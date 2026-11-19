-- =====================================================================
-- 0001_core_schema.sql
-- Phase 3B.1 — core schema for the Pulse Gym Supabase backend.
--
-- Authoritative source: gym-management-app/docs/PHASE_3A_FINAL_DESIGN.md
-- (13-table design; owner decisions O-01..O-36 and C1).
--
-- Scope of THIS migration only:
--   extensions, tables, constraints, indexes, comments.
--   RLS + policies + immutability triggers  -> 0002_rls_and_triggers
--   security-definer authority functions    -> 0003_functions
--   reporting/status views                  -> 0004_views
--   seed data                               -> 0005_seed
--
-- Design rules encoded structurally here:
--   * append-only financial history: payments state has no "reversed"
--     value — reversals are NEW positive-amount rows (entry_type='reversal');
--   * a reversal can ONLY reference an original payment row — composite
--     FK on (reversal_of, reversal_target_type='payment') makes reversal-
--     to-reversal chains impossible at the storage layer;
--   * no in-place mutation of membership period history: full reversals
--     insert append-only rows into membership_period_voids;
--   * money is numeric(12,2) INR, whole rupees; payable must equal
--     round(original_price × (1 − discount_pct/100), 0) — the approved
--     rounding rule — and payable >= 0 (100% discount representable);
--   * attendance rows are successful scans ONLY (O-35: failed scans are
--     never stored; O-10: a scan during a freeze auto-ends the freeze and
--     records verified attendance — no 'failed'/'frozen' status exists);
--   * freeze windows are inclusive dateranges; pending/approved windows
--     of one member can never overlap (storage-level exclusion);
--   * freeze pause arithmetic is DERIVED from freeze rows in the 0004
--     views: decide_freeze does NOT advance membership_end (an approved
--     future-dated window only starts extending validity once it begins,
--     per owner instruction at 3B.1);
--   * QR tokens store SHA-256 hashes only, never plaintext;
--   * every domain FK is RESTRICT (archive/deactivate, never cascade);
--   * the only cascades are auth.users -> profiles / join_applications.
--
-- Deferred to 0002/0003 (not schema-expressible):
--   * UPDATE/DELETE denial on append-only tables (grants/revokes, 0002);
--   * "cumulative reversals <= original payable" (row-level aggregate —
--     create_reversal + deferred constraint trigger, 0003);
--   * reversal_of must reference a VERIFIED payment (state check, 0003);
--   * role immutability, server-side money overrides on INSERT (0002/0003).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------
create extension if not exists pgcrypto;   -- gen_random_uuid(), digest()
create extension if not exists btree_gist; -- uuid equality in GiST (freeze overlap exclusion)

-- ---------------------------------------------------------------------
-- 1. profiles — 1:1 with auth.users; role immutability is enforced by a
--    trigger in 0002; role changes are service-only.
-- ---------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  role         text not null check (role in ('owner', 'receptionist', 'member')),
  phone        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.profiles is
  'Mirror of auth.users (1:1). Role is changed only by service_role (trigger in 0002).';

create index profiles_role_idx on public.profiles (role);

-- ---------------------------------------------------------------------
-- 2. plans — single source of plan data (matches plans.tsx: no duplicate
--    plan tables). Calendar-month validity per O-01; prices are
--    deactivated (is_active), never deleted.
-- ---------------------------------------------------------------------
create table public.plans (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  duration   text not null check (duration in ('monthly', 'quarterly', 'halfYearly', 'yearly')),
  price      numeric(12,2) not null check (price > 0),
  currency   char(3) not null default 'INR' check (currency = 'INR'),
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.plans.duration is
  'Validity unit: monthly/quarterly/halfYearly/yearly calendar months (O-01).';

-- ---------------------------------------------------------------------
-- 3. members — person + subscription state. price_locked is nullable
--    until the first verified payment (FINAL_DESIGN §3). discount_pct is
--    a SUGGESTION the receptionist may apply per payment (O-14), not an
--    automatic rule. Pending plan assignment is a pair of columns, never
--    applied by clients (applied by verify_payment in 0003).
-- ---------------------------------------------------------------------
create table public.members (
  id                        uuid primary key default gen_random_uuid(),
  full_name                 text not null,
  phone                     text not null,
  email                     text,
  plan_id                   uuid references public.plans (id) on delete restrict,
  price_locked              numeric(12,2) check (price_locked is null or price_locked > 0),
  discount_pct              numeric(5,2) not null default 0
                            check (discount_pct between 0 and 100),
  membership_end            date,
  joined_on                 date not null default current_date,
  pending_plan_id           uuid references public.plans (id) on delete restrict,
  pending_plan_requested_by uuid references public.profiles (id) on delete restrict,
  archived_at               timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  constraint pending_plan_pairing
    check ((pending_plan_id is null) = (pending_plan_requested_by is null))
);

comment on column public.members.price_locked is
  'Locked subscription price; NULL until the first verified payment sets it (0003).';
comment on column public.members.discount_pct is
  'Saved discount is a suggestion only (O-14); per-payment discounts are entered at recording time.';
comment on column public.members.membership_end is
  'Payment-derived validity end, maintained only by authority functions (0003) under a member-row lock; freeze pause adjustments are derived from membership_freezes in the 0004 views, never stored here.';

create index members_plan_idx on public.members (plan_id);
create index members_end_idx on public.members (membership_end);

-- ---------------------------------------------------------------------
-- 4. payments — append-only. Original payments and reversals live in the
--    same table; a reversal is a NEW row with a positive payable and
--    reversal_of pointing at the original verified payment (O-19..O-22).
--    There is deliberately NO "reversed" state: the original row is never
--    mutated; net revenue = payments − reversals (O-25).
-- ---------------------------------------------------------------------
create table public.payments (
  id              uuid primary key default gen_random_uuid(),
  member_id       uuid not null references public.members (id) on delete restrict,
  plan_id         uuid not null references public.plans (id) on delete restrict,
  entry_type      text not null check (entry_type in ('payment', 'reversal')),
  original_price  numeric(12,2) not null check (original_price > 0),
  discount_pct    numeric(5,2) not null default 0 check (discount_pct between 0 and 100),
  discount_amount numeric(12,2) not null default 0 check (discount_amount >= 0),
  payable         numeric(12,2) not null check (payable >= 0),
  currency        char(3) not null default 'INR' check (currency = 'INR'),
  method          text not null check (method in ('upi', 'cash')),
  utr             text unique,
  state           text not null check (state in ('awaitingVerification', 'verified', 'rejected')),
  recorded_by     uuid not null references public.profiles (id) on delete restrict,
  verified_by     uuid references public.profiles (id) on delete restrict,
  recorded_at     timestamptz not null default now(),
  verified_at     timestamptz,
  reversal_of     uuid,
  reversal_target_type text generated always as ('payment') stored,
  receipt_issued  boolean not null default false,
  receipt_path    text,
  note            text,
  created_at      timestamptz not null default now(),

  -- a payment row never references anything; a reversal row always does
  constraint reversal_pairing check (
    (entry_type = 'payment'  and reversal_of is null) or
    (entry_type = 'reversal' and reversal_of is not null)
  ),
  -- structurally impossible for a reversal to reference another reversal:
  -- the composite FK matches (id, entry_type) and the marker pins 'payment'
  constraint payments_id_entry_uq unique (id, entry_type),
  constraint reversal_targets_payment
    foreign key (reversal_of, reversal_target_type)
    references public.payments (id, entry_type) on delete restrict,
  -- approved whole-rupee rounding rule (computePayable):
  -- payable = round(original_price × (1 − discount_pct/100), 0)
  constraint payable_rounding
    check (payable = round(original_price * (1 - discount_pct / 100.0), 0)),
  -- O-16: stored discount amount is exact — original price minus final price
  constraint discount_amount_exact check (discount_amount = original_price - payable),
  -- an undecided row has no verifier and no verification timestamp
  constraint undecided_has_no_verifier
    check ((state = 'awaitingVerification') = (verified_by is null)),
  constraint undecided_has_no_verify_time
    check ((state = 'awaitingVerification') = (verified_at is null)),
  -- desk UPI entries require the reference number (fees.tsx behavior)
  -- O-16: UPI PAYMENTS require a UTR. Reversal rows are correction records
  -- (design §5): they can never reuse the original's UTR (unique) and must
  -- not invent one, so the requirement applies to entry_type='payment' only.
  constraint upi_requires_utr
    check (entry_type = 'reversal' or method <> 'upi' or utr is not null)
);

comment on column public.payments.payable is
  'Final whole-rupee amount per computePayable rounding; >= 0 so a 100% discount (free membership) is representable (O-13).';
comment on column public.payments.reversal_of is
  'Set only on reversal rows; composite FK with reversal_target_type makes reversal-to-reversal chains impossible (verified-target check deferred to 0003).';

create index payments_member_recorded_idx on public.payments (member_id, recorded_at desc);
create index payments_reversal_of_idx on public.payments (reversal_of);
create index payments_state_idx on public.payments (state);
create index payments_recorded_at_idx on public.payments (recorded_at);

-- ---------------------------------------------------------------------
-- 5. membership_periods — append-only coverage history. One period per
--    verified payment. end_date is computed AT CREATION by verify_payment
--    (anchored calendar-month arithmetic, FINAL_DESIGN §4.1) and is never
--    recomputed afterwards.
-- ---------------------------------------------------------------------
create table public.membership_periods (
  id                 uuid primary key default gen_random_uuid(),
  member_id          uuid not null references public.members (id) on delete restrict,
  plan_id            uuid not null references public.plans (id) on delete restrict,
  start_date         date not null,
  end_date           date not null,
  price_applied      numeric(12,2) not null check (price_applied > 0),
  created_by_payment uuid not null references public.payments (id) on delete restrict,
  created_at         timestamptz not null default now(),
  constraint period_ordering check (end_date >= start_date),
  constraint one_period_per_payment unique (created_by_payment)
);

comment on table public.membership_periods is
  'Append-only. Full reversals do NOT mutate these rows; they insert membership_period_voids rows (O-23).';

create index periods_member_start_idx on public.membership_periods (member_id, start_date desc);

-- ---------------------------------------------------------------------
-- 6. membership_period_voids — append-only invalidation events (the
--    approved resolution of the in-place voided_at conflict). A period
--    can be voided exactly once, by exactly one full reversal.
-- ---------------------------------------------------------------------
create table public.membership_period_voids (
  id          uuid primary key default gen_random_uuid(),
  period_id   uuid not null unique references public.membership_periods (id) on delete restrict,
  reversal_id uuid not null unique references public.payments (id) on delete restrict,
  voided_by   uuid not null references public.profiles (id) on delete restrict,
  created_at  timestamptz not null default now()
);

comment on table public.membership_period_voids is
  'Append-only. Inserted only by create_reversal (0003) for a FULL reversal of the payment that created the period.';

create index period_voids_reversal_idx on public.membership_period_voids (reversal_id);

-- ---------------------------------------------------------------------
-- 7. qr_tokens — attendance-only, server-minted, hash-only storage.
--    Plaintext is returned transiently by mint_attendance_token (0003)
--    and never persisted. Per-member-per-token replay protection is the
--    unique (member_id, token_id) index on attendance_events — a token is
--    shareable across members within its validity window (multiple
--    check-ins/day per O-29), but each member consumes a token once.
-- ---------------------------------------------------------------------
create table public.qr_tokens (
  id         uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  purpose    text not null default 'attendance' check (purpose = 'attendance'),
  expires_at timestamptz not null,
  minted_by  uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint token_expiry_positive check (expires_at > created_at)
);

create index qr_tokens_expiry_idx on public.qr_tokens (expires_at);

-- ---------------------------------------------------------------------
-- 8. attendance_events — one row per successful scan (O-29; repeats
--    included). Status is VERIFIED-ONLY at the storage layer: failed QR
--    scans are never stored as attendance (O-35), and a scan during a
--    freeze auto-ends the freeze and records ordinary verified attendance
--    (O-10) — so no 'failed'/'frozen' status value exists server-side.
--    The demo domain's 'failed'/'frozen' statuses are client-display
--    concepts only; the enforced rule is stricter and simpler.
-- ---------------------------------------------------------------------
create table public.attendance_events (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid not null references public.members (id) on delete restrict,
  token_id      uuid not null references public.qr_tokens (id) on delete restrict,
  door          text not null,
  status        text not null check (status = 'verified'),
  checked_in_at timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

comment on column public.attendance_events.status is
  'Verified-only (O-35, O-10): failed scans are not attendance records and are never stored; freeze termination is recorded on membership_freezes, not here.';
comment on column public.attendance_events.door is
  'Text location label; check-in only, no entry/exit tracking (O-31).';

create unique index attendance_member_token_uq
  on public.attendance_events (member_id, token_id);
create index attendance_member_time_idx
  on public.attendance_events (member_id, checked_in_at desc);
create index attendance_time_idx on public.attendance_events (checked_in_at);

-- ---------------------------------------------------------------------
-- 9. membership_freezes — receptionist records AND decides ([C1]/O-08);
--    Owner has no write path (0002/0003). Inclusive windows (O-02).
--    active_range is empty for rejected/ended rows so their dates can be
--    re-requested. Exclusion is storage-level: two live (pending/approved)
--    windows of one member can never overlap, under any concurrency.
--
--    Pause arithmetic is DERIVED (per owner instruction at 3B.1): an
--    approved window — including a future-dated one — does NOT advance
--    membership_end at approval time. The 0004 views extend validity by
--    extension_days only once the window has actually begun, subtract
--    unused days on early end (O-03), and contribute nothing while the
--    member is still frozen (validity is paused). decide_freeze writes
--    state/decided_*/extension_days only; membership_end stays purely
--    payment-derived. Arithmetically identical to the extend-then-rollback
--    model proven in FINAL_DESIGN §4.4, with the extension applied at
--    window START (derived) instead of at approval (stored).
-- ---------------------------------------------------------------------
create table public.membership_freezes (
  id             uuid primary key default gen_random_uuid(),
  member_id      uuid not null references public.members (id) on delete restrict,
  start_date     date not null,
  end_date       date not null,
  reason         text not null check (reason in ('Medical', 'Travel', 'Personal', 'Other')),
  state          text not null check (state in ('pending', 'approved', 'rejected', 'ended')),
  requested_by   uuid not null references public.profiles (id) on delete restrict,
  requested_at   timestamptz not null default now(),
  decided_by     uuid references public.profiles (id) on delete restrict,
  decided_at     timestamptz,
  extension_days integer check (extension_days is null or extension_days >= 1),
  ended_at       timestamptz,
  ended_via      text check (ended_via in ('receptionist', 'scan')),
  ended_by       uuid references public.profiles (id) on delete restrict,
  created_at     timestamptz not null default now(),

  constraint window_ordering check (end_date >= start_date),
  constraint pending_means_undecided check ((state = 'pending') = (decided_by is null)),
  constraint decided_pairing check ((decided_by is null) = (decided_at is null)),
  constraint approved_has_extension check (state <> 'approved' or extension_days is not null),
  constraint ended_has_end_time check (state <> 'ended' or ended_at is not null),
  constraint ended_via_only_when_ended check (ended_via is null or state = 'ended'),

  -- inclusive window [start_date, end_date] = daterange(start, end + 1);
  -- rejected/ended rows carry an EMPTY range so they never block.
  active_range daterange generated always as (
    case
      when state in ('pending', 'approved') then daterange(start_date, end_date + 1)
      else daterange(start_date, start_date)
    end
  ) stored,

  constraint freezes_no_overlap exclude using gist (
    member_id with =,
    active_range with &&
  )
);

comment on column public.membership_freezes.extension_days is
  'Approved inclusive frozen days (O-02): end_date − start_date + 1, written by decide_freeze (0003). Not applied to membership_end at approval — the 0004 views derive the pause (see table comment).';
comment on column public.membership_freezes.ended_via is
  'How an approved freeze ended early: receptionist action or the member''s gym-QR scan (O-10).';

create index freezes_member_idx on public.membership_freezes (member_id, start_date);
create index freezes_state_idx on public.membership_freezes (state);

-- ---------------------------------------------------------------------
-- 10. join_applications — public submissions; decided by a receptionist
--     (carried recommendation). auth_user_id links an approved applicant
--     to their auth account; deletion of the auth user cascades.
-- ---------------------------------------------------------------------
create table public.join_applications (
  id             uuid primary key default gen_random_uuid(),
  auth_user_id   uuid unique references auth.users (id) on delete cascade,
  full_name      text not null,
  phone          text not null,
  email          text,
  plan_id        uuid references public.plans (id) on delete restrict,
  state          text not null
                 check (state in ('draft', 'pendingVerification', 'submitted', 'approved', 'rejected')),
  phone_verified boolean not null default false,
  email_verified boolean not null default false,
  created_at     timestamptz not null default now(),
  decided_by     uuid references public.profiles (id) on delete restrict,
  decided_at     timestamptz
);

create index join_applications_state_idx on public.join_applications (state);

-- ---------------------------------------------------------------------
-- 11. follow_up_events — per-member follow-up history (the lost-list
--     screen's "tracked per member with the actor recorded").
-- ---------------------------------------------------------------------
create table public.follow_up_events (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references public.members (id) on delete restrict,
  actor      uuid not null references public.profiles (id) on delete restrict,
  channel    text not null check (channel in ('called', 'messaged', 'visited')),
  outcome    text not null check (outcome in ('won', 'lost', 'open')),
  note       text,
  created_at timestamptz not null default now()
);

create index follow_ups_member_idx on public.follow_up_events (member_id, created_at desc);

-- ---------------------------------------------------------------------
-- 12. audit_log_entries — append-only audit trail. Every authority-bearing
--     action emits a row (0002 triggers + 0003 functions). Attendance
--     inserts and token expiry/purge are excluded by design.
-- ---------------------------------------------------------------------
create table public.audit_log_entries (
  id         uuid primary key default gen_random_uuid(),
  actor      uuid references public.profiles (id) on delete restrict, -- null = system action
  actor_role text,
  action     text not null,
  table_name text not null,
  row_id     uuid,
  old_values jsonb,
  new_values jsonb,
  at         timestamptz not null default now()
);

create index audit_table_row_idx on public.audit_log_entries (table_name, row_id);
create index audit_actor_time_idx on public.audit_log_entries (actor, at desc);
create index audit_time_idx on public.audit_log_entries (at desc);

-- ---------------------------------------------------------------------
-- 13. app_settings — enforced singleton (one row, id = 1). Contains the
--     owner-configurable values; UPDATE happens only via
--     update_gym_settings (0003). Token validity default 60 s is the
--     documented safe assumption (FINAL_DESIGN §2.5).
-- ---------------------------------------------------------------------
create table public.app_settings (
  id                                integer primary key check (id = 1),
  gym_timezone                      text not null default 'Asia/Kolkata',
  upi_id                            text,
  upi_qr_path                       text, -- storage bucket path; bucket arrives in a later phase
  attendance_token_validity_seconds integer not null default 60
                                    check (attendance_token_validity_seconds between 5 and 600),
  updated_at                        timestamptz not null default now()
);

comment on table public.app_settings is
  'Singleton configuration row (id must be 1). Seeded by 0005_seed; owner-only update path (0003).';

commit;
