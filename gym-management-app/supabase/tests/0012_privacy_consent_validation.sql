-- =====================================================================
-- tests/0012_privacy_consent_validation.sql
-- Production Readiness — Stage 2B, WS-8: privacy, consent and user rights.
--
-- Prerequisites: local Supabase stack; database reset with migrations
-- 0001-0012 applied; pristine seed. Fixture prefix: 3d8.
--
-- What is proved here:
--   * Least privilege: consent/privacy RPCs are authenticated-only;
--     anon and service_role have no EXECUTE; there is no client INSERT,
--     UPDATE or DELETE grant on either new table.
--   * Consent is bound to auth.uid(): no function accepts a target user.
--   * Mandatory documents can only be recorded as accepted; marketing can
--     be accepted or declined.
--   * Consent rows are append-only: direct mutation is denied, and a new
--     version appends rather than edits.
--   * RLS: a member reads only their own consent/request rows; an Owner
--     reads the queue; a receptionist reads neither.
--   * Privacy requests are member-initiated and Owner/AAL2-resolved.
--   * Resolution changes workflow state only; member, payment and audit
--     rows are not deleted.
--   * Unauthenticated callers are refused.
--
-- Personas are simulated with SET LOCAL ROLE + request.jwt GUCs.
--
-- NOTE: this suite is committed unexecuted. The WS-8 environment has no
-- local Supabase/Docker stack and no remote access is permitted. It must
-- be run before 0012 is promoted.
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

-- Test-only read helper for audit assertions.
-- SECURITY DEFINER with an explicit search_path so audit assertions can evaluate
-- their conditions without depending on the acting caller's RLS visibility.
-- Validation infrastructure only; no application grants or RLS policies are changed.
create function suite_results.audit_action_count(p_action text, p_actor uuid)
returns bigint
language sql
security definer
set search_path = public
as $$ select count(*) from public.audit_log_entries where action = p_action and actor = p_actor $$;

grant execute on function suite_results.audit_action_count(text, uuid) to public;

-- =====================================================================
-- Fixtures (prefix 3d8)
--   owner           3d8a1111-…-01
--   member A        3d8a2222-…-02
--   member B        3d8a3333-…-03
--   receptionist    3d8a4444-…-04
-- =====================================================================
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '3d8a1111-0000-0000-0000-000000000001', 'authenticated', 'authenticated', '3d8-owner@example.com', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '3d8a2222-0000-0000-0000-000000000002', 'authenticated', 'authenticated', '3d8-member-a@example.com', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '3d8a3333-0000-0000-0000-000000000003', 'authenticated', 'authenticated', '3d8-member-b@example.com', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '3d8a4444-0000-0000-0000-000000000004', 'authenticated', 'authenticated', '3d8-rec@example.com', 'x', now(), now());

insert into public.profiles (id, display_name, role, is_active) values
  ('3d8a1111-0000-0000-0000-000000000001', '3d8 Owner',        'owner',        true),
  ('3d8a2222-0000-0000-0000-000000000002', '3d8 Member A',     'member',       true),
  ('3d8a3333-0000-0000-0000-000000000003', '3d8 Member B',     'member',       true),
  ('3d8a4444-0000-0000-0000-000000000004', '3d8 Receptionist', 'receptionist', true);

insert into public.members (id, full_name, phone, email, auth_user_id, joined_on)
values
  ('3d8b1111-0000-0000-0000-000000000001', '3d8 Member A', '+919811000071',
   '3d8-member-a@example.com', '3d8a2222-0000-0000-0000-000000000002', '2026-09-01'),
  ('3d8b2222-0000-0000-0000-000000000002', '3d8 Member B', '+919811000072',
   '3d8-member-b@example.com', '3d8a3333-0000-0000-0000-000000000003', '2026-09-01');

-- =====================================================================
-- 12.0 Privileges, posture and table shape
-- =====================================================================
select suite_results.check_true('R01', 'authenticated may execute record_consent',
  has_function_privilege('authenticated', 'public.record_consent(text,text,boolean,text)', 'EXECUTE'),
  'EXECUTE granted to authenticated');

select suite_results.check_true('R02', 'anon may NOT execute record_consent',
  not has_function_privilege('anon', 'public.record_consent(text,text,boolean,text)', 'EXECUTE'),
  'EXECUTE revoked from anon');

select suite_results.check_true('R03', 'service_role may NOT execute record_consent',
  not has_function_privilege('service_role', 'public.record_consent(text,text,boolean,text)', 'EXECUTE'),
  'EXECUTE revoked from service_role');

select suite_results.check_true('R04', 'authenticated may execute request_privacy_action',
  has_function_privilege('authenticated', 'public.request_privacy_action(text,text)', 'EXECUTE'),
  'EXECUTE granted to authenticated');

select suite_results.check_true('R05', 'authenticated may execute resolve_privacy_request',
  has_function_privilege('authenticated', 'public.resolve_privacy_request(uuid,text,text)', 'EXECUTE'),
  'EXECUTE granted to authenticated');

select suite_results.check_true('R06', 'anon may NOT execute privacy RPCs',
  not has_function_privilege('anon', 'public.request_privacy_action(text,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.resolve_privacy_request(uuid,text,text)', 'EXECUTE'),
  'EXECUTE revoked from anon');

select suite_results.check_true('R07', 'privacy functions are SECURITY DEFINER with pinned search_path',
  (
    select bool_and(p.prosecdef and p.proconfig @> array['search_path=public'])
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('record_consent', 'request_privacy_action', 'resolve_privacy_request')
  ),
  'definer rights + search_path=public');

select suite_results.check_true('R08', 'record_consent has no target-user parameter',
  (
    select p.pronargs = 4
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'record_consent'
  ),
  'target is always auth.uid()');

select suite_results.check_true('R09', 'request_privacy_action has no target-user parameter',
  (
    select p.pronargs = 2
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'request_privacy_action'
  ),
  'target is always auth.uid()');

select suite_results.check_true('R10', 'both tables have RLS enabled and forced',
  (
    select bool_and(c.relrowsecurity and c.relforcerowsecurity)
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname in ('consent_records', 'privacy_requests')
  ),
  'RLS enabled + forced');

select suite_results.check_true('R11', 'authenticated has no INSERT/UPDATE/DELETE on consent_records',
  not has_table_privilege('authenticated', 'public.consent_records', 'INSERT')
  and not has_table_privilege('authenticated', 'public.consent_records', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.consent_records', 'DELETE'),
  'read-only table; RPC writes only');

select suite_results.check_true('R12', 'authenticated has no INSERT/UPDATE/DELETE on privacy_requests',
  not has_table_privilege('authenticated', 'public.privacy_requests', 'INSERT')
  and not has_table_privilege('authenticated', 'public.privacy_requests', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.privacy_requests', 'DELETE'),
  'read-only table; RPC writes only');

-- =====================================================================
-- 12.1 Unauthenticated calls are refused
-- =====================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"role":"anon"}';

select suite_results.check_fail('U01', 'record_consent refuses no auth.uid()',
  $s$select public.record_consent('privacy_policy', 'v1', true, 'member_join')$s$,
  '42501', 'Authentication required');

select suite_results.check_fail('U02', 'request_privacy_action refuses no auth.uid()',
  $s$select public.request_privacy_action('data_export', null)$s$,
  '42501', 'Authentication required');
commit;

-- =====================================================================
-- 12.2 Consent defaults, validation and append-only behaviour
-- =====================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3d8a2222-0000-0000-0000-000000000002","role":"member","aal":"aal1"}';
set local request.jwt.claim.sub = '3d8a2222-0000-0000-0000-000000000002';

select suite_results.check_ok('C01', 'member records privacy acceptance',
  $s$select public.record_consent('privacy_policy', '2026-11-20-draft.1', true, 'member_join')$s$);

select suite_results.check_ok('C02', 'member records terms acceptance',
  $s$select public.record_consent('terms_of_service', '2026-11-20-draft.1', true, 'member_join')$s$);

select suite_results.check_ok('C03', 'member records marketing refusal explicitly',
  $s$select public.record_consent('marketing', '2026-11-20-draft.1', false, 'member_join')$s$);

select suite_results.check_true('C04', 'consent is bound to the caller, not a supplied id',
  (
    select count(*) = 3
      from public.consent_records
     where auth_user_id = '3d8a2222-0000-0000-0000-000000000002'
       and document_version = '2026-11-20-draft.1'
  ),
  'three rows for the authenticated member');

select suite_results.check_true('C05', 'marketing refusal is recorded as accepted = false',
  (
    select accepted = false
      from public.consent_records
     where auth_user_id = '3d8a2222-0000-0000-0000-000000000002'
       and consent_type = 'marketing'
  ),
  'no invented marketing consent');

select suite_results.check_true('C06', 'each consent row wrote one audit entry',
  (
    select suite_results.audit_action_count('consent.recorded', '3d8a2222-0000-0000-0000-000000000002'::uuid) = 3
  ),
  'normal profile path is audited');

select suite_results.check_fail('C07', 'mandatory privacy cannot be recorded as declined',
  $s$select public.record_consent('privacy_policy', 'v2', false, 'member_join')$s$,
  '22023', 'Mandatory documents');

select suite_results.check_fail('C08', 'terms cannot be recorded as declined',
  $s$select public.record_consent('terms_of_service', 'v2', false, 'member_join')$s$,
  '22023', 'Mandatory documents');

select suite_results.check_fail('C09', 'unknown consent type is refused',
  $s$select public.record_consent('location_tracking', 'v1', true, 'member_join')$s$,
  '22023', 'Unsupported consent type');

select suite_results.check_fail('C10', 'unknown consent source is refused',
  $s$select public.record_consent('privacy_policy', 'v1', true, 'silent_import')$s$,
  '22023', 'Unsupported consent source');

select suite_results.check_fail('C11', 'blank document version is refused',
  $s$select public.record_consent('privacy_policy', '   ', true, 'member_join')$s$,
  '22023', 'version is required');

select suite_results.check_ok('C12', 'a new version appends a new row',
  $s$select public.record_consent('privacy_policy', '2026-12-01-draft.2', true, 'member_privacy_screen')$s$);

select suite_results.check_true('C13', 'the earlier version row is preserved unchanged',
  (
    select count(*) = 1
      from public.consent_records
     where auth_user_id = '3d8a2222-0000-0000-0000-000000000002'
       and consent_type = 'privacy_policy'
       and document_version = '2026-11-20-draft.1'
  ),
  'append-only versioning');

select suite_results.check_fail('C14', 'direct client INSERT into consent_records is denied',
  $s$insert into public.consent_records (auth_user_id, consent_type, document_version, accepted, source)
     values ('3d8a2222-0000-0000-0000-000000000002', 'privacy_policy', 'forged', true, 'member_join')$s$,
  '42501');

select suite_results.check_fail('C15', 'direct client UPDATE of consent_records is denied',
  $s$update public.consent_records set accepted = false
      where auth_user_id = '3d8a2222-0000-0000-0000-000000000002'$s$,
  '42501');

select suite_results.check_fail('C16', 'direct client DELETE of consent_records is denied',
  $s$delete from public.consent_records
      where auth_user_id = '3d8a2222-0000-0000-0000-000000000002'$s$,
  '42501');
commit;

-- =====================================================================
-- 12.3 Consent RLS — own rows only; Owner sees all; receptionist none
-- =====================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3d8a2222-0000-0000-0000-000000000002","role":"member","aal":"aal1"}';
set local request.jwt.claim.sub = '3d8a2222-0000-0000-0000-000000000002';

select suite_results.check_true('L01', 'member A reads only their own consent rows',
  (
    select count(*) = 4
      from public.consent_records
  ),
  'four own rows visible');

select suite_results.check_true('L02', 'member A cannot see member B consent rows',
  (
    select count(*) = 0
      from public.consent_records
     where auth_user_id = '3d8a3333-0000-0000-0000-000000000003'
  ),
  'RLS filters other members');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3d8a3333-0000-0000-0000-000000000003","role":"member","aal":"aal1"}';
set local request.jwt.claim.sub = '3d8a3333-0000-0000-0000-000000000003';

select suite_results.check_true('L03', 'member B sees no rows before accepting anything',
  (select count(*) = 0 from public.consent_records),
  'no consent is invented for a silent user');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3d8a4444-0000-0000-0000-000000000004","role":"receptionist","aal":"aal2"}';
set local request.jwt.claim.sub = '3d8a4444-0000-0000-0000-000000000004';

select suite_results.check_true('L04', 'receptionist sees no consent rows',
  (select count(*) = 0 from public.consent_records),
  'reception desk has no consent access');

select suite_results.check_true('L05', 'receptionist sees no privacy requests',
  (select count(*) = 0 from public.privacy_requests),
  'reception desk has no request access');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3d8a1111-0000-0000-0000-000000000001","role":"owner","aal":"aal2"}';
set local request.jwt.claim.sub = '3d8a1111-0000-0000-0000-000000000001';

select suite_results.check_true('L06', 'owner sees consent rows for the controller record',
  (select count(*) = 4 from public.consent_records),
  'owner can evidence acceptance');
commit;

-- =====================================================================
-- 12.4 Privacy requests — intake and authorization
-- =====================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3d8a2222-0000-0000-0000-000000000002","role":"member","aal":"aal1"}';
set local request.jwt.claim.sub = '3d8a2222-0000-0000-0000-000000000002';

select suite_results.check_ok('P01', 'member requests account deletion',
  $s$select public.request_privacy_action('account_deletion', 'Please close my account after review.')$s$);

select suite_results.check_ok('P02', 'member requests a data export',
  $s$select public.request_privacy_action('data_export', null)$s$);

select suite_results.check_ok('P03', 'member asks a privacy question',
  $s$select public.request_privacy_action('privacy_inquiry', 'Who can see my attendance?')$s$);

select suite_results.check_true('P04', 'requests are bound to the caller',
  (
    select count(*) = 3
      from public.privacy_requests
     where auth_user_id = '3d8a2222-0000-0000-0000-000000000002'
       and state = 'submitted'
  ),
  'three self-owned requests');

select suite_results.check_true('P05', 'each request wrote one audit entry',
  (
    select suite_results.audit_action_count('privacy.requested', '3d8a2222-0000-0000-0000-000000000002'::uuid) = 3
  ),
  'request intake is auditable');

select suite_results.check_fail('P06', 'unknown request type is refused',
  $s$select public.request_privacy_action('erase_everything', null)$s$,
  '22023', 'Unsupported privacy request type');

select suite_results.check_fail('P07', 'overlong details are refused',
  $s$select public.request_privacy_action('privacy_inquiry', repeat('x', 2001))$s$,
  '22001', 'too long');

select suite_results.check_fail('P08', 'member cannot resolve their own request',
  $s$select public.resolve_privacy_request(
       (select id from public.privacy_requests
         where auth_user_id = '3d8a2222-0000-0000-0000-000000000002'
           and request_type = 'account_deletion'),
       'completed', 'self-approved')$s$,
  '42501', 'Insufficient role');

select suite_results.check_fail('P09', 'direct client INSERT into privacy_requests is denied',
  $s$insert into public.privacy_requests (auth_user_id, request_type, state)
     values ('3d8a2222-0000-0000-0000-000000000002', 'account_deletion', 'completed')$s$,
  '42501');

select suite_results.check_fail('P10', 'direct client UPDATE of privacy_requests is denied',
  $s$update public.privacy_requests set state = 'completed', resolved_at = now()
      where auth_user_id = '3d8a2222-0000-0000-0000-000000000002'$s$,
  '42501');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3d8a3333-0000-0000-0000-000000000003","role":"member","aal":"aal1"}';
set local request.jwt.claim.sub = '3d8a3333-0000-0000-0000-000000000003';

select suite_results.check_true('P11', 'member B cannot read member A requests',
  (select count(*) = 0 from public.privacy_requests),
  'RLS isolates the queue');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3d8a1111-0000-0000-0000-000000000001","role":"owner","aal":"aal1"}';
set local request.jwt.claim.sub = '3d8a1111-0000-0000-0000-000000000001';

select suite_results.check_fail('P12', 'owner at aal1 cannot resolve a request',
  $s$select public.resolve_privacy_request(
       (select id from public.privacy_requests
         where auth_user_id = '3d8a2222-0000-0000-0000-000000000002'
           and request_type = 'account_deletion'),
       'in_review', null)$s$,
  '42501', 'multi-factor');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3d8a1111-0000-0000-0000-000000000001","role":"owner","aal":"aal2"}';
set local request.jwt.claim.sub = '3d8a1111-0000-0000-0000-000000000001';

select suite_results.check_ok('P13', 'owner at aal2 moves a request to review',
  $s$select public.resolve_privacy_request(
       (select id from public.privacy_requests
         where auth_user_id = '3d8a2222-0000-0000-0000-000000000002'
           and request_type = 'account_deletion'),
       'in_review', 'Checking retention obligations.')$s$);

select suite_results.check_ok('P14', 'owner at aal2 completes the request',
  $s$select public.resolve_privacy_request(
       (select id from public.privacy_requests
         where auth_user_id = '3d8a2222-0000-0000-0000-000000000002'
           and request_type = 'account_deletion'),
       'completed', 'Owner action recorded outside the app; payment/audit rows retained.')$s$);

select suite_results.check_true('P15', 'completion records resolver and timestamp',
  (
    select state = 'completed'
       and resolved_at is not null
       and resolved_by = '3d8a1111-0000-0000-0000-000000000001'
      from public.privacy_requests
     where auth_user_id = '3d8a2222-0000-0000-0000-000000000002'
       and request_type = 'account_deletion'
  ),
  'auditable workflow state');

select suite_results.check_true('P16', 'resolution wrote the privacy.request_resolved audit row',
  (
    select count(*) = 2
      from public.audit_log_entries
     where action = 'privacy.request_resolved'
       and actor = '3d8a1111-0000-0000-0000-000000000001'
  ),
  'review + completion audited');

select suite_results.check_fail('P17', 'a closed request cannot be reopened',
  $s$select public.resolve_privacy_request(
       (select id from public.privacy_requests
         where auth_user_id = '3d8a2222-0000-0000-0000-000000000002'
           and request_type = 'account_deletion'),
       'in_review', null)$s$,
  '55000', 'already closed');

select suite_results.check_fail('P18', 'unknown request id is refused',
  $s$select public.resolve_privacy_request('3d8affff-0000-0000-0000-0000000000ff', 'completed', null)$s$,
  'P0002', 'not found');

select suite_results.check_true('P19', 'resolution did NOT delete the member row',
  (
    select count(*) = 1
      from public.members
     where id = '3d8b1111-0000-0000-0000-000000000001'
  ),
  'account deletion request is not an automatic erasure');

select suite_results.check_true('P20', 'resolution did NOT delete the consent evidence',
  (
    select count(*) = 4
      from public.consent_records
     where auth_user_id = '3d8a2222-0000-0000-0000-000000000002'
  ),
  'consent rows remain append-only');
commit;

-- =====================================================================
-- 12.5 Retention protections are structural
-- =====================================================================
select suite_results.check_true('T01', 'authenticated cannot DELETE payments',
  not has_table_privilege('authenticated', 'public.payments', 'DELETE'),
  'financial history remains append-only');

select suite_results.check_true('T02', 'authenticated cannot DELETE audit_log_entries',
  not has_table_privilege('authenticated', 'public.audit_log_entries', 'DELETE'),
  'audit history remains append-only');

select suite_results.check_true('T03', 'authenticated cannot DELETE members',
  not has_table_privilege('authenticated', 'public.members', 'DELETE'),
  'member rows are archived, not client-deleted');

select suite_results.check_true('T04', 'no privacy function deletes any row',
  (
    select bool_and(
             position('delete from' in lower(p.prosrc)) = 0
             and position('truncate' in lower(p.prosrc)) = 0)
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('record_consent', 'request_privacy_action', 'resolve_privacy_request')
  ),
  'request workflow is non-destructive by construction');

-- =====================================================================
-- Cleanup + summary
-- =====================================================================
delete from public.audit_log_entries where actor::text like '3d8%' or row_id::text like '3d8%';
delete from public.privacy_requests where auth_user_id::text like '3d8%';
delete from public.consent_records where auth_user_id::text like '3d8%';
delete from public.profiles where id::text like '3d8%';
delete from public.members where id::text like '3d8%' or auth_user_id::text like '3d8%';
delete from auth.users where id::text like '3d8%';

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

  raise notice '0012 privacy/consent validation: % of % assertions passed', v_total - v_fail, v_total;

  if v_fail > 0 then
    raise exception '0012 PRIVACY/CONSENT VALIDATION FAILED: % of % assertions failed', v_fail, v_total;
  end if;
end
$v$;

drop schema suite_results cascade;
