-- =====================================================================
-- tests/0006_concurrency_validation.sql
-- Phase 3B.5 concurrency validation.
--
-- Prerequisites: local Supabase stack; database freshly reset with
-- migrations 0001-0004 applied; suites 0001-0005 already ran in order
-- (this suite's 3b6* UUIDs are disjoint from all of them and cleanup
-- removes every trace again).
--
-- HOW THIS SUITE RUNS (important):
--   It MUST be executed as supabase_admin, not postgres:
--     docker exec supabase_db_GYM_Management psql \
--       -U supabase_admin -d postgres -f /tmp/0006_concurrency_validation.sql
--   Reason: the stack's `postgres` role is NOT superuser, so it cannot
--   dblink_connect (the remote side demands superuser or a password;
--   postgres has neither). supabase_admin is superuser and can.
--
-- METHOD: every business call runs in a REAL second backend opened with
-- dblink (schema suite_dblink, dropped at cleanup). Personas are applied
-- remotely with `set local role authenticated` + request.jwt GUCs, so
-- the authority functions see auth.uid() exactly as PostgREST would.
--
-- Each race is orchestrated the same way:
--   1. holder (conn 'h') begins a transaction and makes the call; its
--      locks stay open because the transaction is not committed;
--   2. contender (conn 'c') begins, sets a 1500 ms lock_timeout and makes
--      the conflicting call -> MUST block and fail 55P03 (proves the
--      lock actually serializes the two callers);
--   3. the holder commits;
--   4. the contender retries and must now hit the BUSINESS guard (not a
--      lock error), proving exactly one winner and a consistent state.
-- All assertions after a commit read committed state from this session.
-- =====================================================================

drop schema if exists suite_results cascade;
drop schema if exists suite_dblink cascade;

create schema suite_results;
create schema suite_dblink;
create extension if not exists dblink with schema suite_dblink;

create table suite_results.t_results (
  num    text,
  label  text,
  passed boolean,
  detail text
);

grant usage on schema suite_results to public;
grant all on suite_results.t_results to public;

-- ---------------------------------------------------------------- helpers
create function suite_results.record(
  p_num text, p_label text, p_ok boolean, p_detail text
) returns void language sql as $$
  insert into suite_results.t_results
  values (p_num, p_label,
          coalesce(p_ok, false),
          case when p_ok is null
               then 'NULL condition (treated as FAIL): ' || coalesce(p_detail, '')
               else p_detail end);
$$;

create function suite_results.check_true(
  p_num text, p_label text, p_ok boolean, p_detail text
) returns void language sql as $$
  insert into suite_results.t_results
  values (p_num, p_label,
          coalesce(p_ok, false),
          case when p_ok is null
               then 'NULL condition (treated as FAIL): ' || coalesce(p_detail, '')
               else p_detail end);
$$;

-- status strings returned by the remote helpers are 'ok' or
-- '<sqlstate>|<message>' (dblink preserves the remote SQLSTATE).
create function suite_results.check_ok(
  p_num text, p_label text, p_status text
) returns void language plpgsql as $$
begin
  perform suite_results.record(p_num, p_label, p_status = 'ok',
    case when p_status = 'ok' then 'call succeeded'
         else 'expected success, got: ' || p_status end);
end $$;

create function suite_results.check_fail(
  p_num text, p_label text, p_status text,
  p_state text, p_frag text default null
) returns void language plpgsql as $$
declare
  v_state text;
  v_msg   text;
  v_ok    boolean;
begin
  if p_status = 'ok' then
    perform suite_results.record(p_num, p_label, false,
      format('expected %s ("%s"), call unexpectedly succeeded', p_state, p_frag));
    return;
  end if;

  v_state := split_part(p_status, '|', 1);
  v_msg   := substr(p_status, length(v_state) + 2);

  v_ok := v_state = p_state
          and (p_frag is null
               or position(lower(p_frag) in lower(v_msg)) > 0);

  perform suite_results.record(p_num, p_label, v_ok,
    format('SQLSTATE %s: %s', v_state, v_msg));
end $$;

grant execute on function suite_results.record(text,text,boolean,text) to public;
grant execute on function suite_results.check_true(text,text,boolean,text) to public;
grant execute on function suite_results.check_ok(text,text,text) to public;
grant execute on function suite_results.check_fail(text,text,text,text,text) to public;

-- ------------------------------------------------------- dblink plumbing
create function suite_results.reset_conn(p_conn text) returns void
language plpgsql as $$
begin
  begin
    perform suite_dblink.dblink_exec(p_conn, 'rollback');
  exception when others then
    null; -- connection gone / no transaction: nothing to reset
  end;
end $$;

-- raw transaction (no persona) for direct maintenance inserts.
create function suite_results.begin_raw(
  p_conn text, p_lock_timeout text default null
) returns text language plpgsql as $$
begin
  perform suite_results.reset_conn(p_conn);
  perform suite_dblink.dblink_exec(p_conn, 'begin');
  if p_lock_timeout is not null then
    perform suite_dblink.dblink_exec(p_conn,
      format('set local lock_timeout = %L', p_lock_timeout));
  end if;
  return 'ok';
exception when others then
  return sqlstate || '|' || sqlerrm;
end $$;

-- transaction + simulated PostgREST persona.
create function suite_results.begin_as(
  p_conn text, p_uid uuid, p_role text,
  p_aal text default null, p_lock_timeout text default null
) returns text language plpgsql as $$
declare
  v_claims jsonb;
  v_sql    text;
begin
  perform suite_results.reset_conn(p_conn);
  perform suite_dblink.dblink_exec(p_conn, 'begin');

  v_claims := jsonb_build_object('sub', p_uid::text, 'role', p_role);
  if p_aal is not null then
    v_claims := v_claims || jsonb_build_object('aal', p_aal);
  end if;

  -- GUCs are set BEFORE the role switch (both are transaction-local).
  v_sql := format(
    'do $setguc$ begin perform set_config(%L, %L, true); '
    'perform set_config(%L, %L, true); end $setguc$',
    'request.jwt.claim.sub', p_uid::text,
    'request.jwt.claims', v_claims::text);
  perform suite_dblink.dblink_exec(p_conn, v_sql);
  perform suite_dblink.dblink_exec(p_conn, 'set local role authenticated');

  if p_lock_timeout is not null then
    perform suite_dblink.dblink_exec(p_conn,
      format('set local lock_timeout = %L', p_lock_timeout));
  end if;
  return 'ok';
exception when others then
  return sqlstate || '|' || sqlerrm;
end $$;

create function suite_results.remote_exec(p_conn text, p_sql text)
returns text language plpgsql as $$
begin
  perform suite_dblink.dblink_exec(p_conn, p_sql);
  return 'ok';
exception when others then
  return sqlstate || '|' || sqlerrm;
end $$;

-- wraps a scalar RPC expression so dblink_exec sees no result rows.
create function suite_results.remote_call(p_conn text, p_expr text)
returns text language plpgsql as $$
begin
  return suite_results.remote_exec(p_conn,
    format('do $suitecall$ begin perform (%s); end $suitecall$', p_expr));
end $$;

create function suite_results.commit_conn(p_conn text) returns text
language sql as $$
  select suite_results.remote_exec(p_conn, 'commit');
$$;

grant execute on function suite_results.reset_conn(text) to public;
grant execute on function suite_results.begin_raw(text,text) to public;
grant execute on function suite_results.begin_as(text,uuid,text,text,text) to public;
grant execute on function suite_results.remote_exec(text,text) to public;
grant execute on function suite_results.remote_call(text,text) to public;
grant execute on function suite_results.commit_conn(text) to public;

-- =====================================================================
-- fixtures (as supabase_admin). All UUIDs carry the 3b6 prefix.
-- Personas: owner, recA, recB, recC (three receptionists so no test is
-- ever forced into the self-verification/self-reversal refusal) and
-- member1..member4 (scan subjects).
-- =====================================================================

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '3b6a1111-0000-0000-0000-000000000001', 'authenticated', 'authenticated', '3b6-owner@example.com', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '3b6a2222-0000-0000-0000-000000000002', 'authenticated', 'authenticated', '3b6-rec-a@example.com', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '3b6a3333-0000-0000-0000-000000000003', 'authenticated', 'authenticated', '3b6-rec-b@example.com', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '3b6a4444-0000-0000-0000-000000000004', 'authenticated', 'authenticated', '3b6-rec-c@example.com', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '3b6a5555-0000-0000-0000-000000000005', 'authenticated', 'authenticated', '3b6-m1@example.com',    'x', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '3b6a6666-0000-0000-0000-000000000006', 'authenticated', 'authenticated', '3b6-m2@example.com',    'x', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '3b6a7777-0000-0000-0000-000000000007', 'authenticated', 'authenticated', '3b6-m3@example.com',    'x', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '3b6a8888-0000-0000-0000-000000000008', 'authenticated', 'authenticated', '3b6-m4@example.com',    'x', now(), now());

insert into public.profiles (id, display_name, role) values
  ('3b6a1111-0000-0000-0000-000000000001', '3b6 Owner', 'owner'),
  ('3b6a2222-0000-0000-0000-000000000002', '3b6 Rec A', 'receptionist'),
  ('3b6a3333-0000-0000-0000-000000000003', '3b6 Rec B', 'receptionist'),
  ('3b6a4444-0000-0000-0000-000000000004', '3b6 Rec C', 'receptionist'),
  ('3b6a5555-0000-0000-0000-000000000005', '3b6 Member 1', 'member'),
  ('3b6a6666-0000-0000-0000-000000000006', '3b6 Member 2', 'member'),
  ('3b6a7777-0000-0000-0000-000000000007', '3b6 Member 3', 'member'),
  ('3b6a8888-0000-0000-0000-000000000008', '3b6 Member 4', 'member');

insert into public.plans (id, name, duration, price, is_active) values
  ('3b6c1111-0000-0000-0000-000000000001', '3b6 Monthly', 'monthly', 1500.00, true);

insert into public.members
  (id, full_name, phone, plan_id, price_locked, membership_end, auth_user_id, joined_on)
values
  -- M1/M2: concurrent scans (S1, S2)
  ('3b6b1111-0000-0000-0000-000000000001', '3b6 Scan One',   '+919600000001', '3b6c1111-0000-0000-0000-000000000001', 1500.00, public.app_gym_date() + 45, '3b6a5555-0000-0000-0000-000000000005', public.app_gym_date() - 100),
  ('3b6b2222-0000-0000-0000-000000000002', '3b6 Scan Two',   '+919600000002', '3b6c1111-0000-0000-0000-000000000001', 1500.00, public.app_gym_date() + 45, '3b6a6666-0000-0000-0000-000000000006', public.app_gym_date() - 100),
  -- M3: concurrent verification (S3)
  ('3b6b3333-0000-0000-0000-000000000003', '3b6 Verify',     '+919600000003', '3b6c1111-0000-0000-0000-000000000001', 1500.00, public.app_gym_date() + 45, null, public.app_gym_date() - 100),
  -- M4: two payments stacking (S4)
  ('3b6b4444-0000-0000-0000-000000000004', '3b6 Stacking',   '+919600000004', '3b6c1111-0000-0000-0000-000000000001', 1500.00, public.app_gym_date() + 10, null, public.app_gym_date() - 100),
  -- M5: freeze decisions (S5, S6)
  ('3b6b5555-0000-0000-0000-000000000005', '3b6 Freeze Dec', '+919600000005', '3b6c1111-0000-0000-0000-000000000001', 1500.00, public.app_gym_date() + 60, null, public.app_gym_date() - 100),
  -- M6/M7: freeze end vs scan (S7)
  ('3b6b6666-0000-0000-0000-000000000006', '3b6 Freeze A',   '+919600000006', '3b6c1111-0000-0000-0000-000000000001', 1500.00, public.app_gym_date() + 30, '3b6a7777-0000-0000-0000-000000000007', public.app_gym_date() - 100),
  ('3b6b7777-0000-0000-0000-000000000007', '3b6 Freeze B',   '+919600000007', '3b6c1111-0000-0000-0000-000000000001', 1500.00, public.app_gym_date() + 30, '3b6a8888-0000-0000-0000-000000000008', public.app_gym_date() - 100),
  -- M8: partial reversals (S8)
  ('3b6b8888-0000-0000-0000-000000000008', '3b6 Partial Rev', '+919600000008', '3b6c1111-0000-0000-0000-000000000001', 1500.00, public.app_gym_date() + 5, null, public.app_gym_date() - 100),
  -- M9: deferred cap backstop (S9)
  ('3b6b9999-0000-0000-0000-000000000009', '3b6 Cap Backstop', '+919600000009', '3b6c1111-0000-0000-0000-000000000001', 1500.00, public.app_gym_date() + 5, null, public.app_gym_date() - 100),
  -- MA: full reversal + void (S10)
  ('3b6baaaa-0000-0000-0000-00000000000a', '3b6 Full Rev',    '+919600000010', '3b6c1111-0000-0000-0000-000000000001', 1500.00, public.app_gym_date() + 20, null, public.app_gym_date() - 100),
  -- MB: overlapping freeze request race (S11)
  ('3b6bbbbb-0000-0000-0000-00000000000b', '3b6 Freeze Race', '+919600000011', '3b6c1111-0000-0000-0000-000000000001', 1500.00, public.app_gym_date() + 50, null, public.app_gym_date() - 100);

insert into public.payments
  (id, member_id, plan_id, entry_type, original_price, discount_pct, discount_amount,
   payable, method, state, recorded_by, verified_by, verified_at)
values
  -- stacking base period for M4
  ('3b6e0004-0000-0000-0000-000000000004', '3b6b4444-0000-0000-0000-000000000004', '3b6c1111-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'verified', '3b6a3333-0000-0000-0000-000000000003', '3b6a2222-0000-0000-0000-000000000002', now()),
  ('3b6e0041-0000-0000-0000-000000000041', '3b6b4444-0000-0000-0000-000000000004', '3b6c1111-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'awaitingVerification', '3b6a3333-0000-0000-0000-000000000003', null, null),
  ('3b6e0042-0000-0000-0000-000000000042', '3b6b4444-0000-0000-0000-000000000004', '3b6c1111-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'awaitingVerification', '3b6a3333-0000-0000-0000-000000000003', null, null),
  -- concurrent verification target (recorded by recB; actors recA/recC)
  ('3b6e0003-0000-0000-0000-000000000003', '3b6b3333-0000-0000-0000-000000000003', '3b6c1111-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'awaitingVerification', '3b6a3333-0000-0000-0000-000000000003', null, null),
  -- partial reversal original (payable 1000)
  ('3b6e0007-0000-0000-0000-000000000007', '3b6b8888-0000-0000-0000-000000000008', '3b6c1111-0000-0000-0000-000000000001', 'payment', 1000.00, 0, 0, 1000.00, 'cash', 'verified', '3b6a4444-0000-0000-0000-000000000004', '3b6a4444-0000-0000-0000-000000000004', now()),
  -- deferred cap original (payable 1000)
  ('3b6e0008-0000-0000-0000-000000000008', '3b6b9999-0000-0000-0000-000000000009', '3b6c1111-0000-0000-0000-000000000001', 'payment', 1000.00, 0, 0, 1000.00, 'cash', 'verified', '3b6a4444-0000-0000-0000-000000000004', '3b6a4444-0000-0000-0000-000000000004', now()),
  -- full reversal originals (payable 1000 + older period to reconstruct to)
  ('3b6e0090-0000-0000-0000-000000000090', '3b6baaaa-0000-0000-0000-00000000000a', '3b6c1111-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'verified', '3b6a4444-0000-0000-0000-000000000004', '3b6a4444-0000-0000-0000-000000000004', now()),
  ('3b6e0091-0000-0000-0000-000000000091', '3b6baaaa-0000-0000-0000-00000000000a', '3b6c1111-0000-0000-0000-000000000001', 'payment', 1000.00, 0, 0, 1000.00, 'cash', 'verified', '3b6a4444-0000-0000-0000-000000000004', '3b6a4444-0000-0000-0000-000000000004', now());

insert into public.membership_periods
  (id, member_id, plan_id, start_date, end_date, price_applied, created_by_payment)
values
  ('3b6f0004-0000-0000-0000-000000000004', '3b6b4444-0000-0000-0000-000000000004', '3b6c1111-0000-0000-0000-000000000001', public.app_gym_date() - 10, public.app_gym_date() + 10, 1500.00, '3b6e0004-0000-0000-0000-000000000004'),
  ('3b6f0007-0000-0000-0000-000000000007', '3b6b8888-0000-0000-0000-000000000008', '3b6c1111-0000-0000-0000-000000000001', public.app_gym_date() - 5,  public.app_gym_date() + 5,  1000.00, '3b6e0007-0000-0000-0000-000000000007'),
  ('3b6f0008-0000-0000-0000-000000000008', '3b6b9999-0000-0000-0000-000000000009', '3b6c1111-0000-0000-0000-000000000001', public.app_gym_date() - 5,  public.app_gym_date() + 5,  1000.00, '3b6e0008-0000-0000-0000-000000000008'),
  ('3b6f0090-0000-0000-0000-000000000090', '3b6baaaa-0000-0000-0000-00000000000a', '3b6c1111-0000-0000-0000-000000000001', public.app_gym_date() - 40, public.app_gym_date() - 10, 1500.00, '3b6e0090-0000-0000-0000-000000000090'),
  ('3b6f0091-0000-0000-0000-000000000091', '3b6baaaa-0000-0000-0000-00000000000a', '3b6c1111-0000-0000-0000-000000000001', public.app_gym_date() - 9,  public.app_gym_date() + 20, 1000.00, '3b6e0091-0000-0000-0000-000000000091');

insert into public.membership_freezes
  (id, member_id, start_date, end_date, reason, state, requested_by,
   decided_by, decided_at, extension_days, ended_at, ended_via)
values
  -- S5: pending future window, approve/approve race
  ('3b610001-0000-0000-0000-000000000001', '3b6b5555-0000-0000-0000-000000000005',
   public.app_gym_date() + 10, public.app_gym_date() + 12, 'Medical', 'pending',
   '3b6a3333-0000-0000-0000-000000000003', null, null, null, null, null),
  -- S6a: pending future window, approve vs reject
  ('3b610002-0000-0000-0000-000000000002', '3b6b5555-0000-0000-0000-000000000005',
   public.app_gym_date() + 20, public.app_gym_date() + 22, 'Travel', 'pending',
   '3b6a3333-0000-0000-0000-000000000003', null, null, null, null, null),
  -- S6b: pending future window, reject vs approve
  ('3b610003-0000-0000-0000-000000000003', '3b6b5555-0000-0000-0000-000000000005',
   public.app_gym_date() + 30, public.app_gym_date() + 32, 'Personal', 'pending',
   '3b6a3333-0000-0000-0000-000000000003', null, null, null, null, null),
  -- S7 order A: approved window covering today
  ('3b610011-0000-0000-0000-000000000011', '3b6b6666-0000-0000-0000-000000000006',
   public.app_gym_date() - 1, public.app_gym_date() + 3, 'Medical', 'approved',
   '3b6a3333-0000-0000-0000-000000000003',
   '3b6a2222-0000-0000-0000-000000000002', now(), 5, null, null),
  -- S7 order B: approved window covering today
  ('3b610012-0000-0000-0000-000000000012', '3b6b7777-0000-0000-0000-000000000007',
   public.app_gym_date() - 1, public.app_gym_date() + 3, 'Travel', 'approved',
   '3b6a3333-0000-0000-0000-000000000003',
   '3b6a2222-0000-0000-0000-000000000002', now(), 5, null, null);

insert into public.qr_tokens (id, token_hash, purpose, expires_at, minted_by)
values
  ('3b6d0001-0000-0000-0000-000000000001', encode(sha256(convert_to('suite-3b6-token-s1', 'utf8')), 'hex'),     'attendance', now() + interval '1 day', '3b6a2222-0000-0000-0000-000000000002'),
  ('3b6d0002-0000-0000-0000-000000000002', encode(sha256(convert_to('suite-3b6-token-s1b', 'utf8')), 'hex'),    'attendance', now() + interval '1 day', '3b6a2222-0000-0000-0000-000000000002'),
  ('3b6d0003-0000-0000-0000-000000000003', encode(sha256(convert_to('suite-3b6-token-shared', 'utf8')), 'hex'), 'attendance', now() + interval '1 day', '3b6a2222-0000-0000-0000-000000000002'),
  ('3b6d0004-0000-0000-0000-000000000004', encode(sha256(convert_to('suite-3b6-token-s7a', 'utf8')), 'hex'),    'attendance', now() + interval '1 day', '3b6a2222-0000-0000-0000-000000000002'),
  ('3b6d0005-0000-0000-0000-000000000005', encode(sha256(convert_to('suite-3b6-token-s7b', 'utf8')), 'hex'),    'attendance', now() + interval '1 day', '3b6a2222-0000-0000-0000-000000000002');

insert into public.app_settings (id, gym_timezone, attendance_token_validity_seconds)
values (1, 'Asia/Kolkata', 60)
on conflict (id) do update
  set gym_timezone = 'Asia/Kolkata',
      attendance_token_validity_seconds = 60;

-- open the two real backends
select suite_dblink.dblink_connect('h',
  'host=127.0.0.1 port=5432 dbname=postgres user=postgres password=postgres') as holder_conn;
select suite_dblink.dblink_connect('c',
  'host=127.0.0.1 port=5432 dbname=postgres user=postgres password=postgres') as contender_conn;

-- persona UUIDs used below
-- recA  3b6a2222-0000-0000-0000-000000000002
-- recB  3b6a3333-0000-0000-0000-000000000003
-- recC  3b6a4444-0000-0000-0000-000000000004
-- m1    3b6a5555-0000-0000-0000-000000000005
-- m2    3b6a6666-0000-0000-0000-000000000006
-- m3    3b6a7777-0000-0000-0000-000000000007
-- m4    3b6a8888-0000-0000-0000-000000000008

-- =====================================================================
-- SECTION S1 - simultaneous attendance scans, same member, same token
-- Member-row FOR UPDATE serializes; the replay guard rejects the loser.
-- =====================================================================

select suite_results.begin_as('h', '3b6a5555-0000-0000-0000-000000000005', 'member') as s1_holder_begin;

select suite_results.check_ok('S1.01', 'holder scan succeeds and holds the member lock',
  suite_results.remote_call('h', $q$public.check_in('suite-3b6-token-s1','main')$q$));

select suite_results.check_true('S1.02', 'holder scan is invisible before commit',
  (select count(*) from public.attendance_events
    where member_id = '3b6b1111-0000-0000-0000-000000000001') = 0,
  'the row is still uncommitted');

select suite_results.begin_as('c', '3b6a5555-0000-0000-0000-000000000005', 'member', null, '1500ms') as s1_contender_begin;

select suite_results.check_fail('S1.03', 'contender scan of the same member blocks (lock timeout)',
  suite_results.remote_call('c', $q$public.check_in('suite-3b6-token-s1','main')$q$),
  '55P03', 'lock timeout');

select suite_results.check_ok('S1.04', 'holder commits',
  suite_results.commit_conn('h'));

select suite_results.check_true('S1.05', 'exactly one attendance row for member+token',
  (select count(*) from public.attendance_events
    where member_id = '3b6b1111-0000-0000-0000-000000000001'
      and token_id = '3b6d0001-0000-0000-0000-000000000001') = 1,
  'no duplicate from the blocked scan');

-- retry the SAME token after the commit: replay, not a lock error
select suite_results.begin_as('c', '3b6a5555-0000-0000-0000-000000000005', 'member') as s1_retry1_begin;

select suite_results.check_fail('S1.06', 'retry of the consumed token -> replay refused',
  suite_results.remote_call('c', $q$public.check_in('suite-3b6-token-s1','main')$q$),
  '55000', 'replay');

select suite_results.reset_conn('c');

-- a different token succeeds: the lock is gone, the member is not stuck
select suite_results.begin_as('c', '3b6a5555-0000-0000-0000-000000000005', 'member') as s1_retry2_begin;

select suite_results.check_ok('S1.07', 'retry with a fresh token succeeds',
  suite_results.remote_call('c', $q$public.check_in('suite-3b6-token-s1b','main')$q$));

select suite_results.check_ok('S1.08', 'contender commit',
  suite_results.commit_conn('c'));

select suite_results.check_true('S1.09', 'member 1 now has exactly two attendance rows (one per token)',
  (select count(*) from public.attendance_events
    where member_id = '3b6b1111-0000-0000-0000-000000000001') = 2,
  'S1 token + S1b token');

-- =====================================================================
-- SECTION S2 - one gym token, two different members, concurrently
-- Shared tokens are the intended design: no cross-member serialization.
-- =====================================================================

select suite_results.begin_as('h', '3b6a5555-0000-0000-0000-000000000005', 'member') as s2_holder_begin;
select suite_results.check_ok('S2.01', 'member 1 scans the shared token',
  suite_results.remote_call('h', $q$public.check_in('suite-3b6-token-shared','main')$q$));

select suite_results.begin_as('c', '3b6a6666-0000-0000-0000-000000000006', 'member') as s2_contender_begin;
select suite_results.check_ok('S2.02', 'member 2 scans the SAME token while member 1 is uncommitted (no block)',
  suite_results.remote_call('c', $q$public.check_in('suite-3b6-token-shared','main')$q$));

select suite_results.check_ok('S2.03', 'member 1 commit', suite_results.commit_conn('h'));
select suite_results.check_ok('S2.04', 'member 2 commit', suite_results.commit_conn('c'));

select suite_results.check_true('S2.05', 'shared token produced exactly one row per member',
  (select count(*) from public.attendance_events
    where token_id = '3b6d0003-0000-0000-0000-000000000003') = 2
  and (select count(distinct member_id) from public.attendance_events
    where token_id = '3b6d0003-0000-0000-0000-000000000003') = 2,
  'no cross-member interference, no duplicate');

-- =====================================================================
-- SECTION S3 - simultaneous verification of the SAME payment
-- Payment-row lock serializes; the loser gets the state guard.
-- =====================================================================

select suite_results.begin_as('h', '3b6a2222-0000-0000-0000-000000000002', 'receptionist', 'aal2') as s3_holder_begin;
select suite_results.check_ok('S3.01', 'recA verifies P3 and holds the payment lock',
  suite_results.remote_call('h', $q$public.verify_payment('3b6e0003-0000-0000-0000-000000000003'::uuid)$q$));

select suite_results.check_true('S3.02', 'P3 is still awaiting verification before commit',
  (select state from public.payments where id = '3b6e0003-0000-0000-0000-000000000003') = 'awaitingVerification',
  'holder transaction uncommitted');

select suite_results.begin_as('c', '3b6a4444-0000-0000-0000-000000000004', 'receptionist', 'aal2', '1500ms') as s3_contender_begin;
select suite_results.check_fail('S3.03', 'recC verifying the same payment blocks (lock timeout)',
  suite_results.remote_call('c', $q$public.verify_payment('3b6e0003-0000-0000-0000-000000000003'::uuid)$q$),
  '55P03', 'lock timeout');

select suite_results.check_ok('S3.04', 'recA commit', suite_results.commit_conn('h'));

select suite_results.begin_as('c', '3b6a4444-0000-0000-0000-000000000004', 'receptionist', 'aal2') as s3_retry_begin;
select suite_results.check_fail('S3.05', 'retry hits the business guard, not the lock',
  suite_results.remote_call('c', $q$public.verify_payment('3b6e0003-0000-0000-0000-000000000003'::uuid)$q$),
  '55000', 'not awaiting verification');
select suite_results.reset_conn('c');

select suite_results.check_true('S3.06', 'exactly one period and one verification audit row',
  (select count(*) from public.membership_periods
    where created_by_payment = '3b6e0003-0000-0000-0000-000000000003') = 1
  and (select count(*) from public.audit_log_entries
    where action = 'payment.verified'
      and row_id = '3b6e0003-0000-0000-0000-000000000003') = 1,
  'double verification would have produced two periods');

select suite_results.check_true('S3.07', 'P3 verified and membership_end advanced',
  (select state from public.payments where id = '3b6e0003-0000-0000-0000-000000000003') = 'verified'
  and (select membership_end from public.members where id = '3b6b3333-0000-0000-0000-000000000003')
      = (select end_date from public.membership_periods
          where created_by_payment = '3b6e0003-0000-0000-0000-000000000003'),
  'consistent state after the race');

-- =====================================================================
-- SECTION S4 - two DIFFERENT payments for the SAME member verified
-- concurrently: they must serialize on the member row and stack, never
-- overwrite each other's period.
-- =====================================================================

select suite_results.begin_as('h', '3b6a2222-0000-0000-0000-000000000002', 'receptionist', 'aal2') as s4_holder_begin;
select suite_results.check_ok('S4.01', 'recA verifies P4a (holds the member lock)',
  suite_results.remote_call('h', $q$public.verify_payment('3b6e0041-0000-0000-0000-000000000041'::uuid)$q$));

select suite_results.begin_as('c', '3b6a4444-0000-0000-0000-000000000004', 'receptionist', 'aal2', '1500ms') as s4_contender_begin;
select suite_results.check_fail('S4.02', 'recC verifying P4b for the same member blocks (member lock)',
  suite_results.remote_call('c', $q$public.verify_payment('3b6e0042-0000-0000-0000-000000000042'::uuid)$q$),
  '55P03', 'lock timeout');

select suite_results.check_ok('S4.03', 'recA commit', suite_results.commit_conn('h'));

select suite_results.begin_as('c', '3b6a4444-0000-0000-0000-000000000004', 'receptionist', 'aal2') as s4_retry_begin;
select suite_results.check_ok('S4.04', 'recC retries P4b and succeeds on the fresh state',
  suite_results.remote_call('c', $q$public.verify_payment('3b6e0042-0000-0000-0000-000000000042'::uuid)$q$));
select suite_results.check_ok('S4.05', 'recC commit', suite_results.commit_conn('c'));

select suite_results.check_true('S4.06', 'both payments produced exactly one period each',
  (select count(*) from public.membership_periods
    where created_by_payment in ('3b6e0041-0000-0000-0000-000000000041',
                                 '3b6e0042-0000-0000-0000-000000000042')) = 2,
  'no lost renewal');

select suite_results.check_true('S4.07', 'the second period starts the day after the first ends',
  (select p2.start_date from public.membership_periods p2
    where p2.created_by_payment = '3b6e0042-0000-0000-0000-000000000042')
  = (select p1.end_date + 1 from public.membership_periods p1
    where p1.created_by_payment = '3b6e0041-0000-0000-0000-000000000041'),
  'contiguous, no gap and no overlap');

select suite_results.check_true('S4.08', 'membership_end equals the later period end',
  (select m.membership_end from public.members m
    where m.id = '3b6b4444-0000-0000-0000-000000000004')
  = (select max(p.end_date) from public.membership_periods p
    where p.created_by_payment in ('3b6e0041-0000-0000-0000-000000000041',
                                   '3b6e0042-0000-0000-0000-000000000042')),
  'the stacked renewal is the stored expiry');

-- =====================================================================
-- SECTION S5 - freeze approval, approve vs approve
-- =====================================================================

select suite_results.begin_as('h', '3b6a2222-0000-0000-0000-000000000002', 'receptionist', 'aal2') as s5_holder_begin;
select suite_results.check_ok('S5.01', 'recA approves freeze D1',
  suite_results.remote_call('h', $q$public.decide_freeze('3b610001-0000-0000-0000-000000000001'::uuid, true)$q$));

select suite_results.begin_as('c', '3b6a3333-0000-0000-0000-000000000003', 'receptionist', 'aal2', '1500ms') as s5_contender_begin;
select suite_results.check_fail('S5.02', 'recB approving the same freeze blocks (member lock)',
  suite_results.remote_call('c', $q$public.decide_freeze('3b610001-0000-0000-0000-000000000001'::uuid, true)$q$),
  '55P03', 'lock timeout');

select suite_results.check_ok('S5.03', 'recA commit', suite_results.commit_conn('h'));

select suite_results.begin_as('c', '3b6a3333-0000-0000-0000-000000000003', 'receptionist', 'aal2') as s5_retry_begin;
select suite_results.check_fail('S5.04', 'retry -> already decided',
  suite_results.remote_call('c', $q$public.decide_freeze('3b610001-0000-0000-0000-000000000001'::uuid, true)$q$),
  '55000', 'already been decided');
select suite_results.reset_conn('c');

select suite_results.check_true('S5.05', 'D1 approved once, with the inclusive extension and recA as decider',
  (select state = 'approved'
          and decided_by = '3b6a2222-0000-0000-0000-000000000002'
          and extension_days = (end_date - start_date) + 1
     from public.membership_freezes
    where id = '3b610001-0000-0000-0000-000000000001'),
  'single decision, no double extension');

select suite_results.check_true('S5.06', 'exactly one freeze.approved audit row for D1',
  (select count(*) from public.audit_log_entries
    where action = 'freeze.approved'
      and row_id = '3b610001-0000-0000-0000-000000000001') = 1,
  'the losing call emitted no audit row');

-- =====================================================================
-- SECTION S6 - freeze approval, approve vs reject (both orders)
-- =====================================================================

select suite_results.begin_as('h', '3b6a2222-0000-0000-0000-000000000002', 'receptionist', 'aal2') as s6a_holder_begin;
select suite_results.check_ok('S6.01', 'recA approves D2',
  suite_results.remote_call('h', $q$public.decide_freeze('3b610002-0000-0000-0000-000000000002'::uuid, true)$q$));

select suite_results.begin_as('c', '3b6a3333-0000-0000-0000-000000000003', 'receptionist', 'aal2', '1500ms') as s6a_contender_begin;
select suite_results.check_fail('S6.02', 'recB rejecting D2 blocks while approval is uncommitted',
  suite_results.remote_call('c', $q$public.decide_freeze('3b610002-0000-0000-0000-000000000002'::uuid, false)$q$),
  '55P03', 'lock timeout');

select suite_results.check_ok('S6.03', 'recA commit', suite_results.commit_conn('h'));

select suite_results.begin_as('c', '3b6a3333-0000-0000-0000-000000000003', 'receptionist', 'aal2') as s6a_retry_begin;
select suite_results.check_fail('S6.04', 'reject retry -> already decided',
  suite_results.remote_call('c', $q$public.decide_freeze('3b610002-0000-0000-0000-000000000002'::uuid, false)$q$),
  '55000', 'already been decided');
select suite_results.reset_conn('c');

select suite_results.check_true('S6.05', 'D2 stayed approved (the reject did not win)',
  (select state = 'approved' and extension_days is not null
     from public.membership_freezes
    where id = '3b610002-0000-0000-0000-000000000002'),
  'approve-first order preserved');

-- reverse order: reject first, approve loses
select suite_results.begin_as('h', '3b6a3333-0000-0000-0000-000000000003', 'receptionist', 'aal2') as s6b_holder_begin;
select suite_results.check_ok('S6.06', 'recB rejects D3',
  suite_results.remote_call('h', $q$public.decide_freeze('3b610003-0000-0000-0000-000000000003'::uuid, false)$q$));

select suite_results.begin_as('c', '3b6a2222-0000-0000-0000-000000000002', 'receptionist', 'aal2', '1500ms') as s6b_contender_begin;
select suite_results.check_fail('S6.07', 'recA approving D3 blocks while rejection is uncommitted',
  suite_results.remote_call('c', $q$public.decide_freeze('3b610003-0000-0000-0000-000000000003'::uuid, true)$q$),
  '55P03', 'lock timeout');

select suite_results.check_ok('S6.08', 'recB commit', suite_results.commit_conn('h'));

select suite_results.begin_as('c', '3b6a2222-0000-0000-0000-000000000002', 'receptionist', 'aal2') as s6b_retry_begin;
select suite_results.check_fail('S6.09', 'approve retry -> already decided',
  suite_results.remote_call('c', $q$public.decide_freeze('3b610003-0000-0000-0000-000000000003'::uuid, true)$q$),
  '55000', 'already been decided');
select suite_results.reset_conn('c');

select suite_results.check_true('S6.10', 'D3 stayed rejected with no extension',
  (select state = 'rejected' and extension_days is null
          and decided_by = '3b6a3333-0000-0000-0000-000000000003'
     from public.membership_freezes
    where id = '3b610003-0000-0000-0000-000000000003'),
  'reject-first order preserved');

-- =====================================================================
-- SECTION S7 - freeze termination: receptionist end vs QR scan (both orders)
-- =====================================================================

-- order A: receptionist end holds the freeze row; the scan must wait.
select suite_results.begin_as('h', '3b6a2222-0000-0000-0000-000000000002', 'receptionist') as s7a_holder_begin;
select suite_results.check_ok('S7.01', 'recA ends freeze A (holds the freeze row)',
  suite_results.remote_call('h', $q$public.end_freeze('3b610011-0000-0000-0000-000000000011'::uuid)$q$));

select suite_results.begin_as('c', '3b6a7777-0000-0000-0000-000000000007', 'member', null, '1500ms') as s7a_contender_begin;
select suite_results.check_fail('S7.02', 'frozen member scanning during the end blocks (freeze row lock)',
  suite_results.remote_call('c', $q$public.check_in('suite-3b6-token-s7a','main')$q$),
  '55P03', 'lock timeout');

select suite_results.check_ok('S7.03', 'recA commit', suite_results.commit_conn('h'));

select suite_results.begin_as('c', '3b6a7777-0000-0000-0000-000000000007', 'member') as s7a_retry_begin;
select suite_results.check_ok('S7.04', 'scan retry after the end succeeds (freeze already ended)',
  suite_results.remote_call('c', $q$public.check_in('suite-3b6-token-s7a','main')$q$));
select suite_results.check_ok('S7.05', 'scan commit', suite_results.commit_conn('c'));

select suite_results.check_true('S7.06', 'freeze A ended by the RECEPTIONIST, not overwritten to scan',
  (select state = 'ended'
          and ended_via = 'receptionist'
          and ended_by = '3b6a2222-0000-0000-0000-000000000002'
     from public.membership_freezes
    where id = '3b610011-0000-0000-0000-000000000011'),
  'one winner, attributed correctly');

select suite_results.check_true('S7.07', 'the scan still recorded attendance after the unfreeze',
  (select count(*) from public.attendance_events
    where member_id = '3b6b6666-0000-0000-0000-000000000006'
      and token_id = '3b6d0004-0000-0000-0000-000000000004') = 1,
  'ending a freeze does not block the scan');

select suite_results.check_true('S7.08', 'exactly one freeze.ended audit row for freeze A',
  (select count(*) from public.audit_log_entries
    where action = 'freeze.ended'
      and row_id = '3b610011-0000-0000-0000-000000000011') = 1
  and (select count(*) from public.audit_log_entries
    where action = 'freeze.ended_scan'
      and row_id = '3b610011-0000-0000-0000-000000000011') = 0,
  'no scan attribution on an already-ended freeze');

-- order B: the scan ends the freeze first; the receptionist must lose.
select suite_results.begin_as('h', '3b6a8888-0000-0000-0000-000000000008', 'member') as s7b_holder_begin;
select suite_results.check_ok('S7.09', 'member scan ends freeze B (holds member + freeze rows)',
  suite_results.remote_call('h', $q$public.check_in('suite-3b6-token-s7b','main')$q$));

select suite_results.begin_as('c', '3b6a2222-0000-0000-0000-000000000002', 'receptionist', null, '1500ms') as s7b_contender_begin;
select suite_results.check_fail('S7.10', 'receptionist end blocks while the scan is uncommitted',
  suite_results.remote_call('c', $q$public.end_freeze('3b610012-0000-0000-0000-000000000012'::uuid)$q$),
  '55P03', 'lock timeout');

select suite_results.check_ok('S7.11', 'scan commit', suite_results.commit_conn('h'));

select suite_results.begin_as('c', '3b6a2222-0000-0000-0000-000000000002', 'receptionist') as s7b_retry_begin;
select suite_results.check_fail('S7.12', 'end retry -> only an approved freeze can be ended',
  suite_results.remote_call('c', $q$public.end_freeze('3b610012-0000-0000-0000-000000000012'::uuid)$q$),
  '55000', 'Only an approved freeze');
select suite_results.reset_conn('c');

select suite_results.check_true('S7.13', 'freeze B ended by SCAN with no receptionist attribution',
  (select state = 'ended'
          and ended_via = 'scan'
          and ended_by is null
     from public.membership_freezes
    where id = '3b610012-0000-0000-0000-000000000012'),
  'one winner, attributed correctly');

select suite_results.check_true('S7.14', 'scan-won freeze emitted exactly one scan audit row',
  (select count(*) from public.audit_log_entries
    where action = 'freeze.ended_scan'
      and row_id = '3b610012-0000-0000-0000-000000000012') = 1
  and (select count(*) from public.audit_log_entries
    where action = 'freeze.ended'
      and row_id = '3b610012-0000-0000-0000-000000000012') = 0,
  'no contradictory attribution');

-- =====================================================================
-- SECTION S8 - concurrent partial reversals of the SAME original
-- Original-row lock serializes; the cumulative cap still holds.
-- =====================================================================

select suite_results.begin_as('h', '3b6a2222-0000-0000-0000-000000000002', 'receptionist', 'aal2') as s8_holder_begin;
select suite_results.check_ok('S8.01', 'recA reverses 600 of P7 and holds the original lock',
  suite_results.remote_call('h', $q$public.create_reversal('3b6e0007-0000-0000-0000-000000000007'::uuid, 600)$q$));

select suite_results.begin_as('c', '3b6a3333-0000-0000-0000-000000000003', 'receptionist', 'aal2', '1500ms') as s8_contender_begin;
select suite_results.check_fail('S8.02', 'recB reversing the same original blocks (original lock)',
  suite_results.remote_call('c', $q$public.create_reversal('3b6e0007-0000-0000-0000-000000000007'::uuid, 600)$q$),
  '55P03', 'lock timeout');

select suite_results.check_ok('S8.03', 'recA commit', suite_results.commit_conn('h'));

select suite_results.begin_as('c', '3b6a3333-0000-0000-0000-000000000003', 'receptionist', 'aal2') as s8_retry_begin;
select suite_results.check_fail('S8.04', '600 retry now exceeds the remaining 400',
  suite_results.remote_call('c', $q$public.create_reversal('3b6e0007-0000-0000-0000-000000000007'::uuid, 600)$q$),
  '55000', 'remaining 400');
select suite_results.reset_conn('c');

select suite_results.begin_as('c', '3b6a3333-0000-0000-0000-000000000003', 'receptionist', 'aal2') as s8_retry2_begin;
select suite_results.check_ok('S8.05', '400 retry succeeds exactly',
  suite_results.remote_call('c', $q$public.create_reversal('3b6e0007-0000-0000-0000-000000000007'::uuid, 400)$q$));
select suite_results.check_ok('S8.06', 'recB commit', suite_results.commit_conn('c'));

select suite_results.check_true('S8.07', 'exactly two partial reversals summing to the payable',
  (select count(*) from public.payments
    where reversal_of = '3b6e0007-0000-0000-0000-000000000007'
      and entry_type = 'reversal' and state = 'verified') = 2
  and (select sum(payable) from public.payments
    where reversal_of = '3b6e0007-0000-0000-0000-000000000007'
      and entry_type = 'reversal' and state = 'verified') = 1000.00,
  'no over-refund, no lost reversal');

select suite_results.check_true('S8.08', 'partial reversals did not void the period or move membership_end',
  (select count(*) from public.membership_period_voids
    where period_id = '3b6f0007-0000-0000-0000-000000000007') = 0
  and (select membership_end from public.members
    where id = '3b6b8888-0000-0000-0000-000000000008') = public.app_gym_date() + 5,
  'O-24: partial reversal never touches coverage');

-- =====================================================================
-- SECTION S9 - deferred cumulative cap backstop
-- Two direct reversal rows (600 + 600 vs payable 1000) are inserted from
-- trusted maintenance sessions. Both INSERTs succeed; the DEFERRED
-- constraint trigger must fail the SECOND COMMIT with 23514.
-- =====================================================================

select suite_results.begin_raw('h') as s9_holder_begin;

select suite_results.check_ok('S9.01', 'first direct 600 reversal INSERT is accepted (deferred check)',
  suite_results.remote_exec('h', $q$insert into public.payments
    (member_id, plan_id, entry_type, reversal_of, original_price, discount_pct,
     discount_amount, payable, method, state, recorded_by, verified_by, verified_at)
    values ('3b6b9999-0000-0000-0000-000000000009','3b6c1111-0000-0000-0000-000000000001',
            'reversal','3b6e0008-0000-0000-0000-000000000008',600,0,0,600,'cash','verified',
            '3b6a4444-0000-0000-0000-000000000004','3b6a4444-0000-0000-0000-000000000004', now())$q$));

select suite_results.begin_raw('c') as s9_contender_begin;

select suite_results.check_ok('S9.02', 'second direct 600 reversal INSERT is also accepted (not yet checked)',
  suite_results.remote_exec('c', $q$insert into public.payments
    (member_id, plan_id, entry_type, reversal_of, original_price, discount_pct,
     discount_amount, payable, method, state, recorded_by, verified_by, verified_at)
    values ('3b6b9999-0000-0000-0000-000000000009','3b6c1111-0000-0000-0000-000000000001',
            'reversal','3b6e0008-0000-0000-0000-000000000008',600,0,0,600,'cash','verified',
            '3b6a4444-0000-0000-0000-000000000004','3b6a4444-0000-0000-0000-000000000004', now())$q$));

select suite_results.check_true('S9.03', 'neither uncommitted reversal is visible to other sessions',
  (select count(*) from public.payments
    where reversal_of = '3b6e0008-0000-0000-0000-000000000008') = 0,
  'both inserts are still uncommitted');

select suite_results.check_ok('S9.04', 'first commit succeeds (600 <= 1000)',
  suite_results.commit_conn('h'));

select suite_results.check_fail('S9.05', 'second commit fails on the deferred cap (600+600 > 1000)',
  suite_results.commit_conn('c'),
  '23514', 'Cumulative reversals');

select suite_results.reset_conn('c');

select suite_results.check_true('S9.06', 'only the first reversal survived; the over-refund rolled back',
  (select count(*) from public.payments
    where reversal_of = '3b6e0008-0000-0000-0000-000000000008') = 1
  and (select sum(payable) from public.payments
    where reversal_of = '3b6e0008-0000-0000-0000-000000000008') = 600.00,
  'the deferred trigger is a real backstop, not advisory');

select suite_results.check_true('S9.07', 'the rejected attempt left no audit residue',
  (select count(*) from public.audit_log_entries
    where row_id in (select id from public.payments
                      where reversal_of = '3b6e0008-0000-0000-0000-000000000008')
      and action = 'payment.reversed') = 0,
  'direct inserts never emit RPC audit rows (and the failed tx wrote none)');

-- =====================================================================
-- SECTION S10 - concurrent FULL reversals: exactly one void, and
-- membership_end is reconstructed once from the surviving period.
-- =====================================================================

select suite_results.begin_as('h', '3b6a2222-0000-0000-0000-000000000002', 'receptionist', 'aal2') as s10_holder_begin;
select suite_results.check_ok('S10.01', 'recA fully reverses P9_new (voids its period)',
  suite_results.remote_call('h', $q$public.create_reversal('3b6e0091-0000-0000-0000-000000000091'::uuid, 1000)$q$));

select suite_results.check_true('S10.02', 'the void and reconstructed expiry are invisible before commit',
  (select count(*) from public.membership_period_voids
    where period_id = '3b6f0091-0000-0000-0000-000000000091') = 0
  and (select membership_end from public.members
    where id = '3b6baaaa-0000-0000-0000-00000000000a') = public.app_gym_date() + 20,
  'holder transaction uncommitted');

select suite_results.begin_as('c', '3b6a3333-0000-0000-0000-000000000003', 'receptionist', 'aal2', '1500ms') as s10_contender_begin;
select suite_results.check_fail('S10.03', 'recB fully reversing the same original blocks (original lock)',
  suite_results.remote_call('c', $q$public.create_reversal('3b6e0091-0000-0000-0000-000000000091'::uuid, 1000)$q$),
  '55P03', 'lock timeout');

select suite_results.check_ok('S10.04', 'recA commit', suite_results.commit_conn('h'));

select suite_results.begin_as('c', '3b6a3333-0000-0000-0000-000000000003', 'receptionist', 'aal2') as s10_retry_begin;
select suite_results.check_fail('S10.05', 'full-reversal retry -> remaining 0',
  suite_results.remote_call('c', $q$public.create_reversal('3b6e0091-0000-0000-0000-000000000091'::uuid, 1000)$q$),
  '55000', 'remaining 0');
select suite_results.reset_conn('c');

select suite_results.check_true('S10.06', 'exactly one reversal and one void for the period',
  (select count(*) from public.payments
    where reversal_of = '3b6e0091-0000-0000-0000-000000000091') = 1
  and (select count(*) from public.membership_period_voids
    where period_id = '3b6f0091-0000-0000-0000-000000000091') = 1,
  'no duplicate void / no double refund');

select suite_results.check_true('S10.07', 'membership_end reconstructed from the surviving older period',
  (select membership_end from public.members
    where id = '3b6baaaa-0000-0000-0000-00000000000a')
  = (select end_date from public.membership_periods
      where id = '3b6f0090-0000-0000-0000-000000000090'),
  '§5.5 reconstruction under the member-row lock');

select suite_results.check_true('S10.08', 'the voided period row remains append-only history',
  (select count(*) from public.membership_periods
    where id = '3b6f0091-0000-0000-0000-000000000091') = 1,
  'voids are recorded, periods are never deleted');

-- =====================================================================
-- SECTION S11 - overlapping freeze REQUESTS race into the GiST
-- exclusion constraint: one pending window only.
-- =====================================================================

select suite_results.begin_as('h', '3b6a2222-0000-0000-0000-000000000002', 'receptionist') as s11_holder_begin;
select suite_results.check_ok('S11.01', 'recA requests a pending window for MB',
  suite_results.remote_call('h', $q$public.request_freeze('3b6bbbbb-0000-0000-0000-00000000000b'::uuid, (current_date + 5), (current_date + 7), 'Medical')$q$));

select suite_results.begin_as('c', '3b6a3333-0000-0000-0000-000000000003', 'receptionist', null, '1500ms') as s11_contender_begin;
select suite_results.check_fail('S11.02', 'an overlapping request blocks on the uncommitted window',
  suite_results.remote_call('c', $q$public.request_freeze('3b6bbbbb-0000-0000-0000-00000000000b'::uuid, (current_date + 6), (current_date + 8), 'Other')$q$),
  '55P03', 'lock timeout');

select suite_results.check_ok('S11.03', 'recA commit', suite_results.commit_conn('h'));

select suite_results.begin_as('c', '3b6a3333-0000-0000-0000-000000000003', 'receptionist') as s11_retry_begin;
select suite_results.check_fail('S11.04', 'retry -> exclusion constraint 23P01',
  suite_results.remote_call('c', $q$public.request_freeze('3b6bbbbb-0000-0000-0000-00000000000b'::uuid, (current_date + 6), (current_date + 8), 'Other')$q$),
  '23P01', 'freezes_no_overlap');
select suite_results.reset_conn('c');

select suite_results.check_true('S11.05', 'exactly one pending window survived (no duplicate freeze)',
  (select count(*) from public.membership_freezes
    where member_id = '3b6bbbbb-0000-0000-0000-00000000000b') = 1,
  'the loser wrote nothing');

-- =====================================================================
-- SECTION T - cross-cutting consistency after every race
-- =====================================================================

select suite_results.check_true('T01', 'no attendance duplicates for any (member, token) pair',
  (select count(*) from (
     select member_id, token_id
       from public.attendance_events
      where member_id::text like '3b6%'
      group by member_id, token_id
     having count(*) > 1) d) = 0,
  'unique member+token held under concurrency');

select suite_results.check_true('T02', 'no member has two non-voided periods covering the same day',
  (select count(*) from (
     select p.member_id, g.d
       from public.membership_periods p
       cross join lateral generate_series(
         p.start_date, p.end_date, interval '1 day') g(d)
      where p.member_id::text like '3b6%'
        and not exists (select 1 from public.membership_period_voids v
                         where v.period_id = p.id)
      group by p.member_id, g.d
     having count(*) > 1) overlap) = 0,
  'stacked periods are disjoint');

select suite_results.check_true('T03', 'every verified payment has exactly one period unless a reversal voided it',
  (select count(*) from public.payments p
    where p.member_id::text like '3b6%'
      and p.entry_type = 'payment'
      and p.state = 'verified'
      and not exists (select 1 from public.membership_periods mp
                       where mp.created_by_payment = p.id)
      and not exists (select 1 from public.payments r
                       where r.reversal_of = p.id
                         and r.entry_type = 'reversal'
                         and r.state = 'verified'
                         and r.payable = p.payable)) = 0,
  'no verified payment silently lost its coverage');

select suite_results.check_true('T04', 'no reversal exceeds its original payable',
  (select count(*) from (
     select o.id
       from public.payments r
       join public.payments o on o.id = r.reversal_of
      where r.entry_type = 'reversal'
        and r.member_id::text like '3b6%'
      group by o.id, o.payable
     having sum(r.payable) > o.payable) over_cap) = 0,
  'cumulative cap holds for every original');

select suite_results.check_true('T05', 'no freeze is both decided and pending, and approved rows carry extension',
  (select count(*) from public.membership_freezes
    where member_id::text like '3b6%'
      and (   ((state = 'pending') <> (decided_by is null))
           or (state = 'approved' and extension_days is null))) = 0,
  'freeze state invariants intact after the races');

-- =====================================================================
-- SECTION Z - cleanup and verdict
-- =====================================================================

select suite_results.reset_conn('h');
select suite_results.reset_conn('c');
select suite_dblink.dblink_disconnect('h');
select suite_dblink.dblink_disconnect('c');

delete from public.audit_log_entries
 where actor::text like '3b6%' or row_id::text like '3b6%';
delete from public.follow_up_events
 where member_id::text like '3b6%' or actor::text like '3b6%';
delete from public.membership_period_voids
 where reversal_id::text like '3b6%' or period_id::text like '3b6%';
delete from public.payments where reversal_of::text like '3b6%';
delete from public.membership_periods
 where id::text like '3b6%' or created_by_payment::text like '3b6%';
delete from public.payments where id::text like '3b6%';
delete from public.membership_freezes
 where id::text like '3b6%' or member_id::text like '3b6%';
delete from public.attendance_events
 where id::text like '3b6%' or member_id::text like '3b6%';
delete from public.qr_tokens where id::text like '3b6%';
delete from public.members where id::text like '3b6%';
delete from public.profiles where id::text like '3b6%';
delete from public.plans where id::text like '3b6%';
delete from auth.users where id::text like '3b6%';

select suite_results.check_true('Z01', 'zero 3b6 residue',
  (select count(*) from public.members where id::text like '3b6%') = 0
  and (select count(*) from public.profiles where id::text like '3b6%') = 0
  and (select count(*) from public.payments where id::text like '3b6%'
        or reversal_of::text like '3b6%') = 0
  and (select count(*) from public.membership_periods where id::text like '3b6%') = 0
  and (select count(*) from public.membership_freezes where id::text like '3b6%') = 0
  and (select count(*) from public.attendance_events where id::text like '3b6%') = 0
  and (select count(*) from public.qr_tokens where id::text like '3b6%') = 0
  and (select count(*) from public.plans where id::text like '3b6%') = 0,
  'database back to the post-0005 state');

select num, passed, label, detail
  from suite_results.t_results
 where not passed
 order by num;

do $v$
declare
  v_total integer;
  v_fail  integer;
begin
  select count(*), count(*) filter (where not passed)
    into v_total, v_fail
    from suite_results.t_results;

  raise notice '0006 concurrency validation: % of % assertions passed', v_total - v_fail, v_total;

  if v_fail > 0 then
    raise exception '0006 CONCURRENCY VALIDATION FAILED: % of % assertions failed', v_fail, v_total;
  end if;
end
$v$;

drop schema suite_results cascade;
drop schema suite_dblink cascade;
