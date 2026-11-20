-- =====================================================================
-- tests/0009_receipt_issuance_validation.sql
-- Phase 5 — Stage 2: receipt issuance (0009) validation.
--
-- Prerequisites: local Supabase stack; database freshly reset with all
-- migrations (0001-0009) applied; pristine seed. Fixture prefix: 3b9.
--
-- What is proved here:
--   * EXECUTE is least-privilege (authenticated only; anon/service_role no).
--   * Role matrix: owner/member refused, receptionist accepted.
--   * AAL2: receptionist at aal1 refused.
--   * State gate: only VERIFIED rows may be receipted.
--   * One-way: false -> true exactly once; second call refused, state
--     unchanged.
--   * Financial neutrality: no money/state/verifier column changes.
--   * Audit attribution: exactly one receipt.issued row, correct actor.
--   * Direct table UPDATE remains impossible for authenticated (the
--     column is reachable only through the RPC).
--
-- Personas are simulated with SET LOCAL ROLE + request.jwt GUCs
-- (session_user stays postgres, so trusted fixture inserts land as given).
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
-- Fixtures (prefix 3b9)
--   owner        3b9a1111-…-01  (refused: receptionist-only)
--   receptionist 3b9a2222-…-02  (actor)
--   member       3b9a3333-…-03  (refused)
-- =====================================================================
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '3b9a1111-0000-0000-0000-000000000001', 'authenticated', 'authenticated', '3b9-owner@example.com', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '3b9a2222-0000-0000-0000-000000000002', 'authenticated', 'authenticated', '3b9-rec@example.com', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '3b9a3333-0000-0000-0000-000000000003', 'authenticated', 'authenticated', '3b9-member@example.com', 'x', now(), now());

insert into public.profiles (id, display_name, role) values
  ('3b9a1111-0000-0000-0000-000000000001', '3b9 Owner',      'owner'),
  ('3b9a2222-0000-0000-0000-000000000002', '3b9 Rec',        'receptionist'),
  ('3b9a3333-0000-0000-0000-000000000003', '3b9 Member',     'member');

insert into public.plans (id, name, duration, price, is_active) values
  ('3b9c1111-0000-0000-0000-000000000001', '3b9 Monthly', 'monthly', 1500.00, true);

insert into public.members (id, full_name, phone, email, plan_id, price_locked, membership_end, auth_user_id, joined_on)
values
  ('3b9b1111-0000-0000-0000-000000000001', '3b9 Member One', '+919811000001', '3b9-m1@example.com',
   '3b9c1111-0000-0000-0000-000000000001', 1500.00, '2027-12-31', null, '2026-09-01');

-- Trusted fixture insert (session_user = postgres bypasses the override).
-- pay01 verified / not receipted   -> success path
-- pay02 awaitingVerification       -> refused
-- pay03 rejected                   -> refused
-- pay04 verified / already issued  -> refused (one-way)
insert into public.payments
  (id, member_id, plan_id, entry_type, original_price, discount_pct,
   discount_amount, payable, currency, method, utr, state,
   recorded_by, verified_by, recorded_at, verified_at,
   receipt_issued, receipt_path)
values
  ('3b9d1111-0000-0000-0000-000000000001', '3b9b1111-0000-0000-0000-000000000001',
   '3b9c1111-0000-0000-0000-000000000001', 'payment', 1500.00, 0,
   0, 1500.00, 'INR', 'upi', '3b9UTR0001', 'verified',
   '3b9a1111-0000-0000-0000-000000000001', '3b9a2222-0000-0000-0000-000000000002',
   now() - interval '2 days', now() - interval '2 days', false, null),
  ('3b9d1111-0000-0000-0000-000000000002', '3b9b1111-0000-0000-0000-000000000001',
   '3b9c1111-0000-0000-0000-000000000001', 'payment', 1500.00, 0,
   0, 1500.00, 'INR', 'cash', null, 'awaitingVerification',
   '3b9a2222-0000-0000-0000-000000000002', null,
   now() - interval '1 day', null, false, null),
  ('3b9d1111-0000-0000-0000-000000000003', '3b9b1111-0000-0000-0000-000000000001',
   '3b9c1111-0000-0000-0000-000000000001', 'payment', 1500.00, 0,
   0, 1500.00, 'INR', 'upi', '3b9UTR0003', 'rejected',
   '3b9a1111-0000-0000-0000-000000000001', '3b9a2222-0000-0000-0000-000000000002',
   now() - interval '5 days', now() - interval '4 days', false, null),
  ('3b9d1111-0000-0000-0000-000000000004', '3b9b1111-0000-0000-0000-000000000001',
   '3b9c1111-0000-0000-0000-000000000001', 'payment', 1500.00, 0,
   0, 1500.00, 'INR', 'cash', null, 'verified',
   '3b9a1111-0000-0000-0000-000000000001', '3b9a2222-0000-0000-0000-000000000002',
   now() - interval '9 days', now() - interval '9 days', true, null);

-- =====================================================================
-- 9.0 Privileges and function posture
-- =====================================================================
select suite_results.check_true('R01', 'authenticated may execute issue_receipt',
  has_function_privilege('authenticated', 'public.issue_receipt(uuid)', 'EXECUTE'),
  'EXECUTE granted to authenticated');

select suite_results.check_true('R02', 'anon may NOT execute issue_receipt',
  not has_function_privilege('anon', 'public.issue_receipt(uuid)', 'EXECUTE'),
  'EXECUTE revoked from anon');

select suite_results.check_true('R03', 'service_role may NOT execute issue_receipt',
  not has_function_privilege('service_role', 'public.issue_receipt(uuid)', 'EXECUTE'),
  'EXECUTE revoked from service_role');

select suite_results.check_true('R04', 'issue_receipt is SECURITY DEFINER with pinned search_path',
  (
    select p.prosecdef
       and p.proconfig @> array['search_path=public']
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'issue_receipt'
  ),
  'definer rights + search_path=public');

select suite_results.check_true('R05', 'no UPDATE grant on payments was added for authenticated',
  not has_table_privilege('authenticated', 'public.payments', 'UPDATE'),
  'payments stays append-only for clients');

-- =====================================================================
-- 9.1 Authorization matrix
-- =====================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b9a1111-0000-0000-0000-000000000001","role":"owner","aal":"aal2"}';
set local request.jwt.claim.sub = '3b9a1111-0000-0000-0000-000000000001';

select suite_results.check_fail('A01', 'owner cannot issue a receipt (receptionist-only)',
  $s$select public.issue_receipt('3b9d1111-0000-0000-0000-000000000001'::uuid)$s$,
  '42501', 'Insufficient role');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b9a3333-0000-0000-0000-000000000003","role":"member","aal":"aal2"}';
set local request.jwt.claim.sub = '3b9a3333-0000-0000-0000-000000000003';

select suite_results.check_fail('A02', 'member cannot issue a receipt',
  $s$select public.issue_receipt('3b9d1111-0000-0000-0000-000000000001'::uuid)$s$,
  '42501', 'Insufficient role');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b9a2222-0000-0000-0000-000000000002","role":"receptionist","aal":"aal1"}';
set local request.jwt.claim.sub = '3b9a2222-0000-0000-0000-000000000002';

select suite_results.check_fail('A03', 'receptionist at aal1 is refused (MFA required)',
  $s$select public.issue_receipt('3b9d1111-0000-0000-0000-000000000001'::uuid)$s$,
  '42501', 'multi-factor');
commit;

-- =====================================================================
-- 9.2 Target validation and one-way rule
-- =====================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b9a2222-0000-0000-0000-000000000002","role":"receptionist","aal":"aal2"}';
set local request.jwt.claim.sub = '3b9a2222-0000-0000-0000-000000000002';

select suite_results.check_fail('T01', 'unknown payment id is refused',
  $s$select public.issue_receipt('3b9dffff-0000-0000-0000-0000000000ff'::uuid)$s$,
  'P0002', 'Payment not found');

select suite_results.check_fail('T02', 'awaiting-verification payment cannot be receipted',
  $s$select public.issue_receipt('3b9d1111-0000-0000-0000-000000000002'::uuid)$s$,
  '55000', 'Only verified payments');

select suite_results.check_fail('T03', 'rejected payment cannot be receipted',
  $s$select public.issue_receipt('3b9d1111-0000-0000-0000-000000000003'::uuid)$s$,
  '55000', 'Only verified payments');

select suite_results.check_fail('T04', 'already-receipted payment is refused (one-way)',
  $s$select public.issue_receipt('3b9d1111-0000-0000-0000-000000000004'::uuid)$s$,
  '55000', 'already been issued');

select suite_results.check_ok('T05', 'receptionist issues a receipt on a verified payment',
  $s$select public.issue_receipt('3b9d1111-0000-0000-0000-000000000001'::uuid)$s$);

select suite_results.check_true('T06', 'receipt_issued flipped true; receipt_path stays NULL',
  (
    select p.receipt_issued = true and p.receipt_path is null
      from public.payments p
     where p.id = '3b9d1111-0000-0000-0000-000000000001'
  ),
  'metadata-only one-way flag');

select suite_results.check_true('T07', 'financial columns are untouched by receipt issuance',
  (
    select p.original_price  = 1500.00
       and p.discount_pct    = 0
       and p.discount_amount = 0
       and p.payable         = 1500.00
       and p.state           = 'verified'
       and p.entry_type      = 'payment'
       and p.method          = 'upi'
       and p.utr             = '3b9UTR0001'
       and p.verified_by     = '3b9a2222-0000-0000-0000-000000000002'::uuid
       and p.verified_at     is not null
      from public.payments p
     where p.id = '3b9d1111-0000-0000-0000-000000000001'
  ),
  'no money/state/verifier mutation');

select suite_results.check_fail('T08', 'a second issue attempt is refused and changes nothing',
  $s$select public.issue_receipt('3b9d1111-0000-0000-0000-000000000001'::uuid)$s$,
  '55000', 'already been issued');

select suite_results.check_fail('T09', 'direct UPDATE of receipt_issued is still impossible for clients',
  $s$update public.payments set receipt_issued = true where id = '3b9d1111-0000-0000-0000-000000000002'::uuid$s$,
  '42501');
commit;

-- =====================================================================
-- 9.3 Audit attribution (audit_log_entries is owner-readable only)
-- =====================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b9a1111-0000-0000-0000-000000000001","role":"owner","aal":"aal2"}';
set local request.jwt.claim.sub = '3b9a1111-0000-0000-0000-000000000001';

select suite_results.check_true('U01', 'exactly one receipt.issued audit row, correct actor and role',
  (
    select count(*) = 1
      from public.audit_log_entries a
     where a.action = 'receipt.issued'
       and a.table_name = 'payments'
       and a.row_id = '3b9d1111-0000-0000-0000-000000000001'
       and a.actor = '3b9a2222-0000-0000-0000-000000000002'
       and a.actor_role = 'receptionist'
  ),
  'audit_authority attribution');

select suite_results.check_true('U02', 'audit row records the false -> true transition',
  (
    select (a.old_values ->> 'receipt_issued') = 'false'
       and (a.new_values ->> 'receipt_issued') = 'true'
      from public.audit_log_entries a
     where a.action = 'receipt.issued'
       and a.row_id = '3b9d1111-0000-0000-0000-000000000001'
     limit 1
  ),
  'old/new values present');
commit;

-- =====================================================================
-- Cleanup and verdict
-- =====================================================================
delete from public.audit_log_entries
 where actor in (select id from public.profiles where id::text like '3b9%')
    or row_id::text like '3b9%';
delete from public.payments where id::text like '3b9%' or member_id::text like '3b9%';
delete from public.members where id::text like '3b9%';
delete from public.plans where id::text like '3b9%' or name like '3b9%';
delete from public.profiles where id::text like '3b9%';
delete from auth.users where id::text like '3b9%';

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

  raise notice '0009 receipts validation: % of % assertions passed', v_total - v_fail, v_total;

  if v_fail > 0 then
    raise exception '0009 RECEIPTS VALIDATION FAILED: % of % assertions failed', v_fail, v_total;
  end if;
end
$v$;

drop schema suite_results cascade;
