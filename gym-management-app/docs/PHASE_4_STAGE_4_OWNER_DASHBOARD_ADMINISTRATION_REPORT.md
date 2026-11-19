# Phase 4 — Stage 4: Owner Dashboard & Administrative Integration Report

**Scope:** Owner dashboard live data, lost-member follow-ups, owner permissions,
dashboard reliability, and Stage 4 verification/audit closure.
**Source plan:** `PHASE_4_IMPLEMENTATION_PLAN.md` (corrected).
**Backend under audit:** migrations `0001`–`0005` (+ `0006`, `0007` regression
suites), local Supabase stack (`supabase_db_GYM_Management`, PostgreSQL 17).

No migration, policy, grant, trigger, function, view or seed file was changed in
this stage. No remote Supabase project was contacted and no Git operation was
performed.

---

## 1. Stage 4 delivery status

| Plan requirement | Delivered in this stage | State |
|---|---|---|
| Owner dashboard: connect `v_daily_report` + `v_month_revenue` | Read hooks (`useDailyReport`, `useMonthlyRevenue`) already wired to the verified views in Stage 2; owner screens render real attendance/collections/reversals/net revenue; demo figures labelled and replaced in live mode. | Done |
| Lost members: connect `v_inactive_members`; follow-ups via `follow_up_events` | Live read via `v_inactive_members` (server-computed inactivity days); owner follow-up write connected through the authorised `follow_up_events` INSERT. | Done (write path completed this stage) |
| Owner permissions: read-only on payments/reversals/freezes/reports; owner update RPCs | Owner read-only enforced by server; owner write RPCs added (`update_plan_price`, `update_gym_settings`) and receptionist UI made read-only in live mode. | Done |
| Owner: cannot verify/reject payments, create reversals or approve/end freezes | Server-side `require_role` gates (receptionist-only for those RPCs); owner refused. | Done (verified) |
| Dashboard reliability: loading/error/empty/refresh; no fabricated data | Honest loading/error/empty/refresh states in the owner screens; live period-series charts omitted when no backend source exists (no invented points). | Done |

Stage 4 implementation delta (files changed in this closing pass):

| File | Change |
|---|---|
| `src/services/data/writes.ts` | Added owner write wrappers `updatePlanPrice` → `update_plan_price`, `updateGymSettings` → `update_gym_settings`, and `recordFollowUp` → authorised `follow_up_events` INSERT. |
| `src/services/data/index.ts` | Re-exported the new write functions and their types. |
| `src/app/(reception)/plans.tsx` | Live mode: plan price editing is demo-only (owner-only server path); permission note updated. |
| `src/app/(reception)/payment-qr.tsx` | Live mode: UPI/QR configuration controls are demo-only; live shows the “Live” badge and owner-configured caption; `StatusTone` corrected to a valid tone. |
| `src/app/(owner)/lost.tsx` | Follow-up recording wired to `recordFollowUp` (session actor, demo/live separation). |

## 2. Security audit — findings

### 2.1 `update_plan_price` — owner-only, validated

Verified against `0003_authority_functions.sql` §4.11 and regression suites:

- **Authorization:** in-function `require_role(array['owner'])` (SECURITY DEFINER,
  `search_path = 'public'`); client `EXECUTE` granted to `authenticated` only
  (revoked from `public`, `anon`, `service_role`). Receptionist and member calls
  fail with `42501 / Insufficient role`. No AAL2 gate on this path.
- **Validation:** `p_price` must be non-null and `> 0` (`55000 / Plan price must
  be positive`); unknown plan → `P0002`.
- **Audit:** emits `plan.price_changed` with old/new values via `audit_authority`.

### 2.2 `update_gym_settings` — owner-only, validated, singleton-scoped

Verified against `0003_authority_functions.sql` §4.13:

- **Authorization:** in-function `require_role(array['owner'])`; receptionist and
  member calls refused (`E03`, `P17`, security suite; `P03`-style checks). Client
  `EXECUTE` to `authenticated` only.
- **Isolation:** operates on the single `app_settings` row (`id = 1`) — the
  single-gym design (no gym dimension in the schema).
- **Validation:** unknown timezone → `55000 / Unknown time zone`; token validity
  outside 5–600 s → `55000 / Token validity must be between 5 and 600 seconds`;
  null parameters leave the current value untouched; change audited as
  `settings.changed`.

### 2.3 `follow_up_events` — staff INSERT only, actor enforced

Verified against `0001` §11, `0002` RLS (§followups_*) and regression suites:

- **Grants:** `INSERT` on `follow_up_events` granted to `authenticated` (alongside
  `payments`); `SELECT` staff-only.
- **RLS insert policy:** `followups_insert_staff` — staff role required and
  `actor = auth.uid()`; `anon`/`member` inserts refused.
- **Client write path:** the app inserts with the acting user's id as `actor`;
  the server-side RLS `WITH CHECK` enforces `actor = auth.uid()`, so identity is
  never client-claimed arbitrarily. `created_at` defaults server-side.
- **Constraints:** `channel`/`outcome` CHECKs; `member_id` → `members`
  (`on delete restrict`); client `UPDATE`/`DELETE` blocked by grant + guard
  trigger (append-only design; corrections are new rows).

### 2.4 Receptionist UI restrictions — server agreement

- Receptionist plan-price editing and UPI/QR configuration are now demo-only in
  live mode, matching the owner-only server paths (`update_plan_price`,
  `update_gym_settings`). The server still refuses any non-owner attempt
  regardless of UI state (verified by negative checks).

### 2.5 Owner write restrictions — no owner write paths added

- Owner is refused on receptionist-only authority functions
  (`verify_payment`, `reject_payment`, `create_reversal`, `decide_freeze`,
  `end_freeze`, `mint_attendance_token` for staff actions). Owner-only write
  wrappers were added for plan price and gym settings only.

### 2.6 Residual / unverified items (reported honestly, not blockers)

1. `update_plan_price` has no explicit upper bound beyond the `numeric(12,2)`
   storage precision; only positivity is enforced by function and constraint.
2. `update_gym_settings` is scoped to the single `app_settings` row (single-gym
   design assumption; no gym dimension exists yet).
3. `follow_up_events` is member-scoped via FK to `members` with no explicit gym
   dimension; multi-gym isolation is a future schema concern.
4. Owner write RPCs (`update_plan_price`, `update_gym_settings`) do not invoke
   `assert_aal2()`; the AAL2 posture is owner-exempt by design decision — this was
   not altered.
5. Live period-series trend charts remain omitted (no backend source) — explicitly
   not fabricated.

## 3. Verification results

| Check | Result |
|---|---|
| `npx tsc --noEmit` | pass |
| `npx expo lint` | pass (0 errors, 0 warnings) |
| `npx jest --silent` | 10 suites / 90 tests passed |
| `node scripts/frontend-role-visibility-check.mjs` | 32 of 32 checks passed, 0 failure(s); fixtures removed |
| `node scripts/backend-readiness-check.mjs` | 52 of 52 checks passed, 0 failure(s) |
| DB regression suites (`supabase db reset` + suites 0001–0007) | 691 assertions total, all passing (incl. Stage-4-relevant checks: P01/P02/P04, P15–P19, P03/P17, E02/E03, R08, owner-refusal matrix) |

Stage-4-relevant database assertions confirmed:

- Owner updates plan price (P01) and it persists + audits old→new (P02).
- Zero plan price refused (P04). Receptionist refused (P03); member refused (R08).
- Owner updates gym settings (P15) and persists/audits (P16); unknown timezone
  refused (P18); token validity 700 refused (P19); receptionist refused (P17).
- Receptionist owner-only surfaces refused (E02/E03); owner refused receptionist
  write RPCs (F matrix).

## 4. Files added / changed (this stage)

Added: `docs/PHASE_4_STAGE_4_OWNER_DASHBOARD_ADMINISTRATION_REPORT.md` (this
report).
Changed: `src/services/data/{writes,index}.ts`, `src/app/(reception)/{plans,payment-qr}.tsx`,
`src/app/(owner)/lost.tsx`.

## 5. Status and next step

- Stage 4 implementation, security audit and verification are **complete**.
- The Stage 4 closure report has been prepared under `docs/`.
- **Stage 4 is now CLOSED** (owner approval received).
- Stage 5 has **not** started.

No blockers remain open from the Stage 4 plan scope. Remaining work is limited to
explicit user approval for Stage 5.
