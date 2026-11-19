# Phase 4 — Integration Plan (Corrected)

**Objective:** Map the existing React Native Expo app screens and role-based workspaces to the verified Supabase backend surface defined in migrations `0001_core_schema.sql` – `0004_views.sql`. Identify genuine missing APIs, frontend integration gaps, authentication requirements and residual risks.

**Status:** Planning only. No application code, migrations or remote Supabase resources are modified. No Git operations.

**Correction notice:** This revision supersedes the first draft. Every permission, RPC name, view name and business rule below is verified directly against `0001`–`0004`. The first draft inferred permissions from screen names; that inference was wrong in several places and is corrected here.

---

## 1. Verified Backend Inventory (from migrations 0001–0004)

### 1.1 Authority functions — exact signatures and in-function gates

All are `SECURITY DEFINER`, `search_path = 'public'`, and gate internally with `require_role(...)`. Client `EXECUTE` is granted to `authenticated` only; `anon`/`PUBLIC`/`service_role` are revoked. Role resolution is via `app_profile_role()`, which reads `profiles.role` for `auth.uid()` — **JWT role claims are never trusted**.

| # | Function (exact signature) | Allowed role (from `require_role`) | AAL2 | Self-action ban |
|---|---------------------------|-----------------------------------|------|-----------------|
| 4.1 | `verify_payment(p_payment_id uuid)` | `receptionist` | **yes** | cannot verify a payment they recorded |
| 4.2 | `reject_payment(p_payment_id uuid)` | `receptionist` | no | cannot reject a payment they recorded |
| 4.3 | `create_reversal(p_original_payment_id uuid, p_amount numeric, p_note text)` | `receptionist` | **yes** | cannot reverse a payment they recorded **or** verified |
| 4.4 | `request_freeze(p_member_id uuid, p_start_date date, p_end_date date, p_reason text)` | `receptionist` | no | — |
| 4.5 | `decide_freeze(p_freeze_id uuid, p_approve boolean)` | `receptionist` | **yes** | — (owner explicitly refused) |
| 4.6 | `end_freeze(p_freeze_id uuid)` | `receptionist` | no | — |
| 4.7 | `check_in(p_token text, p_door text)` | `member` | no | member resolved by `members.auth_user_id = auth.uid()` |
| 4.8 | `mint_attendance_token(p_validity_seconds integer)` | `receptionist` | **yes** | — |
| 4.9 | `set_member_discount(p_member_id uuid, p_discount_pct numeric)` | `receptionist` | no | — |
| 4.10 | `request_plan_assignment(p_member_id uuid, p_plan_id uuid)` | `receptionist` | no | — |
| 4.11 | `update_plan_price(p_plan_id uuid, p_price numeric)` | `owner` | no | — |
| 4.12 | `decide_application(p_application_id uuid, p_approve boolean)` | `receptionist` | no | — |
| 4.13 | `update_gym_settings(p_gym_timezone text, p_upi_id text, p_upi_qr_path text, p_attendance_token_validity_seconds integer)` | `owner` | no | — |

**Payment recording** is deliberately **not** an RPC. It is a direct `INSERT` into `payments` by a `receptionist` (RLS policy `payments_insert_receptionist`), with the `trg_payments_insert_override` trigger forcing server-authoritative money, `state = 'awaitingVerification'`, `recorded_by = auth.uid()`, and emitting a `payment.created` audit row.

**Internal helpers with no client EXECUTE:** `app_gym_date()`, `require_role(text[])`, `assert_aal2()`, `audit_authority(...)`, `payments_reversal_cap_trigger()`.

### 1.2 Views (all `security_invoker = true`, `GRANT SELECT TO authenticated`, revoked from `anon`/`PUBLIC`)

| View | Row filtering |
|------|---------------|
| `v_member_status` | No in-view role gate. Underlying `members`/`periods`/`voids`/`freezes` RLS applies: a member sees only their own row (`members.auth_user_id = auth.uid()`); receptionist and owner see all. |
| `v_inactive_members` | Same `security_invoker` model — member sees own row only; staff see all. |
| `v_daily_report` | In-view gate: `WHERE app_profile_role() IN ('owner','receptionist')`. Members see zero rows. |
| `v_month_revenue` | In-view gate: `WHERE app_profile_role() IN ('owner','receptionist')`. Members see zero rows. |

`v_member_status` exposes `stored_membership_end`, derived `effective_expiry` (stored end + union-deduplicated frozen days), `status` (`frozen`/`active`/`expiring`/`expired`), `days_remaining`, `is_frozen`, `active_freeze_count`.

### 1.3 Tables and client privileges

- `SELECT` granted to `authenticated` on: `profiles, plans, members, membership_periods, membership_period_voids, payments, attendance_events, membership_freezes, join_applications, follow_up_events, app_settings, audit_log_entries` (RLS narrows rows).
- `INSERT` granted to `authenticated` on **only** `payments` and `follow_up_events`.
- No table `UPDATE`/`DELETE` for `authenticated`; `trg_client_guard` (`assert_no_client_mutation`) blocks them at the row level on all 13 tables regardless of grants.
- `audit_log_entries` SELECT policy is **owner-only**.
- `anon`: **no privilege of any kind**.

---

## 2. Corrected Role Matrix

| Action | Receptionist | Owner | Member |
|--------|:-----------:|:-----:|:------:|
| Record a payment (`INSERT payments`) | **write** | read-only | — |
| `verify_payment` | **write** (+AAL2, not own record) | read-only | — |
| `reject_payment` | **write** (not own record) | read-only | — |
| `create_reversal` | **write** (+AAL2, not own record/verify) | read-only | — |
| `request_freeze` | **write** | read-only | — |
| `decide_freeze` (approve/reject) | **write** (+AAL2) | **refused** | — |
| `end_freeze` | **write** | read-only | — |
| `set_member_discount` | **write** | read-only | — |
| `request_plan_assignment` | **write** | read-only | — |
| `mint_attendance_token` | **write** (+AAL2) | — | — |
| `update_plan_price` | refused | **write** | — |
| `update_gym_settings` | refused | **write** | — |
| `decide_application` | **write** | read-only | — |
| `check_in` | — | — | **write** (own record only) |
| Read freeze records | all rows | all rows (read-only) | own rows |
| Read payment records | all rows | all rows (read-only) | own rows |
| Read attendance | all rows | all rows | own rows |
| Read revenue/attendance reports | yes (`v_daily_report`, `v_month_revenue`) | yes | no rows |
| Read audit log | no | **yes** | no |

**Direct correction of the prior draft:** freeze approval is a **receptionist** action, not an owner action; the owner has **read-only** access to freeze and payment records (plus write access only on plan prices and gym settings); payment verification and reversal initiation are **receptionist** actions.

---

## 3. Screen → Backend Mapping (corrected)

| Screen | Role | Verified backend surface |
|--------|------|--------------------------|
| `(auth)/login.tsx` | all | No backend RPC. Role selection is a UI expectation only; the provider validates the immutable account role. |
| `(auth)/join.tsx` | member (self) | **No submit RPC exists.** Application creation is service/hook-side (`join_applications` INSERT granted to `service_role` only). `decide_application` is the staff decision path. |
| `(auth)/verify.tsx`, `(auth)/mfa.tsx` | member / staff | No RPC. Provider-side challenges; staff must reach AAL2 before AAL2-gated writes succeed. |
| `(auth)/success.tsx` | all | No RPC. Routes on `session.role`. |
| `(member)/attendance.tsx` | member | `check_in(p_token, p_door)`; read `v_member_status` (own row); read own `attendance_events`. |
| `(reception)/home.tsx` | receptionist | `v_daily_report` (gross/net/attendance/unique/new/renewals); `v_month_revenue` for comparison; `payments` SELECT. |
| `(reception)/fees.tsx` | receptionist | Direct `INSERT payments` (override trigger computes `original_price`/`payable`/`discount_amount` and forces `awaitingVerification`). Verification is a **separate** `verify_payment` call by a different receptionist. |
| `(reception)/renewals.tsx` | receptionist | `v_member_status` (status/`effective_expiry`/`days_remaining`). Renewal = normal payment + `verify_payment` (**R14**, see §4). |
| `(reception)/freeze.tsx` | receptionist | `request_freeze`; `decide_freeze` (approve/reject, AAL2); `end_freeze`; `membership_freezes` SELECT. |
| `(reception)/door-qr.tsx` | receptionist | `mint_attendance_token` (AAL2) → display plaintext token once, rotate before expiry (server-bound 5–600 s, default 60 s). |
| `(reception)/payment-qr.tsx` | receptionist | **Permission mismatch:** UPI config lives in `app_settings`, and the only write path (`update_gym_settings`) is **owner-only**. See §7. |
| `(reception)/transaction-history.tsx` | receptionist | `payments` SELECT (all rows); reversals appear as `entry_type = 'reversal'` rows. `create_reversal` has no UI yet. |
| `(reception)/member-profile.tsx` | receptionist | `v_member_status`; `payments`/`attendance_events` SELECT. **Contact edit has no write path** (see §7). |
| `(reception)/plans.tsx` | receptionist | `plans` SELECT; `request_plan_assignment`. **Permission mismatch:** `update_plan_price` is owner-only (see §7). |
| `(reception)/members.tsx` | receptionist | `v_member_status`; `attendance_events` SELECT. |
| `(reception)/attendance.tsx` | receptionist | `attendance_events` SELECT (all rows). |
| `(owner)/dashboard.tsx` | owner | `v_month_revenue`; `v_daily_report`; `payments` SELECT (read-only); `membership_freezes` SELECT (read-only). |
| `(owner)/lost.tsx` | owner | `v_inactive_members` (`inactive_days`, `is_inactive` — 30-day rule with frozen-day exclusion); `follow_up_events` SELECT + direct INSERT (with `actor = auth.uid()`). |

---

## 4. Renewals — handled by `verify_payment` (R14). No new logic.

`verify_payment` already implements renewal extension. Verified behaviour:

1. Lock order: payment row → member row.
2. Same-plan renewal **before or on** the freeze-adjusted derived expiry (R14 `after_expiry`):
   - `v_derived_expiry = members.membership_end + cumulative actual frozen days`
   - `v_start = v_derived_expiry + 1`
   - `v_end = last_period.start_date + (era_months + plan_months)` (anchored calendar-month arithmetic — never repeated +1-month from a clamped end).
3. First payment, plan switch, or post-expiry renewal: `v_start = app_gym_date()`, `v_end = start + plan_months`; no retroactivity.
4. Writes one `membership_periods` row per verified payment, sets `members.membership_end = v_end`, and applies any pending plan assignment atomically first.
5. Refuses renewal while a freeze is active for today; refuses inactive plans; refuses plan/member inconsistency.

**Therefore:** there is no separate "renewal extend" RPC and none is required. Do not add duplicate renewal logic.

---

## 5. Audit Attribution — already implemented (not a gap)

Audit rows exist for every authority-bearing write:

| Source | Action emitted |
|--------|----------------|
| `payments_insert_override` trigger (direct INSERT) | `payment.created` |
| `verify_payment` | `payment.verified`, plus `plan.assignment_applied` when a pending assignment is applied |
| `reject_payment` | `payment.rejected` |
| `create_reversal` | `payment.reversed` |
| `request_freeze` | `freeze.requested` |
| `decide_freeze` | `freeze.approved` / `freeze.rejected` |
| `end_freeze` | `freeze.ended` |
| `check_in` (frozen-scan auto-unfreeze only) | `freeze.ended_scan` |
| `mint_attendance_token` | `token.minted` |
| `set_member_discount` | `discount.set` |
| `request_plan_assignment` | `plan.assignment_requested` |
| `update_plan_price` | `plan.price_changed` |
| `decide_application` | `application.decided` |
| `update_gym_settings` | `settings.changed` |

`audit_authority()` resolves `actor` and `actor_role` from `auth.uid()` + the authoritative `profiles.role`. Excluded **by design**: attendance inserts and token expiry/purge. Audit rows are readable by the **owner only** (RLS policy `audit_select_owner`).

**Therefore:** do not plan an "audit attribution" feature — it already exists. Any future RPC must keep calling `audit_authority()`.

---

## 6. Authentication Requirements (corrected — no anonymous path)

1. **Authenticated sessions only.** Production check-in requires a signed-in **member** session: `check_in` calls `require_role(array['member'])` and resolves the member via `members.auth_user_id = auth.uid()`. An unlinked account is refused with `42501`. There is no anonymous check-in and none is to be added.
2. **Authoritative role source.** `require_role` and `app_profile_role()` read `profiles.role` for `auth.uid()`. JWT role claims are explicitly not trusted. A missing profile resolves to `NULL` → default deny.
3. **AAL2 exactly where required:** `verify_payment`, `create_reversal`, `decide_freeze`, `mint_attendance_token`. Not required for `reject_payment`, `request_freeze`, `end_freeze`, `set_member_discount`, `request_plan_assignment`, `decide_application`.
4. **Staff MFA path:** `mfa.tsx` must reach AAL2 before any AAL2-gated call; the demo provider already models challenges/expiry/attempt caps.
5. **Segregation of duties (operational constraint):** the recording receptionist cannot verify or reject their own payment, and cannot reverse a payment they recorded or verified. In a one-receptionist gym no one can verify a payment, because `verify_payment` refuses owners. This is an existing business rule, not a defect to change here — flag it as an operational dependency.
6. **Workspace gating** remains UI-side (`useWorkspaceGuard`): the session role decides the workspace; the login role picker is an expectation only. `previewRole` is demo-only and cleared on sign-out.

---

## 7. Genuine Remaining Integration Gaps

These are real gaps after verification. They are **not** rule changes and **not** requests to alter migrations.

### 7.1 Missing write paths (no RPC and no table grant)

| Gap | Detail |
|-----|--------|
| **Member contact edits** | `member-profile.tsx` stages contact edits via `updateSessionMember`. `members` has no `UPDATE` grant for `authenticated`, and `trg_client_guard` blocks direct updates. No RPC exists. The UI's "contact edit" cannot persist. |
| **Plan creation / deactivation** | `plans.tsx` states plan creation is owner-only, but `plans` has no `INSERT`/`UPDATE` grant and no RPC exists to create or deactivate (`is_active`) a plan. |
| **Join application submission** | `join.tsx` registers into the demo provider only. `join_applications` INSERT is granted to `service_role` only (auth-hook path, unresolved in 0001 comments). There is no client-facing submit RPC; only `decide_application` exists for staff. |

Profile provisioning is **no longer a gap**: Stage 1 added
`provision_member_profile()` (`0005`) and the live provider calls it on member
sign-up / first sign-in (see `docs/PHASE_4_STAGE_1_BACKEND_READINESS_REPORT.md`).

### 7.2 UI/backend permission mismatches to resolve in UI (no DB change)

| Mismatch | Verified fact |
|----------|---------------|
| Receptionist plan price editing (`plans.tsx`) | `update_plan_price` allows `owner` only. The receptionist screen must present it read-only, or the action must be owner-only. |
| Receptionist UPI/QR configuration (`payment-qr.tsx`) | `app_settings` is written only by `update_gym_settings`, which allows `owner` only. Receptionist editing must become owner-only or read-only. |
| Owner freeze approval expectation | `decide_freeze` refuses `owner`. Any approve/reject control belongs on the receptionist freeze screen. The owner sees read-only freeze records. |

### 7.3 Missing frontend wiring

| Screen | Required wiring |
|--------|-----------------|
| `(member)/attendance.tsx` | Call `check_in(token, door)` after scanning; surface `verified`/`frozen`/`pendingPayment` outcomes; render own `v_member_status.status` and `effective_expiry`; show replay refusal. |
| `(reception)/door-qr.tsx` | Call `mint_attendance_token()`; display the plaintext token once; rotate before expiry (server-bounded 5–600 s; default 60 s from `app_settings`). |
| `(reception)/fees.tsx` | Direct `INSERT payments` on record; then a **separate** `verify_payment(payment_id)` by a different receptionist; reflect `awaitingVerification` vs `verified`. |
| `(reception)/freeze.tsx` | `request_freeze`, plus `decide_freeze(approve/reject)` (AAL2) and `end_freeze`; list `membership_freezes` states. |
| `(reception)/transaction-history.tsx` | Read `payments` (payments + reversal rows); add a reversal action calling `create_reversal` (AAL2). No reversal UI exists today. |
| `(reception)/plans.tsx` | Replace local `assignments` state with `request_plan_assignment`. |
| `(owner)/dashboard.tsx` | Subscribe to `v_month_revenue` and `v_daily_report`; replace demo trends. |
| `(owner)/lost.tsx` | Read `v_inactive_members`; write follow-ups by inserting `follow_up_events` (`actor` forced to `auth.uid()` by RLS). |
| `(reception)/home.tsx`, `members.tsx`, `renewals.tsx`, `member-profile.tsx` | Subscribe to `v_member_status` / `v_daily_report`; replace `demoMembers` / `demoPayments` reads. |

### 7.4 Seed (resolved in Stage 1)

- `supabase/seed.sql` now initialises `app_settings(id = 1)` and the four plan
  rows; `[db.seed] sql_paths` applies it on `db reset`. All `0001`–`0007` suites
  pass on the seeded database. See
  `docs/PHASE_4_STAGE_1_BACKEND_READINESS_REPORT.md`.

### 7.5 Non-gaps (explicitly removed from the earlier draft)

- ❌ **Audit attribution** — already implemented (§5).
- ❌ **Renewal extension RPC** — `verify_payment` handles it with R14 (§4).
- ❌ **Anonymous check-in** — not permitted; authenticated member sessions required (§6).
- ❌ **Owner freeze approval** — `decide_freeze` is receptionist-only.
- ❌ **Owner payment verification/reversal** — owner is read-only on payment records.

---

## 8. Preserved Rules and Controls

- Freeze validity is **derived, never stored**: `decide_freeze` writes `state`/`decided_*`/`extension_days` only; `members.membership_end` stays payment-derived; pause math lives in `v_member_status` / `v_inactive_members`.
- Lock order: payment → member → freeze, except `decide_freeze`/`check_in` (member → freeze).
- Reversals are new rows (`entry_type = 'reversal'`); originals are never mutated; a deferred constraint trigger caps cumulative reversals at the original payable.
- Overlapping freeze windows are blocked by the GiST exclusion constraint `freezes_no_overlap` (23P01).
- Discount range 0–100; per-payment discount is entered at recording time; server computes money.
- No direct client `UPDATE`/`DELETE` on any table; `profiles.role` is immutable to clients.
- All existing UI, navigation, demo labelling and business rules remain unchanged in this phase.

---

## 9. Delivery Order (wiring only; no rule changes)

1. **Auth/session parity** — done in Stage 1: the live provider yields AAL2 for staff and a provisioned member profile for `check_in` (see `docs/PHASE_4_STAGE_1_BACKEND_READINESS_REPORT.md`).
2. **Read-only views** — wire `v_member_status`, `v_daily_report`, `v_month_revenue`, `v_inactive_members` to existing screens (no UI redesign).
3. **Receptionist writes** — `INSERT payments`, `verify_payment`, `reject_payment`, `request_freeze`, `decide_freeze`, `end_freeze`, `mint_attendance_token`, `request_plan_assignment`.
4. **Member write** — `check_in` after the door-QR scan.
5. **Owner writes** — `update_plan_price`, `update_gym_settings` (move the corresponding UI affordances accordingly), `create_reversal` UI on the receptionist side.
6. **Resolve §7 gaps** (contact edits, plan lifecycle, join submission) before enabling those screens against live data.

---

*End of corrected Phase 4 plan.*