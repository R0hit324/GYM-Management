-- =====================================================================
-- 0003_authority_functions.sql
-- Phase 3B.3 — SECURITY DEFINER authority functions, ACL lockdown,
-- reversal backstop for the Pulse Gym Supabase backend.
--
-- Authoritative sources:
--   docs/PHASE_3A_FINAL_DESIGN.md     (§4 lifecycle, §5 payments/reversals,
--                                      §6 attendance, §7 concurrency,
--                                      §10 responsibility matrix, §11 plan)
--   docs/PHASE_3A_UNRESOLVED_ITEMS.md (#1 self-verify, #2 self-reverse,
--                                      #3 pendingPayment, #4 AAL2 default-deny)
--   docs/PHASE_3B_2_FINAL_SECURITY_AUDIT.md (conditions A–D carried in)
--   0001_core_schema.sql / 0002_rls_and_triggers.sql (applied baseline)
--
-- Scope of THIS migration ONLY:
--   1. default-privilege lockdown for postgres (+ best-effort for
--      supabase_admin) in schema public      [audit condition A]
--   2. hygiene: PUBLIC/role EXECUTE revoked from 0002 trigger functions
--   3. helpers: app_gym_date, require_role, assert_aal2, audit_authority
--   4. the 13 approved §10 authority functions (create_payment is
--      deliberately NOT here: recording = 0002 direct INSERT + override,
--      already validated by the 3B.2 suite)
--   5. deferred constraint trigger: cumulative reversals ≤ original
--   6. explicit least-privilege ACLs for every object created here
--
-- Recorded decisions implemented here (from the 3B.3 authorization):
--   * derived-pause model (0001 owner instruction #7) OVERRIDES design
--     §4.3/§4.4 store-side: decide_freeze/end_freeze/check_in write only
--     freeze-row fields; members.membership_end stays purely payment-
--     derived (verify_payment writes it; full-reversal reconstruction
--     recomputes it from periods ∸ voids). Freeze pause math is derived
--     in 0004 views.
--   * AAL2 gates exactly: verify_payment, create_reversal,
--     decide_freeze, mint_attendance_token (unresolved #4 default).
--     reject_payment / request_freeze / end_freeze / the remaining
--     functions are NOT AAL2-gated (documented decision).
--   * self-verify / self-reject / self-reverse: default-DENY (unresolved
--     #1/#2). Member pendingPayment attendance: default-DENY (#3).
--   * lock order everywhere: payment row → member row → freeze row,
--     except decide_freeze/check_in which take member → freeze (§7).
--   * audit actions: payment.verified/rejected/reversed,
--     freeze.requested/approved/rejected/ended/ended_scan,
--     application.decided, discount.set, plan.price_changed,
--     plan.assignment_requested, plan.assignment_applied (§4.2 "audited"),
--     settings.changed, token.minted.
--   * rejected payments record the rejecting receptionist in
--     verified_by/verified_at — required by 0001's
--     undecided_has_no_verifier / undecided_has_no_verify_time
--     constraints (verified_by doubles as the decision attribution).
--   * no pgcrypto dependency: sha256()/convert_to()/encode() are core;
--     token randomness = two gen_random_uuid()s (pgcrypto lives in the
--     `extensions` schema on this stack, which would break pinned
--     search_path='public' resolution).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Default-privilege lockdown [audit condition A / MEDIUM-01]
--    The stack image seeds roles.sql on every reset, which creates
--    PER-SCHEMA default-privilege GRANTs for postgres-created objects
--    in `public` (ALL to anon/authenticated/service_role). Engine facts
--    (PG 17, ALTER DEFAULT PRIVILEGES docs, verified live):
--      * per-schema rows MERGE ON TOP of the global defaults; a
--        per-schema REVOKE can only undo a matching per-schema GRANT;
--      * the hard-wired default PUBLIC EXECUTE on functions can only be
--        removed by a GLOBAL revoke — "you cannot accomplish that effect
--        with a command limited to a single schema".
--    The lockdown therefore needs BOTH forms below. The migration
--    runner creates only in `public`, so that is the practical scope.
-- ---------------------------------------------------------------------
-- 1a. undo the image's per-schema grants for postgres-created objects
alter default privileges for role postgres in schema public
  revoke all on tables
  from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on functions
  from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on sequences
  from public, anon, authenticated, service_role;
-- 1b. global: strip the built-in PUBLIC EXECUTE on future functions
alter default privileges for role postgres
  revoke all on functions
  from public;

-- supabase_admin default privileges: the local stack's `postgres` role
-- is NOT a member of supabase_admin and cannot alter its defaults.
-- Attempt (same dual form) and report loudly; on hosted projects
-- (applied as supabase_admin) this succeeds.
do $default_privs$
begin
  begin
    alter default privileges for role supabase_admin in schema public
      revoke all on tables
      from public, anon, authenticated, service_role;
    alter default privileges for role supabase_admin in schema public
      revoke all on functions
      from public, anon, authenticated, service_role;
    alter default privileges for role supabase_admin in schema public
      revoke all on sequences
      from public, anon, authenticated, service_role;
    alter default privileges for role supabase_admin
      revoke all on functions
      from public;
    raise notice 'supabase_admin default privileges locked down (per-schema + global).';
  exception when insufficient_privilege then
    raise notice
      'WARNING (MEDIUM-01 residual): default privileges for supabase_admin could NOT be altered from this migration (insufficient privilege). Future objects created by supabase_admin keep the image default grants (tables arwdDxtm, functions X, sequences rwU to anon/authenticated/service_role, plus built-in PUBLIC EXECUTE). Objects created by the migration runner (postgres) are covered by the lockdown above.';
  end;
end
$default_privs$;

-- ---------------------------------------------------------------------
-- 2. Hygiene [3B.2 audit LOW-01]: the four 0002 trigger functions carry
--    PUBLIC EXECUTE. Trigger invocation does not require EXECUTE, and
--    PostgREST cannot RPC `trigger`-returning functions — revoke anyway
--    so they disappear from every privilege surface.
-- ---------------------------------------------------------------------
revoke execute on function public.set_updated_at()
  from public, anon, authenticated, service_role;
revoke execute on function public.assert_no_client_mutation()
  from public, anon, authenticated, service_role;
revoke execute on function public.profiles_role_guard()
  from public, anon, authenticated, service_role;
revoke execute on function public.payments_insert_override()
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3. Helpers (internal: no EXECUTE grants beyond the owner)
-- ---------------------------------------------------------------------

-- Gym-local calendar date (design §4.1, unresolved #7.5). Reads the
-- configurable timezone; defaults to Asia/Kolkata. SECURITY DEFINER so
-- the configured value is visible regardless of the caller's RLS scope.
create function public.app_gym_date() returns date
language sql
stable
security definer
set search_path = 'public'
as $$
  select (now() at time zone coalesce(
            (select s.gym_timezone from public.app_settings s where s.id = 1),
            'Asia/Kolkata'))::date
$$;

-- Role gate: resolves the AUTHORITATIVE profiles.role for auth.uid()
-- (never JWT claims) and refuses unless the role is allowed. SECURITY
-- DEFINER so the profiles read bypasses RLS by design (unresolved #7.1).
create function public.require_role(p_allowed text[]) returns text
language plpgsql
stable
security definer
set search_path = 'public'
as $$
declare
  v_actor uuid;
  v_role  text;
begin
  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'Authentication required.'
      using errcode = '42501';
  end if;
  select p.role into v_role from public.profiles p where p.id = v_actor;
  if v_role is null or not (v_role = any (p_allowed)) then
    raise exception 'Insufficient role for this operation.'
      using errcode = '42501';
  end if;
  return v_role;
end
$$;

-- AAL2 gate (unresolved #4 default posture). The aal claim comes from
-- the signed JWT via auth.jwt(); an absent claim is treated as aal1
-- (safe failure mode). auth.jwt() is schema-qualified: callable with a
-- pinned search_path.
create function public.assert_aal2() returns void
language plpgsql
stable
set search_path = 'public'
as $$
begin
  if coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then
    raise exception 'This action requires multi-factor authentication (AAL2).'
      using errcode = '42501';
  end if;
end
$$;

-- Audit writer: every authority-bearing action emits one row. Actor and
-- actor_role are resolved from the authenticated identity + the
-- authoritative profile (same discipline as 0002's override trigger).
create function public.audit_authority(
  p_action     text,
  p_table_name text,
  p_row_id     uuid,
  p_old        jsonb default null,
  p_new        jsonb default null
) returns void
language plpgsql
volatile
security definer
set search_path = 'public'
as $$
declare
  v_actor uuid := auth.uid();
  v_role  text;
begin
  if v_actor is not null then
    select p.role into v_role from public.profiles p where p.id = v_actor;
  end if;
  insert into public.audit_log_entries
    (actor, actor_role, action, table_name, row_id, old_values, new_values)
  values
    (v_actor, v_role, p_action, p_table_name, p_row_id, p_old, p_new);
end
$$;

-- ---------------------------------------------------------------------
-- 4. Authority functions (§10 matrix). All SECURITY DEFINER owned by
--    postgres, search_path pinned; role gates INSIDE each function
--    (definer context makes current_user = postgres, so the gate is the
--    function's own require_role call, never a grant).
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- 4.1 verify_payment — receptionist (+AAL2); self-verify denied
--     (unresolved #1). Member-row lock held across the whole period
--     computation (§7). Anchored calendar-month arithmetic (§4.1/§4.2).
-- ---------------------------------------------------------------------
create function public.verify_payment(p_payment_id uuid) returns uuid
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_pay        public.payments%rowtype;
  v_member     public.members%rowtype;
  v_plan       public.plans%rowtype;
  v_last       public.membership_periods%rowtype;
  v_months     integer;
  v_era_months integer;
  v_start      date;
  v_end        date;
  v_today      date;
  v_applied    jsonb;
  v_tz         text;
  v_frozen_days integer;
  v_derived_expiry date;
begin
  perform public.require_role(array['receptionist']);
  perform public.assert_aal2();
  v_today := public.app_gym_date();
  v_tz    := coalesce(
               (select s.gym_timezone from public.app_settings s where s.id = 1),
               'Asia/Kolkata');

  -- payment-row lock first (§7 lock order: payment → member)
  select * into v_pay
    from public.payments
    where id = p_payment_id and entry_type = 'payment'
    for update;
  if not found then
    raise exception 'Payment not found.'
      using errcode = 'P0002';
  end if;

  -- self-verification default-deny (unresolved #1)
  if v_pay.recorded_by = auth.uid() then
    raise exception 'Self-verification is not permitted (segregation of duties).'
      using errcode = '42501';
  end if;

  if v_pay.state <> 'awaitingVerification' then
    raise exception 'Payment is not awaiting verification.'
      using errcode = '55000';
  end if;

  -- member-row lock: all membership arithmetic serializes on it
  select * into v_member
    from public.members
    where id = v_pay.member_id
    for update;
  if not found then
    raise exception 'Member not found.'
      using errcode = 'P0002';
  end if;

  -- plan validation (3B.2 audit condition C / LOW-03): revenue
  -- recognition is gated on an ACTIVE plan consistent with the member.
  select * into v_plan from public.plans where id = v_pay.plan_id;
  if not found then
    raise exception 'Payment plan not found.'
      using errcode = 'P0002';
  end if;
  if not v_plan.is_active then
    raise exception 'Payment plan is inactive; verification refused.'
      using errcode = '55000';
  end if;

  -- pending plan assignment applied atomically FIRST (§4.2):
  -- plan_id updated, price_locked = plans.price at THIS moment, pending
  -- cleared, audited — then the period rules below. A failure aborts
  -- the whole transaction, so the application is atomic with the
  -- verification.
  if v_member.pending_plan_id is not null then
    update public.members
      set plan_id                   = v_member.pending_plan_id,
          price_locked              = (select pl.price
                                       from public.plans pl
                                       where pl.id = v_member.pending_plan_id),
          pending_plan_id           = null,
          pending_plan_requested_by = null
      where id = v_member.id
        and pending_plan_id = v_member.pending_plan_id;
    if not found then
      raise exception 'Plan assignment changed concurrently.'
        using errcode = '55000';
    end if;
    v_applied := jsonb_build_object(
      'plan_id', v_member.pending_plan_id,
      'price_locked', (select pl.price from public.plans pl
                       where pl.id = v_member.pending_plan_id));
    v_member.plan_id      := v_member.pending_plan_id;
    v_member.price_locked := (v_applied ->> 'price_locked')::numeric;
    perform public.audit_authority(
      'plan.assignment_applied', 'members', v_member.id,
      jsonb_build_object('pending_plan_id', v_member.pending_plan_id),
      v_applied);
  end if;

  -- plan/member consistency gate (LOW-03)
  if v_member.plan_id is not null and v_member.plan_id <> v_pay.plan_id then
    raise exception 'Payment plan is inconsistent with the member''s current plan.'
      using errcode = '55000';
  end if;

  -- renewal while frozen refused (O-04; frozen-now predicate, derived)
  if exists (
    select 1 from public.membership_freezes f
    where f.member_id = v_member.id
      and f.state = 'approved'
      and f.start_date <= v_today
      and f.end_date >= v_today
  ) then
    raise exception 'Member is currently frozen; end the freeze before verifying a renewal.'
      using errcode = '55000';
  end if;

  -- anchored calendar-month arithmetic (§4.1): never repeated +1-month
  -- from a clamped end — cumulative months from the era's start anchor.
  v_months := case v_plan.duration
                when 'monthly'    then 1
                when 'quarterly'  then 3
                when 'halfYearly' then 6
                when 'yearly'     then 12
              end;

  select * into v_last
    from public.membership_periods p
    where p.member_id = v_member.id
      and not exists (
            select 1 from public.membership_period_voids v
            where v.period_id = p.id)
    order by p.start_date desc, p.created_at desc
    limit 1;

  -- R14 (after_expiry) + B1 (pure pause): derived expiry = stored expiry +
  -- cumulative ACTUAL frozen days. Mirrors v_member_status.frozen_union
  -- exactly: approved and ended rows only; inclusive day counting; ended
  -- windows stop at gym-local(ended_at) - 1, so the unfreeze/scan day is
  -- active; future days and pending/rejected rows never count; and
  -- count(distinct day) union-deduplicates overlapping ended windows.
  select count(distinct g.d)
    into v_frozen_days
    from public.membership_freezes f
    cross join lateral generate_series(
      f.start_date,
      case
        when f.ended_at is not null then
          -- clamp to the approved window: ending a freeze AFTER its
          -- scheduled end must never credit more than extension_days
          -- (3B.4 §4.4 f = clamp(u - start_date, 0, A))
          least(f.end_date, ((f.ended_at at time zone v_tz)::date - 1))
        when f.state = 'ended' then
          f.end_date
        else
          least(f.end_date, v_today)
      end,
      interval '1 day'
    ) as g(d)
    where f.member_id = v_member.id
      and f.state in ('approved', 'ended')
      and f.start_date <= v_today
      and g.d <= v_today;

  v_derived_expiry := case
    when v_member.membership_end is null then null
    else v_member.membership_end + v_frozen_days
  end;

  if found
     and v_last.plan_id = v_pay.plan_id
     and v_derived_expiry is not null
     and v_derived_expiry >= v_today then
    -- same-plan renewal BEFORE or ON derived expiry (R14 after_expiry):
    -- start = calendar day after the freeze-adjusted derived expiry;
    -- end = anchor_start + cumulative months (anchor arithmetic)
    v_era_months :=
        (date_part('year',  v_last.end_date)::int
       - date_part('year',  v_last.start_date)::int) * 12
      + (date_part('month', v_last.end_date)::int
       - date_part('month', v_last.start_date)::int);
    v_start := v_derived_expiry + 1;
    v_end   := (v_last.start_date
                + make_interval(months => v_era_months + v_months))::date;
  else
    -- first verified payment, plan switch (re-anchor at switch date,
    -- §4.1), or post-expiry renewal (O-05: start = actual verification
    -- date; gap days uncovered, no retroactivity)
    v_start := v_today;
    v_end   := (v_start + make_interval(months => v_months))::date;
  end if;

  -- conditional state transition: double-verify impossible (§7)
  update public.payments
    set state       = 'verified',
        verified_by = auth.uid(),
        verified_at = now()
    where id = v_pay.id
      and state = 'awaitingVerification';
  if not found then
    raise exception 'Payment was decided concurrently.'
      using errcode = '55000';
  end if;

  insert into public.membership_periods
    (member_id, plan_id, start_date, end_date, price_applied,
     created_by_payment)
  values
    (v_member.id, v_pay.plan_id, v_start, v_end, v_pay.original_price,
     v_pay.id);
  -- price_applied carries the payment's original (list) price: it is the
  -- list price applied to the period and stays > 0 even for a fully
  -- discounted (payable = 0, O-13) payment.

  update public.members
    set membership_end = v_end,
        price_locked   = coalesce(v_member.price_locked, v_plan.price),
        updated_at     = now()
    where id = v_member.id;

  perform public.audit_authority(
    'payment.verified', 'payments', v_pay.id, null,
    jsonb_build_object(
      'state', 'verified',
      'period_start', v_start,
      'period_end', v_end,
      'membership_end', v_end,
      'plan_id', v_pay.plan_id,
      'price_locked', coalesce(v_member.price_locked, v_plan.price)));

  return v_pay.id;
end
$$;

-- ---------------------------------------------------------------------
-- 4.2 reject_payment — receptionist; same self-rule as verify
--     (unresolved #1). verified_by/verified_at carry the decision
--     attribution (0001 constraints require them for non-awaiting rows).
-- ---------------------------------------------------------------------
create function public.reject_payment(p_payment_id uuid) returns uuid
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_pay public.payments%rowtype;
begin
  perform public.require_role(array['receptionist']);

  select * into v_pay
    from public.payments
    where id = p_payment_id and entry_type = 'payment'
    for update;
  if not found then
    raise exception 'Payment not found.'
      using errcode = 'P0002';
  end if;

  if v_pay.recorded_by = auth.uid() then
    raise exception 'Self-rejection is not permitted (segregation of duties).'
      using errcode = '42501';
  end if;

  if v_pay.state <> 'awaitingVerification' then
    raise exception 'Payment is not awaiting verification.'
      using errcode = '55000';
  end if;

  update public.payments
    set state       = 'rejected',
        verified_by = auth.uid(),
        verified_at = now()
    where id = v_pay.id
      and state = 'awaitingVerification';
  if not found then
    raise exception 'Payment was decided concurrently.'
      using errcode = '55000';
  end if;

  perform public.audit_authority(
    'payment.rejected', 'payments', v_pay.id, null,
    jsonb_build_object('state', 'rejected'));

  return v_pay.id;
end
$$;

-- ---------------------------------------------------------------------
-- 4.3 create_reversal — receptionist (+AAL2); self-reverse denied
--     (unresolved #2). Original-row lock orders all reversals of one
--     original (§7); remaining-amount check; the reversal row lands
--     verified instantly (reversals never queue); full reversal voids
--     the linked period and reconstructs membership_end (§5.3/§5.5)
--     under the member-row lock. The GUC that lets the row bypass the
--     0002 override is TRANSACTION-LOCAL ONLY (audit condition B).
-- ---------------------------------------------------------------------
create function public.create_reversal(
  p_original_payment_id uuid,
  p_amount              numeric,
  p_note                text default null
) returns uuid
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_orig        public.payments%rowtype;
  v_member      public.members%rowtype;
  v_reversed    numeric(12,2);
  v_remaining   numeric(12,2);
  v_reversal_id uuid;
  v_period_id   uuid;
begin
  perform public.require_role(array['receptionist']);
  perform public.assert_aal2();

  if p_amount is null or p_amount <= 0 then
    raise exception 'Reversal amount must be positive.'
      using errcode = '55000';
  end if;
  if p_amount <> round(p_amount, 0) then
    raise exception 'Reversal amount must be a whole rupee amount.'
      using errcode = '55000';
  end if;

  -- original-row lock (§7 reversal serialization)
  select * into v_orig
    from public.payments
    where id = p_original_payment_id and entry_type = 'payment'
    for update;
  if not found then
    raise exception 'Original payment not found.'
      using errcode = 'P0002';
  end if;
  if v_orig.state <> 'verified' then
    raise exception 'Only verified payments can be reversed.'
      using errcode = '55000';
  end if;

  -- self-reversal default-deny (unresolved #2): the actor may not
  -- reverse a payment they recorded OR verified.
  if v_orig.recorded_by = auth.uid()
     or v_orig.verified_by = auth.uid() then
    raise exception 'Self-reversal is not permitted (segregation of duties).'
      using errcode = '42501';
  end if;

  select coalesce(sum(payable), 0) into v_reversed
    from public.payments
    where reversal_of = v_orig.id
      and entry_type = 'reversal'
      and state = 'verified';
  v_remaining := v_orig.payable - v_reversed;
  if p_amount > v_remaining then
    raise exception 'Reversal exceeds the remaining refundable amount (remaining %).',
      v_remaining
      using errcode = '55000';
  end if;

  -- transaction-local GUC ONLY (audit condition B): the marker makes the
  -- 0002 insert override skip so the reversal lands exactly as provided.
  -- set_config(..., is_local => true) is scoped to THIS transaction — it
  -- can never leak to a subsequent request on a pooled connection.
  perform set_config('app.bypass_payment_override', 'on', true);
  insert into public.payments
    (member_id, plan_id, entry_type, reversal_of, original_price,
     discount_pct, discount_amount, payable, currency, method, utr,
     state, recorded_by, verified_by, recorded_at, verified_at,
     receipt_issued, note)
  values
    (v_orig.member_id, v_orig.plan_id, 'reversal', v_orig.id, p_amount,
     0, 0, p_amount, 'INR', v_orig.method, null, 'verified',
     auth.uid(), auth.uid(), now(), now(), false, p_note)
  returning id into v_reversal_id;
  perform set_config('app.bypass_payment_override', 'off', true);

  -- full reversal → period void (O-23) + membership_end reconstruction
  -- (§5.5, under the derived-pause model: membership_end = end_date of
  -- the latest NON-VOIDED period, null if none remains — freeze
  -- adjustments are derived in 0004 views and were never stored here).
  -- Partial reversals never touch periods or membership_end (O-24).
  if p_amount = v_orig.payable then
    select id into v_period_id
      from public.membership_periods
      where created_by_payment = v_orig.id;
    if found then
      insert into public.membership_period_voids
        (period_id, reversal_id, voided_by)
      values
        (v_period_id, v_reversal_id, auth.uid());

      select * into v_member
        from public.members
        where id = v_orig.member_id
        for update;
      update public.members m
        set membership_end = (
              select p.end_date
                from public.membership_periods p
                where p.member_id = m.id
                  and not exists (
                        select 1 from public.membership_period_voids v
                        where v.period_id = p.id)
                order by p.start_date desc, p.created_at desc
                limit 1),
            updated_at = now()
        where m.id = v_member.id;
    end if;
  end if;

  perform public.audit_authority(
    'payment.reversed', 'payments', v_reversal_id, null,
    jsonb_build_object(
      'reversal_of', v_orig.id,
      'amount', p_amount,
      'full_reversal', p_amount = v_orig.payable,
      'original_payable', v_orig.payable,
      'period_voided', v_period_id));

  return v_reversal_id;
end
$$;

-- ---------------------------------------------------------------------
-- 4.4 request_freeze — receptionist. Eligibility per §2.1: membership
--     not expired (active/expiring), never-paid and frozen-now members
--     refused; no duration/count limits stored (O-06). Overlap against
--     pending/approved windows is enforced by the 0001 GiST exclusion
--     constraint (23P01 freezes_no_overlap).
-- ---------------------------------------------------------------------
create function public.request_freeze(
  p_member_id  uuid,
  p_start_date date,
  p_end_date   date,
  p_reason     text
) returns uuid
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_member public.members%rowtype;
  v_id     uuid;
  v_today  date := public.app_gym_date();
begin
  perform public.require_role(array['receptionist']);

  select * into v_member from public.members where id = p_member_id;
  if not found then
    raise exception 'Member not found.'
      using errcode = 'P0002';
  end if;

  -- eligibility (§2.1): not expired; payment-pending excluded; frozen-now
  -- excluded. Future-dated windows are allowed (they must not pause
  -- anything before they begin — the derived model guarantees that).
  if v_member.membership_end is null then
    raise exception 'Member has no active membership (payment pending).'
      using errcode = '55000';
  end if;
  if v_member.membership_end < v_today then
    raise exception 'Freezes are only available for active memberships.'
      using errcode = '55000';
  end if;
  if exists (
    select 1 from public.membership_freezes f
    where f.member_id = v_member.id
      and f.state = 'approved'
      and f.start_date <= v_today
      and f.end_date >= v_today
  ) then
    raise exception 'Member is currently frozen.'
      using errcode = '55000';
  end if;

  if p_end_date < p_start_date then
    raise exception 'Freeze window end date must not precede the start date.'
      using errcode = '55000';
  end if;

  insert into public.membership_freezes
    (member_id, start_date, end_date, reason, state, requested_by)
  values
    (p_member_id, p_start_date, p_end_date, p_reason, 'pending', auth.uid())
  returning id into v_id;
  -- overlapping pending/approved window → 23P01 freezes_no_overlap

  perform public.audit_authority(
    'freeze.requested', 'membership_freezes', v_id, null,
    jsonb_build_object(
      'member_id', p_member_id,
      'start_date', p_start_date,
      'end_date', p_end_date,
      'reason', p_reason));

  return v_id;
end
$$;

-- ---------------------------------------------------------------------
-- 4.5 decide_freeze — receptionist ONLY, owner explicitly refused [C1];
--     +AAL2 (unresolved #4). Decision-time eligibility/overlap re-check
--     (§4.3); conditional pending → decided transition with rowcount
--     guard (double-decision impossible). Under the recorded derived-
--     pause model this writes ONLY state/decided_*/extension_days
--     (= end_date − start_date + 1, inclusive O-02); membership_end is
--     NOT advanced — the pause is derived in 0004 views.
-- ---------------------------------------------------------------------
create function public.decide_freeze(p_freeze_id uuid, p_approve boolean)
returns uuid
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_freeze public.membership_freezes%rowtype;
  v_member public.members%rowtype;
begin
  perform public.require_role(array['receptionist']);
  perform public.assert_aal2();

  select * into v_freeze
    from public.membership_freezes
    where id = p_freeze_id;
  if not found then
    raise exception 'Freeze request not found.'
      using errcode = 'P0002';
  end if;

  -- member-row lock FIRST (lock order member → freeze matches check_in,
  -- which locks the member before touching freeze rows — no deadlock)
  select * into v_member
    from public.members
    where id = v_freeze.member_id
    for update;

  select * into v_freeze
    from public.membership_freezes
    where id = p_freeze_id
    for update;
  if v_freeze.state <> 'pending' then
    raise exception 'Freeze request has already been decided.'
      using errcode = '55000';
  end if;

  if p_approve then
    -- decision-time re-check (§4.3): refuse if the member meanwhile
    -- expired / payment-pending / currently frozen
    if v_member.membership_end is null
       or v_member.membership_end < public.app_gym_date() then
      raise exception 'Member membership has lapsed; freeze approval refused.'
        using errcode = '55000';
    end if;
    if exists (
      select 1 from public.membership_freezes f
      where f.member_id = v_member.id
        and f.state = 'approved'
        and f.start_date <= public.app_gym_date()
        and f.end_date >= public.app_gym_date()
    ) then
      raise exception 'Member is currently frozen; freeze approval refused.'
        using errcode = '55000';
    end if;

    update public.membership_freezes
      set state          = 'approved',
          decided_by     = auth.uid(),
          decided_at     = now(),
          extension_days = (v_freeze.end_date - v_freeze.start_date) + 1
      where id = v_freeze.id
        and state = 'pending';
    if not found then
      raise exception 'Freeze request was decided concurrently.'
        using errcode = '55000';
    end if;

    perform public.audit_authority(
      'freeze.approved', 'membership_freezes', v_freeze.id, null,
      jsonb_build_object(
        'state', 'approved',
        'extension_days', (v_freeze.end_date - v_freeze.start_date) + 1));
  else
    update public.membership_freezes
      set state      = 'rejected',
          decided_by = auth.uid(),
          decided_at = now()
      where id = v_freeze.id
        and state = 'pending';
    if not found then
      raise exception 'Freeze request was decided concurrently.'
        using errcode = '55000';
    end if;

    perform public.audit_authority(
      'freeze.rejected', 'membership_freezes', v_freeze.id, null,
      jsonb_build_object('state', 'rejected'));
  end if;

  return v_freeze.id;
end
$$;

-- ---------------------------------------------------------------------
-- 4.6 end_freeze — receptionist. Conditional approved → ended transition
--     (scan-vs-receptionist race: one winner, §7). Under the derived-
--     pause model the unused-day rollback (O-03) is computed by the 0004
--     views from ended_at/extension_days; membership_end is never
--     adjusted here (design §10 "members end" column is superseded —
--     see the migration header).
-- ---------------------------------------------------------------------
create function public.end_freeze(p_freeze_id uuid) returns uuid
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_freeze public.membership_freezes%rowtype;
begin
  perform public.require_role(array['receptionist']);

  select * into v_freeze
    from public.membership_freezes
    where id = p_freeze_id
    for update;
  if not found then
    raise exception 'Freeze not found.'
      using errcode = 'P0002';
  end if;
  if v_freeze.state <> 'approved' then
    raise exception 'Only an approved freeze can be ended.'
      using errcode = '55000';
  end if;

  update public.membership_freezes
    set state      = 'ended',
        ended_at   = now(),
        ended_via  = 'receptionist',
        ended_by   = auth.uid()
    where id = v_freeze.id
      and state = 'approved';
  if not found then
    raise exception 'Freeze was ended concurrently.'
      using errcode = '55000';
  end if;

  perform public.audit_authority(
    'freeze.ended', 'membership_freezes', v_freeze.id, null,
    jsonb_build_object('state', 'ended', 'ended_via', 'receptionist'));

  return v_freeze.id;
end
$$;

-- ---------------------------------------------------------------------
-- 4.7 check_in — member (self). Token hash/expiry validation, member
--     resolution by auth_user_id, frozen-scan auto-unfreeze (O-10),
--     pendingPayment default-deny (unresolved #3), expired members
--     attend silently (O-32/O-33), replay refused per member per token.
--     Failed scans are never stored (O-35); attendance inserts emit no
--     audit row (excluded by design).
-- ---------------------------------------------------------------------
create function public.check_in(p_token text, p_door text default 'main')
returns uuid
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_member    public.members%rowtype;
  v_token     public.qr_tokens%rowtype;
  v_event_id  uuid;
  v_freeze_id uuid;
begin
  perform public.require_role(array['member']);

  select * into v_member
    from public.members
    where auth_user_id = auth.uid()
    for update;
  if not found then
    raise exception 'No member record is linked to this account.'
      using errcode = '42501';
  end if;

  if p_token is null or btrim(p_token) = '' then
    raise exception 'Attendance token is invalid.'
      using errcode = '55000';
  end if;

  select * into v_token
    from public.qr_tokens
    where token_hash = encode(sha256(convert_to(p_token, 'utf8')), 'hex');
  if not found then
    raise exception 'Attendance token is invalid.'
      using errcode = '55000';
  end if;
  if v_token.expires_at < now() then
    raise exception 'Attendance token has expired.'
      using errcode = '55000';
  end if;

  -- pendingPayment default-deny (unresolved #3): a member with no
  -- payment-derived validity (never verified, or all periods voided)
  -- is refused; expired members attend silently (O-32).
  if v_member.membership_end is null then
    raise exception 'Attendance is not permitted while payment is pending (pendingPayment).'
      using errcode = '55000';
  end if;

  -- frozen member scanning the gym QR: the scan ENDS the freeze (O-10)
  -- via a conditional transition — a concurrent receptionist unfreeze
  -- wins cleanly and the scan still proceeds (§4.5).
  update public.membership_freezes
    set state     = 'ended',
        ended_at  = now(),
        ended_via = 'scan'
    where member_id = v_member.id
      and state = 'approved'
      and start_date <= public.app_gym_date()
      and end_date >= public.app_gym_date()
    returning id into v_freeze_id;
  if found then
    perform public.audit_authority(
      'freeze.ended_scan', 'membership_freezes', v_freeze_id, null,
      jsonb_build_object('member_id', v_member.id, 'ended_via', 'scan'));
  end if;

  -- every successful scan counts, repeats included (O-29); the same
  -- member reusing the SAME token is refused (unique member+token;
  -- pre-checked by the index, raced inserts land here).
  begin
    insert into public.attendance_events
      (member_id, token_id, door, status)
    values
      (v_member.id, v_token.id, p_door, 'verified')
    returning id into v_event_id;
  exception when unique_violation then
    raise exception 'This token has already been used by this member (replay refused).'
      using errcode = '55000';
  end;

  return v_event_id;
end
$$;

-- ---------------------------------------------------------------------
-- 4.8 mint_attendance_token — receptionist (+AAL2; §8.1 owner "—").
--     Returns the PLAINTEXT token once; only its SHA-256 hash is stored.
--     Validity defaults to app_settings.attendance_token_validity_seconds
--     (60 s default, bounded 5..600 by app_settings' own constraint).
-- ---------------------------------------------------------------------
create function public.mint_attendance_token(
  p_validity_seconds integer default null
) returns text
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_secs  integer;
  v_token text;
  v_id    uuid;
  v_exp   timestamptz;
begin
  perform public.require_role(array['receptionist']);
  perform public.assert_aal2();

  if p_validity_seconds is null then
    select attendance_token_validity_seconds into v_secs
      from public.app_settings where id = 1;
    if not found then
      raise exception 'Gym settings are not initialized.'
        using errcode = '55000';
    end if;
  else
    v_secs := p_validity_seconds;
  end if;
  if v_secs < 5 or v_secs > 600 then
    raise exception 'Token validity must be between 5 and 600 seconds.'
      using errcode = '55000';
  end if;

  -- ~244 random bits from two UUIDv4s; core functions only (pgcrypto's
  -- digest/gen_random_bytes live in the `extensions` schema on this
  -- stack and would break the pinned search_path).
  v_token := replace(gen_random_uuid()::text, '-', '')
          || replace(gen_random_uuid()::text, '-', '');
  v_exp   := now() + make_interval(secs => v_secs);

  insert into public.qr_tokens
    (token_hash, purpose, expires_at, minted_by)
  values
    (encode(sha256(convert_to(v_token, 'utf8')), 'hex'),
     'attendance', v_exp, auth.uid())
  returning id into v_id;

  perform public.audit_authority(
    'token.minted', 'qr_tokens', v_id, null,
    jsonb_build_object(
      'validity_seconds', v_secs,
      'expires_at', v_exp));

  return v_token;
end
$$;

-- ---------------------------------------------------------------------
-- 4.9 set_member_discount — receptionist (O-12); owner read-only
--     (O-15): owner is NOT in the allowed set. Range 0–100 is the
--     data-validity range (§2.3), pre-checked for a clean error.
-- ---------------------------------------------------------------------
create function public.set_member_discount(
  p_member_id     uuid,
  p_discount_pct  numeric
) returns uuid
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_old numeric;
begin
  perform public.require_role(array['receptionist']);

  if p_discount_pct is null or p_discount_pct < 0 or p_discount_pct > 100 then
    raise exception 'Discount must be between 0 and 100.'
      using errcode = '55000';
  end if;

  select discount_pct into v_old
    from public.members where id = p_member_id for update;
  if not found then
    raise exception 'Member not found.'
      using errcode = 'P0002';
  end if;

  update public.members
    set discount_pct = p_discount_pct,
        updated_at   = now()
    where id = p_member_id;

  perform public.audit_authority(
    'discount.set', 'members', p_member_id,
    jsonb_build_object('discount_pct', v_old),
    jsonb_build_object('discount_pct', p_discount_pct));

  return p_member_id;
end
$$;

-- ---------------------------------------------------------------------
-- 4.10 request_plan_assignment — receptionist. One pending assignment
--      at a time (§10); inactive plans refused (the assignment is
--      applied by verify_payment, which refuses inactive plans —
--      refusing here gives the error at the request, where it belongs).
-- ---------------------------------------------------------------------
create function public.request_plan_assignment(
  p_member_id uuid,
  p_plan_id   uuid
) returns uuid
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_member public.members%rowtype;
  v_plan   public.plans%rowtype;
begin
  perform public.require_role(array['receptionist']);

  select * into v_plan from public.plans where id = p_plan_id;
  if not found then
    raise exception 'Plan not found.'
      using errcode = 'P0002';
  end if;
  if not v_plan.is_active then
    raise exception 'Plan is not active.'
      using errcode = '55000';
  end if;

  select * into v_member
    from public.members where id = p_member_id for update;
  if not found then
    raise exception 'Member not found.'
      using errcode = 'P0002';
  end if;
  if v_member.pending_plan_id is not null then
    raise exception 'A plan assignment is already pending for this member.'
      using errcode = '55000';
  end if;

  update public.members
    set pending_plan_id           = p_plan_id,
        pending_plan_requested_by = auth.uid(),
        updated_at                = now()
    where id = p_member_id
      and pending_plan_id is null;
  if not found then
    raise exception 'A plan assignment was requested concurrently.'
      using errcode = '55000';
  end if;

  perform public.audit_authority(
    'plan.assignment_requested', 'members', p_member_id, null,
    jsonb_build_object('plan_id', p_plan_id));

  return p_member_id;
end
$$;

-- ---------------------------------------------------------------------
-- 4.11 update_plan_price — owner [REC]; receptionist/member refused.
-- ---------------------------------------------------------------------
create function public.update_plan_price(p_plan_id uuid, p_price numeric)
returns uuid
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_old numeric;
begin
  perform public.require_role(array['owner']);
  perform public.assert_aal2();

  if p_price is null or p_price <= 0 then
    raise exception 'Plan price must be positive.'
      using errcode = '55000';
  end if;

  select price into v_old from public.plans where id = p_plan_id for update;
  if not found then
    raise exception 'Plan not found.'
      using errcode = 'P0002';
  end if;

  update public.plans
    set price      = p_price,
        updated_at = now()
    where id = p_plan_id;

  perform public.audit_authority(
    'plan.price_changed', 'plans', p_plan_id,
    jsonb_build_object('price', v_old),
    jsonb_build_object('price', p_price));

  return p_plan_id;
end
$$;

-- ---------------------------------------------------------------------
-- 4.12 decide_application — receptionist [REC]. The ONLY member-creation
--     path. Approve → members row inserted; an application carrying
--     auth_user_id is linked ONLY to an existing profile whose role is
--     'member' (staff-profile links and hijacks of already-linked
--     accounts refused — audit condition D); a null auth_user_id creates
--     an unlinked member. Conditional submitted → decided rowcount
--     guard (double-decision impossible).
-- ---------------------------------------------------------------------
create function public.decide_application(
  p_application_id uuid,
  p_approve        boolean
) returns uuid
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_app       public.join_applications%rowtype;
  v_profile   public.profiles%rowtype;
  v_member_id uuid;
begin
  perform public.require_role(array['receptionist']);
  perform public.assert_aal2();

  select * into v_app
    from public.join_applications
    where id = p_application_id
    for update;
  if not found then
    raise exception 'Application not found.'
      using errcode = 'P0002';
  end if;
  if v_app.state <> 'submitted' then
    raise exception 'Application has already been decided or is not decidable.'
      using errcode = '55000';
  end if;

  if p_approve then
    if v_app.auth_user_id is not null then
      -- linking integrity [audit condition D]: the target profile must
      -- exist, must be a MEMBER profile, and must not already be linked
      -- (members.auth_user_id UNIQUE backs the pre-check).
      select * into v_profile
        from public.profiles where id = v_app.auth_user_id;
      if not found then
        raise exception 'Linked profile does not exist.'
          using errcode = '55000';
      end if;
      if v_profile.role <> 'member' then
        raise exception 'Only member profiles can be linked to a member record.'
          using errcode = '42501';
      end if;
      if exists (
        select 1 from public.members
        where auth_user_id = v_app.auth_user_id
      ) then
        raise exception 'This auth account is already linked to a member record.'
          using errcode = '55000';
      end if;

      insert into public.members
        (full_name, phone, email, plan_id, auth_user_id, joined_on)
      values
        (v_app.full_name, v_app.phone, v_app.email, v_app.plan_id,
         v_app.auth_user_id, public.app_gym_date())
      returning id into v_member_id;
    else
      insert into public.members
        (full_name, phone, email, plan_id, joined_on)
      values
        (v_app.full_name, v_app.phone, v_app.email, v_app.plan_id,
         public.app_gym_date())
      returning id into v_member_id;
    end if;

    update public.join_applications
      set state      = 'approved',
          decided_by = auth.uid(),
          decided_at = now()
      where id = v_app.id
        and state = 'submitted';
    if not found then
      raise exception 'Application was decided concurrently.'
        using errcode = '55000';
    end if;

    perform public.audit_authority(
      'application.decided', 'join_applications', v_app.id, null,
      jsonb_build_object(
        'state', 'approved',
        'member_id', v_member_id,
        'auth_user_id', v_app.auth_user_id));
  else
    update public.join_applications
      set state      = 'rejected',
          decided_by = auth.uid(),
          decided_at = now()
      where id = v_app.id
        and state = 'submitted';
    if not found then
      raise exception 'Application was decided concurrently.'
        using errcode = '55000';
    end if;

    perform public.audit_authority(
      'application.decided', 'join_applications', v_app.id, null,
      jsonb_build_object('state', 'rejected'));
  end if;

  return v_app.id;
end
$$;

-- ---------------------------------------------------------------------
-- 4.13 update_gym_settings — owner [REC]. Singleton row (id = 1);
--      null parameters leave the current value untouched; timezone and
--      token-validity values are validated before the write.
-- ---------------------------------------------------------------------
create function public.update_gym_settings(
  p_gym_timezone                      text    default null,
  p_upi_id                            text    default null,
  p_upi_qr_path                       text    default null,
  p_attendance_token_validity_seconds integer default null
) returns integer
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_old public.app_settings%rowtype;
begin
  perform public.require_role(array['owner']);
  perform public.assert_aal2();

  select * into v_old from public.app_settings where id = 1 for update;
  if not found then
    raise exception 'Gym settings are not initialized.'
      using errcode = '55000';
  end if;

  if p_gym_timezone is not null
     and not exists (
       select 1 from pg_timezone_names where name = p_gym_timezone)
  then
    raise exception 'Unknown time zone.'
      using errcode = '55000';
  end if;
  if p_attendance_token_validity_seconds is not null
     and (p_attendance_token_validity_seconds < 5
          or p_attendance_token_validity_seconds > 600)
  then
    raise exception 'Token validity must be between 5 and 600 seconds.'
      using errcode = '55000';
  end if;

  update public.app_settings
    set gym_timezone = coalesce(p_gym_timezone, gym_timezone),
        upi_id       = coalesce(p_upi_id, upi_id),
        upi_qr_path  = coalesce(p_upi_qr_path, upi_qr_path),
        attendance_token_validity_seconds =
          coalesce(p_attendance_token_validity_seconds,
                   attendance_token_validity_seconds),
        updated_at   = now()
    where id = 1;
  if not found then
    raise exception 'Gym settings update failed.'
      using errcode = '55000';
  end if;

  perform public.audit_authority(
    'settings.changed', 'app_settings', null,
    to_jsonb(v_old),
    jsonb_build_object(
      'gym_timezone', coalesce(p_gym_timezone, v_old.gym_timezone),
      'upi_id', coalesce(p_upi_id, v_old.upi_id),
      'upi_qr_path', coalesce(p_upi_qr_path, v_old.upi_qr_path),
      'attendance_token_validity_seconds',
        coalesce(p_attendance_token_validity_seconds,
                 v_old.attendance_token_validity_seconds)));

  return 1;
end
$$;

-- ---------------------------------------------------------------------
-- 5. Deferred reversal-backstop constraint trigger (design §5.3/§7):
--    at COMMIT, Σ verified reversal amounts per original can never
--    exceed the original's payable — over-refund impossible on ANY
--    path, even one that bypasses create_reversal's own remaining
--    check. DEFERRABLE INITIALLY DEFERRED.
-- ---------------------------------------------------------------------
create function public.payments_reversal_cap_trigger() returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_original public.payments%rowtype;
  v_total    numeric(12,2);
begin
  if new.entry_type <> 'reversal' then
    return new;
  end if;

  select * into v_original
    from public.payments
    where id = new.reversal_of and entry_type = 'payment';
  if not found then
    raise exception 'Reversal references a missing original payment.'
      using errcode = '23514';
  end if;

  select coalesce(sum(payable), 0) into v_total
    from public.payments
    where reversal_of = v_original.id
      and entry_type = 'reversal'
      and state = 'verified';

  if v_total > v_original.payable then
    raise exception
      'Cumulative reversals (%) exceed the original payment amount (%).',
      v_total, v_original.payable
      using errcode = '23514';
  end if;

  return new;
end
$$;

create constraint trigger payments_reversal_cap
after insert on public.payments
deferrable initially deferred
for each row
execute function public.payments_reversal_cap_trigger();

-- ---------------------------------------------------------------------
-- 6. Explicit least-privilege ACLs [audit condition A]. The default-
--    privilege lockdown above already denies future objects; these are
--    the binding, verifiable per-function grants.
--    RPC surface: the 13 authority functions → authenticated ONLY
--    (in-function role gates separate member/receptionist/owner).
--    Helpers + the cap trigger function: owner-only (no client EXECUTE).
-- ---------------------------------------------------------------------
revoke execute on function public.verify_payment(uuid)
  from public, anon, service_role;
grant execute on function public.verify_payment(uuid) to authenticated;

revoke execute on function public.reject_payment(uuid)
  from public, anon, service_role;
grant execute on function public.reject_payment(uuid) to authenticated;

revoke execute on function public.create_reversal(uuid, numeric, text)
  from public, anon, service_role;
grant execute on function public.create_reversal(uuid, numeric, text)
  to authenticated;

revoke execute on function public.request_freeze(uuid, date, date, text)
  from public, anon, service_role;
grant execute on function public.request_freeze(uuid, date, date, text)
  to authenticated;

revoke execute on function public.decide_freeze(uuid, boolean)
  from public, anon, service_role;
grant execute on function public.decide_freeze(uuid, boolean)
  to authenticated;

revoke execute on function public.end_freeze(uuid)
  from public, anon, service_role;
grant execute on function public.end_freeze(uuid) to authenticated;

revoke execute on function public.check_in(text, text)
  from public, anon, service_role;
grant execute on function public.check_in(text, text) to authenticated;

revoke execute on function public.mint_attendance_token(integer)
  from public, anon, service_role;
grant execute on function public.mint_attendance_token(integer)
  to authenticated;

revoke execute on function public.set_member_discount(uuid, numeric)
  from public, anon, service_role;
grant execute on function public.set_member_discount(uuid, numeric)
  to authenticated;

revoke execute on function public.request_plan_assignment(uuid, uuid)
  from public, anon, service_role;
grant execute on function public.request_plan_assignment(uuid, uuid)
  to authenticated;

revoke execute on function public.update_plan_price(uuid, numeric)
  from public, anon, service_role;
grant execute on function public.update_plan_price(uuid, numeric)
  to authenticated;

revoke execute on function public.decide_application(uuid, boolean)
  from public, anon, service_role;
grant execute on function public.decide_application(uuid, boolean)
  to authenticated;

revoke execute on function public.update_gym_settings(text, text, text, integer)
  from public, anon, service_role;
grant execute on function public.update_gym_settings(text, text, text, integer)
  to authenticated;

-- internal helpers: NO client EXECUTE on any of them
revoke execute on function public.app_gym_date()
  from public, anon, authenticated, service_role;
revoke execute on function public.require_role(text[])
  from public, anon, authenticated, service_role;
revoke execute on function public.assert_aal2()
  from public, anon, authenticated, service_role;
revoke execute on function public.audit_authority(text, text, uuid, jsonb, jsonb)
  from public, anon, authenticated, service_role;
revoke execute on function public.payments_reversal_cap_trigger()
  from public, anon, authenticated, service_role;

commit;
