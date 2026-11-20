-- =====================================================================
-- 0009_receipt_issuance.sql — Phase 5, Stage 2: receipt issuance
--
-- Scope: ONE additive authority function. Nothing else.
--
--   * `issue_receipt(p_payment_id)` is the only way `payments.receipt_issued`
--     can ever become true. The column is currently forced to false on
--     insert (0002 payments_insert_override) and no function ever set it.
--   * The change is METADATA ONLY: no price, payable, discount, state,
--     method, UTR, verifier or timestamp column is touched. The payments
--     ledger stays financially immutable and append-only.
--   * One-way: false -> true exactly once. A second call raises and changes
--     nothing. There is no "un-issue" path.
--   * `receipt_path` is deliberately left NULL: no Supabase Storage bucket
--     exists in this environment, so no file is claimed.
--
-- Conventions copied verbatim from 0003_authority_functions.sql:
--   * SECURITY DEFINER, `set search_path = 'public'`
--   * authoritative `require_role(...)` gate (profiles.role, never claims)
--   * `assert_aal2()` for the staff action
--   * `audit_authority(...)` append-only attribution
--   * EXECUTE to `authenticated` only (revoked from public/anon/service_role)
--
-- Index assessment (documented negative result). Phase 5's new reads need:
--   - owner audit viewer        -> audit_log_entries (at desc)      exists: audit_time_idx (0001)
--   - month/range ledger        -> payments (recorded_at)           exists: payments_recorded_at_idx (0001)
--   - member profile history    -> payments (member_id, recorded_at desc)
--                                                          exists: payments_member_recorded_idx (0001)
--   - member attendance history -> attendance_events (member_id, checked_in_at desc)
--                                                          exists: attendance_member_time_idx (0001)
--   - freeze history            -> membership_freezes (member_id, start_date)
--                                                          exists: freezes_member_idx (0001)
-- No new index is added: each candidate would duplicate an existing access
-- path and add write cost for no read benefit at gym scale.
--
-- No existing function, policy, grant, trigger, view, seed value or business
-- rule is modified here.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- issue_receipt — receptionist (+AAL2); verified rows only; one-way.
-- ---------------------------------------------------------------------
create function public.issue_receipt(p_payment_id uuid) returns uuid
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_pay public.payments%rowtype;
begin
  perform public.require_role(array['receptionist']);
  perform public.assert_aal2();

  -- row lock: two concurrent issue attempts serialize here, so the
  -- one-way check below cannot be raced.
  select * into v_pay
    from public.payments
    where id = p_payment_id
    for update;
  if not found then
    raise exception 'Payment not found.'
      using errcode = 'P0002';
  end if;

  -- only money that the system already verified may be receipted; a
  -- pending or rejected row is never presented as paid.
  if v_pay.state <> 'verified' then
    raise exception 'Only verified payments can be receipted.'
      using errcode = '55000';
  end if;

  if v_pay.receipt_issued then
    raise exception 'A receipt has already been issued for this payment.'
      using errcode = '55000';
  end if;

  -- conditional update keeps the one-way rule true even if the lock is
  -- ever refactored away: zero rows matched means another writer won.
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
    jsonb_build_object('receipt_issued', true, 'receipt_path', null));

  return p_payment_id;
end
$$;

-- ---------------------------------------------------------------------
-- EXECUTE grants (existing convention): client-callable authority
-- function only; helpers/triggers unchanged.
-- ---------------------------------------------------------------------
revoke execute on function public.issue_receipt(uuid)
  from public, anon, service_role;
grant execute on function public.issue_receipt(uuid)
  to authenticated;

commit;
