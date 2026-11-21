-- =====================================================================
-- tests/0008_stage5_write_paths_validation.sql
-- Phase 5 — Stage 5 write-path validation: member contact edit,
--          plan lifecycle, join application submission.
--
-- Prerequisites: local Supabase stack; database freshly reset with all
-- migrations (0001-0008) applied; pristine seed. Suites run in numeric
-- order; this suite's fixture prefix is 3b8 and it cleans all residue.
--
-- Personas are simulated with SET LOCAL ROLE + request.jwt GUCs
-- (session_user stays postgres, so the 0002 payments override and the
-- client-mutation guard posture are exercised in their own suites).
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
-- Fixtures (prefix 3b8). Personas:
--   owner       3b8a1111-…01  (update_gym_settings / update_plan_price owner)
--   receptionist3b8a2222-…02  (update_member_contact staff)
--   member      3b8a3333-…03  (submit_join_application self)
-- =====================================================================

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '3b8a1111-0000-0000-0000-000000000001', 'authenticated', 'authenticated', '3b8-owner@example.com', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '3b8a2222-0000-0000-0000-000000000002', 'authenticated', 'authenticated', '3b8-rec@example.com', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '3b8a3333-0000-0000-0000-000000000003', 'authenticated', 'authenticated', '3b8-member@example.com', 'x', now(), now());

insert into public.profiles (id, display_name, role) values
  ('3b8a1111-0000-0000-0000-000000000001', '3b8 Owner',      'owner'),
  ('3b8a2222-0000-0000-0000-000000000002', '3b8 Rec',        'receptionist'),
  ('3b8a3333-0000-0000-0000-000000000003', '3b8 Member',     'member');

insert into public.plans (id, name, duration, price, is_active) values
  ('3b8c1111-0000-0000-0000-000000000001', '3b8 Monthly', 'monthly', 1500.00, true);

insert into public.members (id, full_name, phone, email, plan_id, price_locked, membership_end, auth_user_id, joined_on)
values
  ('3b8b1111-0000-0000-0000-000000000001', '3b8 Member One', '+919800000001', '3b8-m1@example.com', '3b8c1111-0000-0000-0000-000000000001', 1500.00, '2027-12-31', null, '2026-09-01');

-- =====================================================================
-- 8.1 update_member_contact — authorization matrix
-- =====================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b8a1111-0000-0000-0000-000000000001","role":"owner","aal":"aal2"}';
set local request.jwt.claim.sub = '3b8a1111-0000-0000-0000-000000000001';

select suite_results.check_fail('C01', 'owner cannot update member contact (receptionist-only)',
  $s$select public.update_member_contact('3b8b1111-0000-0000-0000-000000000001'::uuid, '+919800000002', '3b8-m1-alt@example.com')$s$,
  '42501', 'Insufficient role');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b8a3333-0000-0000-0000-000000000003","role":"member","aal":"aal2"}';
set local request.jwt.claim.sub = '3b8a3333-0000-0000-0000-000000000003';

select suite_results.check_fail('C02', 'member cannot update member contact (receptionist-only)',
  $s$select public.update_member_contact('3b8b1111-0000-0000-0000-000000000001'::uuid, '+919800000003', null)$s$,
  '42501', 'Insufficient role');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b8a2222-0000-0000-0000-000000000002","role":"receptionist","aal":"aal2"}';
set local request.jwt.claim.sub = '3b8a2222-0000-0000-0000-000000000002';

select suite_results.check_ok('C03', 'receptionist updates member contact (aal2)',
  $s$select public.update_member_contact('3b8b1111-0000-0000-0000-000000000001'::uuid, '+919800000002', '3b8-m1-alt@example.com')$s$);

select suite_results.check_true('C04', 'member contact phone/email updated',
  (
    select m.phone = '+919800000002'
       and m.email = '3b8-m1-alt@example.com'
      from public.members m
     where m.id = '3b8b1111-0000-0000-0000-000000000001'
  ),
  'contact columns written');

select suite_results.check_fail('C06', 'receptionist cannot set blank phone (validation)',
  $s$select public.update_member_contact('3b8b1111-0000-0000-0000-000000000001'::uuid, null, null)$s$,
  '55000', 'Member phone is required');

select suite_results.check_fail('C07', 'receptionist cannot set invalid email (validation)',
  $s$select public.update_member_contact('3b8b1111-0000-0000-0000-000000000001'::uuid, '+919800000004', 'not-an-email')$s$,
  '55000', 'Member email is not valid');
commit;

-- C05 reads the audit trail, which is owner-readable only (0002 R17); the
-- attribution read must therefore run under the owner's identity.
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b8a1111-0000-0000-0000-000000000001","role":"owner","aal":"aal2"}';
set local request.jwt.claim.sub = '3b8a1111-0000-0000-0000-000000000001';

select suite_results.check_true('C05', 'contact update audited with actor + role',
  (
    select count(*) = 1
      from public.audit_log_entries a
     where a.action = 'member.contact_updated'
       and a.actor = '3b8a2222-0000-0000-0000-000000000002'
       and a.actor_role = 'receptionist'
       and a.table_name = 'members'
       and a.row_id = '3b8b1111-0000-0000-0000-000000000001'
  ),
  'audit_authority attribution');

commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b8a2222-0000-0000-0000-000000000002","role":"receptionist","aal":"aal1"}';
set local request.jwt.claim.sub = '3b8a2222-0000-0000-0000-000000000002';

select suite_results.check_fail('C08', 'receptionist contact update at aal1 -> MFA required',
  $s$select public.update_member_contact('3b8b1111-0000-0000-0000-000000000001'::uuid, '+919800000005', null)$s$,
  '42501', 'multi-factor');
commit;

-- =====================================================================
-- 8.2 Plan lifecycle — owner only
-- =====================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b8a2222-0000-0000-0000-000000000002","role":"receptionist","aal":"aal2"}';
set local request.jwt.claim.sub = '3b8a2222-0000-0000-0000-000000000002';

select suite_results.check_fail('P01', 'receptionist cannot create plan',
  $s$select public.create_plan('3b8 New Plan', 'quarterly', 4000, 'INR', true)$s$,
  '42501', 'Insufficient role');
select suite_results.check_fail('P02', 'member cannot deactivate plan',
  $s$select public.deactivate_plan('3b8c1111-0000-0000-0000-000000000001'::uuid)$s$,
  '42501', 'Insufficient role');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b8a1111-0000-0000-0000-000000000001","role":"owner","aal":"aal2"}';
set local request.jwt.claim.sub = '3b8a1111-0000-0000-0000-000000000001';

select suite_results.check_ok('P03', 'owner creates plan',
  $s$select public.create_plan('3b8 New Plan', 'quarterly', 4000, 'INR', true)$s$);

select suite_results.check_true('P04', 'created plan persisted (price/duration/currency/is_active)',
  (
    select p.name = '3b8 New Plan'
       and p.duration = 'quarterly'
       and p.price = 4000.00
       and p.currency = 'INR'
       and p.is_active = true
      from public.plans p
     where p.id = (select id from public.plans where name = '3b8 New Plan' limit 1)
  ),
  'create_plan writes the validated plan');

select suite_results.check_fail('P05', 'create_plan rejects unsupported duration',
  $s$select public.create_plan('3b8 Bad Plan', 'fortnightly', 1000, 'INR', true)$s$,
  '55000', 'Unsupported plan duration');
select suite_results.check_fail('P06', 'create_plan rejects zero price',
  $s$select public.create_plan('3b8 Bad Plan', 'monthly', 0, 'INR', true)$s$,
  '55000', 'Plan price must be positive');
select suite_results.check_fail('P07', 'create_plan rejects non-INR currency',
  $s$select public.create_plan('3b8 Bad Plan', 'monthly', 1000, 'USD', true)$s$,
  '55000', 'Plan currency must be INR');

select suite_results.check_ok('P08', 'owner deactivates plan',
  $s$select public.deactivate_plan('3b8c1111-0000-0000-0000-000000000001'::uuid)$s$);

select suite_results.check_true('P09', 'plan deactivated (is_active false)',
  (
    select p.is_active = false
      from public.plans p
     where p.id = '3b8c1111-0000-0000-0000-000000000001'
  ),
  'deactivate_plan soft-deactivates');
commit;

-- =====================================================================
-- 8.10 Stage 2H — M1 AAL2 regression: privileged write paths must enforce AAL2
-- =====================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b8a1111-0000-0000-0000-000000000001","role":"owner","aal":"aal1"}';
set local request.jwt.claim.sub = '3b8a1111-0000-0000-0000-000000000001';

select suite_results.check_fail('M01', 'owner create_plan at aal1 -> MFA required',
  $s$select public.create_plan('3b8 New Plan', 'quarterly', 4000, 'INR', true)$s$,
  '42501', 'multi-factor');

select suite_results.check_fail('M02', 'owner deactivate_plan at aal1 -> MFA required',
  $s$select public.deactivate_plan('3b8c1111-0000-0000-0000-000000000001'::uuid)$s$,
  '42501', 'multi-factor');

select suite_results.check_fail('M03', 'owner update_gym_settings at aal1 -> MFA required',
  $s$select public.update_gym_settings('Asia/Kolkata', null, null, 60)$s$,
  '42501', 'multi-factor');

select suite_results.check_fail('M04', 'owner update_plan_price at aal1 -> MFA required',
  $s$select public.update_plan_price('3b8c1111-0000-0000-0000-000000000001'::uuid, 2000)$s$,
  '42501', 'multi-factor');

commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b8a2222-0000-0000-0000-000000000002","role":"receptionist","aal":"aal1"}';
set local request.jwt.claim.sub = '3b8a2222-0000-0000-0000-000000000002';

select suite_results.check_fail('M05', 'receptionist decide_application at aal1 -> MFA required',
  $s$select public.decide_application('3b8b1111-0000-0000-0000-000000000001'::uuid, true)$s$,
  '42501', 'multi-factor');

commit;

-- =====================================================================
-- 8.3 submit_join_application — member self-submission
-- =====================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b8a1111-0000-0000-0000-000000000001","role":"owner","aal":"aal2"}';
set local request.jwt.claim.sub = '3b8a1111-0000-0000-0000-000000000001';

select suite_results.check_fail('J01', 'owner cannot submit join application',
  $s$select public.submit_join_application('3b8 Applicant', '+919800000099', '3b8-app@example.com', '3b8c1111-0000-0000-0000-000000000001'::uuid)$s$,
  '42501', 'Insufficient role');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b8a2222-0000-0000-0000-000000000002","role":"receptionist","aal":"aal2"}';
set local request.jwt.claim.sub = '3b8a2222-0000-0000-0000-000000000002';

select suite_results.check_fail('J02', 'receptionist cannot submit join application',
  $s$select public.submit_join_application('3b8 Applicant', '+919800000099', '3b8-app@example.com', '3b8c1111-0000-0000-0000-000000000001'::uuid)$s$,
  '42501', 'Insufficient role');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b8a3333-0000-0000-0000-000000000003","role":"member","aal":"aal2"}';
set local request.jwt.claim.sub = '3b8a3333-0000-0000-0000-000000000003';

select suite_results.check_ok('J03', 'member submits own join application',
  $s$select public.submit_join_application('3b8 Applicant', '+919800000099', '3b8-app@example.com', '3b8c1111-0000-0000-0000-000000000001'::uuid)$s$);

select suite_results.check_true('J04', 'join application bound to caller auth uid and state submitted',
  (
    select ja.auth_user_id = '3b8a3333-0000-0000-0000-000000000003'
       and ja.state = 'submitted'
       and ja.full_name = '3b8 Applicant'
       and ja.phone = '+919800000099'
      from public.join_applications ja
     where ja.auth_user_id = '3b8a3333-0000-0000-0000-000000000003'
     order by ja.created_at desc
     limit 1
  ),
  'member-self submission recorded');

select suite_results.check_fail('J05', 'member cannot submit join application with blank name',
  $s$select public.submit_join_application('   ', '+919800000099', '3b8-app@example.com', '3b8c1111-0000-0000-0000-000000000001'::uuid)$s$,
  '55000', 'Applicant name is required');
commit;

-- =====================================================================
-- Cleanup and verdict
-- =====================================================================

delete from public.audit_log_entries
 where actor in (select id from public.profiles where id::text like '3b8%')
    or row_id::text like '3b8%';
delete from public.join_applications where auth_user_id::text like '3b8%' or id::text like '3b8%';
delete from public.members where id::text like '3b8%';
delete from public.plans where id::text like '3b8%' or name like '3b8%';
delete from public.profiles where id::text like '3b8%';
delete from auth.users where id::text like '3b8%';

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

  raise notice '0008 stage5 write paths validation: % of % assertions passed', v_total - v_fail, v_total;

  if v_fail > 0 then
    raise exception '0008 STAGE5 WRITE PATHS VALIDATION FAILED: % of % assertions failed', v_fail, v_total;
  end if;
end
$v$;

drop schema suite_results cascade;
