-- =====================================================================
-- tests/0002_rls_and_triggers_validation.sql
-- Phase 3B.2 behavioral validation for 0002_rls_and_triggers.sql.
--
-- Prerequisites: local Supabase stack running; database freshly reset
-- (npx supabase db reset) with migrations 0001 AND 0002 applied; the
-- Phase 3B.1 suite (0001_core_schema_validation.sql) has ALREADY run in
-- this state and left its documented fixtures behind. The 0001-suite
-- leftovers are tolerated: assertions use id-specific checks or
-- self-contained counts, and this suite's fixture UUIDs are disjoint
-- from the 0001 suite's. (The suite is also runnable standalone right
-- after db reset; threshold assertions accommodate both states.)
--
-- Contexts: this suite runs under ACTUAL roles + JWT claim contexts,
-- not only postgres:
--   postgres        — catalog checks, fixtures, cleanup (BYPASSRLS).
--                     NOTE: as session_user='postgres' the payments
--                     override is SKIPPED by design (maintenance
--                     context), so client-path INSERT denial here
--                     surfaces as RLS WITH CHECK; the override trigger
--                     itself is exercised in the T section below.
--   authenticated   — member1 / member2 / member3 / receptionist /
--                     owner personas, via SET LOCAL ROLE + the
--                     request.jwt.claim.sub / request.jwt.claims GUCs
--                     (exactly how auth.uid() resolves identity)
--   anon            — unauthenticated denial checks
--   service_role    — server-key behavior (BYPASSRLS, grants)
--   authenticator   — mid-suite `\connect` to the stack's REAL
--                     PostgREST login role (session_user =
--                     'authenticator') so the payments INSERT override
--                     genuinely fires: value-forcing, receptionist-only
--                     enforcement, UPI constraint, audit emission, and
--                     the app.bypass_payment_override GUC contract for
--                     0003 authority functions.
--
-- Helpers and results live in a PERSISTENT schema (suite_results), NOT
-- pg_temp: temp objects die at the mid-suite `\connect`, and the T
-- section needs the result table to survive across connections. Schema
-- + helpers are dropped again at the end. Every negative test pins the
-- expected SQLSTATE class AND a message fragment, or asserts an
-- effective row-count result — an unrelated error is a failure, not a
-- pass.
--
-- Convention: SQLSTATE 42501 covers permission denied, RLS violations,
-- and the migration's own guard/override errors. SELECT denials under
-- RLS with no applicable policy are SILENT (empty result) — those cases
-- assert effective row counts instead.
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

-- mutation-blocked helper: statement must NOT modify any row — either
-- rejected with an access-violation SQLSTATE (42xxx) or filtered to
-- 0 rows by RLS. Any other outcome is a mutation leak (failure).
create function suite_results.check_no_mutation(p_num text, p_label text, p_stmt text)
returns void language plpgsql as $cn$
declare
  v_ok    boolean;
  v_detail text;
  v_state text;
  v_msg   text;
  v_rows  bigint;
begin
  begin
    execute p_stmt;
    get diagnostics v_rows = ROW_COUNT;
    if v_rows = 0 then
      v_ok := true;
      v_detail := 'blocked by RLS filter (0 rows affected)';
    else
      v_ok := false;
      v_detail := format('statement modified %s row(s) — MUTATION LEAK', v_rows);
    end if;
  exception when others then
    get stacked diagnostics v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    if left(v_state, 2) = '42' then
      v_ok := true;
      v_detail := format('rejected (SQLSTATE %s): %s', v_state, v_msg);
    else
      v_ok := false;
      v_detail := format('unexpected SQLSTATE %s: %s', v_state, v_msg);
    end if;
  end;
  insert into suite_results.t_results values (p_num, p_label, v_ok, v_detail);
end $cn$;

-- 3B.3 regression-compatibility note: migration 0003's global function
-- default-privilege lockdown removes the engine's built-in PUBLIC
-- EXECUTE from every future function — including these helpers, which
-- non-postgres personas (anon/authenticated/service_role blocks) must
-- be able to call. Grant it explicitly; scope is this throwaway schema
-- only (dropped at the end of the suite).
grant execute on function suite_results.check_fail(text,text,text,text,text)
  to public;
grant execute on function suite_results.check_ok(text,text,text) to public;
grant execute on function suite_results.check_true(text,text,boolean,text)
  to public;
grant execute on function suite_results.check_no_mutation(text,text,text)
  to public;

-- =====================================================================
-- fixtures (run as postgres; BYPASSRLS + override skipped for postgres)
-- Fixture UUIDs are disjoint from the 0001 suite's.
-- =====================================================================

-- auth users: owner, receptionist, member1, member2, member3 (no profile)
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'a1111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'suite-owner@local.test', 'irrelevant', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a2222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'suite-rec@local.test',   'irrelevant', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a3333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated', 'suite-m1@local.test',    'irrelevant', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a4444444-4444-4444-4444-444444444444', 'authenticated', 'authenticated', 'suite-m2@local.test',    'irrelevant', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a5555555-5555-5555-5555-555555555555', 'authenticated', 'authenticated', 'suite-m3@local.test',    'irrelevant', now(), now());

insert into public.profiles (id, display_name, role) values
  ('a1111111-1111-1111-1111-111111111111', 'Suite Owner',   'owner'),
  ('a2222222-2222-2222-2222-222222222222', 'Suite Reception', 'receptionist'),
  ('a3333333-3333-3333-3333-333333333333', 'Suite Member 1', 'member'),
  ('a4444444-4444-4444-4444-444444444444', 'Suite Member 2', 'member');
-- member3 (a5555555) deliberately has NO profile: default-deny persona.

insert into public.plans (id, name, duration, price, is_active) values
  ('c1111111-1111-1111-1111-111111111111', 'Suite Monthly',  'monthly', 1500.00, true),
  ('c2222222-2222-2222-2222-222222222222', 'Suite Retired',  'monthly',  999.00, false);

insert into public.members (id, full_name, phone, plan_id, price_locked, auth_user_id, joined_on) values
  ('b1111111-1111-1111-1111-111111111111', 'Suite Arjun',  '9700000001',
   'c1111111-1111-1111-1111-111111111111', 1500.00, 'a3333333-3333-3333-3333-333333333333', date '2026-01-10'),
  ('b2222222-2222-2222-2222-222222222222', 'Suite Priya',  '9700000002',
   'c1111111-1111-1111-1111-111111111111', null,    'a4444444-4444-4444-4444-444444444444', date '2026-02-01');

-- verified payments: pay1 (member b1), pay2 (member b2)
insert into public.payments (id, member_id, plan_id, entry_type, original_price, discount_pct,
                             discount_amount, payable, method, utr, state, recorded_by, verified_by, verified_at)
values
  ('e1111111-1111-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111111',
   'c1111111-1111-1111-1111-111111111111', 'payment', 1500.00, 0, 0.00, 1500.00,
   'cash', 'UTRSUITE2026000001', 'verified',
   'a2222222-2222-2222-2222-222222222222', 'a1111111-1111-1111-1111-111111111111', now()),
  ('e2222222-2222-2222-2222-222222222222', 'b2222222-2222-2222-2222-222222222222',
   'c1111111-1111-1111-1111-111111111111', 'payment', 1500.00, 0, 0.00, 1500.00,
   'cash', 'UTRSUITE2026000002', 'verified',
   'a2222222-2222-2222-2222-222222222222', 'a2222222-2222-2222-2222-222222222222', now());

insert into public.membership_periods (id, member_id, plan_id, start_date, end_date, price_applied, created_by_payment)
values ('f1111111-1111-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111111',
        'c1111111-1111-1111-1111-111111111111', date '2026-01-10', date '2026-04-10',
        1500.00, 'e1111111-1111-1111-1111-111111111111');

-- verified full reversal of pay1 (member b1 → visible to member1)
insert into public.payments (id, member_id, plan_id, entry_type, original_price, discount_pct,
                             discount_amount, payable, method, state, recorded_by, verified_by,
                             verified_at, reversal_of)
values ('e3333333-3333-3333-3333-333333333333', 'b1111111-1111-1111-1111-111111111111',
        'c1111111-1111-1111-1111-111111111111', 'reversal', 1500.00, 0, 0.00, 1500.00,
        'cash', 'verified', 'a2222222-2222-2222-2222-222222222222',
        'a2222222-2222-2222-2222-222222222222', now(), 'e1111111-1111-1111-1111-111111111111');

insert into public.membership_period_voids (id, period_id, reversal_id, voided_by)
values ('1d111111-1111-1111-1111-111111111111', 'f1111111-1111-1111-1111-111111111111',
        'e3333333-3333-3333-3333-333333333333', 'a2222222-2222-2222-2222-222222222222');

insert into public.membership_freezes (id, member_id, start_date, end_date, reason, state,
                                       requested_by, decided_by, decided_at, extension_days)
values ('1f111111-1111-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111111',
        date '2026-03-01', date '2026-03-10', 'Medical', 'approved',
        'a2222222-2222-2222-2222-222222222222', 'a2222222-2222-2222-2222-222222222222',
        now(), 10);

insert into public.qr_tokens (id, token_hash, expires_at, minted_by)
values ('1e111111-1111-1111-1111-111111111111', repeat('c', 64), now() + interval '2 hours',
        'a2222222-2222-2222-2222-222222222222');

insert into public.attendance_events (id, member_id, token_id, door, status)
values ('1c111111-1111-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111111',
        '1e111111-1111-1111-1111-111111111111', 'Main entrance', 'verified');

insert into public.follow_up_events (id, member_id, actor, channel, outcome, note)
values ('1b111111-1111-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111111',
        'a2222222-2222-2222-2222-222222222222', 'called', 'open', 'suite fixture');

insert into public.join_applications (id, auth_user_id, full_name, phone, plan_id, state)
values ('1a111111-1111-1111-1111-111111111111', 'a3333333-3333-3333-3333-333333333333',
        'Suite Applicant 1', '9700000003', 'c1111111-1111-1111-1111-111111111111', 'submitted');

-- app_settings singleton (id=1 may already exist from the 0001 suite)
insert into public.app_settings (id) values (1) on conflict (id) do nothing;

-- =====================================================================
-- C. catalog checks (postgres context)
-- =====================================================================
select suite_results.check_true('C01', 'RLS enabled on all 13 public tables',
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity) = 13,
  format('enabled on %s of 13', (select count(*) from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity)));

select suite_results.check_true('C02', 'RLS FORCED on all 13 public tables (even the owner)',
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and c.relforcerowsecurity) = 13,
  format('forced on %s of 13', (select count(*) from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and c.relforcerowsecurity)));

select suite_results.check_true('C03', 'exactly 23 policies exist (per §8.1 matrix)',
  (select count(*) from pg_policies where schemaname = 'public') = 23,
  format('found %s policies', (select count(*) from pg_policies where schemaname = 'public')));

select suite_results.check_true('C04', 'no policy is granted to anon',
  (select count(*) from pg_policies where schemaname = 'public'
   and 'anon' = any(roles)) = 0,
  'anon must have zero row-level access paths');

select suite_results.check_true('C05', 'qr_tokens has NO policies at all',
  (select count(*) from pg_policies where schemaname = 'public'
   and tablename = 'qr_tokens') = 0,
  'direct client access to qr_tokens must be impossible');

select suite_results.check_true('C06', 'audit_log_entries has exactly one policy: SELECT, authenticated only',
  (select count(*) from pg_policies where schemaname = 'public'
   and tablename = 'audit_log_entries' and cmd = 'SELECT'
   and 'authenticated' = any(roles) and array_length(roles, 1) = 1) = 1
  and (select count(*) from pg_policies where schemaname = 'public'
       and tablename = 'audit_log_entries') = 1,
  'audit readability gate = owner-only via app_profile_role');

select suite_results.check_true('C07', 'no policy reads JWT role/AAL claims (spoof-proof + MFA boundary preserved)',
  (select count(*) from pg_policies where schemaname = 'public'
   and (coalesce(qual, '') || coalesce(with_check, ''))
       ~* 'request\.jwt\.claims|jwt\.claim\.role|auth\.jwt\(|auth\.role\(\)|\baal\b|\bamr\b') = 0,
  'policies resolve roles via app_profile_role() only');

select suite_results.check_true('C08', 'definer helpers: app_profile_role + payments_insert_override are SECURITY DEFINER',
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('app_profile_role', 'payments_insert_override')
   and p.prosecdef) = 2,
  'definer execution required for RLS-independent role resolution + override');

select suite_results.check_true('C09', 'all 5 helper functions have a pinned search_path',
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
   and p.proname in ('app_profile_role', 'payments_insert_override',
                     'set_updated_at', 'assert_no_client_mutation', 'profiles_role_guard')
   and p.proconfig::text like '%search_path%') = 5,
  'search_path hijacking must be impossible');

select suite_results.check_true('C10', 'engine facts: postgres non-superuser WITH BYPASSRLS; service_role BYPASSRLS',
  (select rolsuper = false and rolbypassrls = true from pg_roles where rolname = 'postgres')
  and (select rolbypassrls = true from pg_roles where rolname = 'service_role'),
  'documented stack posture; FORCE RLS stays safe for maintenance');

select suite_results.check_true('C11', 'members.auth_user_id exists with unique constraint + index',
  (select count(*) from information_schema.columns
   where table_schema = 'public' and table_name = 'members' and column_name = 'auth_user_id') = 1
  and (select count(*) from pg_constraint c join pg_class t on t.oid = c.conrelid
       join pg_namespace n on n.oid = t.relnamespace
       where n.nspname = 'public' and t.relname = 'members'
       and c.conname = 'members_auth_user_id_key') = 1
  and (select count(*) from pg_indexes
       where schemaname = 'public' and tablename = 'members'
       and indexname = 'members_auth_user_idx') = 1,
  'the REPORTED 0002 schema addition (3A §8.1 member-own access)');

select suite_results.check_true('C12', 'authenticated: SELECT granted on exactly 12 tables',
  (select count(*) from information_schema.role_table_grants g
   join information_schema.tables t
     on t.table_schema = g.table_schema and t.table_name = g.table_name
   where g.table_schema = 'public' and g.grantee = 'authenticated'
   and g.privilege_type = 'SELECT'
   and t.table_type = 'BASE TABLE') = 12,
  format('found %s', (select count(*) from information_schema.role_table_grants g
   join information_schema.tables t
     on t.table_schema = g.table_schema and t.table_name = g.table_name
   where g.table_schema = 'public' and g.grantee = 'authenticated'
   and g.privilege_type = 'SELECT'
   and t.table_type = 'BASE TABLE')));

select suite_results.check_true('C13', 'authenticated: INSERT granted on exactly payments + follow_up_events',
  (select count(*) from information_schema.role_table_grants
   where table_schema = 'public' and grantee = 'authenticated'
   and privilege_type = 'INSERT' and table_name in ('payments', 'follow_up_events')) = 2
  and (select count(*) from information_schema.role_table_grants
       where table_schema = 'public' and grantee = 'authenticated'
       and privilege_type = 'INSERT') = 2,
  'no other client-writable table exists');

select suite_results.check_true('C14', 'authenticated: UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER all revoked',
  (select count(*) from information_schema.role_table_grants
   where table_schema = 'public' and grantee = 'authenticated'
   and privilege_type in ('UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')) = 0,
  'writes must flow through authority paths only');

select suite_results.check_true('C15', 'anon: zero table privileges of any kind',
  (select count(*) from information_schema.role_table_grants
   where table_schema = 'public' and grantee = 'anon') = 0,
  format('found %s', (select count(*) from information_schema.role_table_grants
   where table_schema = 'public' and grantee = 'anon')));

select suite_results.check_true('C16', 'service_role: SELECT 13, INSERT 4, UPDATE 2, DELETE 1',
  (select count(*) from information_schema.role_table_grants
   where table_schema = 'public' and grantee = 'service_role' and privilege_type = 'SELECT') = 13
  and (select count(*) from information_schema.role_table_grants
       where table_schema = 'public' and grantee = 'service_role' and privilege_type = 'INSERT'
       and table_name in ('profiles', 'join_applications', 'audit_log_entries', 'qr_tokens')) = 4
  and (select count(*) from information_schema.role_table_grants
       where table_schema = 'public' and grantee = 'service_role' and privilege_type = 'UPDATE'
       and table_name in ('profiles', 'qr_tokens')) = 2
  and (select count(*) from information_schema.role_table_grants
       where table_schema = 'public' and grantee = 'service_role' and privilege_type = 'DELETE'
       and table_name = 'qr_tokens') = 1,
  'service paths exactly per §8.1 (role mgmt, hook apps, audit append, QR mint/purge)');

-- 3B.3 regression-compatibility note: migration 0003 adds one more
-- non-internal trigger (payments_reversal_cap on payments, a DEFERRABLE
-- constraint trigger backstopping cumulative reversals). The total
-- inventory is therefore 20 once 0003 is applied; the per-name counts
-- below are unchanged and each 0002 trigger is still asserted exactly.
select suite_results.check_true('C17', 'trigger inventory: 20 total = guard 13 + updated_at 4 + role 1 + override 1 + 0003 reversal cap 1',
  (select count(*) from pg_trigger t join pg_class c on t.tgrelid = c.oid
   where not t.tgisinternal and c.relnamespace = 'public'::regnamespace) = 20
  and (select count(*) from pg_trigger t join pg_class c on t.tgrelid = c.oid
       where not t.tgisinternal and c.relnamespace = 'public'::regnamespace
       and t.tgname = 'trg_client_guard') = 13
  and (select count(*) from pg_trigger t join pg_class c on t.tgrelid = c.oid
       where not t.tgisinternal and c.relnamespace = 'public'::regnamespace
       and t.tgname = 'trg_updated_at') = 4
  and (select count(*) from pg_trigger t join pg_class c on t.tgrelid = c.oid
       where not t.tgisinternal and c.relnamespace = 'public'::regnamespace
       and t.tgname = 'trg_role_guard') = 1
  and (select count(*) from pg_trigger t join pg_class c on t.tgrelid = c.oid
       where not t.tgisinternal and c.relnamespace = 'public'::regnamespace
       and t.tgname = 'trg_payments_insert_override') = 1
  and (select count(*) from pg_trigger t join pg_class c on t.tgrelid = c.oid
       where not t.tgisinternal and c.relnamespace = 'public'::regnamespace
       and t.tgname = 'payments_reversal_cap') = 1,
  'exact trigger inventory per migration §6 + 0003 deferred backstop');

select suite_results.check_true('C18', 'app_profile_role EXECUTE: authenticated yes; anon/service_role/PUBLIC no',
  has_function_privilege('authenticated', 'public.app_profile_role()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.app_profile_role()', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.app_profile_role()', 'EXECUTE')
  and not has_function_privilege('public', 'public.app_profile_role()', 'EXECUTE'),
  'helper lockdown per migration §5');

-- =====================================================================
-- M. member1 context (authenticated + JWT sub = a3333333, profile 'member')
-- =====================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a3333333-3333-3333-3333-333333333333","role":"member"}';
set local request.jwt.claim.sub = 'a3333333-3333-3333-3333-333333333333';

select suite_results.check_ok('M01', 'member can SELECT own members row (auth_user_id chain)',
  $s$select * from public.members where id = 'b1111111-1111-1111-1111-111111111111'$s$);

select suite_results.check_true('M02', 'member sees exactly ONE member row (cross-member invisibility)',
  (select count(*) from public.members) = 1,
  format('visible rows: %s', (select count(*) from public.members)));

select suite_results.check_true('M03', 'member sees exactly 2 own payments (pay1 + rev1)',
  (select count(*) from public.payments) = 2,
  format('visible payments: %s', (select count(*) from public.payments)));

select suite_results.check_true('M04', 'another member''s payment (pay2) is invisible',
  (select count(*) from public.payments
   where id = 'e2222222-2222-2222-2222-222222222222') = 0,
  'row-access denial via RLS filter');

select suite_results.check_true('M05', 'member sees exactly 1 own membership period + 1 own void',
  (select count(*) from public.membership_periods) = 1
  and (select count(*) from public.membership_period_voids) = 1,
  format('periods %s / voids %s', (select count(*) from public.membership_periods),
         (select count(*) from public.membership_period_voids)));

select suite_results.check_true('M06', 'member sees exactly 1 own freeze + 1 own attendance row',
  (select count(*) from public.membership_freezes) = 1
  and (select count(*) from public.attendance_events) = 1,
  format('freezes %s / attendance %s', (select count(*) from public.membership_freezes),
         (select count(*) from public.attendance_events)));

select suite_results.check_true('M07', 'member sees exactly 1 own join application',
  (select count(*) from public.join_applications) = 1,
  format('visible applications: %s', (select count(*) from public.join_applications)));

select suite_results.check_true('M08', 'member sees own profile only (1 row, not the directory)',
  (select count(*) from public.profiles) = 1
  and (select count(*) from public.profiles
       where id = 'a3333333-3333-3333-3333-333333333333') = 1,
  format('visible profiles: %s', (select count(*) from public.profiles)));

select suite_results.check_true('M09', 'member sees only ACTIVE plans (inactive plan invisible)',
  (select count(*) from public.plans
   where id = 'c1111111-1111-1111-1111-111111111111') = 1
  and (select count(*) from public.plans
       where id = 'c2222222-2222-2222-2222-222222222222') = 0,
  'member plan visibility = active only');

select suite_results.check_true('M10', 'member sees app_settings (profile exists)',
  (select count(*) from public.app_settings) = 1,
  format('visible settings rows: %s', (select count(*) from public.app_settings)));

-- spoofed ROLE claim: JWT says owner, authoritative profile says member.
select suite_results.check_true('M11', 'SPOOFED role claim "owner" changes nothing: still 2 payments',
  (select count(*) from public.payments) = 2
  and (select count(*) from public.members) = 1,
  'claims executed with {"sub":<member1>,"role":"owner"} — profile is authoritative');

select suite_results.check_fail('M12', 'member cannot UPDATE payments (no grant)',
  $s$update public.payments set note = 'hacked' where id = 'e1111111-1111-1111-1111-111111111111'$s$,
  '42501', 'permission denied');

select suite_results.check_fail('M13', 'member cannot DELETE payments (no grant)',
  $s$delete from public.payments where id = 'e1111111-1111-1111-1111-111111111111'$s$,
  '42501', 'permission denied');

select suite_results.check_fail('M14', 'member cannot INSERT payments (override skips in maintenance context; RLS WITH CHECK enforces; trigger raise itself tested in T)',
  $s$insert into public.payments (member_id, plan_id, entry_type, original_price, discount_pct,
    discount_amount, payable, method, state, recorded_by)
  values ('b1111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111',
          'payment', 999.00, 0, 0.00, 999.00, 'cash', 'verified',
          'a3333333-3333-3333-3333-333333333333')$s$,
  '42501', 'row-level security');

select suite_results.check_fail('M15', 'member cannot INSERT follow_up_events (RLS WITH CHECK)',
  $s$insert into public.follow_up_events (member_id, actor, channel, outcome)
  values ('b1111111-1111-1111-1111-111111111111', 'a3333333-3333-3333-3333-333333333333',
          'called', 'open')$s$,
  '42501', 'row-level security');

select suite_results.check_true('M16', 'member SELECT follow_up_events returns 0 rows (silent RLS filter)',
  (select count(*) from public.follow_up_events) = 0,
  format('visible follow-ups: %s', (select count(*) from public.follow_up_events)));

select suite_results.check_fail('M17', 'member cannot SELECT qr_tokens (no grant)',
  $s$select * from public.qr_tokens$s$, '42501', 'permission denied');

select suite_results.check_fail('M18', 'member cannot INSERT join_applications (no grant)',
  $s$insert into public.join_applications (full_name, phone, plan_id, state)
  values ('X', '9700000999', 'c1111111-1111-1111-1111-111111111111', 'submitted')$s$,
  '42501', 'permission denied');

select suite_results.check_fail('M19', 'member cannot change own profiles.role (no grant)',
  $s$update public.profiles set role = 'owner'
   where id = 'a3333333-3333-3333-3333-333333333333'$s$,
  '42501', 'permission denied');

select suite_results.check_fail('M20', 'member cannot update own profile at all (service-mirrored)',
  $s$update public.profiles set display_name = 'Hacked Name'
   where id = 'a3333333-3333-3333-3333-333333333333'$s$,
  '42501', 'permission denied');

select suite_results.check_fail('M21', 'member cannot UPDATE app_settings (no grant)',
  $s$update public.app_settings set upi_id = 'hacked@upi' where id = 1$s$,
  '42501', 'permission denied');

select suite_results.check_true('M22', 'member sees ZERO audit rows (table grant exists; RLS owner-only gate)',
  (select count(*) from public.audit_log_entries) = 0,
  format('visible audit rows: %s', (select count(*) from public.audit_log_entries)));

select suite_results.check_fail('M23', 'member cannot INSERT membership_freezes (request path is 0003)',
  $s$insert into public.membership_freezes (member_id, start_date, end_date, reason, state, requested_by)
  values ('b1111111-1111-1111-1111-111111111111', date '2026-06-01', date '2026-06-05',
          'Travel', 'pending', 'a3333333-3333-3333-3333-333333333333')$s$,
  '42501', 'permission denied');

select suite_results.check_fail('M24', 'member cannot INSERT membership_periods (history is append-only via 0003)',
  $s$insert into public.membership_periods (member_id, plan_id, start_date, end_date, price_applied, created_by_payment)
  values ('b1111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111',
          date '2026-05-01', date '2026-08-01', 1500.00, 'e1111111-1111-1111-1111-111111111111')$s$,
  '42501', 'permission denied');

commit;

-- =====================================================================
-- N. member3 context: authenticated JWT, NO profile row (default deny)
-- =====================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a5555555-5555-5555-5555-555555555555","role":"authenticated"}';
set local request.jwt.claim.sub = 'a5555555-5555-5555-5555-555555555555';

select suite_results.check_true('N01', 'profileless user sees ZERO payments',
  (select count(*) from public.payments) = 0,
  format('visible payments: %s', (select count(*) from public.payments)));

select suite_results.check_true('N02', 'profileless user sees ZERO members',
  (select count(*) from public.members) = 0,
  format('visible members: %s', (select count(*) from public.members)));

select suite_results.check_true('N03', 'profileless user sees ZERO app_settings (policy requires profile)',
  (select count(*) from public.app_settings) = 0,
  format('visible settings: %s', (select count(*) from public.app_settings)));

select suite_results.check_fail('N04', 'profileless user cannot record payments (RLS WITH CHECK; trigger raise tested in T)',
  $s$insert into public.payments (member_id, plan_id, entry_type, original_price, discount_pct,
    discount_amount, payable, method, state, recorded_by)
  values ('b1111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111',
          'payment', 1500.00, 0, 0.00, 1500.00, 'cash', 'awaitingVerification',
          'a5555555-5555-5555-5555-555555555555')$s$,
  '42501', 'row-level security');

commit;

-- =====================================================================
-- R. receptionist context (authenticated + JWT sub = a2222222,
--    profile 'receptionist')
-- =====================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a2222222-2222-2222-2222-222222222222","role":"receptionist"}';
set local request.jwt.claim.sub = 'a2222222-2222-2222-2222-222222222222';

select suite_results.check_true('R01', 'receptionist sees ALL members (incl. 0001-suite leftovers)',
  (select count(*) from public.members where id = 'b1111111-1111-1111-1111-111111111111') = 1
  and (select count(*) from public.members where id = 'b2222222-2222-2222-2222-222222222222') = 1
  and (select count(*) from public.members) >= 4,
  format('visible members: %s', (select count(*) from public.members)));

select suite_results.check_true('R02', 'receptionist sees ALL payments (staff-wide)',
  (select count(*) from public.payments
   where id = 'e2222222-2222-2222-2222-222222222222') = 1
  and (select count(*) from public.payments) >= 3,
  format('visible payments: %s', (select count(*) from public.payments)));

select suite_results.check_true('R03', 'receptionist sees INACTIVE plans too',
  (select count(*) from public.plans
   where id = 'c2222222-2222-2222-2222-222222222222') = 1,
  'staff plan visibility is unrestricted');

select suite_results.check_true('R04', 'receptionist sees follow_up_events + join_applications',
  (select count(*) from public.follow_up_events) >= 1
  and (select count(*) from public.join_applications) >= 1,
  format('follow-ups %s / applications %s', (select count(*) from public.follow_up_events),
         (select count(*) from public.join_applications)));

-- NOTE: the override value-forcing tests (spoofed-field forcing, forced
-- money, fallback pricing) moved to the T section: they need a REAL
-- PostgREST context (session_user = 'authenticator') because the fixed
-- override skips for session_user='postgres'.

select suite_results.check_fail('R08', 'receptionist UPI payment WITHOUT UTR still rejected (constraint on final row)',
  $s$insert into public.payments (member_id, plan_id, original_price, discount_pct,
    discount_amount, payable, method, state, recorded_by, entry_type)
  values ('b1111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111',
          1500.00, 0, 0.00, 1500.00, 'upi', 'awaitingVerification',
          'a2222222-2222-2222-2222-222222222222', 'payment')$s$,
  '23514', 'upi_requires_utr');

select suite_results.check_ok('R09', 'receptionist INSERT follow_up_events (self-attributed) accepted',
  $s$insert into public.follow_up_events (id, member_id, actor, channel, outcome, note)
  values ('f3333333-3333-3333-3333-333333333333', 'b1111111-1111-1111-1111-111111111111',
          'a2222222-2222-2222-2222-222222222222', 'called', 'open', 'suite path test')$s$);

select suite_results.check_fail('R10', 'receptionist follow-up with actor = ANOTHER user rejected (WITH CHECK)',
  $s$insert into public.follow_up_events (member_id, actor, channel, outcome)
  values ('b1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111',
          'messaged', 'open')$s$,
  '42501', 'row-level security');

select suite_results.check_fail('R11', 'receptionist cannot UPDATE payments (verify/reject/reverse are 0003 paths)',
  $s$update public.payments set state = 'verified'
   where id = 'e1111111-1111-1111-1111-111111111111'$s$,
  '42501', 'permission denied');

select suite_results.check_fail('R12', 'receptionist cannot DELETE payments',
  $s$delete from public.payments where id = 'e1111111-1111-1111-1111-111111111111'$s$,
  '42501', 'permission denied');

select suite_results.check_fail('R13', 'receptionist cannot UPDATE members',
  $s$update public.members set discount_pct = 50
   where id = 'b1111111-1111-1111-1111-111111111111'$s$,
  '42501', 'permission denied');

select suite_results.check_fail('R14', 'receptionist cannot INSERT attendance_events (check-in path is 0003; pendingPayment boundary holds)',
  $s$insert into public.attendance_events (member_id, token_id, door, status)
  values ('b1111111-1111-1111-1111-111111111111', '1e111111-1111-1111-1111-111111111111',
          'Main entrance', 'verified')$s$,
  '42501', 'permission denied');

select suite_results.check_fail('R15', 'receptionist cannot SELECT qr_tokens (no grant)',
  $s$select * from public.qr_tokens$s$, '42501', 'permission denied');

select suite_results.check_fail('R16', 'receptionist cannot INSERT qr_tokens (mint path is 0003)',
  $s$insert into public.qr_tokens (token_hash, expires_at, minted_by)
  values (repeat('e', 64), now() + interval '60 seconds',
          'a2222222-2222-2222-2222-222222222222')$s$,
  '42501', 'permission denied');

select suite_results.check_true('R17', 'receptionist sees ZERO audit rows (owner-only policy)',
  (select count(*) from public.audit_log_entries) = 0,
  format('visible audit rows: %s', (select count(*) from public.audit_log_entries)));

select suite_results.check_fail('R18', 'receptionist cannot INSERT audit_log_entries',
  $s$insert into public.audit_log_entries (actor, actor_role, action, table_name)
  values ('a2222222-2222-2222-2222-222222222222', 'receptionist', 'forge', 'payments')$s$,
  '42501', 'permission denied');

select suite_results.check_fail('R19', 'receptionist cannot change profiles.role (no grant)',
  $s$update public.profiles set role = 'owner'
   where id = 'a3333333-3333-3333-3333-333333333333'$s$,
  '42501', 'permission denied');

select suite_results.check_fail('R20', 'receptionist cannot INSERT membership_freezes (decide path is 0003/[C1])',
  $s$insert into public.membership_freezes (member_id, start_date, end_date, reason, state, requested_by)
  values ('b1111111-1111-1111-1111-111111111111', date '2026-07-01', date '2026-07-05',
          'Travel', 'pending', 'a2222222-2222-2222-2222-222222222222')$s$,
  '42501', 'permission denied');

select suite_results.check_fail('R21', 'receptionist cannot INSERT membership_periods',
  $s$insert into public.membership_periods (member_id, plan_id, start_date, end_date, price_applied, created_by_payment)
  values ('b1111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111',
          date '2026-05-01', date '2026-08-01', 1500.00, 'e1111111-1111-1111-1111-111111111111')$s$,
  '42501', 'permission denied');

select suite_results.check_true('R22', 'receptionist sees app_settings',
  (select count(*) from public.app_settings) = 1,
  format('visible settings rows: %s', (select count(*) from public.app_settings)));

commit;
-- NOTE: R23/R24 (fallback-price override insert) and R25 (override audit
-- emission) moved to the authenticator-context T section below.

-- =====================================================================
-- W. member2 context (authenticated + JWT sub = a4444444)
--    Runs AFTER the receptionist block: member2's payments now include
--    the override-inserted e5555555.
-- =====================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a4444444-4444-4444-4444-444444444444","role":"member"}';
set local request.jwt.claim.sub = 'a4444444-4444-4444-4444-444444444444';

select suite_results.check_true('W01', 'member2 sees exactly 1 own payment (pay2; the T-section insert e5555555 comes later)',
  (select count(*) from public.payments) = 1
  and (select count(*) from public.payments
       where id = 'e2222222-2222-2222-2222-222222222222') = 1,
  format('visible payments: %s', (select count(*) from public.payments)));

select suite_results.check_true('W02', 'member1''s payments (pay1/rev1) invisible to member2',
  (select count(*) from public.payments
   where id = 'e1111111-1111-1111-1111-111111111111') = 0
  and (select count(*) from public.payments
       where id = 'e3333333-3333-3333-3333-333333333333') = 0,
  'cross-member row-access denial via RLS filter');

commit;

-- =====================================================================
-- S. service_role context (server key; BYPASSRLS; grants still apply)
-- =====================================================================
begin;
set local role service_role;

select suite_results.check_ok('S01', 'service_role can SELECT qr_tokens (server-minted)',
  $s$select * from public.qr_tokens$s$);

select suite_results.check_ok('S02', 'service_role can INSERT qr_tokens (mint path)',
  $s$insert into public.qr_tokens (token_hash, expires_at, minted_by)
  values (repeat('d', 64), now() + interval '1 hour',
          'a2222222-2222-2222-2222-222222222222')$s$);

select suite_results.check_ok('S03', 'service_role can DELETE qr_tokens (purge path)',
  $s$delete from public.qr_tokens where token_hash = repeat('d', 64)$s$);

-- service-only role management (approved design; clients are blocked)
select suite_results.check_ok('S04', 'service_role can UPDATE profiles.role (service-only role management)',
  $s$update public.profiles set role = 'receptionist'
   where id = 'a4444444-4444-4444-4444-444444444444'$s$);

select suite_results.check_ok('S05', 'service_role role change reverted (member2 back to member)',
  $s$update public.profiles set role = 'member'
   where id = 'a4444444-4444-4444-4444-444444444444'$s$);

select suite_results.check_ok('S06', 'service_role can INSERT audit_log_entries (append)',
  $s$insert into public.audit_log_entries (actor_role, action, table_name, new_values)
  values ('service_role', 'suite.service_test', 'qr_tokens', '{}'::jsonb)$s$);

select suite_results.check_ok('S07', 'service_role can INSERT join_applications (auth-hook path, unresolved #7)',
  $s$insert into public.join_applications (id, full_name, phone, plan_id, state)
  values ('1a222222-2222-2222-2222-222222222222', 'Service Applicant', '9700000004',
          'c1111111-1111-1111-1111-111111111111', 'submitted')$s$);

select suite_results.check_fail('S08', 'service_role cannot DELETE audit_log_entries (append-only even for service)',
  $s$delete from public.audit_log_entries$s$, '42501', 'permission denied');

select suite_results.check_fail('S09', 'service_role cannot record payments (no INSERT grant; receptionist path only)',
  $s$insert into public.payments (member_id, plan_id, entry_type, original_price, discount_pct,
    discount_amount, payable, method, state, recorded_by)
  values ('b1111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111',
          'payment', 1500.00, 0, 0.00, 1500.00, 'cash', 'verified',
          'a2222222-2222-2222-2222-222222222222')$s$,
  '42501', 'permission denied');

select suite_results.check_fail('S10', 'service_role cannot DELETE payments (no grant)',
  $s$delete from public.payments$s$, '42501', 'permission denied');

select suite_results.check_fail('S11', 'service_role cannot UPDATE payments (verify/reject stay 0003)',
  $s$update public.payments set state = 'verified'
   where id = 'e1111111-1111-1111-1111-111111111111'$s$,
  '42501', 'permission denied');

select suite_results.check_fail('S12', 'service_role cannot UPDATE plans (no grant)',
  $s$update public.plans set price = 1
   where id = 'c1111111-1111-1111-1111-111111111111'$s$,
  '42501', 'permission denied');

commit;

-- =====================================================================
-- O. owner context (authenticated + JWT sub = a1111111, profile 'owner')
--    Owner = SELECT-only on payments/freezes; no write path anywhere
--    except follow_up_events (staff insert, self-attributed).
-- =====================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a1111111-1111-1111-1111-111111111111","role":"owner"}';
set local request.jwt.claim.sub = 'a1111111-1111-1111-1111-111111111111';

select suite_results.check_true('O01', 'owner sees ALL payments (pay1/pay2/rev1 + staff-wide; override rows come later in T)',
  (select count(*) from public.payments
   where id = 'e1111111-1111-1111-1111-111111111111') = 1
  and (select count(*) from public.payments
       where id = 'e2222222-2222-2222-2222-222222222222') = 1
  and (select count(*) from public.payments
       where id = 'e3333333-3333-3333-3333-333333333333') = 1
  and (select count(*) from public.payments) >= 3,
  format('visible payments: %s', (select count(*) from public.payments)));

select suite_results.check_true('O02', 'owner sees membership_freezes (incl. suite freeze)',
  (select count(*) from public.membership_freezes
   where id = '1f111111-1111-1111-1111-111111111111') = 1
  and (select count(*) from public.membership_freezes) >= 1,
  format('visible freezes: %s', (select count(*) from public.membership_freezes)));

select suite_results.check_fail('O03', 'owner cannot UPDATE payments (read-only per O-18/O-19)',
  $s$update public.payments set state = 'verified'
   where id = 'e1111111-1111-1111-1111-111111111111'$s$,
  '42501', 'permission denied');

select suite_results.check_fail('O04', 'owner cannot DELETE payments',
  $s$delete from public.payments where id = 'e1111111-1111-1111-1111-111111111111'$s$,
  '42501', 'permission denied');

select suite_results.check_fail('O05', 'owner cannot INSERT payments (RLS WITH CHECK; trigger raise tested in T)',
  $s$insert into public.payments (member_id, plan_id, entry_type, original_price, discount_pct,
    discount_amount, payable, method, state, recorded_by)
  values ('b1111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111',
          'payment', 1500.00, 0, 0.00, 1500.00, 'cash', 'verified',
          'a1111111-1111-1111-1111-111111111111')$s$,
  '42501', 'row-level security');

select suite_results.check_fail('O06', 'owner cannot APPROVE a freeze (direct UPDATE denied; [C1] path is 0003)',
  $s$update public.membership_freezes set state = 'approved', decided_by = 'a1111111-1111-1111-1111-111111111111',
   decided_at = now(), extension_days = 10
   where id = '1f111111-1111-1111-1111-111111111111'$s$,
  '42501', 'permission denied');

select suite_results.check_fail('O07', 'owner cannot DELETE freezes',
  $s$delete from public.membership_freezes where id = '1f111111-1111-1111-1111-111111111111'$s$,
  '42501', 'permission denied');

select suite_results.check_ok('O08', 'owner CAN INSERT follow_up_events (staff insert, self-attributed)',
  $s$insert into public.follow_up_events (id, member_id, actor, channel, outcome, note)
  values ('f2222222-2222-2222-2222-222222222222', 'b1111111-1111-1111-1111-111111111111',
          'a1111111-1111-1111-1111-111111111111', 'visited', 'open', 'owner path test')$s$);

select suite_results.check_true('O09', 'owner sees audit_log_entries (owner-readable only) — 1 service row so far',
  (select count(*) from public.audit_log_entries) = 1,
  format('visible audit rows: %s (the S06 service test row; override rows come later in T)',
         (select count(*) from public.audit_log_entries)));

select suite_results.check_fail('O10', 'owner cannot INSERT audit_log_entries (append via service only)',
  $s$insert into public.audit_log_entries (actor, actor_role, action, table_name)
  values ('a1111111-1111-1111-1111-111111111111', 'owner', 'forge', 'payments')$s$,
  '42501', 'permission denied');

select suite_results.check_fail('O11', 'owner cannot DELETE audit_log_entries (append-only)',
  $s$delete from public.audit_log_entries$s$, '42501', 'permission denied');

select suite_results.check_fail('O12', 'owner cannot UPDATE audit_log_entries (immutable history)',
  $s$update public.audit_log_entries set action = 'tampered'
   where action = 'suite.service_test'$s$,
  '42501', 'permission denied');

select suite_results.check_fail('O13', 'owner cannot UPDATE app_settings (update path is 0003)',
  $s$update public.app_settings set upi_id = 'owner@upi' where id = 1$s$,
  '42501', 'permission denied');

select suite_results.check_fail('O14', 'owner cannot UPDATE members',
  $s$update public.members set archived_at = now()
   where id = 'b1111111-1111-1111-1111-111111111111'$s$,
  '42501', 'permission denied');

select suite_results.check_fail('O15', 'owner cannot DELETE qr_tokens (no grant)',
  $s$delete from public.qr_tokens$s$, '42501', 'permission denied');

select suite_results.check_fail('O16', 'owner cannot SELECT qr_tokens (no grant; §8.1 "—")',
  $s$select * from public.qr_tokens$s$, '42501', 'permission denied');

select suite_results.check_fail('O17', 'owner cannot change profiles.role (no grant)',
  $s$update public.profiles set role = 'owner'
   where id = 'a3333333-3333-3333-3333-333333333333'$s$,
  '42501', 'permission denied');

select suite_results.check_true('O18', 'owner sees ALL profiles (staff visibility)',
  (select count(*) from public.profiles) >= 4
  and (select count(*) from public.profiles
       where id = 'a3333333-3333-3333-3333-333333333333') = 1,
  format('visible profiles: %s', (select count(*) from public.profiles)));

select suite_results.check_true('O19', 'owner sees join_applications + follow_up_events + periods',
  (select count(*) from public.join_applications) = 2
  and (select count(*) from public.follow_up_events) = 3
  and (select count(*) from public.membership_periods) >= 1,
  format('apps %s / followups %s / periods %s',
         (select count(*) from public.join_applications),
         (select count(*) from public.follow_up_events),
         (select count(*) from public.membership_periods)));

commit;

-- =====================================================================
-- A. anon context (unauthenticated)
-- =====================================================================
begin;
set local role anon;

select suite_results.check_fail('A01', 'anon cannot SELECT payments',
  $s$select * from public.payments$s$, '42501', 'permission denied');

select suite_results.check_fail('A02', 'anon cannot SELECT profiles',
  $s$select * from public.profiles$s$, '42501', 'permission denied');

select suite_results.check_fail('A03', 'anon cannot SELECT app_settings',
  $s$select * from public.app_settings$s$, '42501', 'permission denied');

select suite_results.check_fail('A04', 'anon cannot INSERT payments',
  $s$insert into public.payments (member_id, plan_id, method, state, recorded_by)
  values ('b1111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111',
          'cash', 'awaitingVerification', 'a2222222-2222-2222-2222-222222222222')$s$,
  '42501', 'permission denied');

select suite_results.check_fail('A05', 'anon cannot INSERT follow_up_events',
  $s$insert into public.follow_up_events (member_id, actor, channel, outcome)
  values ('b1111111-1111-1111-1111-111111111111', 'a2222222-2222-2222-2222-222222222222',
          'called', 'open')$s$,
  '42501', 'permission denied');

select suite_results.check_fail('A06', 'anon cannot SELECT audit_log_entries',
  $s$select * from public.audit_log_entries$s$, '42501', 'permission denied');

commit;

-- =====================================================================
-- G. guard backstop: even a temporary direct grant cannot enable a
--    client mutation (assert_no_client_mutation fires before RLS'd
--    writes land; when RLS filters first, effective rows = 0 anyway).
-- =====================================================================
grant update on public.payments to authenticated;
grant delete on public.members to authenticated;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a3333333-3333-3333-3333-333333333333","role":"member"}';
set local request.jwt.claim.sub = 'a3333333-3333-3333-3333-333333333333';

select suite_results.check_no_mutation('G01', 'TEMPORARY UPDATE grant still cannot mutate payments (guard/RLS backstop)',
  $s$update public.payments set note = 'backstop-test' where id = 'e1111111-1111-1111-1111-111111111111'$s$);

select suite_results.check_no_mutation('G02', 'TEMPORARY DELETE grant still cannot delete members (guard/RLS backstop)',
  $s$delete from public.members where id = 'b1111111-1111-1111-1111-111111111111'$s$);

commit;

revoke update on public.payments from authenticated;
revoke delete on public.members from authenticated;

select suite_results.check_true('G03', 'payments row unchanged after backstop attempt',
  (select state from public.payments
   where id = 'e1111111-1111-1111-1111-111111111111') = 'verified'
  and (select note is null from public.payments
       where id = 'e1111111-1111-1111-1111-111111111111'),
  'no mutation landed through the temporary grant');

select suite_results.check_true('G04', 'temporary grants fully revoked (catalog re-verified)',
  (select count(*) from information_schema.role_table_grants
   where table_schema = 'public' and grantee = 'authenticated'
   and privilege_type in ('UPDATE', 'DELETE')) = 0,
  'back to least privilege');

-- =====================================================================
-- X. members.auth_user_id FK behavior: ON DELETE SET NULL (financial
--    history is retained when the auth account goes away)
-- =====================================================================
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'a6666666-6666-6666-6666-666666666666',
        'authenticated', 'authenticated', 'temp-link@local.test', 'irrelevant', now(), now());

insert into public.members (id, full_name, phone, auth_user_id)
values ('b6666666-6666-6666-6666-666666666666', 'Temp Link', '9700000999',
        'a6666666-6666-6666-6666-666666666666');

delete from auth.users where id = 'a6666666-6666-6666-6666-666666666666';

select suite_results.check_true('X01', 'deleting the auth user NULLs members.auth_user_id (member row retained)',
  (select auth_user_id is null from public.members
   where id = 'b6666666-6666-6666-6666-666666666666'),
  'ON DELETE SET NULL per the approved deletion rule');

-- =====================================================================
-- U. updated_at maintenance triggers
-- =====================================================================
do $u$
declare
  v_old timestamptz;
  v_new timestamptz;
begin
  select updated_at into v_old from public.plans
   where id = 'c1111111-1111-1111-1111-111111111111';
  update public.plans set is_active = is_active
   where id = 'c1111111-1111-1111-1111-111111111111';
  select updated_at into v_new from public.plans
   where id = 'c1111111-1111-1111-1111-111111111111';
  perform suite_results.check_true('U01', 'set_updated_at maintains plans.updated_at on UPDATE',
    v_new <> v_old, format('%s -> %s', v_old, v_new));
end
$u$;

-- =====================================================================
-- T. payments INSERT override in a REAL PostgREST context.
--    The main suite runs as session_user='postgres', which the fixed
--    override skips by design (maintenance context). To exercise the
--    trigger for real, we \connect to the stack's actual client login
--    role: session_user becomes 'authenticator' — exactly what PostgREST
--    presents. pg_temp objects would die here; helpers/results live in
--    the persistent suite_results schema instead.
-- =====================================================================
\connect "host=127.0.0.1 port=5432 dbname=postgres user=authenticator"

-- T1: receptionist-context spoofed-field insert (the former R05–R07)
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a2222222-2222-2222-2222-222222222222","role":"receptionist"}';
set local request.jwt.claim.sub = 'a2222222-2222-2222-2222-222222222222';

select suite_results.check_ok('T01', 'override accepts receptionist INSERT with fully spoofed fields (JWT role claim downgraded to "member")',
  $s$insert into public.payments (id, member_id, plan_id, entry_type, reversal_of,
    original_price, discount_pct, discount_amount, payable, currency, method, utr,
    state, recorded_by, verified_by, receipt_issued, receipt_path, note)
  values ('e4444444-4444-4444-4444-444444444444', 'b1111111-1111-1111-1111-111111111111',
          'c1111111-1111-1111-1111-111111111111', 'reversal',
          'e2222222-2222-2222-2222-222222222222', 999.00, 0, 998.00, 1.00, 'USD', 'cash', null,
          'verified', 'a1111111-1111-1111-1111-111111111111',
          'a1111111-1111-1111-1111-111111111111', true, 'hacked/receipt.pdf', 'spoofed')$s$);

select suite_results.check_true('T02', 'override FORCED state/entry_type/reversal_of/currency/verifier',
  (select state from public.payments
   where id = 'e4444444-4444-4444-4444-444444444444') = 'awaitingVerification'
  and (select entry_type from public.payments
       where id = 'e4444444-4444-4444-4444-444444444444') = 'payment'
  and (select reversal_of is null from public.payments
       where id = 'e4444444-4444-4444-4444-444444444444')
  and (select currency from public.payments
       where id = 'e4444444-4444-4444-4444-444444444444') = 'INR'
  and (select verified_by is null from public.payments
       where id = 'e4444444-4444-4444-4444-444444444444'),
  'client-spoofed reversal/verified/USD fields all discarded');

select suite_results.check_true('T03', 'override computed server money from price_locked + forced attribution',
  (select original_price from public.payments
   where id = 'e4444444-4444-4444-4444-444444444444') = 1500.00
  and (select payable from public.payments
       where id = 'e4444444-4444-4444-4444-444444444444') = 1500.00
  and (select discount_amount from public.payments
       where id = 'e4444444-4444-4444-4444-444444444444') = 0.00
  and (select recorded_by from public.payments
       where id = 'e4444444-4444-4444-4444-444444444444') = 'a2222222-2222-2222-2222-222222222222'
  and (select receipt_issued from public.payments
       where id = 'e4444444-4444-4444-4444-444444444444') = false,
  'money from members.price_locked (1500); recorded_by = actual actor');

select suite_results.check_fail('T04', 'override-computed row still hits UPI-requires-UTR constraint (no bypass of storage rules)',
  $s$insert into public.payments (member_id, plan_id, method, state, recorded_by)
  values ('b1111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111',
          'upi', 'awaitingVerification', 'a2222222-2222-2222-2222-222222222222')$s$,
  '23514', 'upi_requires_utr');
commit;

-- T5: non-receptionist personas are rejected by the override trigger
-- itself (BEFORE INSERT fires before WITH CHECK — proven on this engine
-- by micro-test), so clients get the guard error, not a bare RLS error.
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a3333333-3333-3333-3333-333333333333","role":"member"}';
set local request.jwt.claim.sub = 'a3333333-3333-3333-3333-333333333333';

select suite_results.check_fail('T05', 'member INSERT rejected BY THE OVERRIDE (receptionist-only)',
  $s$insert into public.payments (member_id, plan_id, method, state, recorded_by)
  values ('b1111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111',
          'cash', 'awaitingVerification', 'a3333333-3333-3333-3333-333333333333')$s$,
  '42501', 'Only receptionists can record payments');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a1111111-1111-1111-1111-111111111111","role":"owner"}';
set local request.jwt.claim.sub = 'a1111111-1111-1111-1111-111111111111';

select suite_results.check_fail('T06', 'owner INSERT rejected BY THE OVERRIDE (spoofed owner claim irrelevant)',
  $s$insert into public.payments (member_id, plan_id, method, state, recorded_by)
  values ('b1111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111',
          'cash', 'awaitingVerification', 'a1111111-1111-1111-1111-111111111111')$s$,
  '42501', 'Only receptionists can record payments');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a5555555-5555-5555-5555-555555555555","role":"receptionist"}';
set local request.jwt.claim.sub = 'a5555555-5555-5555-5555-555555555555';

select suite_results.check_fail('T07', 'profileless user INSERT rejected BY THE OVERRIDE (no profile ≠ receptionist)',
  $s$insert into public.payments (member_id, plan_id, method, state, recorded_by)
  values ('b1111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111',
          'cash', 'awaitingVerification', 'a5555555-5555-5555-5555-555555555555')$s$,
  '42501', 'Only receptionists can record payments');
commit;

-- T8/T9: fallback price (former R23/R24): member2 has NO price_locked →
-- plan price used; spoofed uprole/reversal claims discarded.
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a2222222-2222-2222-2222-222222222222","role":"owner"}';
set local request.jwt.claim.sub = 'a2222222-2222-2222-2222-222222222222';

select suite_results.check_ok('T08', 'receptionist INSERT for member2 accepted with spoofed uprole/reversal claims (discount 10%)',
  $s$insert into public.payments (id, member_id, plan_id, original_price, discount_pct,
    discount_amount, payable, method, utr, state, recorded_by, entry_type)
  values ('e5555555-5555-5555-5555-555555555555', 'b2222222-2222-2222-2222-222222222222',
          'c1111111-1111-1111-1111-111111111111', 999.00, 10, 1.00, 500.00,
          'upi', 'UTRSUITE2026000003', 'rejected',
          'a1111111-1111-1111-1111-111111111111', 'reversal')$s$);

select suite_results.check_true('T09', 'fallback price from plan + approved rounding: 1500 → 1350 @ 10%',
  (select original_price from public.payments
   where id = 'e5555555-5555-5555-5555-555555555555') = 1500.00
  and (select payable from public.payments
       where id = 'e5555555-5555-5555-5555-555555555555') = 1350.00
  and (select discount_amount from public.payments
       where id = 'e5555555-5555-5555-5555-555555555555') = 150.00
  and (select entry_type from public.payments
       where id = 'e5555555-5555-5555-5555-555555555555') = 'payment'
  and (select recorded_by from public.payments
       where id = 'e5555555-5555-5555-5555-555555555555') = 'a2222222-2222-2222-2222-222222222222',
  'member2 has NO price_locked → plans.price (1500) used; spoofed reversal fields discarded');
commit;

-- T10: member2 visibility after the T8 insert (former W01 extension)
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a4444444-4444-4444-4444-444444444444","role":"member"}';
set local request.jwt.claim.sub = 'a4444444-4444-4444-4444-444444444444';

select suite_results.check_true('T10', 'member2 now sees exactly 2 own payments (pay2 + override-inserted e5555555)',
  (select count(*) from public.payments) = 2
  and (select count(*) from public.payments
       where id = 'e5555555-5555-5555-5555-555555555555') = 1,
  format('visible payments: %s', (select count(*) from public.payments)));
commit;

-- T11: audit emission for both override inserts (former R25), read in
-- the owner context.
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a1111111-1111-1111-1111-111111111111","role":"owner"}';
set local request.jwt.claim.sub = 'a1111111-1111-1111-1111-111111111111';

select suite_results.check_true('T11', 'override emitted payment.created audit rows for both override inserts',
  (select count(*) from public.audit_log_entries
   where row_id = 'e4444444-4444-4444-4444-444444444444'
   and action = 'payment.created'
   and actor = 'a2222222-2222-2222-2222-222222222222'
   and actor_role = 'receptionist') = 1
  and (select count(*) from public.audit_log_entries
       where row_id = 'e5555555-5555-5555-5555-555555555555'
       and action = 'payment.created') = 1,
  'audit trail: actor + actor_role from the authoritative profile');
commit;

-- T12: the app.bypass_payment_override GUC contract — the 0003 authority
-- functions (e.g. create_reversal) set this marker around their own
-- inserts so reversal rows land EXACTLY as provided. Here the GUC is set
-- inside the authenticator session (the only way server code reachable
-- by a client can do it): a reversal-shaped 'verified' row lands
-- unmodified, proving the override did not fire. Without the GUC the
-- same insert would be forced to an awaitingVerification payment row
-- (T01/T02 prove that), and clients cannot SET custom GUCs through
-- PostgREST.
--
-- 3B.3 regression-compatibility note: the reversal target is e2222222
-- (member2's verified payment, no prior reversals). The original e1111111
-- target was already fully reversed by fixture e3333333, and once
-- migration 0003 is applied its deferred constraint trigger
-- (payments_reversal_cap) would — correctly — abort this insert at
-- commit. Purpose, mechanism and assertion count are unchanged.
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a2222222-2222-2222-2222-222222222222","role":"receptionist"}';
set local request.jwt.claim.sub = 'a2222222-2222-2222-2222-222222222222';
set local app.bypass_payment_override = 'on';

select suite_results.check_ok('T12', 'GUC bypass (0003 contract): reversal-shaped row lands EXACTLY as provided',
  $s$insert into public.payments (id, member_id, plan_id, entry_type, reversal_of,
    original_price, discount_pct, discount_amount, payable, currency, method, utr,
    state, recorded_by, verified_by, verified_at, receipt_issued)
  values ('e6666666-6666-6666-6666-666666666666', 'b2222222-2222-2222-2222-222222222222',
          'c1111111-1111-1111-1111-111111111111', 'reversal',
          'e2222222-2222-2222-2222-222222222222', 1500.00, 0, 0.00, 1500.00, 'INR', 'cash', null,
          'verified', 'a2222222-2222-2222-2222-222222222222',
          'a2222222-2222-2222-2222-222222222222', now(), true)$s$);

select suite_results.check_true('T13', 'GUC-bypass row was NOT overridden (entry_type/reversal_of/state intact)',
  (select entry_type from public.payments
   where id = 'e6666666-6666-6666-6666-666666666666') = 'reversal'
  and (select reversal_of from public.payments
       where id = 'e6666666-6666-6666-6666-666666666666')
       = 'e2222222-2222-2222-2222-222222222222'
  and (select state from public.payments
       where id = 'e6666666-6666-6666-6666-666666666666') = 'verified',
  'authority-function contract: no value forcing while the marker is set');
commit;

-- back to the maintenance connection for cleanup + verdict
\connect "host=127.0.0.1 port=5432 dbname=postgres user=postgres"

-- =====================================================================
-- cleanup (postgres; FK order; leaves app_settings id=1 and the
-- 0001-suite fixtures, which belong to the 3B.1 run)
-- =====================================================================
delete from public.audit_log_entries;
delete from public.membership_period_voids where id = '1d111111-1111-1111-1111-111111111111';
delete from public.membership_periods       where id = 'f1111111-1111-1111-1111-111111111111';
delete from public.attendance_events        where id = '1c111111-1111-1111-1111-111111111111';
delete from public.follow_up_events         where id in
  ('1b111111-1111-1111-1111-111111111111', 'f2222222-2222-2222-2222-222222222222',
   'f3333333-3333-3333-3333-333333333333');
delete from public.membership_freezes       where id = '1f111111-1111-1111-1111-111111111111';
delete from public.payments                 where id in
  ('e1111111-1111-1111-1111-111111111111', 'e2222222-2222-2222-2222-222222222222',
   'e3333333-3333-3333-3333-333333333333', 'e4444444-4444-4444-4444-444444444444',
   'e5555555-5555-5555-5555-555555555555', 'e6666666-6666-6666-6666-666666666666');
delete from public.qr_tokens                where id = '1e111111-1111-1111-1111-111111111111';
delete from public.join_applications        where id in
  ('1a111111-1111-1111-1111-111111111111', '1a222222-2222-2222-2222-222222222222');
delete from public.members                  where id in
  ('b1111111-1111-1111-1111-111111111111', 'b2222222-2222-2222-2222-222222222222',
   'b6666666-6666-6666-6666-666666666666');
delete from public.plans                    where id in
  ('c1111111-1111-1111-1111-111111111111', 'c2222222-2222-2222-2222-222222222222');
delete from public.profiles                 where id in
  ('a1111111-1111-1111-1111-111111111111', 'a2222222-2222-2222-2222-222222222222',
   'a3333333-3333-3333-3333-333333333333', 'a4444444-4444-4444-4444-444444444444');
delete from auth.users                      where id in
  ('a1111111-1111-1111-1111-111111111111', 'a2222222-2222-2222-2222-222222222222',
   'a3333333-3333-3333-3333-333333333333', 'a4444444-4444-4444-4444-444444444444',
   'a5555555-5555-5555-5555-555555555555');

-- This suite's trigger/policy tests inserted dependent rows with generated
-- uuids on the 0001 baseline members. Remove them so later suites see a
-- predictable table state; the baseline members/plans/profiles stay (0003
-- relies on them existing).
delete from public.membership_period_voids where period_id in
  (select id from public.membership_periods
    where member_id in ('bbbbbbbb-0000-0000-0000-000000000001',
                        'bbbbbbbb-0000-0000-0000-000000000002'));
delete from public.membership_periods where member_id in
  ('bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002');
delete from public.payments where member_id in
  ('bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002');
delete from public.membership_freezes where member_id in
  ('bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002');
delete from public.attendance_events where member_id in
  ('bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002');
delete from public.follow_up_events where member_id in
  ('bbbbbbbb-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002');

-- =====================================================================
-- report: every assertion individually, then the verdict
-- =====================================================================
do $$
declare
  r       record;
  v_pass  int;
  v_total int;
begin
  for r in select num, label, passed, detail from suite_results.t_results order by num loop
    if r.passed then
      raise notice 'PASS  %  %', r.num, r.label;
    else
      raise notice 'FAIL  %  %  ::  %', r.num, r.label, r.detail;
    end if;
  end loop;

  select count(*) filter (where passed), count(*) into v_pass, v_total from suite_results.t_results;

  if v_pass < v_total then
    raise exception '0002 VALIDATION FAILED: % of % assertions passed — see FAIL lines above',
      v_pass, v_total;
  end if;
  raise notice '0002 VALIDATION PASSED: % of % assertions passed', v_pass, v_total;
end
$$;

-- drop the persistent results schema (recreated fresh on every run)
drop schema suite_results cascade;

