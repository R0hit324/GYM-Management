-- =====================================================================
-- tests/0010_receipt_storage_validation.sql
-- Production Readiness Stage 2B, WS-4 — receipt storage validation.
--
-- Prerequisites: local Supabase stack; database freshly reset with all
-- migrations (0001-0010) applied; pristine seed. Fixture prefix: 4a0.
--
-- What is proved here:
--   * The `receipts` bucket is PRIVATE, PDF-only and size-limited.
--   * Storage policies exist exactly as intended (no UPDATE/DELETE).
--   * Member SELECT sees only their own member folder.
--   * Staff SELECT sees all receipt objects (receptionist + owner).
--   * Member INSERT is denied; receptionist INSERT is allowed.
--   * attach_receipt_path: role/AAL2 gates, verified payment only,
--     reversal entries refused, exact deterministic path, one-way +
--     idempotent, audit attribution.
--   * issue_receipt hardening: reversal rows and fully reversed payments
--     can never be receipted; existing one-way behaviour still holds.
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
  v_ok boolean; v_detail text; v_state text; v_msg text;
begin
  begin
    execute p_stmt;
    v_ok := false; v_detail := 'statement unexpectedly succeeded';
  exception when others then
    get stacked diagnostics v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    if left(v_state, 2) <> left(p_want_sqlstate, 2) then
      v_ok := false; v_detail := format('SQLSTATE %s (wanted %s): %s', v_state, p_want_sqlstate, v_msg);
    elsif p_want_err is not null and position(lower(p_want_err) in lower(v_msg)) = 0 then
      v_ok := false; v_detail := format('wrong violation (SQLSTATE %s, wanted "%s" in message): %s', v_state, p_want_err, v_msg);
    else
      v_ok := true; v_detail := format('rejected as expected (SQLSTATE %s): %s', v_state, v_msg);
    end if;
  end;
  insert into suite_results.t_results values (p_num, p_label, v_ok, v_detail);
end $cf$;

create function suite_results.check_ok(p_num text, p_label text, p_stmt text)
returns void language plpgsql as $co$
declare
  v_ok boolean; v_detail text; v_msg text; v_rows bigint;
begin
  begin
    execute p_stmt;
    get diagnostics v_rows = ROW_COUNT;
    if v_rows = 0 then
      v_ok := false; v_detail := 'statement matched no rows (vacuous pass rejected)';
    else
      v_ok := true; v_detail := format('accepted as expected (%s row(s))', v_rows);
    end if;
  exception when others then
    get stacked diagnostics v_msg = MESSAGE_TEXT;
    v_ok := false; v_detail := format('expected success, got error: %s', v_msg);
  end;
  insert into suite_results.t_results values (p_num, p_label, v_ok, v_detail);
end $co$;

create function suite_results.check_true(p_num text, p_label text, p_ok boolean, p_detail text)
returns void language plpgsql as $ct$
begin
  insert into suite_results.t_results
  values (p_num, p_label, coalesce(p_ok, false),
          case when p_ok is null then 'NULL condition (treated as FAIL): ' || coalesce(p_detail, '') else p_detail end);
end $ct$;

grant execute on function suite_results.check_fail(text,text,text,text,text) to public;
grant execute on function suite_results.check_ok(text,text,text) to public;
grant execute on function suite_results.check_true(text,text,boolean,text) to public;

-- Test-only read helper for audit assertions.
-- SECURITY DEFINER with an explicit search_path so audit assertions can evaluate
-- their conditions without depending on the acting caller's RLS visibility.
-- Validation infrastructure only; no application grants or RLS policies are changed.
create function suite_results.receipt_stored_audit_ok(
  p_row_id uuid,
  p_actor uuid
)
returns boolean
language sql
security definer
set search_path = public
as $$ select count(*) = 1
    from public.audit_log_entries
   where action = 'receipt.stored'
     and row_id = p_row_id
     and actor = p_actor $$;

grant execute on function suite_results.receipt_stored_audit_ok(uuid, uuid) to public;

-- =====================================================================
-- Fixtures (prefix 4a0)
--   owner        4a0a1111-…-01
--   receptionist 4a0a2222-…-02
--   member A     4a0a3333-…-03  (auth-linked to member A)
--   member B     4a0a4444-…-04  (auth-linked to member B)
-- =====================================================================
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '4a0a1111-0000-0000-0000-000000000001', 'authenticated', 'authenticated', '4a0-owner@example.com', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '4a0a2222-0000-0000-0000-000000000002', 'authenticated', 'authenticated', '4a0-rec@example.com', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '4a0a3333-0000-0000-0000-000000000003', 'authenticated', 'authenticated', '4a0-member-a@example.com', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '4a0a4444-0000-0000-0000-000000000004', 'authenticated', 'authenticated', '4a0-member-b@example.com', 'x', now(), now());

insert into public.profiles (id, display_name, role) values
  ('4a0a1111-0000-0000-0000-000000000001', '4a0 Owner',     'owner'),
  ('4a0a2222-0000-0000-0000-000000000002', '4a0 Rec',       'receptionist'),
  ('4a0a3333-0000-0000-0000-000000000003', '4a0 Member A',  'member'),
  ('4a0a4444-0000-0000-0000-000000000004', '4a0 Member B',  'member');

insert into public.plans (id, name, duration, price, is_active) values
  ('4a0c1111-0000-0000-0000-000000000001', '4a0 Monthly', 'monthly', 1500.00, true);

insert into public.members (id, full_name, phone, email, plan_id, price_locked, membership_end, auth_user_id, joined_on)
values
  ('4a0b1111-0000-0000-0000-000000000001', '4a0 Member A', '+919811000001', '4a0-m-a@example.com',
   '4a0c1111-0000-0000-0000-000000000001', 1500.00, '2027-12-31', '4a0a3333-0000-0000-0000-000000000003', '2026-09-01'),
  ('4a0b2222-0000-0000-0000-000000000002', '4a0 Member B', '+919811000002', '4a0-m-b@example.com',
   '4a0c1111-0000-0000-0000-000000000001', 1500.00, '2027-12-31', '4a0a4444-0000-0000-0000-000000000004', '2026-09-01');

-- Verified payment (receiptable), pending payment, reversal row and a
-- fully reversed original.
insert into public.payments
  (id, member_id, plan_id, entry_type, original_price, discount_pct,
   discount_amount, payable, currency, method, utr, state,
   recorded_by, verified_by, recorded_at, verified_at,
   receipt_issued, receipt_path, reversal_of)
values
  ('4a0d1111-0000-0000-0000-000000000001', '4a0b1111-0000-0000-0000-000000000001',
   '4a0c1111-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00,
   'INR', 'upi', '4a0UTR0001', 'verified',
   '4a0a1111-0000-0000-0000-000000000001', '4a0a2222-0000-0000-0000-000000000002',
   now() - interval '3 days', now() - interval '3 days', false, null, null),
  ('4a0d1111-0000-0000-0000-000000000002', '4a0b1111-0000-0000-0000-000000000001',
   '4a0c1111-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00,
   'INR', 'cash', null, 'awaitingVerification',
   '4a0a2222-0000-0000-0000-000000000002', null,
   now() - interval '2 days', null, false, null, null),
  ('4a0d1111-0000-0000-0000-000000000003', '4a0b1111-0000-0000-0000-000000000001',
   '4a0c1111-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00,
   'INR', 'cash', null, 'verified',
   '4a0a1111-0000-0000-0000-000000000001', '4a0a2222-0000-0000-0000-000000000002',
   now() - interval '8 days', now() - interval '8 days', false, null, null),
  ('4a0d1111-0000-0000-0000-000000000004', '4a0b1111-0000-0000-0000-000000000001',
   '4a0c1111-0000-0000-0000-000000000001', 'reversal', 1500.00, 0, 0, 1500.00,
   'INR', 'cash', null, 'verified',
   '4a0a2222-0000-0000-0000-000000000002', '4a0a2222-0000-0000-0000-000000000002',
   now() - interval '4 days', now() - interval '4 days', false, null,
   '4a0d1111-0000-0000-0000-000000000003'),
  ('4a0d1111-0000-0000-0000-000000000005', '4a0b2222-0000-0000-0000-000000000002',
   '4a0c1111-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00,
   'INR', 'cash', null, 'verified',
   '4a0a1111-0000-0000-0000-000000000001', '4a0a2222-0000-0000-0000-000000000002',
   now() - interval '6 days', now() - interval '6 days', false, null, null);

-- Trusted storage fixtures: one object per member folder.
insert into storage.objects (bucket_id, name) values
  ('receipts', '4a0b1111-0000-0000-0000-000000000001/4a0d1111-0000-0000-0000-000000000001.pdf'),
  ('receipts', '4a0b2222-0000-0000-0000-000000000002/4a0d1111-0000-0000-0000-000000000005.pdf');

-- =====================================================================
-- 10.0 Bucket and policy posture
-- =====================================================================
select suite_results.check_true('B01', 'receipts bucket exists and is PRIVATE',
  (select count(*) = 1 and bool_and(not public)
     from storage.buckets where id = 'receipts'),
  'public = false');

select suite_results.check_true('B02', 'receipts bucket is PDF-only and size-limited',
  (select bool_and(allowed_mime_types = array['application/pdf'] and file_size_limit = 5242880)
     from storage.buckets where id = 'receipts'),
  'application/pdf, 5 MiB');

select suite_results.check_true('B03', 'select policies grant member-own and staff',
  (select count(*) = 2
     from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname in ('receipts_select_own', 'receipts_select_staff')),
  'two SELECT policies');

select suite_results.check_true('B04', 'exactly one INSERT policy, no UPDATE/DELETE policies',
  (select count(*) filter (where cmd = 'INSERT') = 1
      and count(*) filter (where cmd in ('UPDATE', 'DELETE')) = 0
     from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname like 'receipts_%'),
  'immutable storage for clients');

select suite_results.check_true('B05', 'attach_receipt_path executable by authenticated only',
  has_function_privilege('authenticated', 'public.attach_receipt_path(uuid,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.attach_receipt_path(uuid,text)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.attach_receipt_path(uuid,text)', 'EXECUTE'),
  'least-privilege EXECUTE');

-- =====================================================================
-- 10.1 Storage RLS matrix
-- =====================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"4a0a3333-0000-0000-0000-000000000003","role":"member","aal":"aal2"}';
set local request.jwt.claim.sub = '4a0a3333-0000-0000-0000-000000000003';

select suite_results.check_true('S01', 'member A sees only their own receipt object',
  (select count(*) = 1
      and bool_and(name like '4a0b1111-%')
     from storage.objects where bucket_id = 'receipts'),
  'own folder only');

select suite_results.check_fail('S02', 'member A cannot upload a receipt object',
  $s$insert into storage.objects (bucket_id, name) values ('receipts', '4a0b1111-0000-0000-0000-000000000001/forged.pdf')$s$,
  '42501');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"4a0a2222-0000-0000-0000-000000000002","role":"receptionist","aal":"aal2"}';
set local request.jwt.claim.sub = '4a0a2222-0000-0000-0000-000000000002';

select suite_results.check_true('S03', 'receptionist sees every receipt object',
  (select count(*) = 2 from storage.objects where bucket_id = 'receipts'),
  'staff SELECT all');

select suite_results.check_ok('S04', 'receptionist may upload a receipt object',
  $s$insert into storage.objects (bucket_id, name) values ('receipts', '4a0b1111-0000-0000-0000-000000000001/4a0d1111-0000-0000-0000-000000000002.pdf')$s$);

-- Stage 2H / M2: database-level storage INSERT path-shape validation.
select suite_results.check_fail('S09', 'receptionist cannot upload a receipt object with an invalid path',
  $s$insert into storage.objects (bucket_id, name) values ('receipts', 'invalid/invalid.pdf')$s$,
  '42501');

update storage.objects set name = name || '.x' where bucket_id = 'receipts';

select suite_results.check_true('S05', 'receptionist cannot UPDATE a stored receipt',
  (select count(*) = 0
      from storage.objects
     where bucket_id = 'receipts'
       and position('.x' in name) > 0),
  'update affected no rows (no UPDATE policy) so no stored receipt was modified');

select suite_results.check_fail('S06', 'receptionist cannot DELETE a stored receipt',
  $s$delete from storage.objects where bucket_id = 'receipts'$s$,
  '42501');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"4a0a1111-0000-0000-0000-000000000001","role":"owner","aal":"aal2"}';
set local request.jwt.claim.sub = '4a0a1111-0000-0000-0000-000000000001';

select suite_results.check_true('S07', 'owner sees every receipt object',
  (select count(*) = 3 from storage.objects where bucket_id = 'receipts'),
  'staff SELECT all');

select suite_results.check_fail('S08', 'owner cannot upload a receipt object (receptionist-only)',
  $s$insert into storage.objects (bucket_id, name) values ('receipts', '4a0b1111-0000-0000-0000-000000000001/owner-upload.pdf')$s$,
  '42501');
commit;

-- =====================================================================
-- 10.2 attach_receipt_path
-- =====================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"4a0a2222-0000-0000-0000-000000000002","role":"receptionist","aal":"aal1"}';
set local request.jwt.claim.sub = '4a0a2222-0000-0000-0000-000000000002';

select suite_results.check_fail('P01', 'attach at aal1 is refused (MFA)',
  $s$select public.attach_receipt_path('4a0d1111-0000-0000-0000-000000000001', '4a0b1111-0000-0000-0000-000000000001/4a0d1111-0000-0000-0000-000000000001.pdf')$s$,
  '42501', 'multi-factor');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"4a0a3333-0000-0000-0000-000000000003","role":"member","aal":"aal2"}';
set local request.jwt.claim.sub = '4a0a3333-0000-0000-0000-000000000003';

select suite_results.check_fail('P02', 'member cannot attach a receipt path',
  $s$select public.attach_receipt_path('4a0d1111-0000-0000-0000-000000000001', '4a0b1111-0000-0000-0000-000000000001/4a0d1111-0000-0000-0000-000000000001.pdf')$s$,
  '42501', 'Insufficient role');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"4a0a2222-0000-0000-0000-000000000002","role":"receptionist","aal":"aal2"}';
set local request.jwt.claim.sub = '4a0a2222-0000-0000-0000-000000000002';

select suite_results.check_fail('P03', 'pending payment cannot store a receipt',
  $s$select public.attach_receipt_path('4a0d1111-0000-0000-0000-000000000002', '4a0b1111-0000-0000-0000-000000000001/4a0d1111-0000-0000-0000-000000000002.pdf')$s$,
  '55000', 'Only verified payments');

select suite_results.check_fail('P04', 'reversal entry cannot store a payment receipt',
  $s$select public.attach_receipt_path('4a0d1111-0000-0000-0000-000000000004', '4a0b1111-0000-0000-0000-000000000001/4a0d1111-0000-0000-0000-000000000004.pdf')$s$,
  '55000', 'reversal');

select suite_results.check_fail('P05', 'path for another member/payment is refused',
  $s$select public.attach_receipt_path('4a0d1111-0000-0000-0000-000000000001', '4a0b2222-0000-0000-0000-000000000002/4a0d1111-0000-0000-0000-000000000005.pdf')$s$,
  '55000', 'does not match');

select suite_results.check_ok('P06', 'exact deterministic path is accepted',
  $s$select public.attach_receipt_path('4a0d1111-0000-0000-0000-000000000001', '4a0b1111-0000-0000-0000-000000000001/4a0d1111-0000-0000-0000-000000000001.pdf')$s$);

select suite_results.check_true('P07', 'receipt_path stored and money untouched',
  (select receipt_path = '4a0b1111-0000-0000-0000-000000000001/4a0d1111-0000-0000-0000-000000000001.pdf'
      and payable = 1500.00 and state = 'verified' and receipt_issued = false
     from public.payments where id = '4a0d1111-0000-0000-0000-000000000001'),
  'metadata only');

select suite_results.check_ok('P08', 'same path retry is idempotent',
  $s$select public.attach_receipt_path('4a0d1111-0000-0000-0000-000000000001', '4a0b1111-0000-0000-0000-000000000001/4a0d1111-0000-0000-0000-000000000001.pdf')$s$);

select suite_results.check_true('P09', 'exactly one receipt.stored audit row',
  (select suite_results.receipt_stored_audit_ok(
      '4a0d1111-0000-0000-0000-000000000001'::uuid,
      '4a0a2222-0000-0000-0000-000000000002'::uuid) = true),
  'idempotent retry does not duplicate audit');
commit;

-- =====================================================================
-- 10.3 issue_receipt hardening
-- =====================================================================
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"4a0a2222-0000-0000-0000-000000000002","role":"receptionist","aal":"aal2"}';
set local request.jwt.claim.sub = '4a0a2222-0000-0000-0000-000000000002';

select suite_results.check_fail('P10', 'reversal row can never be receipted',
  $s$select public.issue_receipt('4a0d1111-0000-0000-0000-000000000004')$s$,
  '55000', 'reversal');

select suite_results.check_fail('P11', 'fully reversed payment can never be receipted',
  $s$select public.issue_receipt('4a0d1111-0000-0000-0000-000000000003')$s$,
  '55000', 'fully reversed');

select suite_results.check_ok('P12', 'verified non-reversed payment still issues once',
  $s$select public.issue_receipt('4a0d1111-0000-0000-0000-000000000001')$s$);

select suite_results.check_fail('P13', 'second issue remains refused (one-way preserved)',
  $s$select public.issue_receipt('4a0d1111-0000-0000-0000-000000000001')$s$,
  '55000', 'already been issued');
commit;

-- =====================================================================
-- Cleanup and verdict
-- =====================================================================
-- Storage objects are intentionally NOT deleted here: Supabase Storage blocks
-- direct deletes from storage.objects (storage.protect_delete). Leftover receipt
-- fixtures are cleared by an isolated `supabase db reset` instead of weakening
-- the storage protection model.
delete from public.audit_log_entries
 where actor in (select id from public.profiles where id::text like '4a0%')
    or row_id::text like '4a0%';
delete from public.payments where id::text like '4a0%' or member_id::text like '4a0%';
delete from public.members where id::text like '4a0%';
delete from public.plans where id::text like '4a0%' or name like '4a0%';
delete from public.profiles where id::text like '4a0%';
delete from auth.users where id::text like '4a0%';

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

  raise notice '0010 receipt storage validation: % of % assertions passed', v_total - v_fail, v_total;

  if v_fail > 0 then
    raise exception '0010 RECEIPT STORAGE VALIDATION FAILED: % of % assertions failed', v_fail, v_total;
  end if;
end
$v$;

drop schema suite_results cascade;
