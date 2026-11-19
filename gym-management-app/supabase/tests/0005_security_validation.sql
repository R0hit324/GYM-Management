-- =====================================================================
-- tests/0005_security_validation.sql
-- Phase 3B.5 security validation: role matrix, RLS isolation, EXECUTE
-- grants, AAL2 enforcement, profileless users, owner write restrictions.
--
-- Prerequisites: local Supabase stack; database freshly reset with
-- migrations 0001-0004 applied; suites 0001-0004 already ran in order
-- (this suite's 3b5* UUIDs are disjoint from all of them and cleanup
-- removes every trace again).
--
-- Personas are simulated with SET LOCAL ROLE + request.jwt GUCs
-- (session_user stays postgres, so the 0002 payments override is
-- skipped — it is exercised in the 0003 suite's authenticator context).
-- Negative tests pin the SQLSTATE class AND a message fragment.
-- =====================================================================

drop schema if exists suite_results cascade;
create schema suite_results;

create table suite_results.t_results (
  num    text,
  label  text,
  passed boolean,
  detail text
);
grant usage on schema suite_results to public;
grant all on suite_results.t_results to public;

-- negative helper: statement MUST fail with wanted SQLSTATE class
-- (+ optional message fragment).
create function suite_results.check_fail(
  p_num text, p_label text, p_stmt text, p_want_sqlstate text, p_want_err text default null
) returns void language plpgsql as $cf$
declare
  v_ok     boolean;
  v_detail text;
  v_state  text;
  v_msg    text;
begin
  begin
    execute p_stmt;
    v_ok := false;
    v_detail := 'statement unexpectedly succeeded';
  exception when others then
    get stacked diagnostics v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    if left(v_state, 2) <> left(p_want_sqlstate, 2) then
      v_ok := false;
      v_detail := format('SQLSTATE %s (wanted %s): %s', v_state, p_want_sqlstate, v_msg);
    elsif p_want_err is not null and position(lower(p_want_err) in lower(v_msg)) = 0 then
      v_ok := false;
      v_detail := format('wrong violation (SQLSTATE %s, wanted "%s" in message): %s',
                         v_state, p_want_err, v_msg);
    else
      v_ok := true;
      v_detail := format('rejected as expected (SQLSTATE %s): %s', v_state, v_msg);
    end if;
  end;
  insert into suite_results.t_results values (p_num, p_label, v_ok, v_detail);
end $cf$;

create function suite_results.check_ok(p_num text, p_label text, p_stmt text)
returns void language plpgsql as $co$
declare
  v_ok     boolean;
  v_detail text;
  v_msg    text;
  v_rows   bigint;
begin
  begin
    execute p_stmt;
    get diagnostics v_rows = ROW_COUNT;
    if v_rows = 0 then
      v_ok := false;
      v_detail := 'statement matched no rows (vacuous pass rejected)';
    else
      v_ok := true;
      v_detail := format('accepted as expected (%s row(s))', v_rows);
    end if;
  exception when others then
    get stacked diagnostics v_msg = MESSAGE_TEXT;
    v_ok := false;
    v_detail := format('expected success, got error: %s', v_msg);
  end;
  insert into suite_results.t_results values (p_num, p_label, v_ok, v_detail);
end $co$;

create function suite_results.check_true(p_num text, p_label text, p_ok boolean, p_detail text)
returns void language plpgsql as $ct$
begin
  insert into suite_results.t_results
  values (p_num, p_label,
          coalesce(p_ok, false),
          case when p_ok is null
               then 'NULL condition (treated as FAIL): ' || coalesce(p_detail, '')
               else p_detail end);
end $ct$;

-- helpers must be callable from the simulated personas.
grant execute on function suite_results.check_fail(text,text,text,text,text) to public;
grant execute on function suite_results.check_ok(text,text,text) to public;
grant execute on function suite_results.check_true(text,text,boolean,text) to public;

-- 13 authority RPCs: one valid-shaped call each. Role gates run before
-- any argument/business validation, so these are safe to call from a
-- persona that must be refused.
create table suite_results.t_rpc (
  n        integer primary key,
  name     text not null,
  call_sql text not null
);
grant select on suite_results.t_rpc to public;

insert into suite_results.t_rpc values
 ( 1, 'verify_payment',
   $s$select public.verify_payment('3b5e0003-0000-0000-0000-000000000003'::uuid)$s$),
 ( 2, 'reject_payment',
   $s$select public.reject_payment('3b5e0006-0000-0000-0000-000000000006'::uuid)$s$),
 ( 3, 'create_reversal',
   $s$select public.create_reversal('3b5e0005-0000-0000-0000-000000000005'::uuid, 100)$s$),
 ( 4, 'request_freeze',
   $s$select public.request_freeze('3b5b3333-0000-0000-0000-000000000003'::uuid, '2027-09-01'::date, '2027-09-03'::date, 'Medical')$s$),
 ( 5, 'decide_freeze',
   $s$select public.decide_freeze('3b510002-0000-0000-0000-000000000002'::uuid, true)$s$),
 ( 6, 'end_freeze',
   $s$select public.end_freeze('3b510001-0000-0000-0000-000000000001'::uuid)$s$),
 ( 7, 'check_in',
   $s$select public.check_in('matrix-garbage-token', 'main')$s$),
 ( 8, 'mint_attendance_token',
   $s$select public.mint_attendance_token(null)$s$),
 ( 9, 'set_member_discount',
   $s$select public.set_member_discount('3b5b3333-0000-0000-0000-000000000003'::uuid, 10)$s$),
 (10, 'request_plan_assignment',
   $s$select public.request_plan_assignment('3b5b3333-0000-0000-0000-000000000003'::uuid, '3b5c2222-0000-0000-0000-000000000002'::uuid)$s$),
 (11, 'update_plan_price',
   $s$select public.update_plan_price('3b5c1111-0000-0000-0000-000000000001'::uuid, 1600)$s$),
 (12, 'decide_application',
   $s$select public.decide_application('3b530003-0000-0000-0000-000000000003'::uuid, true)$s$),
 (13, 'update_gym_settings',
   $s$select public.update_gym_settings('Asia/Kolkata', null, null, 60)$s$);

-- =====================================================================
-- fixtures (as postgres). All UUIDs carry the 3b5 prefix.
-- =====================================================================

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '3b5a1111-0000-0000-0000-000000000001', 'authenticated', 'authenticated', '3b5-owner@example.com', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '3b5a2222-0000-0000-0000-000000000002', 'authenticated', 'authenticated', '3b5-rec-a@example.com', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '3b5a9999-0000-0000-0000-000000000009', 'authenticated', 'authenticated', '3b5-rec-b@example.com', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '3b5a3333-0000-0000-0000-000000000003', 'authenticated', 'authenticated', '3b5-m1@example.com',     'x', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '3b5a4444-0000-0000-0000-000000000004', 'authenticated', 'authenticated', '3b5-m2@example.com',     'x', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '3b5a0000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '3b5-noprofile@example.com','x', now(), now());

insert into public.profiles (id, display_name, role) values
  ('3b5a1111-0000-0000-0000-000000000001', '3b5 Owner',      'owner'),
  ('3b5a2222-0000-0000-0000-000000000002', '3b5 Rec A',      'receptionist'),
  ('3b5a9999-0000-0000-0000-000000000009', '3b5 Rec B',      'receptionist'),
  ('3b5a3333-0000-0000-0000-000000000003', '3b5 Member One', 'member'),
  ('3b5a4444-0000-0000-0000-000000000004', '3b5 Member Two', 'member');

insert into public.plans (id, name, duration, price, is_active) values
  ('3b5c1111-0000-0000-0000-000000000001', '3b5 Monthly',   'monthly',   1500.00, true),
  ('3b5c2222-0000-0000-0000-000000000002', '3b5 Quarterly', 'quarterly', 4000.00, true),
  ('3b5c3333-0000-0000-0000-000000000003', '3b5 Inactive',  'monthly',    999.00, false);

-- M1/M2 are the RLS-isolation subjects (linked to the member personas);
-- M3 is the staff write target (no auth link); M4 is the AAL2 subject.
insert into public.members (id, full_name, phone, plan_id, price_locked, membership_end, auth_user_id, joined_on) values
  ('3b5b1111-0000-0000-0000-000000000001', '3b5 Member One',   '+913000000001', '3b5c1111-0000-0000-0000-000000000001', 1500.00, '2026-12-01', '3b5a3333-0000-0000-0000-000000000003', '2026-09-01'),
  ('3b5b2222-0000-0000-0000-000000000002', '3b5 Member Two',   '+913000000002', '3b5c1111-0000-0000-0000-000000000001', 1500.00, '2026-11-30', '3b5a4444-0000-0000-0000-000000000004', '2026-08-01'),
  ('3b5b3333-0000-0000-0000-000000000003', '3b5 Member Three', '+913000000003', '3b5c1111-0000-0000-0000-000000000001', 1500.00, '2027-06-30', null, '2026-07-01'),
  ('3b5b4444-0000-0000-0000-000000000004', '3b5 Member Four',  '+913000000004', '3b5c1111-0000-0000-0000-000000000001', 1500.00, '2027-12-31', null, '2026-01-01');

insert into public.payments
  (id, member_id, plan_id, entry_type, original_price, discount_pct, discount_amount,
   payable, method, state, recorded_by, verified_by, verified_at)
values
  -- verified backers for the fixture periods
  ('3b5e0001-0000-0000-0000-000000000001', '3b5b1111-0000-0000-0000-000000000001', '3b5c1111-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'verified', '3b5a9999-0000-0000-0000-000000000009', '3b5a1111-0000-0000-0000-000000000001', now()),
  ('3b5e0002-0000-0000-0000-000000000002', '3b5b2222-0000-0000-0000-000000000002', '3b5c1111-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'verified', '3b5a9999-0000-0000-0000-000000000009', '3b5a1111-0000-0000-0000-000000000001', now()),
  ('3b5e0005-0000-0000-0000-000000000005', '3b5b3333-0000-0000-0000-000000000003', '3b5c1111-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'verified', '3b5a9999-0000-0000-0000-000000000009', '3b5a1111-0000-0000-0000-000000000001', now()),
  -- awaiting rows: role-matrix / reject target
  ('3b5e0003-0000-0000-0000-000000000003', '3b5b1111-0000-0000-0000-000000000001', '3b5c1111-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'awaitingVerification', '3b5a9999-0000-0000-0000-000000000009', null, null),
  ('3b5e0006-0000-0000-0000-000000000006', '3b5b2222-0000-0000-0000-000000000002', '3b5c1111-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'awaitingVerification', '3b5a9999-0000-0000-0000-000000000009', null, null),
  -- AAL2 subjects: P8 awaiting (verify positive), P9 verified (reversal positive)
  ('3b5e0008-0000-0000-0000-000000000008', '3b5b4444-0000-0000-0000-000000000004', '3b5c1111-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'awaitingVerification', '3b5a9999-0000-0000-0000-000000000009', null, null),
  ('3b5e0009-0000-0000-0000-000000000009', '3b5b4444-0000-0000-0000-000000000004', '3b5c1111-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'verified', '3b5a9999-0000-0000-0000-000000000009', '3b5a1111-0000-0000-0000-000000000001', now());

insert into public.membership_periods
  (id, member_id, plan_id, start_date, end_date, price_applied, created_by_payment)
values
  ('3b5f1111-0000-0000-0000-000000000001', '3b5b1111-0000-0000-0000-000000000001', '3b5c1111-0000-0000-0000-000000000001', '2026-09-01', '2026-12-01', 1500.00, '3b5e0001-0000-0000-0000-000000000001'),
  ('3b5f2222-0000-0000-0000-000000000002', '3b5b2222-0000-0000-0000-000000000002', '3b5c1111-0000-0000-0000-000000000001', '2026-08-01', '2026-11-30', 1500.00, '3b5e0002-0000-0000-0000-000000000002'),
  ('3b5f3333-0000-0000-0000-000000000003', '3b5b3333-0000-0000-0000-000000000003', '3b5c1111-0000-0000-0000-000000000001', '2026-07-01', '2027-06-30', 1500.00, '3b5e0005-0000-0000-0000-000000000005');

insert into public.membership_freezes
  (id, member_id, start_date, end_date, reason, state, requested_by,
   decided_by, decided_at, extension_days, ended_at, ended_via)
values
  -- M1: ended window (member-visible history, non-frozen)
  ('3b510001-0000-0000-0000-000000000001', '3b5b1111-0000-0000-0000-000000000001',
   '2026-10-01', '2026-10-05', 'Medical', 'ended',
   '3b5a9999-0000-0000-0000-000000000009', '3b5a2222-0000-0000-0000-000000000002', now(), 5,
   '2026-10-03 10:00+05:30', 'receptionist'),
  -- M2: pending (decide_freeze positive)
  ('3b510002-0000-0000-0000-000000000002', '3b5b2222-0000-0000-0000-000000000002',
   '2026-12-10', '2026-12-12', 'Travel', 'pending',
   '3b5a9999-0000-0000-0000-000000000009', null, null, null, null, null),
  -- M4: pending (AAL2 subject)
  ('3b510003-0000-0000-0000-000000000003', '3b5b4444-0000-0000-0000-000000000004',
   '2027-02-01', '2027-02-03', 'Personal', 'pending',
   '3b5a9999-0000-0000-0000-000000000009', null, null, null, null, null);

insert into public.qr_tokens (id, token_hash, purpose, expires_at, minted_by)
values
  ('3b520001-0000-0000-0000-000000000001',
   encode(sha256(convert_to('suite-3b5-token-alpha', 'utf8')), 'hex'),
   'attendance', now() + interval '1 day', '3b5a2222-0000-0000-0000-000000000002'),
  ('3b520002-0000-0000-0000-000000000002',
   encode(sha256(convert_to('suite-3b5-token-beta', 'utf8')), 'hex'),
   'attendance', now() + interval '1 day', '3b5a2222-0000-0000-0000-000000000002'),
  ('3b520003-0000-0000-0000-000000000003',
   encode(sha256(convert_to('suite-3b5-token-gamma', 'utf8')), 'hex'),
   'attendance', now() + interval '1 day', '3b5a2222-0000-0000-0000-000000000002');

insert into public.attendance_events (id, member_id, token_id, door, status, checked_in_at)
values
  ('3b550001-0000-0000-0000-000000000001', '3b5b1111-0000-0000-0000-000000000001',
   '3b520001-0000-0000-0000-000000000001', 'main', 'verified', now() - interval '2 days'),
  ('3b550002-0000-0000-0000-000000000002', '3b5b2222-0000-0000-0000-000000000002',
   '3b520002-0000-0000-0000-000000000002', 'main', 'verified', now() - interval '3 days');

insert into public.join_applications (id, auth_user_id, full_name, phone, email, plan_id, state) values
  ('3b530001-0000-0000-0000-000000000001', '3b5a3333-0000-0000-0000-000000000003', '3b5 Appl One',  '+919999000001', '3b5-a1@example.com', '3b5c1111-0000-0000-0000-000000000001', 'submitted'),
  ('3b530002-0000-0000-0000-000000000002', '3b5a4444-0000-0000-0000-000000000004', '3b5 Appl Two',  '+919999000002', '3b5-a2@example.com', '3b5c1111-0000-0000-0000-000000000001', 'submitted'),
  ('3b530003-0000-0000-0000-000000000003', null,                                   '3b5 Appl Three','+919999000003', '3b5-a3@example.com', '3b5c1111-0000-0000-0000-000000000001', 'submitted');

insert into public.app_settings (id, gym_timezone, attendance_token_validity_seconds)
values (1, 'Asia/Kolkata', 60)
on conflict (id) do update
  set gym_timezone = 'Asia/Kolkata',
      attendance_token_validity_seconds = 60;

-- =====================================================================
-- SECTION A — catalog & ACL surface
-- =====================================================================

select suite_results.check_true('A01', '13 authority RPCs exist in public',
  (select count(*) = 13
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (select name from suite_results.t_rpc)),
  'the documented RPC surface');

select suite_results.check_true('A02', 'all 13 RPCs are SECURITY DEFINER',
  (select bool_and(p.prosecdef)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (select name from suite_results.t_rpc)),
  'definer-owned authority functions');

select suite_results.check_true('A03', 'all 13 RPCs pin search_path = public',
  (select bool_and(p.proconfig @> array['search_path=public'])
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (select name from suite_results.t_rpc)),
  'no search_path hijack surface');

select suite_results.check_true('A04', 'authenticated has EXECUTE on all 13 RPCs',
  (select bool_and(has_function_privilege('authenticated', p.oid, 'execute'))
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (select name from suite_results.t_rpc)),
  'the RPC surface is reachable only via the authenticated role');

select suite_results.check_true('A05', 'anon has EXECUTE on no RPC',
  (select bool_and(not has_function_privilege('anon', p.oid, 'execute'))
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (select name from suite_results.t_rpc)),
  'anon is denied at the grant layer (not just the role gate)');

select suite_results.check_true('A06', 'service_role has EXECUTE on no RPC',
  (select bool_and(not has_function_privilege('service_role', p.oid, 'execute'))
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (select name from suite_results.t_rpc)),
  'service_role must not call client authority functions');

select suite_results.check_true('A07', 'no PUBLIC EXECUTE grant on any RPC or helper',
  (select count(*) = 0
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     cross join lateral aclexplode(p.proacl) a
    where n.nspname = 'public'
      and p.proname in (select name from suite_results.t_rpc)
      and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
  'PUBLIC (grantee 0) must hold no EXECUTE');

select suite_results.check_true('A08', 'internal helpers have no client EXECUTE',
  (select bool_and(
            not has_function_privilege('anon', p.oid, 'execute')
        and not has_function_privilege('authenticated', p.oid, 'execute')
        and not has_function_privilege('service_role', p.oid, 'execute'))
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('app_gym_date','require_role','assert_aal2',
                        'audit_authority','payments_reversal_cap_trigger')),
  'app_gym_date / require_role / assert_aal2 / audit_authority / cap trigger');

select suite_results.check_true('A09', 'anon holds zero table privileges',
  (select count(*) = 0
     from information_schema.role_table_grants g
     join information_schema.tables t
       on t.table_schema = g.table_schema and t.table_name = g.table_name
    where g.grantee = 'anon' and g.table_schema = 'public'
      and t.table_type = 'BASE TABLE'),
  'anon cannot even reach the tables');

select suite_results.check_true('A10', 'authenticated DML is exactly 2 INSERT grants',
  (select count(*) = 2
      and bool_and(g.privilege_type = 'INSERT')
      and bool_and(g.table_name in ('payments','follow_up_events'))
     from information_schema.role_table_grants g
     join information_schema.tables t
       on t.table_schema = g.table_schema and t.table_name = g.table_name
    where g.grantee = 'authenticated' and g.table_schema = 'public'
      and t.table_type = 'BASE TABLE'
      and g.privilege_type <> 'SELECT'),
  'payments + follow_up_events INSERT only; no UPDATE/DELETE anywhere');

select suite_results.check_true('A11', 'service_role holds no DML on authority tables',
  (select count(*) = 0
     from information_schema.role_table_grants
    where grantee = 'service_role' and table_schema = 'public'
      and table_name in ('members','payments','membership_periods',
                         'membership_freezes','membership_period_voids',
                         'attendance_events','plans','app_settings')
      and privilege_type <> 'SELECT'),
  'service_role is read-only on the authority-bearing tables');

select suite_results.check_true('A12', 'RLS enabled and forced on all 13 base tables',
  (select count(*) = 13 and bool_and(c.relrowsecurity and c.relforcerowsecurity)
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'),
  'every public base table is RLS-enabled and FORCEd');

-- =====================================================================
-- SECTION B — RLS isolation between members
-- =====================================================================

-- B: member one sees only their own world.
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b5a3333-0000-0000-0000-000000000003","role":"member"}';
set local request.jwt.claim.sub = '3b5a3333-0000-0000-0000-000000000003';

select suite_results.check_true('B01', 'member 1 sees exactly own member row',
  (select count(*) = 1
      and bool_and(id = '3b5b1111-0000-0000-0000-000000000001')
     from public.members),
  'members_select_own');

select suite_results.check_true('B02', 'member 1 sees only own profile',
  (select count(*) = 1
      and bool_and(id = '3b5a3333-0000-0000-0000-000000000003')
     from public.profiles),
  'profiles_select_own');

select suite_results.check_true('B03', 'member 1 sees only own payments',
  (select count(*) = 2
      and bool_and(member_id = '3b5b1111-0000-0000-0000-000000000001')
     from public.payments),
  'P1 + P3 only; P2/P5/P6/P8/P9 are invisible');

select suite_results.check_true('B04', 'member 1 sees only own periods',
  (select count(*) = 1
      and bool_and(member_id = '3b5b1111-0000-0000-0000-000000000001')
     from public.membership_periods),
  'periods_select_own');

select suite_results.check_true('B05', 'member 1 sees only own freezes',
  (select count(*) = 1
      and bool_and(member_id = '3b5b1111-0000-0000-0000-000000000001')
     from public.membership_freezes),
  'FZ1 (ended) only; M2/M4 freezes invisible');

select suite_results.check_true('B06', 'member 1 sees only own attendance',
  (select count(*) = 1
      and bool_and(member_id = '3b5b1111-0000-0000-0000-000000000001')
     from public.attendance_events),
  'attendance_select_own');

select suite_results.check_true('B07', 'member 1 sees only own application',
  (select count(*) = 1
      and bool_and(id = '3b530001-0000-0000-0000-000000000001')
     from public.join_applications),
  'applications_select_own');

select suite_results.check_true('B08', 'member 1 sees active plans only',
  -- order-independent: no inactive plan is visible to a member, the
  -- inactive fixture is hidden, and both active fixtures are visible.
  -- (Exact global counts would break when the 0001 baseline exists.)
  (select coalesce(bool_and(is_active), true) from public.plans)
  and exists (select 1 from public.plans
               where id = '3b5c1111-0000-0000-0000-000000000001')
  and exists (select 1 from public.plans
               where id = '3b5c2222-0000-0000-0000-000000000002')
  and not exists (select 1 from public.plans
                   where id = '3b5c3333-0000-0000-0000-000000000003'),
  'plans_select_member filters is_active');

select suite_results.check_true('B09', 'member 1 sees no voids and no audit rows',
  (select count(*) from public.membership_period_voids) = 0
  and (select count(*) from public.audit_log_entries) = 0,
  'voids/audit have no member policy');

select suite_results.check_fail('B09b', 'member 1 cannot read qr_tokens at all',
  $s$select count(*) from public.qr_tokens$s$,
  '42501', 'permission denied');

select suite_results.check_true('B10', 'member 1 sees 1 v_member_status row (self)',
  (select count(*) = 1
      and bool_and(member_id = '3b5b1111-0000-0000-0000-000000000001')
     from public.v_member_status),
  'view is security_invoker -> RLS applies');

select suite_results.check_true('B11', 'member 1 sees 1 v_inactive_members row (self)',
  (select count(*) = 1
      and bool_and(member_id = '3b5b1111-0000-0000-0000-000000000001')
     from public.v_inactive_members),
  'inactivity view is member-scoped by RLS');

select suite_results.check_true('B12', 'member 1 sees no v_daily_report rows',
  (select count(*) = 0 from public.v_daily_report),
  'staff-only role gate inside the view');

select suite_results.check_fail('B13', 'member 1 cannot insert a follow-up',
  $s$insert into public.follow_up_events (member_id, actor, channel, outcome)
     values ('3b5b1111-0000-0000-0000-000000000001','3b5a3333-0000-0000-0000-000000000003','called','open')$s$,
  '42501', 'row-level security');
commit;

-- member two: same isolation, mirrored fixture set
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b5a4444-0000-0000-0000-000000000004","role":"member"}';
set local request.jwt.claim.sub = '3b5a4444-0000-0000-0000-000000000004';

select suite_results.check_true('B14', 'member 2 sees exactly own member row',
  (select count(*) = 1
      and bool_and(id = '3b5b2222-0000-0000-0000-000000000002')
     from public.members),
  'isolated from member 1');

select suite_results.check_true('B15', 'member 2 sees only own payments and period',
  (select count(*) = 2
      and bool_and(member_id = '3b5b2222-0000-0000-0000-000000000002')
     from public.payments)
  and (select count(*) = 1
      and bool_and(member_id = '3b5b2222-0000-0000-0000-000000000002')
     from public.membership_periods),
  'P2 + P6, PR2 only');

select suite_results.check_true('B16', 'member 2 sees only own application',
  (select count(*) = 1
      and bool_and(id = '3b530002-0000-0000-0000-000000000002')
     from public.join_applications),
  'member 1 application is invisible');

select suite_results.check_true('B17', 'member 2 sees 1 v_member_status row (self)',
  (select count(*) = 1
      and bool_and(member_id = '3b5b2222-0000-0000-0000-000000000002')
     from public.v_member_status),
  'no cross-member leak through the view');
commit;

-- staff see everything
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b5a2222-0000-0000-0000-000000000002","role":"receptionist"}';
set local request.jwt.claim.sub = '3b5a2222-0000-0000-0000-000000000002';

select suite_results.check_true('B18', 'receptionist sees all members, payments, freezes',
  -- scoped to this suite's fixtures so the assertion stays true in a
  -- chained run (0001's baseline rows / 0002's residue are not ours to
  -- count). Seeing a member row at all already proves the staff policy
  -- widened beyond the caller's own rows: the receptionist is not a member.
  (select count(*) from public.members    where id::text like '3b5%') = 4
  and (select count(*) from public.payments where id::text like '3b5%') = 7
  and (select count(*) from public.membership_freezes where id::text like '3b5%') = 3,
  'staff policies widen to the whole gym');

select suite_results.check_true('B19', 'receptionist sees no audit rows (owner-only)',
  (select count(*) from public.audit_log_entries) = 0,
  'audit_select_owner is the sole policy');

select suite_results.check_fail('B20', 'receptionist cannot read qr_tokens at all',
  $s$select count(*) from public.qr_tokens$s$,
  '42501', 'permission denied');
commit;

-- =====================================================================
-- SECTION C — anon: no RPC and no table is reachable
-- =====================================================================
begin;
set local role anon;

do $anon$
declare
  r record;
begin
  for r in select * from suite_results.t_rpc order by n loop
    perform suite_results.check_fail(
      'C' || lpad(r.n::text, 2, '0'),
      'anon ' || r.name || ' -> permission denied',
      r.call_sql, '42501', 'permission denied');
  end loop;
end
$anon$;

select suite_results.check_fail('C14', 'anon cannot select members',
  $s$select count(*) from public.members$s$, '42501', 'permission denied');
select suite_results.check_fail('C15', 'anon cannot select payments',
  $s$select count(*) from public.payments$s$, '42501', 'permission denied');
select suite_results.check_fail('C16', 'anon cannot select app_settings',
  $s$select count(*) from public.app_settings$s$, '42501', 'permission denied');
commit;

-- =====================================================================
-- SECTION D — member persona: every staff/owner RPC is refused
-- =====================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b5a3333-0000-0000-0000-000000000003","role":"member"}';
set local request.jwt.claim.sub = '3b5a3333-0000-0000-0000-000000000003';

do $mem$
declare
  r record;
begin
  for r in select * from suite_results.t_rpc where n <> 7 order by n loop
    perform suite_results.check_fail(
      'D' || lpad(r.n::text, 2, '0'),
      'member ' || r.name || ' -> Insufficient role',
      r.call_sql, '42501', 'Insufficient role');
  end loop;
end
$mem$;

-- the grant exists (authenticated INSERT on payments) but the INSERT policy
-- is receptionist-only, so the member's own write is refused at RLS level.
select suite_results.check_fail('D14', 'member cannot insert a payment (RLS with-check)',
  $s$insert into public.payments (member_id, plan_id, entry_type, original_price, discount_pct, discount_amount, payable, method, state, recorded_by)
     values ('3b5b1111-0000-0000-0000-000000000001','3b5c1111-0000-0000-0000-000000000001','payment',1500,0,0,1500,'cash','awaitingVerification','3b5a3333-0000-0000-0000-000000000003')$s$,
  '42501', 'row-level security');
commit;

-- =====================================================================
-- SECTION E — receptionist persona: owner-only surfaces are refused
-- =====================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b5a2222-0000-0000-0000-000000000002","role":"receptionist","aal":"aal2"}';
set local request.jwt.claim.sub = '3b5a2222-0000-0000-0000-000000000002';

select suite_results.check_fail('E01', 'receptionist check_in -> Insufficient role',
  $s$select public.check_in('suite-3b5-token-alpha', 'main')$s$,
  '42501', 'Insufficient role');
select suite_results.check_fail('E02', 'receptionist update_plan_price -> Insufficient role',
  $s$select public.update_plan_price('3b5c1111-0000-0000-0000-000000000001'::uuid, 1600)$s$,
  '42501', 'Insufficient role');
select suite_results.check_fail('E03', 'receptionist update_gym_settings -> Insufficient role',
  $s$select public.update_gym_settings('Asia/Kolkata', null, null, 60)$s$,
  '42501', 'Insufficient role');
commit;

-- =====================================================================
-- SECTION F — owner persona: every receptionist write is refused
-- =====================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b5a1111-0000-0000-0000-000000000001","role":"owner","aal":"aal2"}';
set local request.jwt.claim.sub = '3b5a1111-0000-0000-0000-000000000001';

do $own$
declare
  r record;
begin
  for r in select * from suite_results.t_rpc where n not in (11, 13) order by n loop
    perform suite_results.check_fail(
      'F' || lpad(r.n::text, 2, '0'),
      'owner ' || r.name || ' -> Insufficient role',
      r.call_sql, '42501', 'Insufficient role');
  end loop;
end
$own$;

select suite_results.check_fail('F12', 'owner cannot insert a payment directly',
  $s$insert into public.payments (member_id, plan_id, entry_type, original_price, discount_pct, discount_amount, payable, method, state, recorded_by)
     values ('3b5b1111-0000-0000-0000-000000000001','3b5c1111-0000-0000-0000-000000000001','payment',1500,0,0,1500,'cash','awaitingVerification','3b5a1111-0000-0000-0000-000000000001')$s$,
  '42501', 'row-level security');
select suite_results.check_fail('F13', 'owner cannot update members directly',
  $s$update public.members set membership_end = '2030-01-01' where id = '3b5b1111-0000-0000-0000-000000000001'$s$,
  '42501', 'permission denied');
select suite_results.check_fail('F14', 'owner cannot delete a member',
  $s$delete from public.members where id = '3b5b1111-0000-0000-0000-000000000001'$s$,
  '42501', 'permission denied');
select suite_results.check_fail('F15', 'owner cannot update profiles.role',
  $s$update public.profiles set role = 'owner' where id = '3b5a3333-0000-0000-0000-000000000003'$s$,
  '42501', 'permission denied');
select suite_results.check_fail('F16', 'owner cannot update plans directly',
  $s$update public.plans set price = 1 where id = '3b5c1111-0000-0000-0000-000000000001'$s$,
  '42501', 'permission denied');
select suite_results.check_fail('F17', 'owner cannot write app_settings directly',
  $s$update public.app_settings set gym_timezone = 'UTC' where id = 1$s$,
  '42501', 'permission denied');
select suite_results.check_fail('F18', 'owner cannot delete audit rows',
  $s$delete from public.audit_log_entries$s$,
  '42501', 'permission denied');
commit;

-- =====================================================================
-- SECTION G — profileless authenticated user
-- =====================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b5a0000-0000-0000-0000-000000000000","role":"authenticated","aal":"aal2"}';
set local request.jwt.claim.sub = '3b5a0000-0000-0000-0000-000000000000';

do $nop$
declare
  r record;
begin
  for r in select * from suite_results.t_rpc order by n loop
    perform suite_results.check_fail(
      'G' || lpad(r.n::text, 2, '0'),
      'profileless ' || r.name || ' -> Insufficient role',
      r.call_sql, '42501', 'Insufficient role');
  end loop;
end
$nop$;

select suite_results.check_true('G14', 'profileless user sees zero rows everywhere',
  (select count(*) from public.members) = 0
  and (select count(*) from public.profiles) = 0
  and (select count(*) from public.plans) = 0
  and (select count(*) from public.payments) = 0
  and (select count(*) from public.membership_freezes) = 0
  and (select count(*) from public.v_member_status) = 0,
  'app_profile_role() is null -> every policy denies');
commit;

-- =====================================================================
-- SECTION H — AAL2 enforcement on the four gated RPCs
-- (verify_payment, create_reversal, decide_freeze, mint_attendance_token)
-- =====================================================================

-- H01-H04: JWT without an aal claim (treated as aal1)
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b5a2222-0000-0000-0000-000000000002","role":"receptionist"}';
set local request.jwt.claim.sub = '3b5a2222-0000-0000-0000-000000000002';

select suite_results.check_fail('H01', 'verify_payment without aal claim -> MFA required',
  $s$select public.verify_payment('3b5e0008-0000-0000-0000-000000000008'::uuid)$s$,
  '42501', 'multi-factor');
select suite_results.check_fail('H02', 'create_reversal without aal claim -> MFA required',
  $s$select public.create_reversal('3b5e0009-0000-0000-0000-000000000009'::uuid, 100)$s$,
  '42501', 'multi-factor');
select suite_results.check_fail('H03', 'decide_freeze without aal claim -> MFA required',
  $s$select public.decide_freeze('3b510003-0000-0000-0000-000000000003'::uuid, true)$s$,
  '42501', 'multi-factor');
select suite_results.check_fail('H04', 'mint_attendance_token without aal claim -> MFA required',
  $s$select public.mint_attendance_token(null)$s$,
  '42501', 'multi-factor');
commit;

-- H05-H08: explicit aal1
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b5a2222-0000-0000-0000-000000000002","role":"receptionist","aal":"aal1"}';
set local request.jwt.claim.sub = '3b5a2222-0000-0000-0000-000000000002';

select suite_results.check_fail('H05', 'verify_payment at aal1 -> MFA required',
  $s$select public.verify_payment('3b5e0008-0000-0000-0000-000000000008'::uuid)$s$,
  '42501', 'multi-factor');
select suite_results.check_fail('H06', 'create_reversal at aal1 -> MFA required',
  $s$select public.create_reversal('3b5e0009-0000-0000-0000-000000000009'::uuid, 100)$s$,
  '42501', 'multi-factor');
select suite_results.check_fail('H07', 'decide_freeze at aal1 -> MFA required',
  $s$select public.decide_freeze('3b510003-0000-0000-0000-000000000003'::uuid, true)$s$,
  '42501', 'multi-factor');
select suite_results.check_fail('H08', 'mint_attendance_token at aal1 -> MFA required',
  $s$select public.mint_attendance_token(null)$s$,
  '42501', 'multi-factor');
commit;

-- H09-H12: with aal2 the same calls pass the gate
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b5a2222-0000-0000-0000-000000000002","role":"receptionist","aal":"aal2"}';
set local request.jwt.claim.sub = '3b5a2222-0000-0000-0000-000000000002';

select suite_results.check_ok('H09', 'verify_payment at aal2 succeeds',
  $s$select public.verify_payment('3b5e0008-0000-0000-0000-000000000008'::uuid)$s$);
select suite_results.check_ok('H10', 'create_reversal at aal2 succeeds',
  $s$select public.create_reversal('3b5e0009-0000-0000-0000-000000000009'::uuid, 100)$s$);
select suite_results.check_ok('H11', 'decide_freeze at aal2 succeeds',
  $s$select public.decide_freeze('3b510003-0000-0000-0000-000000000003'::uuid, true)$s$);
select suite_results.check_ok('H12', 'mint_attendance_token at aal2 succeeds',
  $s$select public.mint_attendance_token(null)$s$);
commit;

-- =====================================================================
-- SECTION I — receptionist/owner positive paths that must keep working
-- =====================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b5a2222-0000-0000-0000-000000000002","role":"receptionist","aal":"aal2"}';
set local request.jwt.claim.sub = '3b5a2222-0000-0000-0000-000000000002';

select suite_results.check_ok('I01', 'receptionist rejects a payment',
  $s$select public.reject_payment('3b5e0006-0000-0000-0000-000000000006'::uuid)$s$);
select suite_results.check_ok('I02', 'receptionist requests a freeze',
  $s$select public.request_freeze('3b5b3333-0000-0000-0000-000000000003'::uuid, '2027-09-01'::date, '2027-09-03'::date, 'Medical')$s$);
select suite_results.check_ok('I03', 'receptionist sets a member discount',
  $s$select public.set_member_discount('3b5b3333-0000-0000-0000-000000000003'::uuid, 10)$s$);
select suite_results.check_ok('I04', 'receptionist requests a plan assignment',
  $s$select public.request_plan_assignment('3b5b3333-0000-0000-0000-000000000003'::uuid, '3b5c2222-0000-0000-0000-000000000002'::uuid)$s$);
select suite_results.check_ok('I05', 'receptionist records a follow-up',
  $s$insert into public.follow_up_events (member_id, actor, channel, outcome, note)
     values ('3b5b3333-0000-0000-0000-000000000003','3b5a2222-0000-0000-0000-000000000002','called','open','3b5 follow-up')$s$);
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b5a2222-0000-0000-0000-000000000002","role":"receptionist","aal":"aal2"}';
set local request.jwt.claim.sub = '3b5a2222-0000-0000-0000-000000000002';

select suite_results.check_ok('I06', 'receptionist decides the new freeze',
  $s$select public.decide_freeze((select id from public.membership_freezes
      where member_id = '3b5b3333-0000-0000-0000-000000000003' and state = 'pending'), true)$s$);
select suite_results.check_ok('I07', 'receptionist ends the approved freeze',
  $s$select public.end_freeze((select id from public.membership_freezes
      where member_id = '3b5b3333-0000-0000-0000-000000000003' and state = 'approved'))$s$);
select suite_results.check_ok('I08', 'receptionist decides a join application',
  $s$select public.decide_application('3b530003-0000-0000-0000-000000000003'::uuid, true)$s$);
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b5a1111-0000-0000-0000-000000000001","role":"owner","aal":"aal2"}';
set local request.jwt.claim.sub = '3b5a1111-0000-0000-0000-000000000001';

select suite_results.check_ok('I09', 'owner updates a plan price',
  $s$select public.update_plan_price('3b5c3333-0000-0000-0000-000000000003'::uuid, 1000)$s$);
select suite_results.check_ok('I10', 'owner updates gym settings',
  $s$select public.update_gym_settings('Asia/Kolkata', null, null, 60)$s$);
commit;

-- member positive: own scan still works
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b5a3333-0000-0000-0000-000000000003","role":"member"}';
set local request.jwt.claim.sub = '3b5a3333-0000-0000-0000-000000000003';

select suite_results.check_ok('I11', 'member checks in with a valid token',
  $s$select public.check_in('suite-3b5-token-gamma', 'main')$s$);
commit;

-- =====================================================================
-- SECTION J — audit trail: emitted, owner-visible, immutable
-- =====================================================================
select suite_results.check_true('J01', 'verify_payment emitted an audit row with actor + role',
  (select count(*) = 1
     from public.audit_log_entries
    where action = 'payment.verified'
      and actor = '3b5a2222-0000-0000-0000-000000000002'
      and actor_role = 'receptionist'
      and row_id = '3b5e0008-0000-0000-0000-000000000008'),
  'audit_authority resolves the authoritative profile role');

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b5a1111-0000-0000-0000-000000000001","role":"owner"}';
set local request.jwt.claim.sub = '3b5a1111-0000-0000-0000-000000000001';

select suite_results.check_true('J02', 'owner can read the audit trail',
  (select count(*) >= 1 from public.audit_log_entries),
  'audit_select_owner');

select suite_results.check_fail('J03', 'owner cannot update audit rows',
  $s$update public.audit_log_entries set action = 'tampered'$s$,
  '42501', 'permission denied');
select suite_results.check_fail('J04', 'owner cannot insert audit rows',
  $s$insert into public.audit_log_entries (action, table_name) values ('forged','members')$s$,
  '42501', 'permission denied');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b5a3333-0000-0000-0000-000000000003","role":"member"}';
set local request.jwt.claim.sub = '3b5a3333-0000-0000-0000-000000000003';

select suite_results.check_true('J05', 'member cannot see audit rows',
  (select count(*) from public.audit_log_entries) = 0,
  'no member policy on audit_log_entries');
commit;

-- =====================================================================
-- SECTION Z — cleanup and verdict
-- =====================================================================

delete from public.audit_log_entries
 where actor in (select id from public.profiles where id::text like '3b5%')
    or row_id::text like '3b5%';
delete from public.follow_up_events
 where member_id::text like '3b5%' or actor::text like '3b5%';
delete from public.membership_period_voids
 where reversal_id::text like '3b5%' or period_id::text like '3b5%';
delete from public.payments
 where reversal_of::text like '3b5%';
delete from public.membership_periods
 where id::text like '3b5%' or created_by_payment::text like '3b5%';
delete from public.payments where id::text like '3b5%';
delete from public.membership_freezes
 where id::text like '3b5%' or member_id::text like '3b5%';
delete from public.attendance_events
 where id::text like '3b5%' or member_id::text like '3b5%';
delete from public.qr_tokens
 where id::text like '3b5%' or minted_by::text like '3b5%';
delete from public.join_applications where id::text like '3b5%';
delete from public.members
 where id::text like '3b5%' or phone = '+919999000003';
delete from public.profiles where id::text like '3b5%';
delete from public.plans where id::text like '3b5%';
delete from auth.users where id::text like '3b5%';

select suite_results.check_true('Z01', 'zero 3b5 residue',
  (select count(*) from public.members where id::text like '3b5%') = 0
  and (select count(*) from public.profiles where id::text like '3b5%') = 0
  and (select count(*) from public.payments where id::text like '3b5%') = 0
  and (select count(*) from public.membership_periods where id::text like '3b5%') = 0
  and (select count(*) from public.membership_freezes where id::text like '3b5%') = 0
  and (select count(*) from public.attendance_events where id::text like '3b5%') = 0
  and (select count(*) from public.qr_tokens where id::text like '3b5%') = 0
  and (select count(*) from public.join_applications where id::text like '3b5%') = 0
  and (select count(*) from public.plans where id::text like '3b5%') = 0
  and (select count(*) from public.audit_log_entries where row_id::text like '3b5%') = 0,
  'database back to the post-0004 state');

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

  raise notice '0005 security validation: % of % assertions passed', v_total - v_fail, v_total;

  if v_fail > 0 then
    raise exception '0005 SECURITY VALIDATION FAILED: % of % assertions failed', v_fail, v_total;
  end if;
end
$v$;

drop schema suite_results cascade;
