-- =====================================================================
-- 0002_rls_and_triggers.sql
-- Phase 3B.2 — Row Level Security, privilege lockdown, immutability
-- triggers for the Pulse Gym Supabase backend.
--
-- Authoritative sources:
--   docs/PHASE_3A_FINAL_DESIGN.md   (§8 security posture, §8.1 RLS matrix,
--                                    §10 responsibility matrix)
--   docs/PHASE_3A_UNRESOLVED_ITEMS.md (default-deny boundaries)
--   docs/PHASE_3B_1_REPORT.md       (validated 0001 baseline)
--
-- Scope of THIS migration ONLY:
--   1. one schema addition REQUIRED by the approved §8.1 matrix (reported):
--        members.auth_user_id — the FINAL_DESIGN ER diagram declares
--        `profiles ||--o| members : "auth_user_id nullable"`; 0001 omitted
--        it, and Member-own SELECT is unimplementable without the link.
--   2. role-resolution helper (app_profile_role) — reads the AUTHORITATIVE
--      profiles.role, never user-settable JWT claims.
--   3. RLS enable + FORCE on all 13 tables + policies per §8.1.
--   4. privilege grants/revocations for anon / authenticated / service_role.
--   5. immutability/guard triggers + updated_at maintenance.
--   6. payments BEFORE INSERT server-override trigger (design §5.2, §11
--      places it here): forces state='awaitingVerification', entry_type,
--      attribution and server-computed money. NO authority functions are
--      created here (0003).
--
-- Default-deny boundaries implemented here (UNRESOLVED items — nothing
-- enabled silently):
--   * self-verify / self-reverse  -> authority paths are 0003 functions;
--     no direct UPDATE exists for ANY client role, so the boundary holds.
--   * attendance for pendingPayment members -> check_in is a 0003 function;
--     no client INSERT on attendance_events exists here.
--   * member-submitted UTR (unresolved #5): members have NO INSERT grant
--     on payments; only receptionists (RLS WITH CHECK) can insert.
--   * join-application creation: service_role only — the public-submission
--     mechanism is unresolved (#7: auth hook dependency). Nothing granted
--     to anon or authenticated.
--   * MFA/AAL2 gates: belong to 0003 authority functions; no 0002 policy
--     reads the AAL claim (suite verifies this).
--   * data retention: nothing here purges anything (unresolved #6).
--
-- Owner authority (structurally guaranteed — O-18/O-19/O-08/[C1]):
--   owner = SELECT-only on payments and membership_freezes: no INSERT/
--   UPDATE/DELETE grant, and RLS policies grant no such path.
--
-- Engine facts this migration relies on (verified on the local stack):
--   * role `postgres` is NOT superuser but HAS BYPASSRLS and owns the
--     public tables — FORCE RLS therefore cannot lock out server-side
--     maintenance, while still applying to any future non-bypass owner.
--   * SECURITY DEFINER functions owned by postgres bypass RLS via the
--     BYPASSRLS attribute of the owner (0003 relies on this).
--   * postgres is a member of anon/authenticated/service_role, so test
--     suites can SET ROLE into real client contexts.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 0. Schema addition required by the approved §8.1 RLS matrix (REPORTED)
--    members.auth_user_id — nullable 1:1 auth link. ON DELETE SET NULL:
--    the approved deletion rule states ONLY profiles.id and
--    join_applications.auth_user_id cascade from auth.users; member
--    history is financial data and is retained (archived, never deleted).
-- ---------------------------------------------------------------------
alter table public.members
  add column auth_user_id uuid references auth.users (id) on delete set null;

alter table public.members
  add constraint members_auth_user_id_key unique (auth_user_id);

comment on column public.members.auth_user_id is
  'Auth account link (added in 0002 per FINAL_DESIGN §8.1 member-own access). Nullable until the account is linked; NULL does not grant access to anyone.';

create index members_auth_user_idx on public.members (auth_user_id);

-- ---------------------------------------------------------------------
-- 1. Helpers
-- ---------------------------------------------------------------------

-- Role resolution for RLS policies. SECURITY DEFINER so policies do not
-- depend on the caller''s ability to SELECT profiles; reads the
-- AUTHORITATIVE database profile — JWT role claims are never trusted
-- (they are user-mutable in principle; the DB row is the only truth).
create function public.app_profile_role() returns text
language sql
stable
security definer
set search_path = 'public'
as $$
  select p.role from public.profiles p where p.id = auth.uid()
$$;

comment on function public.app_profile_role() is
  'Returns the authoritative profiles.role for the caller (auth.uid()), or NULL when no profile exists (default deny). SECURITY DEFINER with pinned search_path; takes no arguments; cannot be used for privilege escalation.';

-- updated_at maintenance for tables that carry the column.
create function public.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

-- Client-mutation guard: a uniform backstop that blocks every direct
-- UPDATE/DELETE from the client-facing roles, independent of grants.
-- postgres (server maintenance) and service_role pass; their access is
-- governed by explicit grants. Used on ALL 13 tables.
create function public.assert_no_client_mutation() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    raise exception
      'Direct modification of % is not permitted; writes flow through approved service paths only.',
      tg_table_name
      using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

-- profiles.role immutability backstop: even if an UPDATE grant ever
-- leaked to a client role, role changes remain service-only.
create function public.profiles_role_guard() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.role is distinct from old.role
     and current_user in ('anon', 'authenticated') then
    raise exception 'profiles.role changes are service-only.'
      using errcode = '42501';
  end if;
  return new;
end
$$;

-- Payments INSERT server-override (design §5.2: "every entry starts
-- awaitingVerification ... client can never mint verified"; money is
-- server-computed from server-authoritative inputs).
--   * maintenance contexts skip the override. The discriminator is
--     `session_user` — the LOGIN role of the connection — NOT
--     `current_user`: inside a SECURITY DEFINER function `current_user`
--     is always the definer (postgres), so a current_user test can never
--     see the effective client role. Through PostgREST the login role is
--     'authenticator' (real client INSERTs are always overridden); direct
--     server-side administration logs in as 'postgres'/'supabase_admin'.
--   * the skip ALSO accepts the marker GUC
--     app.bypass_payment_override = 'on'. That is a FORWARD CONTRACT for
--     the 0003 SECURITY DEFINER authority functions (e.g. create_reversal
--     must insert a reversal row without the override forcing
--     entry_type='payment'): the function sets the GUC locally around its
--     own inserts. PostgREST clients CANNOT set custom GUCs (no SET
--     privilege through the REST path), so this is not a client door —
--     do not treat it as one; it is callable only from trusted server
--     code. (Validated by the suite's authenticator-context tests.)
--   * the acting profile must be a receptionist (O-12/O-17); the JWT
--     role claim is ignored.
--   * original_price comes from the member''s locked price, else the
--     plan price (locked subscription prices); payable is the approved
--     whole-rupee rounding; discount_amount is stored exactly (O-16).
--   * entry_type/reversal_of/currency/state/attribution are forced:
--     clients cannot mint reversals (create_reversal is 0003) or
--     verified rows.
create function public.payments_insert_override() returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_actor uuid;
  v_role  text;
  v_price numeric(12,2);
begin
  if session_user in ('postgres', 'supabase_admin')
     or coalesce(current_setting('app.bypass_payment_override', true), 'off') = 'on' then
    return new; -- trusted maintenance/authority context: rows land as provided
  end if;

  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'Recording a payment requires a signed-in user.'
      using errcode = '42501';
  end if;

  select p.role into v_role from public.profiles p where p.id = v_actor;
  if v_role is distinct from 'receptionist' then
    raise exception 'Only receptionists can record payments.'
      using errcode = '42501';
  end if;

  -- server-authoritative money (price_locked wins per locked-price rule;
  -- fallback: the price of the plan being paid for)
  select m.price_locked into v_price
    from public.members m where m.id = new.member_id;
  if v_price is null then
    select pl.price into v_price
      from public.plans pl where pl.id = new.plan_id;
  end if;
  if v_price is null then
    raise exception 'No server-authoritative price available for this payment.'
      using errcode = '42501';
  end if;

  new.original_price  := v_price;
  new.payable         := round(v_price * (1 - new.discount_pct / 100.0), 0);
  new.discount_amount := v_price - new.payable;

  new.entry_type      := 'payment';
  new.reversal_of     := null;
  new.currency        := 'INR';
  new.state           := 'awaitingVerification';
  new.verified_by     := null;
  new.verified_at     := null;
  new.recorded_by     := v_actor;
  new.recorded_at     := now();
  new.receipt_issued  := false;
  new.receipt_path    := null;

  insert into public.audit_log_entries
    (actor, actor_role, action, table_name, row_id, new_values)
  values
    (v_actor, v_role, 'payment.created', 'payments', new.id, to_jsonb(new));

  return new;
end
$$;

-- ---------------------------------------------------------------------
-- 2. Privilege cleanup — the stack image grants ALL on every public table
--    to anon/authenticated/service_role by default; start from zero.
-- ---------------------------------------------------------------------
revoke all privileges on all tables in schema public
  from anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- 3. RLS enable + FORCE on all 13 tables
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','plans','members','membership_periods','membership_period_voids',
    'payments','membership_freezes','qr_tokens','attendance_events',
    'join_applications','follow_up_events','audit_log_entries','app_settings'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('alter table public.%I force row level security;',  t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 4. Policies per the approved §8.1 matrix.
--    Staff = receptionist or owner (both authenticated JWTs; separated by
--    the authoritative profile role, never by JWT claims).
--    All policies are PERMISSIVE but every qual is role-bound, so the
--    permissive-OR combination cannot widen any single role''s view
--    (verified by the suite''s cross-role row counts).
-- ---------------------------------------------------------------------

-- profiles ------------------------------------------------------------
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (public.app_profile_role() = 'member' and id = auth.uid());

create policy profiles_select_staff on public.profiles
  for select to authenticated
  using (public.app_profile_role() in ('receptionist', 'owner'));

-- plans ---------------------------------------------------------------
create policy plans_select_member on public.plans
  for select to authenticated
  using (public.app_profile_role() = 'member' and is_active);

create policy plans_select_staff on public.plans
  for select to authenticated
  using (public.app_profile_role() in ('receptionist', 'owner'));

-- members -------------------------------------------------------------
create policy members_select_own on public.members
  for select to authenticated
  using (public.app_profile_role() = 'member' and auth_user_id = auth.uid());

create policy members_select_staff on public.members
  for select to authenticated
  using (public.app_profile_role() in ('receptionist', 'owner'));

-- membership_periods --------------------------------------------------
create policy periods_select_own on public.membership_periods
  for select to authenticated
  using (
    public.app_profile_role() = 'member'
    and member_id in (select m.id from public.members m where m.auth_user_id = auth.uid())
  );

create policy periods_select_staff on public.membership_periods
  for select to authenticated
  using (public.app_profile_role() in ('receptionist', 'owner'));

-- membership_period_voids ----------------------------------------------
create policy voids_select_own on public.membership_period_voids
  for select to authenticated
  using (
    public.app_profile_role() = 'member'
    and period_id in (
      select mp.id from public.membership_periods mp
      where mp.member_id in (select m.id from public.members m where m.auth_user_id = auth.uid())
    )
  );

create policy voids_select_staff on public.membership_period_voids
  for select to authenticated
  using (public.app_profile_role() in ('receptionist', 'owner'));

-- payments --------------------------------------------------------------
create policy payments_select_own on public.payments
  for select to authenticated
  using (
    public.app_profile_role() = 'member'
    and member_id in (select m.id from public.members m where m.auth_user_id = auth.uid())
  );

create policy payments_select_staff on public.payments
  for select to authenticated
  using (public.app_profile_role() in ('receptionist', 'owner'));

create policy payments_insert_receptionist on public.payments
  for insert to authenticated
  with check (public.app_profile_role() = 'receptionist');

-- attendance_events -----------------------------------------------------
create policy attendance_select_own on public.attendance_events
  for select to authenticated
  using (
    public.app_profile_role() = 'member'
    and member_id in (select m.id from public.members m where m.auth_user_id = auth.uid())
  );

create policy attendance_select_staff on public.attendance_events
  for select to authenticated
  using (public.app_profile_role() in ('receptionist', 'owner'));

-- membership_freezes ----------------------------------------------------
create policy freezes_select_own on public.membership_freezes
  for select to authenticated
  using (
    public.app_profile_role() = 'member'
    and member_id in (select m.id from public.members m where m.auth_user_id = auth.uid())
  );

create policy freezes_select_staff on public.membership_freezes
  for select to authenticated
  using (public.app_profile_role() in ('receptionist', 'owner'));

-- join_applications -----------------------------------------------------
create policy applications_select_own on public.join_applications
  for select to authenticated
  using (public.app_profile_role() = 'member' and auth_user_id = auth.uid());

create policy applications_select_staff on public.join_applications
  for select to authenticated
  using (public.app_profile_role() in ('receptionist', 'owner'));

-- follow_up_events ------------------------------------------------------
create policy followups_select_staff on public.follow_up_events
  for select to authenticated
  using (public.app_profile_role() in ('receptionist', 'owner'));

create policy followups_insert_staff on public.follow_up_events
  for insert to authenticated
  with check (
    public.app_profile_role() in ('receptionist', 'owner')
    and actor = auth.uid()
  );

-- qr_tokens -------------------------------------------------------------
-- NO policies: no direct client-role access of any kind (§8.1 "—" for all
-- client roles). service_role reaches it via BYPASSRLS + explicit grants.

-- audit_log_entries -------------------------------------------------------
create policy audit_select_owner on public.audit_log_entries
  for select to authenticated
  using (public.app_profile_role() = 'owner');

-- app_settings ------------------------------------------------------------
create policy settings_select_authenticated on public.app_settings
  for select to authenticated
  using (public.app_profile_role() is not null);

-- ---------------------------------------------------------------------
-- 5. Grants (least privilege; RLS does the row-level narrowing)
-- ---------------------------------------------------------------------

-- authenticated (member / receptionist / owner JWTs — RLS narrows rows).
-- audit_log_entries is granted at TABLE level only so the Owner policy can
-- ever return rows; the row-level policy is the sole access gate (owner).
grant select on
  public.profiles, public.plans, public.members,
  public.membership_periods, public.membership_period_voids,
  public.payments, public.attendance_events, public.membership_freezes,
  public.join_applications, public.follow_up_events, public.app_settings,
  public.audit_log_entries
  to authenticated;

-- receptionist records payments directly (override trigger above);
-- staff add follow-ups directly. Nothing else is writable by clients.
grant insert on public.payments, public.follow_up_events to authenticated;

-- service_role: server-only key, BYPASSRLS. SELECT everywhere; writes
-- ONLY where the design names a service/hook path:
--   profiles            — signup mirror / service-only role changes
--   join_applications   — auth-hook creation path (unresolved #7)
--   audit_log_entries   — "service: insert" (§8.1)
--   qr_tokens           — "service: full" (§8.1): mint + purge
grant select on all tables in schema public to service_role;
grant insert on
  public.profiles, public.join_applications,
  public.audit_log_entries, public.qr_tokens
  to service_role;
grant update on public.profiles, public.qr_tokens to service_role;
grant delete on public.qr_tokens to service_role;

-- anon: NOTHING. No table privilege of any kind.

-- helper EXECUTE lockdown
revoke execute on function public.app_profile_role()
  from public, anon, service_role;
grant execute on function public.app_profile_role() to authenticated;

-- ---------------------------------------------------------------------
-- 6. Triggers
-- ---------------------------------------------------------------------

-- updated_at maintenance (tables that carry the column)
create trigger trg_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger trg_updated_at before update on public.plans
  for each row execute function public.set_updated_at();
create trigger trg_updated_at before update on public.members
  for each row execute function public.set_updated_at();
create trigger trg_updated_at before update on public.app_settings
  for each row execute function public.set_updated_at();

-- client-mutation guard on ALL 13 tables (backstop for the revocations;
-- service_role and postgres pass, governed by grants instead)
create trigger trg_client_guard before update or delete on public.profiles
  for each row execute function public.assert_no_client_mutation();
create trigger trg_client_guard before update or delete on public.plans
  for each row execute function public.assert_no_client_mutation();
create trigger trg_client_guard before update or delete on public.members
  for each row execute function public.assert_no_client_mutation();
create trigger trg_client_guard before update or delete on public.payments
  for each row execute function public.assert_no_client_mutation();
create trigger trg_client_guard before update or delete on public.membership_periods
  for each row execute function public.assert_no_client_mutation();
create trigger trg_client_guard before update or delete on public.membership_period_voids
  for each row execute function public.assert_no_client_mutation();
create trigger trg_client_guard before update or delete on public.attendance_events
  for each row execute function public.assert_no_client_mutation();
create trigger trg_client_guard before update or delete on public.membership_freezes
  for each row execute function public.assert_no_client_mutation();
create trigger trg_client_guard before update or delete on public.qr_tokens
  for each row execute function public.assert_no_client_mutation();
create trigger trg_client_guard before update or delete on public.join_applications
  for each row execute function public.assert_no_client_mutation();
create trigger trg_client_guard before update or delete on public.follow_up_events
  for each row execute function public.assert_no_client_mutation();
create trigger trg_client_guard before update or delete on public.audit_log_entries
  for each row execute function public.assert_no_client_mutation();
create trigger trg_client_guard before update or delete on public.app_settings
  for each row execute function public.assert_no_client_mutation();

-- profiles.role immutability (backstop; grants already deny client UPDATE)
create trigger trg_role_guard before update on public.profiles
  for each row execute function public.profiles_role_guard();

-- payments BEFORE INSERT server override (design §5.2 / §11)
create trigger trg_payments_insert_override before insert on public.payments
  for each row execute function public.payments_insert_override();

commit;
