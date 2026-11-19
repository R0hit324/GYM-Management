-- =====================================================================
-- tests/0004_views_validation.sql
-- Phase 3B.4 Stage 2 behavioral validation for 0004_views.sql.
-- Uses digit-only UUIDs (0-9 only) to guarantee PostgreSQL validity.
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
  v_ok    boolean;
  v_detail text;
  v_state text;
  v_msg   text;
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

-- positive helper: statement MUST succeed AND affect/return > 0 rows.
create function suite_results.check_ok(p_num text, p_label text, p_stmt text)
returns void language plpgsql as $co$
declare
  v_ok    boolean;
  v_detail text;
  v_msg   text;
  v_rows  bigint;
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

-- boolean assertion helper.
create function suite_results.check_true(p_num text, p_label text, p_ok boolean, p_detail text)
returns void language plpgsql as $ct$
begin
  insert into suite_results.t_results values (p_num, p_label, p_ok, p_detail);
end $ct$;

-- helpers must be executable by non-postgres personas.
grant execute on function suite_results.check_fail(text,text,text,text,text) to public;
grant execute on function suite_results.check_ok(text,text,text) to public;
grant execute on function suite_results.check_true(text,text,boolean,text) to public;

-- test-only SECURITY DEFINER wrapper. public.app_gym_date() is deliberately
-- internal (no client EXECUTE, checked by A03), so persona blocks cannot
-- call it directly. This wrapper exposes only the date, never the table.
create function suite_results.gym_date() returns date
language sql stable security definer
set search_path = 'public'
as $$ select public.app_gym_date() $$;
grant execute on function suite_results.gym_date() to public;

-- Baseline of today's aggregates BEFORE this suite's fixtures are inserted.
-- The suite runs after 0001-0003 in the documented chain, and those suites
-- leave documented fixtures behind; assertions below therefore verify the
-- DELTA contributed by this suite rather than a global total.
create table suite_results.t_baseline as
with tz as (
  select coalesce(
    (select gym_timezone from public.app_settings where id = 1),
    'Asia/Kolkata') as tz
)
select
  (select coalesce(sum(p.payable), 0)
     from public.payments p, tz
    where p.entry_type = 'payment' and p.state = 'verified'
      and (p.recorded_at at time zone tz.tz)::date
          = (now() at time zone tz.tz)::date) as gross,
  (select coalesce(sum(p.payable), 0)
     from public.payments p, tz
    where p.entry_type = 'reversal' and p.state = 'verified'
      and (p.recorded_at at time zone tz.tz)::date
          = (now() at time zone tz.tz)::date) as reversals,
  (select count(*)
     from public.attendance_events ae, tz
    where ae.status = 'verified'
      and (ae.checked_in_at at time zone tz.tz)::date
          = (now() at time zone tz.tz)::date) as attendance;
grant select on suite_results.t_baseline to public;

-- =====================================================================
-- Valid hex-only UUIDs (0-9 only). All 27 needed UUIDs use suffix
-- 000000000001, first group varies 00000001 through 00000027.
-- =====================================================================

-- auth users (8): owner, recA, m1, m2, m3_never, m4_frozen, expired, no-profile
-- UUIDs: 00000001 through 00000008
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '00000001-0000-0000-0000-000000000001', 'authenticated', 'authenticated', '4v-owner@example.com',    'x', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000002-0000-0000-0000-000000000002', 'authenticated', 'authenticated', '4v-rec-a@example.com',     'x', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000003-0000-0000-0000-000000000003', 'authenticated', 'authenticated', '4v-m1@example.com',        'x', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000004-0000-0000-0000-000000000004', 'authenticated', 'authenticated', '4v-m2@example.com',        'x', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000005-0000-0000-0000-000000000005', 'authenticated', 'authenticated', '4v-m3-never@example.com',  'x', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000006-0000-0000-0000-000000000006', 'authenticated', 'authenticated', '4v-m4-frozen@example.com', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000007-0000-0000-0000-000000000007', 'authenticated', 'authenticated', '4v-expired@example.com',   'x', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000008-0000-0000-0000-000000000008', 'authenticated', 'authenticated', '4v-noprofile@example.com', 'x', now(), now());

-- profiles (7; last auth user deliberately has none)
-- profile.id matches auth.user.id for the first 7; 8th has no profile
insert into public.profiles (id, display_name, role) values
  ('00000001-0000-0000-0000-000000000001', '4v Owner',         'owner'),
  ('00000002-0000-0000-0000-000000000002', '4v Rec A',         'receptionist'),
  ('00000003-0000-0000-0000-000000000003', '4v Member One',    'member'),
  ('00000004-0000-0000-0000-000000000004', '4v Member Two',    'member'),
  ('00000005-0000-0000-0000-000000000005', '4v Member Three',  'member'),
  ('00000006-0000-0000-0000-000000000006', '4v Member Four',   'member'),
  ('00000007-0000-0000-0000-000000000007', '4v Expired Member','member');

-- plans
insert into public.plans (id, name, duration, price, is_active) values
  ('00000009-0000-0000-0000-000000000001', '4v Monthly',   'monthly',   1500.00, true),
  ('00000010-0000-0000-0000-000000000002', '4v Quarterly', 'quarterly', 4000.00, true);

-- members
-- M1: active, scanned today, period end 2026-12-01, joined 2026-09-01
-- M2: active, scanned 5 days ago, period end 2027-01-31, joined 2026-11-01
-- M3: never attended, active, period end 2026-12-31, joined 2026-10-01 (40 days ago if today ~2026-11-10)
-- M4: frozen (approved freeze covering today), active, period end 2027-06-30, joined 2026-07-01
-- M5: expired, period end 2026-01-31, joined 2025-11-01
insert into public.members (id, full_name, phone, plan_id, price_locked, membership_end, auth_user_id, joined_on) values
  ('00000011-0000-0000-0000-000000000001', '4v Member One',   '+911000000001', '00000009-0000-0000-0000-000000000001', 1500.00, '2026-12-01', '00000003-0000-0000-0000-000000000003', '2026-09-01'),
  ('00000012-0000-0000-0000-000000000002', '4v Member Two',   '+911000000002', '00000009-0000-0000-0000-000000000001', 1500.00, '2027-01-31', '00000004-0000-0000-0000-000000000004', '2026-11-01'),
  ('00000013-0000-0000-0000-000000000003', '4v Member Three', '+911000000003', '00000009-0000-0000-0000-000000000001', 1500.00, '2026-12-31', '00000005-0000-0000-0000-000000000005', '2026-10-01'),
  ('00000014-0000-0000-0000-000000000004', '4v Member Four',  '+911000000004', '00000009-0000-0000-0000-000000000001', 1500.00, '2027-06-30', '00000006-0000-0000-0000-000000000006', '2026-07-01'),
  ('00000015-0000-0000-0000-000000000005', '4v Member Five',  '+911000000005', '00000009-0000-0000-0000-000000000001', 1500.00, '2026-01-31', '00000007-0000-0000-0000-000000000007', '2025-11-01');

-- payments (verified backers for periods) — must precede periods (FK)
insert into public.payments
  (id, member_id, plan_id, entry_type, original_price, discount_pct, discount_amount, payable, method, state, recorded_by, verified_by, verified_at)
values
  ('00000016-0000-0000-0000-000000000001', '00000011-0000-0000-0000-000000000001', '00000009-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'verified', '00000002-0000-0000-0000-000000000002', '00000001-0000-0000-0000-000000000001', now()),
  ('00000017-0000-0000-0000-000000000002', '00000012-0000-0000-0000-000000000002', '00000009-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'verified', '00000002-0000-0000-0000-000000000002', '00000001-0000-0000-0000-000000000001', now()),
  ('00000018-0000-0000-0000-000000000003', '00000013-0000-0000-0000-000000000003', '00000009-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'verified', '00000002-0000-0000-0000-000000000002', '00000001-0000-0000-0000-000000000001', now()),
  ('00000019-0000-0000-0000-000000000004', '00000014-0000-0000-0000-000000000004', '00000009-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'verified', '00000002-0000-0000-0000-000000000002', '00000001-0000-0000-0000-000000000001', now()),
  ('00000020-0000-0000-0000-000000000005', '00000015-0000-0000-0000-000000000005', '00000009-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'verified', '00000002-0000-0000-0000-000000000002', '00000001-0000-0000-0000-000000000001', now());

-- membership periods (non-voided)
insert into public.membership_periods
  (id, member_id, plan_id, start_date, end_date, price_applied, created_by_payment)
values
  ('00000021-0000-0000-0000-000000000001', '00000011-0000-0000-0000-000000000001', '00000009-0000-0000-0000-000000000001', '2026-09-01', '2026-12-01', 1500.00, '00000016-0000-0000-0000-000000000001'),
  ('00000022-0000-0000-0000-000000000002', '00000012-0000-0000-0000-000000000002', '00000009-0000-0000-0000-000000000001', '2026-11-01', '2027-01-31', 1500.00, '00000017-0000-0000-0000-000000000002'),
  ('00000023-0000-0000-0000-000000000003', '00000013-0000-0000-0000-000000000003', '00000009-0000-0000-0000-000000000001', '2026-10-01', '2026-12-31', 1500.00, '00000018-0000-0000-0000-000000000003'),
  ('00000024-0000-0000-0000-000000000004', '00000014-0000-0000-0000-000000000004', '00000009-0000-0000-0000-000000000001', '2026-07-01', '2027-06-30', 1500.00, '00000019-0000-0000-0000-000000000004'),
  ('00000025-0000-0000-0000-000000000005', '00000015-0000-0000-0000-000000000005', '00000009-0000-0000-0000-000000000001', '2025-11-01', '2026-01-31', 1500.00, '00000020-0000-0000-0000-000000000005');

-- qr_tokens backing the attendance rows (token_id is a NOT NULL FK).
-- Hashes are fixed 64-hex values distinct from the 0001-suite leftovers.
insert into public.qr_tokens (id, token_hash, purpose, expires_at, minted_by)
values
  ('00000023-0000-0000-0000-000000000001', repeat('deadbeef', 8), 'attendance', now() + interval '1 day', '00000002-0000-0000-0000-000000000002'),
  ('00000023-0000-0000-0000-000000000002', repeat('cafebabe', 8), 'attendance', now() + interval '1 day', '00000002-0000-0000-0000-000000000002'),
  ('00000023-0000-0000-0000-000000000003', repeat('0badf00d', 8), 'attendance', now() + interval '1 day', '00000002-0000-0000-0000-000000000002'),
  ('00000023-0000-0000-0000-000000000004', repeat('feedface', 8), 'attendance', now() + interval '1 day', '00000002-0000-0000-0000-000000000002'),
  ('00000023-0000-0000-0000-000000000005', repeat('8badf00d', 8), 'attendance', now() + interval '1 day', '00000002-0000-0000-0000-000000000002');

-- attendance events (verified scans)
-- M1 scanned today (gym_date), M2 scanned 5 days ago, M4 scanned 32 days ago
insert into public.attendance_events (id, member_id, token_id, door, status, checked_in_at)
values
  ('00000026-0000-0000-0000-000000000001', '00000011-0000-0000-0000-000000000001', '00000023-0000-0000-0000-000000000001', 'Main', 'verified', (select (now() at time zone coalesce((select gym_timezone from app_settings where id=1), 'Asia/Kolkata'))::date + time '07:00')),
  ('00000027-0000-0000-0000-000000000002', '00000012-0000-0000-0000-000000000002', '00000023-0000-0000-0000-000000000002', 'Main', 'verified', (select (now() at time zone coalesce((select gym_timezone from app_settings where id=1), 'Asia/Kolkata'))::date - interval '5 days' + time '07:00')),
  ('00000028-0000-0000-0000-000000000003', '00000014-0000-0000-0000-000000000004', '00000023-0000-0000-0000-000000000003', 'Main', 'verified', (select (now() at time zone coalesce((select gym_timezone from app_settings where id=1), 'Asia/Kolkata'))::date - interval '32 days' + time '07:00'));

-- freezes
-- FZ1: M4, approved, starts today, ends +3 days (active frozen window covering today)
-- FZ2: M1, ended early via scan 5 days ago (start = today-10, ended_at = today-5) -> 5 frozen days
-- FZ3: M3, approved, window elapsed, no end event (start = 2026-10-06, end = 2026-10-16) -> 11 frozen days
-- FZ4: M2, future-dated (starts +10 days) -> should contribute nothing yet
insert into public.membership_freezes (id, member_id, start_date, end_date, reason, state, requested_by, decided_by, decided_at, extension_days, ended_at, ended_via)
values
  ('00000029-0000-0000-0000-000000000001', '00000014-0000-0000-0000-000000000004',
   (select suite_results.gym_date()), (select suite_results.gym_date() + 3), 'Medical', 'approved', '00000002-0000-0000-0000-000000000002', '00000001-0000-0000-0000-000000000001', now(), 4, null, null),
  ('00000030-0000-0000-0000-000000000002', '00000011-0000-0000-0000-000000000001',
   (select suite_results.gym_date() - 10), (select suite_results.gym_date() - 5), 'Travel', 'ended', '00000002-0000-0000-0000-000000000002', '00000001-0000-0000-0000-000000000001', (select (now() at time zone coalesce((select gym_timezone from app_settings where id=1), 'Asia/Kolkata'))::date - 5 + time '10:00'), 6, (select (now() at time zone coalesce((select gym_timezone from app_settings where id=1), 'Asia/Kolkata'))::date - 5 + time '10:00'), 'scan'),
  ('00000031-0000-0000-0000-000000000003', '00000013-0000-0000-0000-000000000003',
   '2026-10-06', '2026-10-16', 'Personal', 'approved', '00000002-0000-0000-0000-000000000002', '00000001-0000-0000-0000-000000000001', '2026-10-05 10:00+05:30', 11, null, null),
  ('00000032-0000-0000-0000-000000000004', '00000012-0000-0000-0000-000000000002',
   (select suite_results.gym_date() + 10), (select suite_results.gym_date() + 14), 'Medical', 'approved', '00000002-0000-0000-0000-000000000002', '00000001-0000-0000-0000-000000000001', now(), 5, null, null);

-- =====================================================================
-- SECTION A — Catalog & Grants
-- =====================================================================

-- A01: all four views exist
select suite_results.check_ok('A01', 'v_member_status exists',
  $s$select 1 from information_schema.views where table_schema = 'public' and table_name = 'v_member_status'$s$);
select suite_results.check_ok('A02', 'v_inactive_members exists',
  $s$select 1 from information_schema.views where table_schema = 'public' and table_name = 'v_inactive_members'$s$);
select suite_results.check_ok('A03', 'v_daily_report exists',
  $s$select 1 from information_schema.views where table_schema = 'public' and table_name = 'v_daily_report'$s$);
select suite_results.check_ok('A04', 'v_month_revenue exists',
  $s$select 1 from information_schema.views where table_schema = 'public' and table_name = 'v_month_revenue'$s$);

-- A05: security_invoker on member views (reloptions has no information_schema
-- column; read pg_class.reloptions directly).
select suite_results.check_true('A05', 'v_member_status is security_invoker',
  (select coalesce(array_to_string(c.reloptions, ','), '') like '%security_invoker=true%'
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'v_member_status'),
  'v_member_status reloptions must include security_invoker=true');
select suite_results.check_true('A06', 'v_inactive_members is security_invoker',
  (select coalesce(array_to_string(c.reloptions, ','), '') like '%security_invoker=true%'
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'v_inactive_members'),
  'v_inactive_members reloptions must include security_invoker=true');

-- A07: grants/revoke pattern
select suite_results.check_true('A07', 'authenticated has SELECT on v_member_status',
  has_table_privilege('authenticated', 'public.v_member_status', 'select'),
  'GRANT SELECT TO authenticated');
select suite_results.check_true('A08', 'anon denied on v_member_status',
  not has_table_privilege('anon', 'public.v_member_status', 'select'),
  'REVOKE SELECT FROM anon');
select suite_results.check_true('A09', 'public denied on v_member_status',
  not has_table_privilege('public', 'public.v_member_status', 'select'),
  'REVOKE SELECT FROM public');

-- Same for other views
select suite_results.check_true('A10', 'authenticated has SELECT on v_inactive_members', has_table_privilege('authenticated', 'public.v_inactive_members', 'select'), '');
select suite_results.check_true('A11', 'authenticated has SELECT on v_daily_report', has_table_privilege('authenticated', 'public.v_daily_report', 'select'), '');
select suite_results.check_true('A12', 'authenticated has SELECT on v_month_revenue', has_table_privilege('authenticated', 'public.v_month_revenue', 'select'), '');
select suite_results.check_true('A13', 'anon denied on v_daily_report', not has_table_privilege('anon', 'public.v_daily_report', 'select'), '');
select suite_results.check_true('A14', 'anon denied on v_month_revenue', not has_table_privilege('anon', 'public.v_month_revenue', 'select'), '');

-- =====================================================================
-- SECTION B — Security: RLS & role gating
-- =====================================================================

-- B01: anon gets permission denied
begin;
set local role anon;
select suite_results.check_fail('B01', 'anon cannot select v_member_status',
  $s$select count(*) from public.v_member_status$s$,
  '42', 'permission denied');
commit;

-- B02: member sees only own row in v_member_status
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000003-0000-0000-0000-000000000003","role":"member"}';
set local request.jwt.claim.sub = '00000003-0000-0000-0000-000000000003';
select suite_results.check_ok('B02', 'member sees own v_member_status row',
  $s$select member_id, status from public.v_member_status$s$);
commit;

-- B03: member does NOT see other member's row
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000003-0000-0000-0000-000000000003","role":"member"}';
set local request.jwt.claim.sub = '00000003-0000-0000-0000-000000000003';
select suite_results.check_true('B03', 'member sees only 1 row (own)',
  (select count(*) from public.v_member_status) = 1,
  'RLS restricts member to own row');
commit;

-- B04: owner sees all rows in v_member_status
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-0000-0000-0000-000000000001","role":"owner"}';
set local request.jwt.claim.sub = '00000001-0000-0000-0000-000000000001';
select suite_results.check_ok('B04', 'owner sees all v_member_status rows',
  $s$select member_id, status from public.v_member_status$s$);
commit;

-- B05: receptionist sees all rows
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000002-0000-0000-0000-000000000002","role":"receptionist"}';
set local request.jwt.claim.sub = '00000002-0000-0000-0000-000000000002';
select suite_results.check_ok('B05', 'receptionist sees all v_member_status rows',
  $s$select member_id, status from public.v_member_status$s$);
commit;

-- B06: member sees only own row in v_inactive_members
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000003-0000-0000-0000-000000000003","role":"member"}';
set local request.jwt.claim.sub = '00000003-0000-0000-0000-000000000003';
select suite_results.check_true('B06', 'member sees only own v_inactive_members row',
  (select count(*) from public.v_inactive_members) = 1,
  'RLS restricts member to own row');
commit;

-- B07: v_daily_report returns 0 rows for member
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000003-0000-0000-0000-000000000003","role":"member"}';
set local request.jwt.claim.sub = '00000003-0000-0000-0000-000000000003';
select suite_results.check_true('B07', 'member sees 0 rows from v_daily_report',
  (select count(*) from public.v_daily_report) = 0,
  'WHERE app_profile_role() IN (owner,receptionist) filters out member');
commit;

-- B08: v_month_revenue returns 0 rows for member
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000003-0000-0000-0000-000000000003","role":"member"}';
set local request.jwt.claim.sub = '00000003-0000-0000-0000-000000000003';
select suite_results.check_true('B08', 'member sees 0 rows from v_month_revenue',
  (select count(*) from public.v_month_revenue) = 0,
  'WHERE app_profile_role() IN (owner,receptionist) filters out member');
commit;

-- B09: owner sees rows in v_daily_report
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-0000-0000-0000-000000000001","role":"owner"}';
set local request.jwt.claim.sub = '00000001-0000-0000-0000-000000000001';
select suite_results.check_ok('B09', 'owner sees v_daily_report rows',
  $s$select report_date, gross from public.v_daily_report$s$);
commit;

-- B10: owner sees rows in v_month_revenue
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-0000-0000-0000-000000000001","role":"owner"}';
set local request.jwt.claim.sub = '00000001-0000-0000-0000-000000000001';
select suite_results.check_ok('B10', 'owner sees v_month_revenue rows',
  $s$select report_month, gross from public.v_month_revenue$s$);
commit;

-- B11: receptionist sees rows in v_daily_report
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000002-0000-0000-0000-000000000002","role":"receptionist"}';
set local request.jwt.claim.sub = '00000002-0000-0000-0000-000000000002';
select suite_results.check_ok('B11', 'receptionist sees v_daily_report rows',
  $s$select report_date, gross from public.v_daily_report$s$);
commit;

-- B12: profileless authenticated user sees 0 rows
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000008-0000-0000-0000-000000000008","role":"authenticated"}';
set local request.jwt.claim.sub = '00000008-0000-0000-0000-000000000008';
select suite_results.check_true('B12', 'profileless user sees 0 rows in v_member_status',
  (select count(*) from public.v_member_status) = 0,
  'app_profile_role() returns null for profileless user');
commit;

-- =====================================================================
-- SECTION C — v_member_status: freeze arithmetic & status
-- =====================================================================

-- C01: M4 (frozen member) shows status 'frozen'
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-0000-0000-0000-000000000001","role":"owner"}';
set local request.jwt.claim.sub = '00000001-0000-0000-0000-000000000001';
select suite_results.check_true('C01', 'M4 (frozen) shows status frozen',
  (select status from public.v_member_status where member_id = '00000014-0000-0000-0000-000000000004') = 'frozen',
  'active approved freeze covering today -> frozen status');
commit;

-- C02: M4 is_frozen = true, active_freeze_count = 1
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-0000-0000-0000-000000000001","role":"owner"}';
set local request.jwt.claim.sub = '00000001-0000-0000-0000-000000000001';
select suite_results.check_true('C02', 'M4 is_frozen true, active_freeze_count 1',
  (select is_frozen and active_freeze_count = 1
   from public.v_member_status where member_id = '00000014-0000-0000-0000-000000000004'),
  'frozen member flags');
commit;

-- C03: M1 (ended freeze 5 days ago) effective_expiry = period_end + 5 frozen days
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-0000-0000-0000-000000000001","role":"owner"}';
set local request.jwt.claim.sub = '00000001-0000-0000-0000-000000000001';
select suite_results.check_true('C03', 'M1 effective_expiry = 2026-12-06 (period_end + 5 frozen)',
  (select effective_expiry from public.v_member_status where member_id = '00000011-0000-0000-0000-000000000001') = '2026-12-06',
  'ended freeze contributes actual frozen days (5), not planned (6)');
commit;

-- C04: M1 status = active
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-0000-0000-0000-000000000001","role":"owner"}';
set local request.jwt.claim.sub = '00000001-0000-0000-0000-000000000001';
select suite_results.check_true('C04', 'M1 status = active',
  (select status from public.v_member_status where member_id = '00000011-0000-0000-0000-000000000001') = 'active',
  'not frozen, effective_expiry in future -> active');
commit;

-- C05: M3 (never attended) has frozen days from FZ3 (window elapsed)
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-0000-0000-0000-000000000001","role":"owner"}';
set local request.jwt.claim.sub = '00000001-0000-0000-0000-000000000001';
select suite_results.check_true('C05', 'M3 effective_expiry = 2027-01-11 (period_end + 11 frozen)',
  (select effective_expiry from public.v_member_status where member_id = '00000013-0000-0000-0000-000000000003') = '2027-01-11',
  'window-elapsed approved freeze contributes full planned window');
commit;

-- C06: M2 future-dated freeze (FZ4) contributes 0 frozen days
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-0000-0000-0000-000000000001","role":"owner"}';
set local request.jwt.claim.sub = '00000001-0000-0000-0000-000000000001';
select suite_results.check_true('C06', 'M2 future freeze adds 0 days',
  (select effective_expiry from public.v_member_status where member_id = '00000012-0000-0000-0000-000000000002') = '2027-01-31',
  'future-dated freeze contributes nothing before start_date');
commit;

-- C07: M5 expired member shows status 'expired'
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-0000-0000-0000-000000000001","role":"owner"}';
set local request.jwt.claim.sub = '00000001-0000-0000-0000-000000000001';
select suite_results.check_true('C07', 'M5 (expired) shows status expired',
  (select status from public.v_member_status where member_id = '00000015-0000-0000-0000-000000000005') = 'expired',
  'period_end + 0 frozen < today -> expired');
commit;

-- C08: stored_membership_end matches latest non-voided period end_date
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-0000-0000-0000-000000000001","role":"owner"}';
set local request.jwt.claim.sub = '00000001-0000-0000-0000-000000000001';
select suite_results.check_true('C08', 'stored_membership_end = period_end for all members',
  (select count(*) from public.v_member_status
   where stored_membership_end <> (
     select end_date from public.membership_periods p
     where p.member_id = v_member_status.member_id
       and not exists (select 1 from public.membership_period_voids v where v.period_id = p.id)
     order by p.start_date desc, p.created_at desc limit 1
   )) = 0,
  'stored end always matches latest non-voided period');
commit;

-- =====================================================================
-- SECTION D — v_inactive_members: interval-intersection formula
-- =====================================================================

-- D01: M1 (scanned today) -> inactive_days = 0, not inactive
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-0000-0000-0000-000000000001","role":"owner"}';
set local request.jwt.claim.sub = '00000001-0000-0000-0000-000000000001';
select suite_results.check_true('D01', 'M1 scanned today -> inactive_days = 0, not inactive',
  (select inactive_days = 0 and is_inactive = false
   from public.v_inactive_members where member_id = '00000011-0000-0000-0000-000000000001'),
  'today scan resets inactivity');
commit;

-- D02: M2 (scanned 5 days ago, no freezes) -> raw = 5, frozen = 0, inactive = 5, not inactive
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-0000-0000-0000-000000000001","role":"owner"}';
set local request.jwt.claim.sub = '00000001-0000-0000-0000-000000000001';
select suite_results.check_true('D02', 'M2 scanned 5 days ago -> inactive_days = 5, not inactive',
  (select inactive_days = 5 and is_inactive = false
   from public.v_inactive_members where member_id = '00000012-0000-0000-0000-000000000002'),
  '5 non-frozen days -> not inactive');
commit;

-- D03: M3 (never attended; FZ3 covers 2026-10-06..2026-10-16 = 11 days)
-- expected inactivity = (gym_date - joined_on) - 11. Expressed relative to
-- gym_date so the assertion is not tied to the calendar day it runs.
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-0000-0000-0000-000000000001","role":"owner"}';
set local request.jwt.claim.sub = '00000001-0000-0000-0000-000000000001';
select suite_results.check_true('D03', 'M3: 11 elapsed frozen days are excluded from inactivity',
  (select inactive_days = ((select suite_results.gym_date() - date '2026-10-01') - 11)
          and is_inactive = (((select suite_results.gym_date() - date '2026-10-01') - 11) > 30)
   from public.v_inactive_members where member_id = '00000013-0000-0000-0000-000000000003'),
  'raw days since joined_on minus the 11 frozen days (Oct 6-16 inclusive)');
commit;

-- D04: M4 (frozen today, scanned 32 days ago). Today is a frozen day, so
-- only the 31 non-frozen days count; 31 > 30 -> inactive.
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-0000-0000-0000-000000000001","role":"owner"}';
set local request.jwt.claim.sub = '00000001-0000-0000-0000-000000000001';
select suite_results.check_true('D04', 'M4 scanned 32 days ago, frozen today -> inactive_days = 31, inactive',
  (select inactive_days = 31 and is_inactive = true
   from public.v_inactive_members where member_id = '00000014-0000-0000-0000-000000000004'),
  'freeze starting today excludes today from inactivity (32 raw - 1 frozen)');
commit;

-- D05/D06 boundary fixtures: two members, 30 and 31 non-frozen days.
-- Payments are backdated so today's daily report is unaffected.
begin;
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
  values
    ('00000000-0000-0000-0000-000000000000', '00000009-0000-0000-0000-000000000009', 'authenticated', 'authenticated', '4v-boundary30@example.com', 'x', now(), now()),
    ('00000000-0000-0000-0000-000000000000', '00000010-0000-0000-0000-000000000010', 'authenticated', 'authenticated', '4v-boundary31@example.com', 'x', now(), now());
  insert into public.profiles (id, display_name, role) values
    ('00000009-0000-0000-0000-000000000009', '4v Boundary 30', 'member'),
    ('00000010-0000-0000-0000-000000000010', '4v Boundary 31', 'member');
  insert into public.members (id, full_name, phone, plan_id, price_locked, membership_end, auth_user_id, joined_on)
  values
    ('00000016-0000-0000-0000-000000000009', '4v Boundary 30', '+911000000009', '00000009-0000-0000-0000-000000000001', 1500.00, (select suite_results.gym_date() + 60), '00000009-0000-0000-0000-000000000009', (select suite_results.gym_date() - 45)),
    ('00000017-0000-0000-0000-000000000011', '4v Boundary 31', '+911000000010', '00000009-0000-0000-0000-000000000001', 1500.00, (select suite_results.gym_date() + 60), '00000010-0000-0000-0000-000000000010', (select suite_results.gym_date() - 45));
  insert into public.payments (id, member_id, plan_id, entry_type, original_price, discount_pct, discount_amount, payable, method, state, recorded_by, verified_by, verified_at, recorded_at)
  values
    ('00000021-0000-0000-0000-000000000009', '00000016-0000-0000-0000-000000000009', '00000009-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'verified', '00000002-0000-0000-0000-000000000002', '00000001-0000-0000-0000-000000000001', now() - interval '35 days', now() - interval '35 days'),
    ('00000022-0000-0000-0000-000000000010', '00000017-0000-0000-0000-000000000011', '00000009-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'verified', '00000002-0000-0000-0000-000000000002', '00000001-0000-0000-0000-000000000001', now() - interval '35 days', now() - interval '35 days');
  insert into public.membership_periods (id, member_id, plan_id, start_date, end_date, price_applied, created_by_payment)
  values
    ('00000026-0000-0000-0000-000000000009', '00000016-0000-0000-0000-000000000009', '00000009-0000-0000-0000-000000000001', (select suite_results.gym_date() - 30), (select suite_results.gym_date() + 30), 1500.00, '00000021-0000-0000-0000-000000000009'),
    ('00000027-0000-0000-0000-000000000010', '00000017-0000-0000-0000-000000000011', '00000009-0000-0000-0000-000000000001', (select suite_results.gym_date() - 31), (select suite_results.gym_date() + 30), 1500.00, '00000022-0000-0000-0000-000000000010');
  insert into public.attendance_events (id, member_id, token_id, door, status, checked_in_at)
  values
    ('00000029-0000-0000-0000-000000000009', '00000016-0000-0000-0000-000000000009', '00000023-0000-0000-0000-000000000004', 'Main', 'verified', (select (now() at time zone coalesce((select gym_timezone from app_settings where id=1), 'Asia/Kolkata'))::date - interval '30 days' + time '07:00')),
    ('00000030-0000-0000-0000-000000000010', '00000017-0000-0000-0000-000000000011', '00000023-0000-0000-0000-000000000005', 'Main', 'verified', (select (now() at time zone coalesce((select gym_timezone from app_settings where id=1), 'Asia/Kolkata'))::date - interval '31 days' + time '07:00'));
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-0000-0000-0000-000000000001","role":"owner"}';
set local request.jwt.claim.sub = '00000001-0000-0000-0000-000000000001';
select suite_results.check_true('D05', 'exactly 30 non-frozen days -> is_inactive = false',
  (select inactive_days = 30 and is_inactive = false
   from public.v_inactive_members where member_id = '00000016-0000-0000-0000-000000000009'),
  'threshold: 30 = not inactive, 31 = inactive');
commit;

-- D06: 31 days -> inactive (separate member, scanned 31 days ago)
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-0000-0000-0000-000000000001","role":"owner"}';
set local request.jwt.claim.sub = '00000001-0000-0000-0000-000000000001';
select suite_results.check_true('D06', '31 non-frozen days -> is_inactive = true',
  (select inactive_days = 31 and is_inactive = true
   from public.v_inactive_members where member_id = '00000017-0000-0000-0000-000000000011'),
  '31 days crosses the threshold');
commit;

-- D07: M1 freeze before L+1 -> frozen_days_between = 0
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-0000-0000-0000-000000000001","role":"owner"}';
set local request.jwt.claim.sub = '00000001-0000-0000-0000-000000000001';
select suite_results.check_true('D07', 'M1 freeze before L+1 -> frozen_days_between = 0',
  (select frozen_days_between = 0
   from public.v_inactive_members where member_id = '00000011-0000-0000-0000-000000000001'),
  'freeze entirely before L+1 contributes nothing');
commit;

-- D08: M4 freeze starts today -> frozen_days_between = 1 (inclusive window
-- counts today; the 31 earlier days are not covered by the freeze)
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-0000-0000-0000-000000000001","role":"owner"}';
set local request.jwt.claim.sub = '00000001-0000-0000-0000-000000000001';
select suite_results.check_true('D08', 'M4 freeze starts today, span 32 days -> frozen_days_between = 1',
  (select frozen_days_between = 1
   from public.v_inactive_members where member_id = '00000014-0000-0000-0000-000000000004'),
  'inclusive freeze window covers today only, not the earlier 31 days');
commit;

-- =====================================================================
-- SECTION E — v_daily_report & v_month_revenue: aggregates & filters
-- =====================================================================

-- E01: v_daily_report gross = 7500 for today (5 verified payments * 1500)
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-0000-0000-0000-000000000001","role":"owner"}';
set local request.jwt.claim.sub = '00000001-0000-0000-0000-000000000001';
select suite_results.check_true('E01', 'v_daily_report gross increases by 7500 for today',
  (select gross = (select gross + 7500 from suite_results.t_baseline)
   from public.v_daily_report
   where report_date = (select suite_results.gym_date())
  ),
  '5 verified fixture payments * 1500 = +7500 today (baseline-aware)');
commit;

-- E02: reversals = 0, net = gross
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-0000-0000-0000-000000000001","role":"owner"}';
set local request.jwt.claim.sub = '00000001-0000-0000-0000-000000000001';
select suite_results.check_true('E02', 'v_daily_report adds no reversals; net = gross - reversals',
  (select reversals = (select reversals from suite_results.t_baseline)
          and net = gross - reversals
   from public.v_daily_report
   where report_date = (select suite_results.gym_date())
  ),
  'this suite creates no reversal rows; net identity holds against baseline');
commit;

-- E03: attendance = 1 today
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-0000-0000-0000-000000000001","role":"owner"}';
set local request.jwt.claim.sub = '00000001-0000-0000-0000-000000000001';
select suite_results.check_true('E03', 'v_daily_report attendance increases by 1 today',
  (select attendance = (select attendance + 1 from suite_results.t_baseline)
   from public.v_daily_report
   where report_date = (select suite_results.gym_date())
  ),
  '1 fixture scan today (baseline-aware)');
commit;

-- E04: new_members = 0 today
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-0000-0000-0000-000000000001","role":"owner"}';
set local request.jwt.claim.sub = '00000001-0000-0000-0000-000000000001';
select suite_results.check_true('E04', 'v_daily_report new_members = 0 today',
  (select new_members = 0
   from public.v_daily_report
   where report_date = (select suite_results.gym_date())
  ),
  'no period starts today');
commit;

-- E05: discounts = 0
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-0000-0000-0000-000000000001","role":"owner"}';
set local request.jwt.claim.sub = '00000001-0000-0000-0000-000000000001';
select suite_results.check_true('E05', 'v_daily_report discounts = 0',
  (select discounts = 0
   from public.v_daily_report
   where report_date = (select suite_results.gym_date())
  ),
  'no discounts in fixtures');
commit;

-- E06: pending payment does not increase gross
begin;
  insert into public.payments (id, member_id, plan_id, entry_type, original_price, discount_pct, discount_amount, payable, method, utr, state, recorded_by)
  values ('00000021-0000-0000-0000-000000000001', '00000011-0000-0000-0000-000000000001', '00000009-0000-0000-0000-000000000001', 'payment', 5000.00, 0, 0, 5000.00, 'upi', '4v-e06-utr-001', 'awaitingVerification', '00000002-0000-0000-0000-000000000002');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-0000-0000-0000-000000000001","role":"owner"}';
set local request.jwt.claim.sub = '00000001-0000-0000-0000-000000000001';
select suite_results.check_true('E06', 'pending payment does not increase gross',
  (select gross = (select gross + 7500 from suite_results.t_baseline)
   from public.v_daily_report
   where report_date = (select suite_results.gym_date())
  ),
  'awaitingVerification excluded from revenue');
commit;

-- E07: rejected payment does not count
begin;
  insert into public.payments (id, member_id, plan_id, entry_type, original_price, discount_pct, discount_amount, payable, method, state, recorded_by, verified_by, verified_at)
  values ('00000022-0000-0000-0000-000000000001', '00000012-0000-0000-0000-000000000002', '00000009-0000-0000-0000-000000000001', 'payment', 3000.00, 0, 0, 3000.00, 'cash', 'rejected', '00000002-0000-0000-0000-000000000002', '00000001-0000-0000-0000-000000000001', now());
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-0000-0000-0000-000000000001","role":"owner"}';
set local request.jwt.claim.sub = '00000001-0000-0000-0000-000000000001';
select suite_results.check_true('E07', 'rejected payment does not increase gross',
  (select gross = (select gross + 7500 from suite_results.t_baseline)
   from public.v_daily_report
   where report_date = (select suite_results.gym_date())
  ),
  'rejected excluded from revenue');
commit;

-- E08: v_month_revenue returns monthly rows
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-0000-0000-0000-000000000001","role":"owner"}';
set local request.jwt.claim.sub = '00000001-0000-0000-0000-000000000001';
select suite_results.check_ok('E08', 'v_month_revenue returns monthly rows',
  $s$select report_month, gross from public.v_month_revenue$s$);
commit;

-- E09: monthly gross = sum of daily gross in that month
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-0000-0000-0000-000000000001","role":"owner"}';
set local request.jwt.claim.sub = '00000001-0000-0000-0000-000000000001';
select suite_results.check_true('E09', 'monthly gross = sum of daily gross in month',
  (select mr.gross = (select sum(dr.gross) from public.v_daily_report dr
                       where date_trunc('month', dr.report_date)::date = mr.report_month)
   from public.v_month_revenue mr
   where mr.report_month = date_trunc('month', (select suite_results.gym_date()))::date
  ),
  'monthly aggregation consistency');
commit;

-- E10: v_daily_report has no transaction-detail columns
select suite_results.check_true('E10', 'v_daily_report has no transaction-detail columns',
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'v_daily_report'
      and column_name in ('member_name', 'amount', 'method', 'payment_date', 'utr', 'status', 'receptionist')
  ),
  'aggregate-only columns per O-28 assignment to export feature');
select suite_results.check_true('E11', 'v_month_revenue has no transaction-detail columns',
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'v_month_revenue'
      and column_name in ('member_name', 'amount', 'method', 'payment_date', 'utr', 'status', 'receptionist')
  ),
  'aggregate-only columns');
select suite_results.check_true('E12', 'v_daily_report column count matches spec',
  (select count(*) from information_schema.columns
   where table_schema = 'public' and table_name = 'v_daily_report'
     and column_name in ('report_date', 'gross', 'reversals', 'net', 'attendance', 'unique_visitors', 'new_members', 'renewals', 'discounts', 'refunds', 'today')
  ) = 11,
  'exactly the specified aggregate columns');
select suite_results.check_true('E13', 'v_month_revenue column count matches spec',
  (select count(*) from information_schema.columns
   where table_schema = 'public' and table_name = 'v_month_revenue'
     and column_name in ('report_month', 'gross', 'reversals', 'net', 'attendance', 'unique_visitors', 'new_members', 'renewals', 'discounts', 'refunds', 'today')
  ) = 11,
  'exactly the specified aggregate columns');

-- =====================================================================
-- SECTION F — Timezone & month semantics
-- =====================================================================

-- F01: gym_date() conversion uses configured timezone
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-0000-0000-0000-000000000001","role":"owner"}';
set local request.jwt.claim.sub = '00000001-0000-0000-0000-000000000001';
select suite_results.check_true('F01', 'v_member_status gym_date matches suite_results.gym_date()',
  (select gym_date = suite_results.gym_date() from public.v_member_status limit 1),
  'all views use same gym-date conversion');
commit;

-- F02: bare ::date differs when server tz != gym tz. Use a fixed instant
-- so the assertion does not depend on the time of day the suite runs.
select suite_results.check_true('F02', 'timezone conversion matters (server UTC, gym IST)',
  (('2026-01-01 20:00:00+00'::timestamptz at time zone 'UTC')::date
     <> ('2026-01-01 20:00:00+00'::timestamptz at time zone 'Asia/Kolkata')::date),
  '20:00 UTC on Jan 1 is already Jan 2 in IST: bare ::date uses server tz');

-- =====================================================================
-- SECTION G — verify_payment renewal behavior (R14 after_expiry ruling)
-- =====================================================================

-- Renewal payments are inserted as postgres with recorded_by = owner so
-- that the verifying receptionist is a DIFFERENT actor: self-verification
-- is default-deny. The desk override trigger is skipped in this
-- maintenance context, which is exactly what lets the recorder differ.
insert into public.payments
  (id, member_id, plan_id, entry_type, original_price, discount_pct,
   discount_amount, payable, method, state, recorded_by)
values
  ('00000041-0000-0000-0000-000000000001', '00000012-0000-0000-0000-000000000002',
   '00000009-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00,
   'cash', 'awaitingVerification', '00000001-0000-0000-0000-000000000001'),
  ('00000042-0000-0000-0000-000000000002', '00000011-0000-0000-0000-000000000001',
   '00000009-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00,
   'cash', 'awaitingVerification', '00000001-0000-0000-0000-000000000001'),
  ('00000043-0000-0000-0000-000000000003', '00000015-0000-0000-0000-000000000005',
   '00000009-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00,
   'cash', 'awaitingVerification', '00000001-0000-0000-0000-000000000001');

-- G01: recA verifies M2 (no freezes; derived expiry = stored expiry)
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000002-0000-0000-0000-000000000002","role":"receptionist","aal":"aal2"}';
set local request.jwt.claim.sub = '00000002-0000-0000-0000-000000000002';
select suite_results.check_ok('G01', 'recA verifies M2 renewal (before derived expiry)',
  $s$select public.verify_payment('00000041-0000-0000-0000-000000000001'::uuid)$s$);
commit;

-- G02: renewal starts the calendar day after the DERIVED expiry.
-- M2 has no counted freeze days, so derived = stored 2027-01-31.
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-0000-0000-0000-000000000001","role":"owner"}';
set local request.jwt.claim.sub = '00000001-0000-0000-0000-000000000001';
select suite_results.check_true('G02', 'renewal start = derived expiry + 1 (M2, 0 frozen days)',
  (select start_date = '2027-02-01'
   from public.membership_periods
   where created_by_payment = '00000041-0000-0000-0000-000000000001'
  ),
  'R14: stored end 2027-01-31 + 0 frozen days -> renewal starts 2027-02-01');
commit;

-- G03: recA verifies M1, whose ended freeze contributes 5 actual frozen
-- days (ended via scan at today-5, so days today-10 .. today-6 count).
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000002-0000-0000-0000-000000000002","role":"receptionist","aal":"aal2"}';
set local request.jwt.claim.sub = '00000002-0000-0000-0000-000000000002';
select suite_results.check_ok('G03', 'recA verifies M1 renewal (5 frozen days counted)',
  $s$select public.verify_payment('00000042-0000-0000-0000-000000000002'::uuid)$s$);
commit;

-- G04: the freeze extension moves the renewal start: 2026-12-01 stored
-- end + 5 frozen days = derived 2026-12-06 -> start 2026-12-07, NOT
-- 2026-12-02 (which is what stored_end + 1 would wrongly give).
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-0000-0000-0000-000000000001","role":"owner"}';
set local request.jwt.claim.sub = '00000001-0000-0000-0000-000000000001';
select suite_results.check_true('G04', 'renewal start = freeze-adjusted derived expiry + 1 (M1)',
  (select start_date = '2026-12-07'
   from public.membership_periods
   where created_by_payment = '00000042-0000-0000-0000-000000000002'
  ),
  'R14: stored 2026-12-01 + 5 frozen = 2026-12-06 -> start 2026-12-07');
commit;

-- G05: recA verifies M5 whose derived expiry is already in the past.
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000002-0000-0000-0000-000000000002","role":"receptionist","aal":"aal2"}';
set local request.jwt.claim.sub = '00000002-0000-0000-0000-000000000002';
select suite_results.check_ok('G05', 'recA verifies M5 post-expiry renewal',
  $s$select public.verify_payment('00000043-0000-0000-0000-000000000003'::uuid)$s$);
commit;

-- G06: post-expiry renewal re-anchors at the verification date.
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-0000-0000-0000-000000000001","role":"owner"}';
set local request.jwt.claim.sub = '00000001-0000-0000-0000-000000000001';
select suite_results.check_true('G06', 'post-expiry period start = verification date (today)',
  (select start_date = suite_results.gym_date()
   from public.membership_periods
   where created_by_payment = '00000043-0000-0000-0000-000000000003'
  ),
  'O-05: derived expiry in the past -> start = today, gap days uncovered');
commit;

-- =====================================================================
-- SECTION I — Freeze-day arithmetic: inclusive, union, scan-end, future
-- =====================================================================
-- Six members, each with one non-voided period ending 100 days from
-- today, so effective_expiry isolates the freeze contribution exactly.
-- Semantics under test (identical in v_member_status and verify_payment):
--   * approved + ended rows only; inclusive [start_date, end_date]
--   * ended by unfreeze/scan stops at gym_local(ended_at) - 1
--   * future-dated windows contribute nothing yet
--   * overlaps are union-merged, never double-counted
insert into public.members (id, full_name, phone, plan_id, price_locked, membership_end, joined_on)
values
  ('00000051-0000-0000-0000-000000000001', '4v I One Day',   '+911000005001', '00000009-0000-0000-0000-000000000001', 1500.00, (select suite_results.gym_date() + 100), (select suite_results.gym_date() - 200)),
  ('00000052-0000-0000-0000-000000000002', '4v I Feb Ten',   '+911000005002', '00000009-0000-0000-0000-000000000001', 1500.00, (select suite_results.gym_date() + 100), (select suite_results.gym_date() - 200)),
  ('00000053-0000-0000-0000-000000000003', '4v I Early End', '+911000005003', '00000009-0000-0000-0000-000000000001', 1500.00, (select suite_results.gym_date() + 100), (select suite_results.gym_date() - 200)),
  ('00000054-0000-0000-0000-000000000004', '4v I Future',    '+911000005004', '00000009-0000-0000-0000-000000000001', 1500.00, (select suite_results.gym_date() + 100), (select suite_results.gym_date() - 200)),
  ('00000055-0000-0000-0000-000000000005', '4v I Overlap',   '+911000005005', '00000009-0000-0000-0000-000000000001', 1500.00, (select suite_results.gym_date() + 100), (select suite_results.gym_date() - 200)),
  ('00000056-0000-0000-0000-000000000006', '4v I Scan End',  '+911000005006', '00000009-0000-0000-0000-000000000001', 1500.00, (select suite_results.gym_date() + 100), (select suite_results.gym_date() - 200));

insert into public.payments
  (id, member_id, plan_id, entry_type, original_price, discount_pct,
   discount_amount, payable, method, state, recorded_by, verified_by, verified_at)
values
  ('00000071-0000-0000-0000-000000000001', '00000051-0000-0000-0000-000000000001', '00000009-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'verified', '00000002-0000-0000-0000-000000000002', '00000001-0000-0000-0000-000000000001', now()),
  ('00000072-0000-0000-0000-000000000002', '00000052-0000-0000-0000-000000000002', '00000009-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'verified', '00000002-0000-0000-0000-000000000002', '00000001-0000-0000-0000-000000000001', now()),
  ('00000073-0000-0000-0000-000000000003', '00000053-0000-0000-0000-000000000003', '00000009-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'verified', '00000002-0000-0000-0000-000000000002', '00000001-0000-0000-0000-000000000001', now()),
  ('00000074-0000-0000-0000-000000000004', '00000054-0000-0000-0000-000000000004', '00000009-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'verified', '00000002-0000-0000-0000-000000000002', '00000001-0000-0000-0000-000000000001', now()),
  ('00000075-0000-0000-0000-000000000005', '00000055-0000-0000-0000-000000000005', '00000009-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'verified', '00000002-0000-0000-0000-000000000002', '00000001-0000-0000-0000-000000000001', now()),
  ('00000076-0000-0000-0000-000000000006', '00000056-0000-0000-0000-000000000006', '00000009-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'verified', '00000002-0000-0000-0000-000000000002', '00000001-0000-0000-0000-000000000001', now());

insert into public.membership_periods
  (id, member_id, plan_id, start_date, end_date, price_applied, created_by_payment)
values
  ('00000081-0000-0000-0000-000000000001', '00000051-0000-0000-0000-000000000001', '00000009-0000-0000-0000-000000000001', (select suite_results.gym_date() - 200), (select suite_results.gym_date() + 100), 1500.00, '00000071-0000-0000-0000-000000000001'),
  ('00000082-0000-0000-0000-000000000002', '00000052-0000-0000-0000-000000000002', '00000009-0000-0000-0000-000000000001', (select suite_results.gym_date() - 200), (select suite_results.gym_date() + 100), 1500.00, '00000072-0000-0000-0000-000000000002'),
  ('00000083-0000-0000-0000-000000000003', '00000053-0000-0000-0000-000000000003', '00000009-0000-0000-0000-000000000001', (select suite_results.gym_date() - 200), (select suite_results.gym_date() + 100), 1500.00, '00000073-0000-0000-0000-000000000003'),
  ('00000084-0000-0000-0000-000000000004', '00000054-0000-0000-0000-000000000004', '00000009-0000-0000-0000-000000000001', (select suite_results.gym_date() - 200), (select suite_results.gym_date() + 100), 1500.00, '00000074-0000-0000-0000-000000000004'),
  ('00000085-0000-0000-0000-000000000005', '00000055-0000-0000-0000-000000000005', '00000009-0000-0000-0000-000000000001', (select suite_results.gym_date() - 200), (select suite_results.gym_date() + 100), 1500.00, '00000075-0000-0000-0000-000000000005'),
  ('00000086-0000-0000-0000-000000000006', '00000056-0000-0000-0000-000000000006', '00000009-0000-0000-0000-000000000001', (select suite_results.gym_date() - 200), (select suite_results.gym_date() + 100), 1500.00, '00000076-0000-0000-0000-000000000006');

-- I one-day: single inclusive day (today-20) -> +1
-- I Feb ten: 2026-02-01 .. 2026-02-10 inclusive -> +10 (natural freeze)
-- I early end: scan at today-15 -> counts today-20 .. today-16 = +5
-- I future: starts today+5 -> +0
-- I overlap: ended today-16 (4 days) + ended today-10 (8 days), overlap
--   today-18..today-17 -> union is today-20 .. today-11 = +10 (not 12)
-- I scan end: same shape as early end, ended_via = 'scan' -> +5
insert into public.membership_freezes
  (id, member_id, start_date, end_date, reason, state, requested_by,
   decided_by, decided_at, extension_days, ended_at, ended_via)
values
  ('00000061-0000-0000-0000-000000000001', '00000051-0000-0000-0000-000000000001',
   (select suite_results.gym_date() - 20), (select suite_results.gym_date() - 20), 'Medical', 'approved',
   '00000002-0000-0000-0000-000000000002', '00000001-0000-0000-0000-000000000001', now(), 1, null, null),
  ('00000062-0000-0000-0000-000000000002', '00000052-0000-0000-0000-000000000002',
   '2026-02-01', '2026-02-10', 'Travel', 'approved',
   '00000002-0000-0000-0000-000000000002', '00000001-0000-0000-0000-000000000001', '2026-01-31 10:00+05:30', 10, null, null),
  ('00000063-0000-0000-0000-000000000003', '00000053-0000-0000-0000-000000000003',
   (select suite_results.gym_date() - 20), (select suite_results.gym_date() - 10), 'Personal', 'ended',
   '00000002-0000-0000-0000-000000000002', '00000001-0000-0000-0000-000000000001', now(), 10,
   ((select suite_results.gym_date() - 15) + time '10:00')::timestamptz, 'scan'),
  ('00000064-0000-0000-0000-000000000004', '00000054-0000-0000-0000-000000000004',
   (select suite_results.gym_date() + 5), (select suite_results.gym_date() + 10), 'Medical', 'approved',
   '00000002-0000-0000-0000-000000000002', '00000001-0000-0000-0000-000000000001', now(), 6, null, null),
  ('00000065-0000-0000-0000-000000000005', '00000055-0000-0000-0000-000000000005',
   (select suite_results.gym_date() - 20), (select suite_results.gym_date() - 10), 'Travel', 'ended',
   '00000002-0000-0000-0000-000000000002', '00000001-0000-0000-0000-000000000001', now(), 10,
   ((select suite_results.gym_date() - 16) + time '10:00')::timestamptz, 'receptionist'),
  ('00000066-0000-0000-0000-000000000006', '00000055-0000-0000-0000-000000000005',
   (select suite_results.gym_date() - 18), (select suite_results.gym_date() - 11), 'Other', 'ended',
   '00000002-0000-0000-0000-000000000002', '00000001-0000-0000-0000-000000000001', now(), 8,
   ((select suite_results.gym_date() - 10) + time '10:00')::timestamptz, 'scan'),
  ('00000067-0000-0000-0000-000000000007', '00000056-0000-0000-0000-000000000006',
   (select suite_results.gym_date() - 20), (select suite_results.gym_date() - 10), 'Medical', 'ended',
   '00000002-0000-0000-0000-000000000002', '00000001-0000-0000-0000-000000000001', now(), 10,
   ((select suite_results.gym_date() - 15) + time '10:00')::timestamptz, 'scan');

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-0000-0000-0000-000000000001","role":"owner"}';
set local request.jwt.claim.sub = '00000001-0000-0000-0000-000000000001';
select suite_results.check_true('I01', 'one-day freeze adds exactly 1 day',
  (select effective_expiry = (select suite_results.gym_date() + 101)
   from public.v_member_status where member_id = '00000051-0000-0000-0000-000000000001'),
  'inclusive single-day window [d,d] counts once');
select suite_results.check_true('I02', 'Feb 1-10 inclusive freeze adds 10 days',
  (select effective_expiry = (select suite_results.gym_date() + 110)
   from public.v_member_status where member_id = '00000052-0000-0000-0000-000000000002'),
  'natural elapsed freeze counts both endpoints (10, not 9)');
select suite_results.check_true('I03', 'early unfreeze excludes the unfreeze day',
  (select effective_expiry = (select suite_results.gym_date() + 105)
   from public.v_member_status where member_id = '00000053-0000-0000-0000-000000000003'),
  'ended at today-15 -> frozen today-20..today-16 = 5 days');
select suite_results.check_true('I04', 'future-dated freeze adds 0 days',
  (select effective_expiry = (select suite_results.gym_date() + 100)
   from public.v_member_status where member_id = '00000054-0000-0000-0000-000000000004'),
  'window starts today+5 -> nothing counted yet');
select suite_results.check_true('I05', 'overlapping ended freezes are union-merged',
  (select effective_expiry = (select suite_results.gym_date() + 110)
   from public.v_member_status where member_id = '00000055-0000-0000-0000-000000000005'),
  '4 + 8 raw days with a 2-day overlap -> 10 distinct days, not 12');
select suite_results.check_true('I06', 'scan-ended freeze excludes the scan day',
  (select effective_expiry = (select suite_results.gym_date() + 105)
   from public.v_member_status where member_id = '00000056-0000-0000-0000-000000000006'),
  'ended_via scan at today-15 -> 5 frozen days');
commit;

-- =====================================================================
-- SECTION J — Derived-expiry boundaries & stacked renewals
-- =====================================================================
-- M57: renewal strictly before derived expiry (today+30 + 5 frozen)
-- M58: renewal ON the derived expiry (today-5 + 5 frozen = today)
-- M59: renewal after derived expiry (today-10, no freeze)
-- M60: two sequential renewals stack on the previous period end
insert into public.members (id, full_name, phone, plan_id, price_locked, membership_end, joined_on)
values
  ('00000057-0000-0000-0000-000000000007', '4v J Before', '+911000005007', '00000009-0000-0000-0000-000000000001', 1500.00, (select suite_results.gym_date() + 30), (select suite_results.gym_date() - 200)),
  ('00000058-0000-0000-0000-000000000008', '4v J On',     '+911000005008', '00000009-0000-0000-0000-000000000001', 1500.00, (select suite_results.gym_date() - 5),  (select suite_results.gym_date() - 200)),
  ('00000059-0000-0000-0000-000000000009', '4v J After',  '+911000005009', '00000009-0000-0000-0000-000000000001', 1500.00, (select suite_results.gym_date() - 10), (select suite_results.gym_date() - 200)),
  ('00000060-0000-0000-0000-000000000010', '4v J Twice',  '+911000005010', '00000009-0000-0000-0000-000000000001', 1500.00, (select suite_results.gym_date() + 30), (select suite_results.gym_date() - 200));

insert into public.payments
  (id, member_id, plan_id, entry_type, original_price, discount_pct,
   discount_amount, payable, method, state, recorded_by, verified_by, verified_at)
values
  ('00000091-0000-0000-0000-000000000001', '00000057-0000-0000-0000-000000000007', '00000009-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'verified', '00000002-0000-0000-0000-000000000002', '00000001-0000-0000-0000-000000000001', now()),
  ('00000092-0000-0000-0000-000000000002', '00000058-0000-0000-0000-000000000008', '00000009-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'verified', '00000002-0000-0000-0000-000000000002', '00000001-0000-0000-0000-000000000001', now()),
  ('00000093-0000-0000-0000-000000000003', '00000059-0000-0000-0000-000000000009', '00000009-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'verified', '00000002-0000-0000-0000-000000000002', '00000001-0000-0000-0000-000000000001', now()),
  ('00000094-0000-0000-0000-000000000004', '00000060-0000-0000-0000-000000000010', '00000009-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'verified', '00000002-0000-0000-0000-000000000002', '00000001-0000-0000-0000-000000000001', now());

insert into public.membership_periods
  (id, member_id, plan_id, start_date, end_date, price_applied, created_by_payment)
values
  ('00000096-0000-0000-0000-000000000006', '00000057-0000-0000-0000-000000000007', '00000009-0000-0000-0000-000000000001', (select suite_results.gym_date() - 170), (select suite_results.gym_date() + 30), 1500.00, '00000091-0000-0000-0000-000000000001'),
  ('00000097-0000-0000-0000-000000000007', '00000058-0000-0000-0000-000000000008', '00000009-0000-0000-0000-000000000001', (select suite_results.gym_date() - 205), (select suite_results.gym_date() - 5),  1500.00, '00000092-0000-0000-0000-000000000002'),
  ('00000098-0000-0000-0000-000000000008', '00000059-0000-0000-0000-000000000009', '00000009-0000-0000-0000-000000000001', (select suite_results.gym_date() - 210), (select suite_results.gym_date() - 10), 1500.00, '00000093-0000-0000-0000-000000000003'),
  ('00000099-0000-0000-0000-000000000009', '00000060-0000-0000-0000-000000000010', '00000009-0000-0000-0000-000000000001', (select suite_results.gym_date() - 170), (select suite_results.gym_date() + 30), 1500.00, '00000094-0000-0000-0000-000000000004');

insert into public.membership_freezes
  (id, member_id, start_date, end_date, reason, state, requested_by,
   decided_by, decided_at, extension_days, ended_at, ended_via)
values
  ('00000068-0000-0000-0000-000000000008', '00000057-0000-0000-0000-000000000007',
   (select suite_results.gym_date() - 6), (select suite_results.gym_date() - 2), 'Travel', 'approved',
   '00000002-0000-0000-0000-000000000002', '00000001-0000-0000-0000-000000000001', now(), 5, null, null),
  ('00000069-0000-0000-0000-000000000009', '00000058-0000-0000-0000-000000000008',
   (select suite_results.gym_date() - 10), (select suite_results.gym_date() - 6), 'Medical', 'approved',
   '00000002-0000-0000-0000-000000000002', '00000001-0000-0000-0000-000000000001', now(), 5, null, null);

-- renewal payments (awaiting, recorded by owner, verified by recA)
insert into public.payments
  (id, member_id, plan_id, entry_type, original_price, discount_pct,
   discount_amount, payable, method, state, recorded_by)
values
  ('00000077-0000-0000-0000-000000000007', '00000057-0000-0000-0000-000000000007', '00000009-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'awaitingVerification', '00000001-0000-0000-0000-000000000001'),
  ('00000078-0000-0000-0000-000000000008', '00000058-0000-0000-0000-000000000008', '00000009-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'awaitingVerification', '00000001-0000-0000-0000-000000000001'),
  ('00000079-0000-0000-0000-000000000009', '00000059-0000-0000-0000-000000000009', '00000009-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'awaitingVerification', '00000001-0000-0000-0000-000000000001'),
  ('00000080-0000-0000-0000-000000000010', '00000060-0000-0000-0000-000000000010', '00000009-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'awaitingVerification', '00000001-0000-0000-0000-000000000001');

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000002-0000-0000-0000-000000000002","role":"receptionist","aal":"aal2"}';
set local request.jwt.claim.sub = '00000002-0000-0000-0000-000000000002';
select suite_results.check_ok('J01', 'verify renewal strictly before derived expiry',
  $s$select public.verify_payment('00000077-0000-0000-0000-000000000007'::uuid)$s$);
select suite_results.check_ok('J02', 'verify renewal exactly ON derived expiry',
  $s$select public.verify_payment('00000078-0000-0000-0000-000000000008'::uuid)$s$);
select suite_results.check_ok('J03', 'verify renewal after derived expiry',
  $s$select public.verify_payment('00000079-0000-0000-0000-000000000009'::uuid)$s$);
select suite_results.check_ok('J04', 'verify first of two stacked renewals',
  $s$select public.verify_payment('00000080-0000-0000-0000-000000000010'::uuid)$s$);
commit;

-- second renewal for M60, verified after the first period exists
insert into public.payments
  (id, member_id, plan_id, entry_type, original_price, discount_pct,
   discount_amount, payable, method, state, recorded_by)
values
  ('00000081-0000-0000-0000-000000000081', '00000060-0000-0000-0000-000000000010', '00000009-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'awaitingVerification', '00000001-0000-0000-0000-000000000001');

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000002-0000-0000-0000-000000000002","role":"receptionist","aal":"aal2"}';
set local request.jwt.claim.sub = '00000002-0000-0000-0000-000000000002';
select suite_results.check_ok('J05', 'verify second stacked renewal',
  $s$select public.verify_payment('00000081-0000-0000-0000-000000000081'::uuid)$s$);
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000001-0000-0000-0000-000000000001","role":"owner"}';
set local request.jwt.claim.sub = '00000001-0000-0000-0000-000000000001';
select suite_results.check_true('J06', 'before-expiry start = derived expiry + 1 (today+36)',
  (select start_date = (select suite_results.gym_date() + 36)
   from public.membership_periods
   where created_by_payment = '00000077-0000-0000-0000-000000000007'),
  'period end today+30 + 5 frozen days = today+35 -> start today+36');
select suite_results.check_true('J07', 'on-expiry start = derived expiry + 1 (today+1)',
  (select start_date = (select suite_results.gym_date() + 1)
   from public.membership_periods
   where created_by_payment = '00000078-0000-0000-0000-000000000008'),
  'stored today-5 + 5 frozen = derived today -> start today+1 (not today)');
select suite_results.check_true('J08', 'after-expiry start = today',
  (select start_date = (select suite_results.gym_date())
   from public.membership_periods
   where created_by_payment = '00000079-0000-0000-0000-000000000009'),
  'derived today-10 is past -> re-anchor at verification date');
select suite_results.check_true('J09', 'first stacked renewal start = today+31',
  (select start_date = (select suite_results.gym_date() + 31)
   from public.membership_periods
   where created_by_payment = '00000080-0000-0000-0000-000000000010'),
  'no freeze: derived today+30 -> start today+31');
select suite_results.check_true('J10', 'second renewal stacks on the previous period end',
  (select p2.start_date = p1.end_date + 1
   from public.membership_periods p1
   join public.membership_periods p2
     on p2.created_by_payment = '00000081-0000-0000-0000-000000000081'
   where p1.created_by_payment = '00000080-0000-0000-0000-000000000010'),
  'multiple renewals: new start = previous end + 1, never overlapping');
commit;

-- =====================================================================
-- SECTION H — Cleanup & verdict
-- =====================================================================

-- H01: cleanup all fixtures
-- audit rows first: audit_log_entries.actor is ON DELETE RESTRICT, and
-- verify_payment emits payment.verified rows for the fixture actors.
delete from public.audit_log_entries
 where actor in (select id from public.profiles where id::text like '000000%')
    or row_id::text like '000000%';
delete from public.membership_freezes where id::text like '000000%';
delete from public.attendance_events where id::text like '000000%';
-- periods created by verify_payment carry a generated uuid: remove them by
-- their fixture payment id as well as by their own id.
delete from public.membership_periods
 where id::text like '000000%'
    or created_by_payment in (select id from public.payments where id::text like '000000%');
delete from public.payments where id::text like '000000%';
delete from public.qr_tokens where id::text like '000000%';
delete from public.members where id::text like '000000%';
delete from public.plans where id::text like '000000%';
delete from public.profiles where id::text like '000000%';
delete from auth.users where id::text like '000000%';

select suite_results.check_true('Z01', 'cleanup committed',
  true, 'cleanup done');

-- Z02: zero residue
select suite_results.check_true('Z02', 'zero 4v residue',
  (select count(*) from public.members where id::text like '000000%') = 0
   and (select count(*) from public.profiles where id::text like '000000%') = 0
   and (select count(*) from public.payments where id::text like '000000%') = 0
   and (select count(*) from public.membership_periods where id::text like '000000%') = 0
   and (select count(*) from public.membership_freezes where id::text like '000000%') = 0
   and (select count(*) from public.attendance_events where id::text like '000000%') = 0
   and (select count(*) from public.qr_tokens where id::text like '000000%') = 0
   and (select count(*) from public.plans where id::text like '000000%') = 0
   and (select count(*) from public.audit_log_entries where row_id::text like '000000%') = 0
   and (select count(*) from auth.users where id::text like '000000%') = 0,
  'database back to post-reset state');

-- verdict
do $v$
declare
  v_total integer;
  v_fail  integer;
begin
  select count(*), count(*) filter (where not passed)
    into v_total, v_fail
    from suite_results.t_results;

  raise notice '0004 validation: % of % assertions passed', v_total - v_fail, v_total;

  if v_fail > 0 then
    raise exception '0004 VALIDATION FAILED: % of % assertions failed', v_fail, v_total;
  end if;
end
$v$;

select num, passed, label, detail from suite_results.t_results order by num;

drop schema suite_results cascade;