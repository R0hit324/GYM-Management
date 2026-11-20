-- =====================================================================
-- 0010_receipt_storage.sql — Production Readiness Stage 2B, WS-4
--
-- Scope: private receipt storage + receipt-path metadata, additive only.
--
--   * Creates the PRIVATE storage bucket `receipts` (public = false,
--     PDF-only, 5 MiB limit). No public bucket, no public URL.
--   * Adds RLS policies on storage.objects:
--       - member: SELECT only objects under their own member id folder
--       - staff (receptionist + owner): SELECT every receipt object
--       - receptionist: INSERT (upload) only; no UPDATE/DELETE policy, so
--         stored receipts are immutable through the API
--   * Adds `attach_receipt_path(p_payment_id, p_receipt_path)`: the only
--     way `payments.receipt_path` can be written. Receptionist + AAL2,
--     verified PAYMENT rows only, exact deterministic path, one-way
--     (NULL -> path once; same path is an idempotent no-op).
--   * Replaces `issue_receipt` to also refuse:
--       - reversal rows (a reversal is never a payment receipt)
--       - fully reversed payments (no receipt may present them as paid)
--     The original one-way / verified-only / financial-neutral behaviour
--     and grants are preserved verbatim.
--
-- Object naming (enforced by attach_receipt_path and mirrored in
-- src/services/receipts/storage.ts):
--
--     receipts/{member_id}/{payment_id}.pdf
--
-- Path segments are UUIDs; the exact string is recomputed server-side, so
-- a caller cannot point a payment at another member's file.
--
-- Conventions copied from 0009:
--   * SECURITY DEFINER, `set search_path = 'public'`
--   * authoritative require_role(...) gate
--   * assert_aal2() for the staff action
--   * audit_authority(...) append-only attribution
--   * EXECUTE to `authenticated` only
--
-- No existing table, money column, state, verifier, policy, grant or
-- business rule is weakened. Nothing here is executed against production.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Private bucket. `on conflict` re-asserts privacy/limits if a bucket
--    with this id was ever created with looser settings.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 5242880, array['application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------
-- 2. storage.objects policies (default deny: anything not listed here is
--    refused). Path shape is `{member_uuid}/{payment_uuid}.pdf`, so the
--    first folder segment identifies the owning member.
-- ---------------------------------------------------------------------
create policy receipts_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'receipts'
    and public.app_profile_role() = 'member'
    and (storage.foldername(name))[1] in (
      select m.id::text
        from public.members m
       where m.auth_user_id = auth.uid()
    )
  );

create policy receipts_select_staff on storage.objects
  for select to authenticated
  using (
    bucket_id = 'receipts'
    and public.app_profile_role() in ('receptionist', 'owner')
  );

create policy receipts_insert_receptionist on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'receipts'
    and public.app_profile_role() = 'receptionist'
  );

-- No UPDATE or DELETE policy is created: stored receipts are immutable
-- through the Storage API for every client role.

-- ---------------------------------------------------------------------
-- 3. attach_receipt_path — receptionist (+AAL2); verified payment rows
--    only; exact deterministic path; one-way metadata attachment.
-- ---------------------------------------------------------------------
create function public.attach_receipt_path(
  p_payment_id  uuid,
  p_receipt_path text
) returns uuid
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_pay  public.payments%rowtype;
  v_path text;
begin
  perform public.require_role(array['receptionist']);
  perform public.assert_aal2();

  if p_receipt_path is null or btrim(p_receipt_path) = '' then
    raise exception 'A receipt path is required.'
      using errcode = '55000';
  end if;

  select * into v_pay
    from public.payments
    where id = p_payment_id
    for update;
  if not found then
    raise exception 'Payment not found.'
      using errcode = 'P0002';
  end if;

  if v_pay.state <> 'verified' then
    raise exception 'Only verified payments can store a receipt.'
      using errcode = '55000';
  end if;

  if v_pay.entry_type <> 'payment' then
    raise exception 'A reversal entry cannot store a payment receipt.'
      using errcode = '55000';
  end if;

  -- Recomputed server-side; callers may not choose another member's file.
  v_path := v_pay.member_id::text || '/' || p_payment_id::text || '.pdf';
  if p_receipt_path <> v_path then
    raise exception 'Receipt path does not match the payment.'
      using errcode = '55000';
  end if;

  if v_pay.receipt_path is not null then
    if v_pay.receipt_path = v_path then
      return p_payment_id;  -- idempotent retry, nothing changed
    end if;
    raise exception 'A different receipt is already stored for this payment.'
      using errcode = '55000';
  end if;

  update public.payments
     set receipt_path = v_path
   where id = p_payment_id
     and receipt_path is null
     and state = 'verified'
     and entry_type = 'payment';
  if not found then
    raise exception 'A different receipt is already stored for this payment.'
      using errcode = '55000';
  end if;

  perform public.audit_authority(
    'receipt.stored', 'payments', p_payment_id,
    jsonb_build_object('receipt_path', null),
    jsonb_build_object('receipt_path', v_path));

  return p_payment_id;
end
$$;

revoke execute on function public.attach_receipt_path(uuid, text)
  from public, anon, service_role;
grant execute on function public.attach_receipt_path(uuid, text)
  to authenticated;

-- ---------------------------------------------------------------------
-- 4. issue_receipt hardening (supersedes 0009 body; same signature,
--    grants and metadata-only semantics). Adds two receipt-integrity
--    gates only — no money/state/verifier column is touched.
-- ---------------------------------------------------------------------
create or replace function public.issue_receipt(p_payment_id uuid) returns uuid
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_pay      public.payments%rowtype;
  v_reversed numeric(12,2);
begin
  perform public.require_role(array['receptionist']);
  perform public.assert_aal2();

  select * into v_pay
    from public.payments
    where id = p_payment_id
    for update;
  if not found then
    raise exception 'Payment not found.'
      using errcode = 'P0002';
  end if;

  -- only money that the system already verified may be receipted.
  if v_pay.state <> 'verified' then
    raise exception 'Only verified payments can be receipted.'
      using errcode = '55000';
  end if;

  -- a reversal row is a correction record, never a payment receipt.
  if v_pay.entry_type <> 'payment' then
    raise exception 'A reversal entry cannot be receipted.'
      using errcode = '55000';
  end if;

  -- a fully reversed payment must never be presented as paid.
  select coalesce(sum(payable), 0) into v_reversed
    from public.payments
   where reversal_of = p_payment_id
     and entry_type = 'reversal'
     and state = 'verified';
  if v_reversed >= v_pay.payable then
    raise exception 'A fully reversed payment cannot be receipted.'
      using errcode = '55000';
  end if;

  if v_pay.receipt_issued then
    raise exception 'A receipt has already been issued for this payment.'
      using errcode = '55000';
  end if;

  update public.payments
     set receipt_issued = true
   where id = p_payment_id
     and receipt_issued = false
     and state = 'verified';
  if not found then
    raise exception 'A receipt has already been issued for this payment.'
      using errcode = '55000';
  end if;

  perform public.audit_authority(
    'receipt.issued', 'payments', p_payment_id,
    jsonb_build_object('receipt_issued', false, 'state', v_pay.state),
    jsonb_build_object('receipt_issued', true, 'receipt_path', v_pay.receipt_path));

  return p_payment_id;
end
$$;

commit;
