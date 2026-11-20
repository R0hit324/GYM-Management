# Phase 5 — Initial Audit (Stage 1)

**Project:** Pulse GYM Management (`E:\GYM Management\gym-management-app`)
**Date:** 2026-11-19
**Mode:** Read-only audit. No application code, migration, grant, policy or
business rule was changed to produce this document.
**Baseline:** Phase 4 is fully verified and closed. The baseline evidence is
`docs/PHASE_4_FINAL_VERIFICATION_REPORT.md` (suites `0001`–`0008`, backend
readiness 62/62, frontend role visibility 32/32, TypeScript, ESLint and Jest
all green).

---

## 1. Purpose and method

Phase 5 is **product completion, advanced features and production
readiness**. The rule for this stage is audit first: do not rebuild what
already works, and do not present demo-only behaviour as production
behaviour.

Method:

1. Read every screen under `src/app/`, the shared data/auth services, the
   domain types and the four migrations that define the live backend.
2. Trace each feature from UI → data hook → SQL query → RLS/authority
   function → view/table.
3. Classify each feature against the actual code, not against screen copy.
4. Record the exact missing path (UI, query, RPC, grant, provider) for every
   non-COMPLETE item.
5. Identify which gaps can be closed in this repository without weakening
   RLS, AAL2, audit attribution or the approved financial rules.

### 1.1 Scope baseline note

The Phase 5 brief refers to **16 listed features**. The exact list was part
of the earlier briefing and is not stored in this repository. The register
below reconstructs the 16 product-completion items from:

- the Phase 4 closure report and `PHASE_4_IMPLEMENTATION_PLAN.md` §7;
- `PHASE_TRACKER.md` Part 3 (billing history/invoices, notification system,
  advanced reporting/export/trends/analytics);
- the verified backend inventory (`0001`–`0008`);
- the honesty notes written into the screens themselves.

If the owner's original 16-item list differs, **this register is the one
thing to correct before Stage 2**. Every later stage uses these IDs
(`P5-01` … `P5-16`).

---

## 2. Baseline verification (Phase 4 evidence)

| Gate | Result | Evidence |
|---|---|---|
| SQL suites `0001`–`0008` | PASS (713 assertions) | `PHASE_4_FINAL_VERIFICATION_REPORT.md` |
| Backend readiness harness | 62/62 PASS | `scripts/backend-readiness-check.mjs` |
| Frontend role visibility harness | 32/32 PASS | `scripts/frontend-role-visibility-check.mjs` |
| `npx tsc --noEmit` | PASS | Phase 4 report |
| `npx expo lint` | PASS | Phase 4 report |
| Jest | 90/90 (10 suites) | Phase 4 report |
| Fresh `npx supabase db reset` | PASS (`0001`–`0005`, `0008`) | Phase 4 report |

**Uncommitted Stage 5 baseline work (must be preserved):**
`supabase/migrations/0008_stage5_write_paths.sql`,
`supabase/tests/0008_stage5_write_paths_validation.sql`,
`src/services/data/writes.ts`, `src/services/data/index.ts`,
`src/app/(auth)/join.tsx`, `src/app/(reception)/member-profile.tsx`,
`src/app/(reception)/plans.tsx`, `scripts/backend-readiness-check.mjs`, and
the Phase 4 report. No Git operation is permitted in Phase 5.

---

## 3. Verified backend surface (what already exists)

### 3.1 Authority functions (all `SECURITY DEFINER`, `search_path=public`)

| Function | Role | AAL2 | Audit action | Client EXECUTE |
|---|---|:---:|---|---|
| `payments` direct INSERT + `payments_insert_override` trigger | receptionist | no | `payment.created` | table INSERT |
| `verify_payment(p_payment_id)` | receptionist | yes | `payment.verified`, `plan.assignment_applied` | yes |
| `reject_payment(p_payment_id)` | receptionist | no | `payment.rejected` | yes |
| `create_reversal(p_original_payment_id, p_amount, p_note)` | receptionist | yes | `payment.reversed` | yes |
| `request_freeze(p_member_id, p_start_date, p_end_date, p_reason)` | receptionist | no | `freeze.requested` | yes |
| `decide_freeze(p_freeze_id, p_approve)` | receptionist | yes | `freeze.approved` / `freeze.rejected` | yes |
| `end_freeze(p_freeze_id)` | receptionist | no | `freeze.ended` | yes |
| `check_in(p_token, p_door)` | member | no | `freeze.ended_scan` when it auto-unfreezes | yes |
| `mint_attendance_token(p_validity_seconds)` | receptionist | yes | `token.minted` | yes |
| `set_member_discount(p_member_id, p_discount_pct)` | receptionist | no | `discount.set` | yes |
| `request_plan_assignment(p_member_id, p_plan_id)` | receptionist | no | `plan.assignment_requested` | yes |
| `update_plan_price(p_plan_id, p_price)` | owner | no | `plan.price_changed` | yes |
| `decide_application(p_application_id, p_approve)` | receptionist | no | `application.decided` | yes |
| `update_gym_settings(...)` | owner | no | `settings.changed` | yes |
| `update_member_contact` | receptionist | yes | `member.contact_updated` | yes (0008) |
| `create_plan` / `deactivate_plan` | owner | no | `plan.created` / `plan.deactivated` | yes (0008) |
| `submit_join_application` | member | no | `join.submitted` | yes (0008) |
| `provision_member_profile` | caller (member) | no | `profile.provisioned` | yes (0005) |

Every existing financial decision remains server-owned. The client never
computes a price, state, extension or verification result.

### 3.2 Read surface

- `v_member_status`: member/staff; effective expiry, days remaining, frozen
  state, locked price, discount.
- `v_inactive_members`: member/staff; server-computed inactivity days with
  frozen-day exclusion.
- `v_daily_report`: staff only; today's gross/reversals/net, attendance,
  unique visitors, new members, renewals, discounts, refunds.
- `v_month_revenue`: staff only; the same aggregates per month.
- `payments`, `membership_periods`, `membership_period_voids`,
  `membership_freezes`, `attendance_events`, `join_applications`,
  `follow_up_events`, `app_settings`: SELECT granted to `authenticated`,
  narrowed by RLS.
- `audit_log_entries`: table SELECT granted, but the **only** row policy is
  owner-only (`audit_select_owner`).

### 3.3 Client privileges

- INSERT only on `payments` and `follow_up_events`.
- No client UPDATE/DELETE on any table; `assert_no_client_mutation` blocks
  them regardless of grants.
- `anon` has no privilege of any kind.
- The service-role key has no slot and no reader in the Expo app
  (`src/services/supabase/client.ts`).

These controls are preserved by this audit and must remain intact in every
Phase 5 change.

---

## 4. Feature register and classification

Legend: **COMPLETE** = production-capable through the live backend;
**PARTIAL** = real path exists but a material part is missing; **DEMO ONLY**
= works only in the session/demo provider; **MISSING** = no implementation;
**BLOCKED** = requires an external provider, infrastructure or credential
that this environment does not have.

| ID | Feature | Status | Evidence and exact gap |
|---|---|---|---|
| **P5-01** | Receipt issuance and sharing | **PARTIAL** | `payments.receipt_issued`/`receipt_path` exist (`0001` 155–156) but the insert trigger forces both to false/null (`0002` 224–225) and **no function ever sets them**. Transaction History only displays “Issued / Not issued” (`transaction-history.tsx` 575). There is no receipt screen, no receipt number, no share/print, and no PDF dependency. |
| **P5-02** | In-app notification centre | **PARTIAL** | Owner bell opens a modal that lists the same derived attention items (`dashboard.tsx` 331–360); reception Home has a static “Needs attention” panel (`home.tsx` 298–336). No persistent notifications, read state, per-role centre, or deep-linkable notification list. |
| **P5-03** | Automated reminders | **MISSING** | Reminder-worthy data exists (`v_member_status.days_remaining`, `v_inactive_members.inactive_days`, pending payments), but there is no scheduler, queue, delivery, or reminder history. The UI only counts items. Push/SMS/email are provider-dependent. |
| **P5-04** | Owner analytics | **PARTIAL** | `v_daily_report` and `v_month_revenue` supply aggregates; `report.tsx` shows the verified ledger and omits period charts in live mode because there is no series source (`report.tsx` 9–10, 281). No payment-method split, retention, 6-month trend, or custom range. |
| **P5-05** | Report export | **MISSING** | No export code, no file/share path, no `expo-print`/`expo-sharing`/`expo-file-system` dependency. The design explicitly assigns Excel/PDF export to the application layer (`PHASE_3A_UNRESOLVED_ITEMS.md` 102–104). |
| **P5-06** | Owner audit-log viewer | **MISSING** | `audit_log_entries` is correctly owner-readable (`0002` 388–390), and every authority write emits a row, but there is no query, hook or screen. The owner cannot see the trail the system records. |
| **P5-07** | Join application review | **PARTIAL** | `decide_application` exists and is receptionist-only (`0003`), and `submit_join_application` was added in `0008`. But `fetchJoinApplicationRows` selects only `id,state` (`queries.ts` 213–221), `usePendingApplications` returns a **count**, and there is no review screen. The owner dashboard shows the count with **no href** (`dashboard.tsx` 160–166) — a dead end. |
| **P5-08** | Live plan catalogue and lifecycle | **PARTIAL** | `create_plan`/`deactivate_plan` are wired in `plans.tsx` for the owner branch, but the screen renders `demoPlans.map(...)` even in live mode (`plans.tsx` 273) and imports `demoMembers` for search. `usePlans()` is not used. `update_plan_price` has a wrapper but no UI. The “owner” branch is unreachable from the owner workspace because the screen lives in the receptionist group. |
| **P5-09** | Live plan assignment | **PARTIAL / DEMO ONLY** | `request_plan_assignment` exists (`0003`) but is not exported from `writes.ts`. `plans.tsx` keeps assignments in local React state (`plans.tsx` 98, 192–214) and searches `demoMembers`. No live request is sent. `members.pending_plan_id` is not exposed through `v_member_status`, so a pending request is not visible after navigation. |
| **P5-10** | Member profile history | **PARTIAL** | Contact, payments and attendance are live. Membership History renders “No freeze on record” and “Previous plans / renewals = Not recorded” (`member-profile.tsx` 414–433) even though `membership_periods` and `membership_freezes` are readable by staff. The queries are not implemented. |
| **P5-11** | Owner gym settings | **PARTIAL** | `update_gym_settings` is wrapped in `writes.ts` (273–295), but there is no owner settings screen. `payment-qr.tsx` reads the **session** QR config (`useSessionQrConfig`) even in live mode and only says the owner configures it elsewhere; the live `app_settings.upi_id` is loaded by `useGymSettings` but not displayed there. Timezone and token validity are not editable. |
| **P5-12** | Staff account administration | **BLOCKED** | Creating/role-assigning staff requires the Supabase Admin API with a service-role key. The app deliberately has no service-role slot, and no server-side deployment is permitted in this environment. Current path: owner creates staff in the Supabase dashboard and the staff enrols TOTP. Documented as an owner action, not app code. |
| **P5-13** | Member self-service | **PARTIAL** | The member sees their membership and attendance, and can scan the door code (`check_in` is wired). They cannot see their own payments, receipts, or a receipt share; there is no member payment tab. |
| **P5-14** | Backup and restore | **BLOCKED** | No backup/restore code or scheduled job. Local `pg_dump` is possible for verification, but production backup/restore is a provider/infrastructure responsibility. No service-role key may be used in the app. |
| **P5-15** | Offline resilience and sync | **MISSING** | Live reads fail to an explicit `ErrorState` with retry; there is no cache, offline queue, or conflict reconciliation. Writes are online-only. This is honest but not production-resilient. |
| **P5-16** | Production deployment readiness | **PARTIAL** | Env validation and SecureStore sessions exist; docs and tests are strong. Missing: EAS build/deploy (not permitted), observability/error reporting, rate limiting beyond provider defaults, release signing, and a documented production-vs-RC decision. |

### 4.1 Features already COMPLETE and not to be rebuilt

These are working live paths and must not be redesigned in Phase 5:

- Email/password + TOTP staff sign-in, member verification, password reset,
  role-bound session and workspace guards.
- Payment recording (server-forced prices/state), verification, rejection
  and capped reversals.
- Freeze request/decision/early-end, scan auto-unfreeze, derived validity.
- Attendance token minting/rotation, member check-in, replay/expiry refusal.
- Contact edit, join application submission, plan create/deactivate, and
  follow-up recording (the Stage 5 write paths).
- Server-derived member status, inactivity and daily/monthly ledgers.
- Owner-only audit rows and the no-client-mutation guard.

---

## 5. Screen-by-screen integration findings

| Screen | Live behaviour | Finding |
|---|---|---|
| `(auth)/login.tsx` | `provider.signIn`, role is an expectation only | COMPLETE. No Phase 5 change. |
| `(auth)/join.tsx` | Live `submit_join_application` | COMPLETE for submission. Application `phone_verified`/`email_verified` are forced false by `0008` even when the provider verified them; staff must verify manually. Document, do not trust client claims. |
| `(auth)/verify.tsx`, `mfa.tsx`, `forgot-password.tsx` | Provider challenges | COMPLETE. |
| `(member)/attendance.tsx` | Own status, own attendance, `check_in` | PARTIAL only for payments/receipts (P5-13). |
| `(reception)/home.tsx` | Daily report, attendance, members, payments | Works. Alerts are derived; no notification centre. |
| `(reception)/members.tsx` | `v_member_status` | Works. |
| `(reception)/member-profile.tsx` | Live contact edit; history absent | P5-10. |
| `(reception)/fees.tsx` | Live INSERT, server prices, pending queue | Works. Receipt is only a future promise; P5-01. |
| `(reception)/renewals.tsx` | `v_member_status` + payments | Works. |
| `(reception)/attendance.tsx` | `attendance_events` | Works. |
| `(reception)/freeze.tsx` | Live RPCs | Works. |
| `(reception)/door-qr.tsx` | Live `mint_attendance_token` + rotation | Works. |
| `(reception)/payment-qr.tsx` | Displays **session** QR config in live mode | P5-11; live `app_settings.upi_id` ignored. |
| `(reception)/transaction-history.tsx` | Live payment register, verify/reject/reverse | Works. Receipt action missing (P5-01). |
| `(reception)/plans.tsx` | Demo catalogue even in live mode | P5-08, P5-09. |
| `(reception)/more.tsx` | Links to all tools | Missing Applications and Receipts entries. |
| `(owner)/dashboard.tsx` | Live aggregates, derived attention | Notification centre partial; applications item dead-ends (P5-02, P5-07). |
| `(owner)/report.tsx` | Live daily/monthly ledger | Charts omitted in live; no method split/trend/export (P5-04, P5-05). |
| `(owner)/lost.tsx` | `v_inactive_members` + follow-ups | Works. |
| `(owner)/members.tsx` | `v_member_status` | Works. |
| Owner settings / plans / audit / applications | — | Do not exist (P5-06, P5-08, P5-11). |

---

## 6. Security risks found in the audit

No existing RLS, AAL2, audit-attribution or authorization-by-profile control
is broken. The risks below are **product-completion risks** and **new-code
risks to avoid**, not regressions in the verified Phase 4 baseline.

| # | Risk | Severity | Disposition |
|---|---|---|---|
| S1 | `plans.tsx` shows demo plans and demo members in a live session. A receptionist could believe a live plan list is being displayed. | High (misleading data) | Replace with live `usePlans`/`useMembers`; keep demo only for the demo provider. |
| S2 | `payment-qr.tsx` shows the session QR/UPI in live mode, contradicting the owner-configured `app_settings` row. | High (money destination) | Read live `app_settings.upi_id`; make configuration owner-only; never silently use a session value in live mode. |
| S3 | Receipt issuance would need to change `receipt_issued`. A broad UPDATE grant would violate the append-only posture. | High if implemented carelessly | Add one narrow `issue_receipt` authority RPC (receptionist + AAL2, verified rows only, one-way, audited) or keep receipts read-only. No table UPDATE grant. |
| S4 | `decide_application` creates a member from applicant data. Exposing the decision to the wrong role or trusting client verification flags would weaken the join path. | High | Keep the RPC receptionist-only; never send `phone_verified`/`email_verified` from the client; render the server result. |
| S5 | Analytics/report queries currently fetch all payments and all attendance (up to 2,000 events) and filter client-side. | Medium (performance/PII scope) | Add bounded range queries with explicit columns and limits; keep RLS as the row gate. |
| S6 | `fetchMemberProfile` fetches every payment/attendance row and filters in JS. | Medium | Add `.eq('member_id', …)` queries; never fetch another member’s rows. |
| S7 | Audit-log viewer could expose actor ids or stale JSON. | Medium | Owner-only read, explicit columns, no raw PII beyond what the table stores; show actor role/action/time/table. |
| S8 | Export/share could leak financial or member data to the OS share sheet. | Medium | User-initiated share only; explicit confirmation; no automatic upload; cap rows; document. |
| S9 | Push/SMS reminder content would send PII to a third party. | High if added loosely | Keep delivery BLOCKED until a provider and consent policy exist; in-app reminders contain no provider payload. |
| S10 | A new RPC could forget `require_role`/`assert_aal2`/`audit_authority`. | High | Every new function follows the `0003` template; the validation suite must prove role/AAL2 refusals and audit rows. |
| S11 | Offline caching could persist financial data insecurely. | Medium | Do not add a cache in Phase 5; keep explicit error/retry states. |
| S12 | The owner cannot review applications because `decide_application` is receptionist-only. | Medium (operational) | Provide a receptionist review screen; make the owner item a read-only count/label, not a fake action. |

### 6.1 Controls that must remain true after Phase 5

- No service-role key in the app bundle or source.
- No unrestricted direct table write; new writes use narrow RPCs or the two
  existing INSERT grants.
- Every privileged write calls `require_role`, the required `assert_aal2`,
  and `audit_authority`.
- RLS policies are not widened; no `USING (true)` additions.
- `profiles.role` stays client-immutable.
- Payments remain append-only; reversals remain new rows; receipt metadata
  changes, if any, are one-way and audited.
- Calendar-month arithmetic, inclusive freezes, frozen-day extension,
  renewal anchoring, full payment only, reversal caps, 30-day inactivity,
  Asia/Kolkata default, scan auto-resume and expired-member attendance are
  unchanged.

---

## 7. Reusable code and backend assets

| Asset | Reuse in Phase 5 |
|---|---|
| `src/services/data/queries.ts` | Add scoped/range queries; keep explicit columns. |
| `src/services/data/mappers.ts` | Add period/application/audit mappers. |
| `src/services/data/use-data.ts` | Add hooks for history, applications, audit, ranges. |
| `src/services/data/writes.ts` | Add `issueReceipt`, `requestPlanAssignment`, `decideApplication`. |
| `src/services/data/index.ts` | Re-export new hooks/functions/types. |
| `src/components/owner/owner-ui.tsx` | Reuse list/stat/section primitives on owner screens. |
| `src/components/workspace/workspace-ui.tsx` | Reuse reception chrome on new reception screens. |
| `src/components/ui/modal-sheet.tsx` | Receipt/confirm/share sheets. |
| `src/components/charts/*` | Owner analytics; feed only real derived points. |
| `scripts/backend-readiness-check.mjs` | Extend with new RPC/read checks. |
| `scripts/frontend-role-visibility-check.mjs` | Extend with new screens/roles. |
| `supabase/tests/0008_*` | Template for the new migration suite. |

---

## 8. Required migrations (assessment, not yet written)

The audit finds **one genuinely necessary migration** for Phase 5, plus
optional performance indexes:

1. **`0009_receipt_issuance.sql` (proposed)**
   - `issue_receipt(p_payment_id uuid)`: receptionist + AAL2; only a
     `verified` payment/reversal row; one-way (`receipt_issued = false`);
     sets `receipt_issued = true`; writes `receipt.issued` through
     `audit_authority`; returns the payment id. No `receipt_path` is written
     because no storage bucket exists.
   - Additive indexes for the audit viewer and range analytics:
     `audit_log_entries (at desc)`, `payments (recorded_at desc)`,
     `payments (member_id, recorded_at desc)` if not already present.
   - **Amendment (Stage 2, measured):** all three already exist in `0001`
     (`audit_time_idx`, `payments_recorded_at_idx`,
     `payments_member_recorded_idx`), as do the attendance and freeze
     history paths. The shipped migration therefore contains the function
     only; no index is added. See `docs/PHASE_5_PROGRESS_REPORT.md`.
   - Least-privilege EXECUTE: `authenticated` only; revoke from
     `public/anon/service_role`.
   - Validated by `supabase/tests/0009_receipt_issuance_validation.sql`.

2. **No migration is required** for:
   - plan assignment (`request_plan_assignment` exists);
   - application review (`decide_application` exists);
   - owner settings (`update_gym_settings` exists);
   - plan price/lifecycle (`update_plan_price`, `create_plan`,
     `deactivate_plan` exist);
   - member history (`membership_periods`, `membership_freezes`,
     `payments` are readable);
   - audit viewer (`audit_log_entries` is owner-readable);
   - in-app notifications/analytics/CSV export (derived from readable data).

3. **Optional, only if the implementation needs it:** expose
   `members.pending_plan_id` through `v_member_status` so a pending plan
   request is visible after navigation. This is an additive view column and
   does not widen row access; decide in Stage 2 after checking the suite
   fixtures.

---

## 9. External dependencies and blocked work

| Dependency | Needed for | Status |
|---|---|---|
| Expo Push / FCM / APNs | P5-03 push reminders | **BLOCKED** — no project credentials; no real messages may be sent. |
| SMS provider (e.g. MSG91/Twilio) | P5-03 SMS reminders | **BLOCKED** — paid account, consent and sender ID required. |
| Email provider / SMTP | P5-03 email reminders | **BLOCKED** — provider credentials. |
| Payment/UPI verification provider | Automatic UPI reconciliation | **BLOCKED** — the approved design keeps verification manual; no provider account. |
| Supabase Storage bucket | Stored receipt PDFs/images | **BLOCKED** for storage; a read-only on-screen receipt and text share can be delivered. |
| Supabase Admin API + service-role key | P5-12 staff administration | **BLOCKED by project rule** — no service-role key in the app. Owner action in the dashboard. |
| EAS build/signing credentials | P5-16 store builds | **BLOCKED** — no deploy/build in this environment. |
| Production database/backups | P5-14 | **BLOCKED** — provider/infrastructure. Local `pg_dump` is verification-only. |
| `expo-print` / `expo-sharing` / `expo-file-system` | PDF/file receipt and export | Not installed. Prefer dependency-free CSV/text share; install only with explicit approval and `npx expo install`. |

---

## 10. Recommended delivery order

The order keeps the verified baseline stable and closes truthful gaps before
adding new surfaces.

1. **Backend closure** — `0009` receipt RPC + indexes + validation suite;
   fresh reset.
2. **Data layer** — scoped history queries, full application rows, audit
   rows, bounded ranges, new hooks/mappers/exports.
3. **Reception completion** — live plan catalogue/assignment, application
   review, member history, receipt action.
4. **Owner completion** — settings, plan price/lifecycle, audit viewer,
   analytics, CSV export.
5. **Member completion** — own payments and receipts.
6. **Notifications** — in-app derived centre; delivery remains blocked.
7. **Security review** — verify no control weakened, add negative tests.
8. **Full verification** — all suites, harnesses, TypeScript, lint, Jest.
9. **Release readiness** — env/external-service/owner-action register.
10. **Final report** — actual results only, no fabricated passes.

---

## 11. Unresolved decisions for the owner

1. **Confirm the 16-feature register.** If the original list differs, supply
   it before Stage 2; the IDs above are the working baseline.
2. **Receipt semantics.** Confirm that issuing a receipt may set
   `receipt_issued` true once on an already-verified payment (metadata only,
   no financial change, audited), or that receipts must remain a pure
   read-only rendering with `receipt_issued` untouched.
3. **Application review role.** `decide_application` is receptionist-only by
   design. Confirm the reception desk owns review and the owner only sees a
   read-only count, or explicitly approve an owner read-only list screen.
4. **PDF/Excel export.** Confirm CSV/text export is acceptable for Phase 5
   and PDF/Excel is deferred to a provider/app-build phase.
5. **Reminder delivery.** Confirm push/SMS/email stay BLOCKED and only
   in-app derived reminders are delivered in Phase 5.
6. **Staff administration.** Confirm the owner creating staff in the Supabase
   dashboard (plus TOTP enrolment) is the approved operational path.

---

## 12. Stage 1 conclusion

The verified Phase 4 baseline is intact. Phase 5 has **no security
regression to repair**; it has **product-completion gaps** and **two
misleading live surfaces** (`plans.tsx`, `payment-qr.tsx`) that must be
corrected before any new feature is presented as production-ready.

The highest-value in-repository work is:

- make the plan catalogue and assignment genuinely live;
- make the payment QR genuinely owner-configured;
- expose application review, member history and the audit trail;
- issue receipts through one narrow audited RPC;
- add owner analytics, CSV export and a derived in-app notification centre;
- give members their own payment/receipt view.

Push/SMS/email delivery, staff administration, storage-backed PDF receipts,
production backups and store deployment remain **BLOCKED** and are recorded
as owner/provider actions rather than faked.

**Stage 1 status: COMPLETE (read-only).**
