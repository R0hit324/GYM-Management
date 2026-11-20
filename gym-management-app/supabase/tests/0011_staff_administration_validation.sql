-- =====================================================================
-- tests/0011_staff_administration_validation.sql
-- Production Readiness — Stage 2B, WS-5: staff administration (0011).
--
-- Prerequisites: local Supabase stack; database reset with migrations
-- 0001-0011 applied; pristine seed. Fixture prefix: 3c5.
--
-- What is proved here:
--   * Least privilege: authenticated-only EXECUTE; anon/service_role no;
--     the internal guard has no client EXECUTE.
--   * Role/AAL2 matrix for every administrative function.
--   * Inactive profiles are denied immediately by app_profile_role(),
--     require_role(), RLS and authority functions.
--   * Receptionists/members cannot create or deactivate anyone.
--   * Owners cannot create owners or pass a role argument at all.
--   * Self-deactivation and owner/member deactivation are refused.
--   * Directory exposes staff only (owners/receptionists), never members.
--   * Every successful action writes exactly one audit row with the owner
--     as actor; idempotent calls write no extra row.
--   * Direct client UPDATE of profiles remains impossible.
--
-- Personas are simulated with SET LOCAL ROLE + request.jwt GUCs
-- (session_user stays postgres, so trusted fixture inserts land as given).
--
-- NOTE: this suite could not be executed in the WS-5 environment because
-- the local Docker daemon was unavailable. It is committed unexecuted and
-- must be run before the migration is promoted.
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
  values (p_num, p_label, coalesce(p_ok, false),
          case when p_ok is null
               then 'NULL condition (treated as FAIL): ' || coalesce(p_detail, '')
               else p_detail end);
end $ct$;

grant execute on function suite_results.check_fail(text,text,text,text,text) to public;
grant execute on function suite_results.check_ok(text,text,text) to public;
grant execute on function suite_results.check_true(text,text,boolean,text) to public;

-- =====================================================================
-- Fixtures (prefix 3c5)
--   owner active           3c5a1111-…-01  (actor)
--   receptionist active    3c5a2222-…-02  (target)
--   receptionist inactive  3c5a3333-…-03  (denied account)
--   owner 2 active         3c5a4444-…-04  (owner-target protection)
--   member                 3c5a5555-…-05
--   unprofiled auth user   3c5a6666-…-06  (create target)
--   member-linked auth     3c5a7777-…-07  (create must refuse)
--   owner inactive         3c5a9999-…-09  (denied owner)
-- =====================================================================
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '3c5a1111-0000-0000-0000-000000000001', 'authenticated', 'authenticated', '3c5-owner@example.com', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '3c5a2222-0000-0000-0000-000000000002', 'authenticated', 'authenticated', '3c5-rec@example.com', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '3c5a3333-0000-0000-0000-000000000003', 'authenticated', 'authenticated', '3c5-rec-inactive@example.com', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '3c5a4444-0000-0000-0000-000000000004', 'authenticated', 'authenticated', '3c5-owner2@example.com', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '3c5a5555-0000-0000-0000-000000000005', 'authenticated', 'authenticated', '3c5-member@example.com', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '3c5a6666-0000-0000-0000-000000000006', 'authenticated', 'authenticated', '3c5-newstaff@example.com', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '3c5a7777-0000-0000-0000-000000000007', 'authenticated', 'authenticated', '3c5-linked@example.com', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '3c5a9999-0000-0000-0000-000000000009', 'authenticated', 'authenticated', '3c5-owner-inactive@example.com', 'x', now(), now());

insert into public.profiles (id, display_name, role, is_active) values
  ('3c5a1111-0000-0000-0000-000000000001', '3c5 Owner',          'owner',        true),
  ('3c5a2222-0000-0000-0000-000000000002', '3c5 Rec',            'receptionist', true),
  ('3c5a3333-0000-0000-0000-000000000003', '3c5 Rec Inactive',   'receptionist', false),
  ('3c5a4444-0000-0000-0000-000000000004', '3c5 Owner Two',      'owner',        true),
  ('3c5a5555-0000-0000-0000-000000000005', '3c5 Member',         'member',       true),
  ('3c5a9999-0000-0000-0000-000000000009', '3c5 Owner Inactive', 'owner',        false);

-- A member record linked to an auth user that has NO profile (the create
-- path must refuse to repurpose it as staff).
insert into public.members (id, full_name, phone, email, auth_user_id, joined_on)
values
  ('3c5b1111-0000-0000-0000-000000000001', '3c5 Linked Member', '+919811000060',
   '3c5-linked@example.com', '3c5a7777-0000-0000-0000-000000000007', '2026-09-01');

-- =====================================================================
-- 11.0 Privileges and function posture
-- =====================================================================
select suite_results.check_true('R01', 'authenticated may execute admin_staff_directory',
  has_function_privilege('authenticated', 'public.admin_staff_directory()', 'EXECUTE'),
  'EXECUTE granted to authenticated');

select suite_results.check_true('R02', 'anon may NOT execute admin_staff_directory',
  not has_function_privilege('anon', 'public.admin_staff_directory()', 'EXECUTE'),
  'EXECUTE revoked from anon');

select suite_results.check_true('R03', 'service_role may NOT execute admin_staff_directory',
  not has_function_privilege('service_role', 'public.admin_staff_directory()', 'EXECUTE'),
  'EXECUTE revoked from service_role');

select suite_results.check_true('R04', 'internal guard has no client EXECUTE',
  not has_function_privilege('authenticated', 'public.admin_staff_assert()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.admin_staff_assert()', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.admin_staff_assert()', 'EXECUTE'),
  'admin_staff_assert is internal only');

select suite_results.check_true('R05', 'directory is SECURITY DEFINER with pinned search_path',
  (
    select p.prosecdef and p.proconfig @> array['search_path=public']
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'admin_staff_directory'
  ),
  'definer rights + search_path=public');

select suite_results.check_true('R06', 'is_active is NOT NULL with a true default',
  (
    select a.attnotnull
       and pg_get_expr(d.adbin, d.adrelid) = 'true'
      from pg_attribute a
      join pg_class c on c.oid = a.attrelid
      join pg_namespace n on n.oid = c.relnamespace
      left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
     where n.nspname = 'public' and c.relname = 'profiles' and a.attname = 'is_active'
  ),
  'durable authorisation switch');

-- =====================================================================
-- 11.1 Inactive profiles are denied at the helper/RLS level
-- =====================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3c5a3333-0000-0000-0000-000000000003","role":"receptionist","aal":"aal2"}';
set local request.jwt.claim.sub = '3c5a3333-0000-0000-0000-000000000003';

select suite_results.check_true('I01', 'inactive profile resolves to NULL role',
  public.app_profile_role() is null,
  'app_profile_role honours is_active');

select suite_results.check_true('I02', 'inactive account sees no profile rows through RLS',
  (select count(*) from public.profiles) = 0,
  'every RLS policy denies the inactive session');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3c5a3333-0000-0000-0000-000000000003","role":"receptionist","aal":"aal2"}';
set local request.jwt.claim.sub = '3c5a3333-0000-0000-0000-000000000003';

select suite_results.check_fail('I03', 'inactive receptionist cannot use a gated authority function',
  $s$select public.mint_attendance_token(60)$s$,
  '42501', 'Insufficient role');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3c5a9999-0000-0000-0000-000000000009","role":"owner","aal":"aal2"}';
set local request.jwt.claim.sub = '3c5a9999-0000-0000-0000-000000000009';

select suite_results.check_fail('I04', 'inactive owner cannot read the staff directory',
  $s$select * from public.admin_staff_directory()$s$,
  '42501', 'Insufficient role');
commit;

-- =====================================================================
-- 11.2 Directory authorization matrix
-- =====================================================================
begin;
set local role anon;
set local request.jwt.claims = '{}';

select suite_results.check_fail('A01', 'anon cannot read the staff directory',
  $s$select * from public.admin_staff_directory()$s$,
  '42501');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3c5a5555-0000-0000-0000-000000000005","role":"member","aal":"aal2"}';
set local request.jwt.claim.sub = '3c5a5555-0000-0000-0000-000000000005';

select suite_results.check_fail('A02', 'member cannot read the staff directory',
  $s$select * from public.admin_staff_directory()$s$,
  '42501', 'Insufficient role');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3c5a2222-0000-0000-0000-000000000002","role":"receptionist","aal":"aal2"}';
set local request.jwt.claim.sub = '3c5a2222-0000-0000-0000-000000000002';

select suite_results.check_fail('A03', 'receptionist cannot read the staff directory',
  $s$select * from public.admin_staff_directory()$s$,
  '42501', 'Insufficient role');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3c5a1111-0000-0000-0000-000000000001","role":"owner","aal":"aal1"}';
set local request.jwt.claim.sub = '3c5a1111-0000-0000-0000-000000000001';

select suite_results.check_fail('A04', 'owner at aal1 is refused (MFA required)',
  $s$select * from public.admin_staff_directory()$s$,
  '42501', 'multi-factor');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3c5a1111-0000-0000-0000-000000000001","role":"owner","aal":"aal2"}';
set local request.jwt.claim.sub = '3c5a1111-0000-0000-0000-000000000001';

select suite_results.check_ok('A05', 'owner at aal2 reads the staff directory',
  $s$select * from public.admin_staff_directory()$s$);

select suite_results.check_true('A06', 'directory contains owners + receptionists only',
  (select count(*) = 5
      and bool_and(role in ('owner', 'receptionist'))
     from public.admin_staff_directory()),
  '5 staff rows; no member row');

select suite_results.check_true('A07', 'directory reports inactive staff honestly',
  (select bool_and(is_active = false)
     from public.admin_staff_directory()
    where user_id in ('3c5a3333-0000-0000-0000-000000000003',
                      '3c5a9999-0000-0000-0000-000000000009')),
  'inactive flags preserved');

select suite_results.check_true('A08', 'directory never exposes a member profile',
  (select count(*) = 0
     from public.admin_staff_directory()
    where user_id = '3c5a5555-0000-0000-0000-000000000005'),
  'member excluded');
commit;

-- =====================================================================
-- 11.3 Creation: block every escalation path
-- =====================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3c5a5555-0000-0000-0000-000000000005","role":"member","aal":"aal2"}';
set local request.jwt.claim.sub = '3c5a5555-0000-0000-0000-000000000005';

select suite_results.check_fail('C01', 'member cannot create a staff profile',
  $s$select public.admin_register_staff('3c5a6666-0000-0000-0000-000000000006', '3c5 New Staff', null)$s$,
  '42501', 'Insufficient role');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3c5a2222-0000-0000-0000-000000000002","role":"receptionist","aal":"aal2"}';
set local request.jwt.claim.sub = '3c5a2222-0000-0000-0000-000000000002';

select suite_results.check_fail('C02', 'receptionist cannot create a staff profile',
  $s$select public.admin_register_staff('3c5a6666-0000-0000-0000-000000000006', '3c5 New Staff', null)$s$,
  '42501', 'Insufficient role');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3c5a1111-0000-0000-0000-000000000001","role":"owner","aal":"aal1"}';
set local request.jwt.claim.sub = '3c5a1111-0000-0000-0000-000000000001';

select suite_results.check_fail('C03', 'owner at aal1 cannot create a staff profile',
  $s$select public.admin_register_staff('3c5a6666-0000-0000-0000-000000000006', '3c5 New Staff', null)$s$,
  '42501', 'multi-factor');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3c5a1111-0000-0000-0000-000000000001","role":"owner","aal":"aal2"}';
set local request.jwt.claim.sub = '3c5a1111-0000-0000-0000-000000000001';

-- There is no role parameter: a 4-argument call cannot resolve to a
-- function, so no request can ask for owner/receptionist/member.
select suite_results.check_fail('C04', 'no role argument exists on the create function',
  $s$select public.admin_register_staff('3c5a6666-0000-0000-0000-000000000006', '3c5 New Staff', null, 'owner')$s$,
  '42883');

select suite_results.check_fail('C05', 'blank display name is refused',
  $s$select public.admin_register_staff('3c5a6666-0000-0000-0000-000000000006', '  ', null)$s$,
  '55000', 'display name');

select suite_results.check_fail('C06', 'unknown auth user is refused',
  $s$select public.admin_register_staff('3c5affff-0000-0000-0000-0000000000ff', '3c5 Ghost', null)$s$,
  'P0002', 'does not exist');

select suite_results.check_fail('C07', 'an existing profile cannot be re-registered',
  $s$select public.admin_register_staff('3c5a2222-0000-0000-0000-000000000002', '3c5 Rec Again', null)$s$,
  '55000', 'already has a profile');

select suite_results.check_fail('C08', 'a member-linked auth account cannot become staff',
  $s$select public.admin_register_staff('3c5a7777-0000-0000-0000-000000000007', '3c5 Linked Staff', null)$s$,
  '42501', 'linked to a member');

select suite_results.check_ok('C09', 'owner at aal2 registers a receptionist profile',
  $s$select public.admin_register_staff('3c5a6666-0000-0000-0000-000000000006', '3c5 New Staff', '+919811000066')$s$);

select suite_results.check_true('C10', 'created profile is receptionist, active, with the supplied name/phone',
  (
    select p.role = 'receptionist'
       and p.is_active
       and p.display_name = '3c5 New Staff'
       and p.phone = '+919811000066'
      from public.profiles p
     where p.id = '3c5a6666-0000-0000-0000-000000000006'
  ),
  'role hard-coded to receptionist');

select suite_results.check_true('C11', 'creation wrote one staff.created audit row with the owner actor',
  (
    select count(*) = 1
      from public.audit_log_entries a
     where a.action = 'staff.created'
       and a.table_name = 'profiles'
       and a.row_id = '3c5a6666-0000-0000-0000-000000000006'
       and a.actor = '3c5a1111-0000-0000-0000-000000000001'
       and a.actor_role = 'owner'
  ),
  'audited and attributed');

select suite_results.check_true('C12', 'created profile can be read by the owner directory',
  (
    select count(*) = 1
      from public.admin_staff_directory()
     where user_id = '3c5a6666-0000-0000-0000-000000000006'
       and email = '3c5-newstaff@example.com'
  ),
  'directory joins auth email');
commit;

-- =====================================================================
-- 11.4 Activation / deactivation
-- =====================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3c5a2222-0000-0000-0000-000000000002","role":"receptionist","aal":"aal2"}';
set local request.jwt.claim.sub = '3c5a2222-0000-0000-0000-000000000002';

select suite_results.check_fail('D01', 'receptionist cannot deactivate anyone',
  $s$select public.admin_set_staff_active('3c5a2222-0000-0000-0000-000000000002', false)$s$,
  '42501', 'Insufficient role');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3c5a1111-0000-0000-0000-000000000001","role":"owner","aal":"aal1"}';
set local request.jwt.claim.sub = '3c5a1111-0000-0000-0000-000000000001';

select suite_results.check_fail('D02', 'owner at aal1 cannot deactivate a receptionist',
  $s$select public.admin_set_staff_active('3c5a2222-0000-0000-0000-000000000002', false)$s$,
  '42501', 'multi-factor');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3c5a1111-0000-0000-0000-000000000001","role":"owner","aal":"aal2"}';
set local request.jwt.claim.sub = '3c5a1111-0000-0000-0000-000000000001';

select suite_results.check_fail('D03', 'owner cannot deactivate their own account',
  $s$select public.admin_set_staff_active('3c5a1111-0000-0000-0000-000000000001', false)$s$,
  '42501', 'own account');

select suite_results.check_fail('D04', 'owner cannot deactivate another owner',
  $s$select public.admin_set_staff_active('3c5a4444-0000-0000-0000-000000000004', false)$s$,
  '42501', 'Only receptionist');

select suite_results.check_fail('D05', 'owner cannot deactivate a member',
  $s$select public.admin_set_staff_active('3c5a5555-0000-0000-0000-000000000005', false)$s$,
  '42501', 'Only receptionist');

select suite_results.check_fail('D06', 'unknown staff id is refused',
  $s$select public.admin_set_staff_active('3c5affff-0000-0000-0000-0000000000ff', false)$s$,
  'P0002', 'not found');

select suite_results.check_ok('D09', 'owner at aal2 deactivates a receptionist',
  $s$select public.admin_set_staff_active('3c5a2222-0000-0000-0000-000000000002', false)$s$);

select suite_results.check_true('D10', 'deactivation set is_active = false',
  (select not is_active from public.profiles where id = '3c5a2222-0000-0000-0000-000000000002'),
  'authorisation revoked at the profile');

select suite_results.check_true('D11', 'deactivation wrote exactly one staff.deactivated row',
  (
    select count(*) = 1
      from public.audit_log_entries
     where action = 'staff.deactivated'
       and row_id = '3c5a2222-0000-0000-0000-000000000002'
       and actor = '3c5a1111-0000-0000-0000-000000000001'
       and new_values ->> 'is_active' = 'false'
  ),
  'audited');

select suite_results.check_ok('D12', 'repeating the same deactivation is a safe no-op',
  $s$select public.admin_set_staff_active('3c5a2222-0000-0000-0000-000000000002', false)$s$);

select suite_results.check_true('D13', 'idempotent deactivation writes no second audit row',
  (
    select count(*) = 1
      from public.audit_log_entries
     where action = 'staff.deactivated'
       and row_id = '3c5a2222-0000-0000-0000-000000000002'
  ),
  'same-state call is a no-op');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3c5a2222-0000-0000-0000-000000000002","role":"receptionist","aal":"aal2"}';
set local request.jwt.claim.sub = '3c5a2222-0000-0000-0000-000000000002';

select suite_results.check_true('D14', 'deactivated receptionist resolves to NULL role',
  public.app_profile_role() is null,
  'immediate revocation');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3c5a1111-0000-0000-0000-000000000001","role":"owner","aal":"aal2"}';
set local request.jwt.claim.sub = '3c5a1111-0000-0000-0000-000000000001';

select suite_results.check_ok('D15', 'owner at aal2 reactivates the receptionist',
  $s$select public.admin_set_staff_active('3c5a2222-0000-0000-0000-000000000002', true)$s$);

select suite_results.check_true('D16', 'reactivation set is_active = true',
  (select is_active from public.profiles where id = '3c5a2222-0000-0000-0000-000000000002'),
  'access restored deliberately');

select suite_results.check_true('D17', 'reactivation wrote exactly one staff.activated row',
  (
    select count(*) = 1
      from public.audit_log_entries
     where action = 'staff.activated'
       and row_id = '3c5a2222-0000-0000-0000-000000000002'
       and actor = '3c5a1111-0000-0000-0000-000000000001'
  ),
  'audited');
commit;

-- =====================================================================
-- 11.5 Session-block acknowledgement
-- =====================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3c5a1111-0000-0000-0000-000000000001","role":"owner","aal":"aal2"}';
set local request.jwt.claim.sub = '3c5a1111-0000-0000-0000-000000000001';

select suite_results.check_ok('S01', 'owner at aal2 records a session block for a receptionist',
  $s$select public.admin_record_staff_sessions_blocked('3c5a2222-0000-0000-0000-000000000002')$s$);

select suite_results.check_true('S02', 'session block wrote one audited row',
  (
    select count(*) = 1
      from public.audit_log_entries
     where action = 'staff.sessions_blocked'
       and row_id = '3c5a2222-0000-0000-0000-000000000002'
       and actor = '3c5a1111-0000-0000-0000-000000000001'
       and actor_role = 'owner'
  ),
  'audit matches the auth-side ban');

select suite_results.check_fail('S03', 'owner target cannot be session-blocked',
  $s$select public.admin_record_staff_sessions_blocked('3c5a4444-0000-0000-0000-000000000004')$s$,
  '42501', 'Only receptionist');

select suite_results.check_fail('S04', 'member target cannot be session-blocked',
  $s$select public.admin_record_staff_sessions_blocked('3c5a5555-0000-0000-0000-000000000005')$s$,
  '42501', 'Only receptionist');

select suite_results.check_fail('S05', 'unknown target cannot be session-blocked',
  $s$select public.admin_record_staff_sessions_blocked('3c5affff-0000-0000-0000-0000000000ff')$s$,
  'P0002', 'not found');

select suite_results.check_fail('S06', 'direct client UPDATE of profiles is still denied',
  $s$update public.profiles set is_active = false where id = '3c5a4444-0000-0000-0000-000000000004'$s$,
  '42501');

select suite_results.check_true('S07', 'admin actions never changed roles',
  (
    select count(*) = 0
      from public.profiles
     where id::text like '3c5%'
       and role not in ('owner', 'receptionist', 'member')
  ),
  'role remains one of the three sanctioned values');
commit;

-- =====================================================================
-- Cleanup + summary
-- =====================================================================
delete from public.audit_log_entries where actor::text like '3c5%' or row_id::text like '3c5%';
delete from public.profiles where id::text like '3c5%';
delete from public.members where id::text like '3c5%' or auth_user_id::text like '3c5%';
delete from auth.users where id::text like '3c5%';

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

  raise notice '0011 staff administration validation: % of % assertions passed', v_total - v_fail, v_total;

  if v_fail > 0 then
    raise exception '0011 STAFF ADMINISTRATION VALIDATION FAILED: % of % assertions failed', v_fail, v_total;
  end if;
end
$v$;

drop schema suite_results cascade;
