# Phase 5 — Progress Report

**Project:** Pulse GYM Management (`E:\GYM Management\gym-management-app`)
**Phase:** 5 — product completion, advanced features, production readiness
**Baseline:** Phase 4 fully verified — see
`docs/PHASE_4_FINAL_VERIFICATION_REPORT.md`.
**Ledger rule:** a stage is marked COMPLETE only when its acceptance gate is
evidenced by real command output. Nothing below is estimated.

---

## Stage 1 — Initial audit

**Status:** COMPLETE (read-only)

### Files changed
- **Created** `docs/PHASE_5_INITIAL_AUDIT.md`
- **Created** `docs/PHASE_5_IMPLEMENTATION_PLAN.md`
- **Created** `docs/PHASE_5_PROGRESS_REPORT.md` (this file)

No file outside `docs/` was created, edited or deleted. The uncommitted
Stage 5 write-path work from the previous phase remains untouched:

```
 M scripts/backend-readiness-check.mjs
 M src/app/(auth)/join.tsx
 M src/app/(reception)/member-profile.tsx
 M src/app/(reception)/plans.tsx
 M src/services/data/index.ts
 M src/services/data/writes.ts
?? docs/PHASE_4_FINAL_VERIFICATION_REPORT.md
?? docs/PHASE_5_INITIAL_AUDIT.md
?? docs/PHASE_5_IMPLEMENTATION_PLAN.md
?? docs/PHASE_5_PROGRESS_REPORT.md
?? supabase/migrations/0008_stage5_write_paths.sql
?? supabase/tests/0008_stage5_write_paths_validation.sql
```

### Implementation notes
- Audited every screen under `src/app/`, the auth providers and session
  manager, the data layer (`queries`, `rows`, `mappers`, `use-data`,
  `writes`), the domain types, migrations `0001`–`0008` and the existing
  test suites and scripts.
- Classified all 16 features `P5-01` … `P5-16` as COMPLETE / PARTIAL /
  DEMO ONLY / MISSING / BLOCKED with file-and-line evidence for each gap.
- Confirmed the Phase 4 security posture is intact: no RLS widening, AAL2
  gates in place, audit attribution present, no service-role reference in
  `src/`, `assert_no_client_mutation` still blocking direct client writes.
- Identified two **misleading live surfaces** that must be fixed before any
  new feature ships:
  - `src/app/(reception)/plans.tsx` renders `demoPlans`/`demoMembers`
    even when the session is live.
  - `src/app/(reception)/payment-qr.tsx` renders the session QR/UPI config
    in live mode and ignores `app_settings.upi_id`.
- Identified the one genuinely missing backend capability: receipt
  issuance (`receipt_issued` is forced false on insert and never set).
- Assessed migrations: exactly one new migration is needed
  (`0009_receipt_issuance.sql`); every other gap is closable through
  existing RPCs/views or new read queries.
- Recorded the reconstructed 16-feature register as the one item the owner
  should confirm before Stage 2, because the original brief list is not
  stored in the repository.

### DB changes
None. No migration was written, applied or reset in this stage.

### Security controls exercised
- Read-only review only. No grant, policy, function, trigger or view was
  modified.
- The audit explicitly records the controls that must remain true through
  the rest of Phase 5 (audit §6.1) and the new-code risks to avoid
  (audit §6, S1–S12).

### Test results

| Check | Result | Evidence |
|---|---|---|
| Baseline suites `0001`–`0008` | **PASS (inherited)** — 713 assertions | `docs/PHASE_4_FINAL_VERIFICATION_REPORT.md` |
| Backend readiness harness | **PASS (inherited)** — 62/62 | same |
| Frontend role visibility harness | **PASS (inherited)** — 32/32 | same |
| `npx tsc --noEmit` | **PASS (inherited)** | same |
| `npx expo lint` | **PASS (inherited)** | same |
| Jest | **PASS (inherited)** — 90/90, 10 suites | same |
| `git status` scope check | **PASS** — only intended files | command output above |
| Phase 5 code tests | **N/A** — no code changed | — |

No Phase 5 test was run in this stage because the stage produced
documentation only. The baseline results are inherited from the verified
Phase 4 report, not re-measured here. They are re-measured for real in
Stage 2 (after the reset) and Stage 10 (full regression).

### Unresolved decisions
1. Owner confirmation of the reconstructed `P5-01` … `P5-16` register.
2. Receipt semantics — one-way `issue_receipt` RPC (recommended) vs.
   read-only receipts.
3. Application review role — reception owns approval; owner read-only.
4. Export format — dependency-free CSV/text (recommended) vs. PDF/Excel
   (deferred).
5. Reminder delivery — push/SMS/email stay BLOCKED; in-app only.
6. Staff administration — owner dashboard path.
7. Notification read state — memory-only vs. local persistence.

Defaults are stated in the implementation plan (§10) so Stage 2 is not
blocked by an unanswered question.

### Next stage
Stage 2 — Backend closure: `0009_receipt_issuance.sql` + validation
suite, fresh `npx supabase db reset`, then suites `0001`–`0009`.

---

## Stage 2 — Backend closure (receipt issuance)

**Status:** COMPLETE

### Files changed
- **Created** `supabase/migrations/0009_receipt_issuance.sql`
- **Created** `supabase/tests/0009_receipt_issuance_validation.sql`
- **Updated** `docs/PHASE_5_PROGRESS_REPORT.md` (this section)
- **Updated** `docs/PHASE_5_IMPLEMENTATION_PLAN.md` (index assessment,
  final filenames)
- **Updated** `docs/PHASE_5_INITIAL_AUDIT.md` (§8 amendment: measured index
  result, final filenames)

The migration was written first as `0009_receipts_and_indexes.sql`, then
renamed to `0009_receipt_issuance.sql` once the index assessment proved no
new index was needed. The full reset and all nine suites were re-run after
the rename, so the evidence below is for the files as they now stand.

### Implementation notes
- `issue_receipt(p_payment_id uuid) returns uuid` — the **only** path that
  can set `payments.receipt_issued` true.
  - `SECURITY DEFINER`, `set search_path = 'public'` (matches `0003`).
  - `require_role(array['receptionist'])` — authoritative `profiles.role`,
    not JWT claims.
  - `assert_aal2()` — staff action requires MFA.
  - Row locked `for update`; `state = 'verified'` required; `receipt_issued`
    must be false.
  - Conditional `update ... where receipt_issued = false and state =
    'verified'` closes the race even if the lock is refactored away.
  - One-way: a second call raises `55000` and changes nothing. No
    un-issue path exists.
  - `receipt_path` is deliberately never written — no storage bucket exists.
  - `audit_authority('receipt.issued', 'payments', id, old, new)` records
    actor, role and the `false → true` transition.
  - EXECUTE revoked from `public, anon, service_role`; granted to
    `authenticated` only.
- No financial column is touched: price, discount, payable, state, method,
  UTR, verifier and timestamps all stay as they were.
- **Index assessment — negative result, documented in the migration
  header:** every Phase 5 access path already has an index in `0001`
  (`audit_time_idx`, `payments_recorded_at_idx`,
  `payments_member_recorded_idx`, `attendance_member_time_idx`,
  `freezes_member_idx`, `periods_member_start_idx`). No index was added, so
  the migration contains the function and its grants only.

### DB changes
- 1 function: `public.issue_receipt(uuid)`.
- 2 grant statements (revoke/grant EXECUTE).
- 0 tables, 0 columns, 0 policies, 0 triggers, 0 views, 0 indexes, 0 seed
  changes.

### Security controls exercised
- C3 (AAL2), C4 (audit attribution), C5 (authorization by profile) and
  C6 (no service-role shortcut, no direct table write) are each asserted
  in `0009`:
  - `has_function_privilege` for `authenticated` / `anon` / `service_role`;
  - `prosecdef` + pinned `search_path` posture check;
  - `has_table_privilege('authenticated','public.payments','UPDATE')` false;
  - owner and member refused at `42501`; receptionist at `aal1` refused;
  - a direct client `update public.payments set receipt_issued = true` is
    refused.
- No existing policy, grant, function or trigger was modified (pure
  additive migration).

### Test results

**Fresh reset** (`npx supabase db reset`, exit 0) applied:
`0001`, `0002`, `0003`, `0004`, `0005`, `0008`, `0009_receipt_issuance.sql`
(no `0006`/`0007` migration files by design — their suites validate logic
that lives in earlier migrations), then seed.

| Suite | Result | Assertions |
|---|---|---|
| `0001_core_schema_validation` | **PASS** | 56/56 |
| `0002_rls_and_triggers_validation` | **PASS** | 123/123 |
| `0003_authority_functions_validation` | **PASS** | 139/139 |
| `0004_views_validation` | **PASS** | 81/81 |
| `0005_security_validation` | **PASS** | 126/126 |
| `0006_concurrency_validation` (as `supabase_admin`) | **PASS** | 93/93 |
| `0007_date_math_validation` | **PASS** | 73/73 |
| `0008_stage5_write_paths_validation` | **PASS** | 22/22 |
| `0009_receipt_issuance_validation` | **PASS** | 19/19 |
| **Total** | **9/9 suites PASS** | **732/732** |

Failed: 0. Blocked: 0. Every count above is the suite's own
`assertions passed` notice from the run after the final rename.

### Unresolved decisions
- Owner confirmed (before Stage 2): reconstructed register accepted;
  one-way audited `issue_receipt` approved; CSV/text export approved with
  no new dependencies.
- Still open, not blocking Stage 3: notification read-state persistence
  (memory-only default), application-review screen placement (reception
  owns the decision), and staff-administration documentation (owner
  dashboard path).

### Next stage
Stage 3 — Data layer completion: member-scoped history queries, full
application rows, owner audit rows, bounded range queries, and the
`issueReceipt` / `requestPlanAssignment` / `decideApplication` wrappers.

---

## Stage 3 — Data layer completion

**Status:** COMPLETE

### Files changed
- `src/types/domain.ts` — added `MembershipPeriodRecord`, `AuditLogEntry`
- `src/services/data/rows.ts` — added `MembershipPeriodRow`, `AuditLogRow`;
  expanded `JoinApplicationRow` to the full stored row
- `src/services/data/queries.ts` — scoped/bounded reads, range reads, full
  application columns, owner audit page; exported limit constants
- `src/services/data/mappers.ts` — `toMembershipPeriod`, `toJoinApplication`,
  `toAuditEntry`
- `src/services/data/use-data.ts` — scoped `loadMemberProfile`,
  `loadMyAttendance`, `loadMyPayments`, `loadJoinApplications`,
  `loadAuditLog`, `loadPaymentsInRange`, `loadAttendanceInRange`; five new
  hooks
- `src/services/data/writes.ts` — `issueReceipt`, `requestPlanAssignment`,
  `decideApplication`
- `src/services/data/index.ts` — re-exports
- `src/services/data/demo-fallbacks.ts` — `demoMyPayments` (derived from the
  existing demo ledger, no new sample data)
- **Created** `src/__tests__/data-mappers.test.ts` — 8 mapper assertions
- `docs/PHASE_5_PROGRESS_REPORT.md` (this section)

### Implementation notes
- `loadMemberProfile` no longer fetches whole tables and filters in JS. It
  now uses `fetchMemberStatusRow(memberId)`, `fetchPaymentRowsForMember`,
  `fetchAttendanceRowsForMember`, `fetchMembershipPeriodRowsForMember`,
  `fetchFreezeRowsForMember` and `fetchFollowUpRowsForMember`. This closes
  audit risk S6 and makes the profile history (Stage 4) possible without a
  new migration.
- Range reads are half-open `[from, to)` over `recorded_at` /
  `checked_in_at`, ordered newest-first, capped by `RANGE_LIMIT` (5,000).
  History reads are capped at 200; the audit page at 200.
- `JoinApplicationRow` now mirrors all twelve stored columns. The count-only
  hook is retained (the owner dashboard uses it) and a full-list hook is
  added for the reception review screen.
- Mappers stay honest: an unresolvable plan name becomes "Plan not on
  record"; a null email becomes an empty display value; a null audit actor
  stays null; verification flags are copied as stored, never inferred.
- The member's own payments/attendance are scoped by the member id the
  session can already read; RLS remains the row gate.
- `MemberProfileData` gained `periods` and `freezes`. The existing
  `member-profile.tsx` compiles unchanged; Stage 4 renders the new data.

### DB changes
None. No migration, grant, policy or view change.

### Security controls exercised
- No new privileges. Every new read stays under the existing RLS policies
  (`payments_select_own/_staff`, `periods_select_own/_staff`,
  `freezes_select_own/_staff`, `applications_select_own/_staff`,
  `audit_select_owner`).
- Explicit column lists everywhere (no `select('*')`).
- No unbounded query was added; every new read has `.limit(...)`.
- No service-role reference, no second Supabase client, no direct
  UPDATE/DELETE.

### Test results

| Check | Result |
|---|---|
| `npx tsc --noEmit` | **PASS** (exit 0) |
| `npx expo lint` | **PASS** (exit 0) |
| `npx jest` | **PASS** — 98/98 tests, 11 suites |
| SQL suites | **Not re-run** — no database change in this stage |

Failed: 0. Blocked: 0.

### Unresolved decisions
- `useMemberHistory` from the plan was folded into `useMemberProfile`
  (periods + freezes) instead of a second hook, because the profile screen
  needs both in one load. Recorded here rather than silently substituted.

### Next stage
Stage 4 — Reception completion: live plan catalogue and assignment,
application review screen, member history sections, and the receipt action.

---

## Stage 4 — Reception completion

**Status:** COMPLETE

### Files changed
- `src/app/(reception)/member-profile.tsx` — header comment updated; derives
  `memberPeriods` / `memberFreezes` from `useMemberProfile`; the "Membership
  history" card now lists applied terms (plan, start→end, price applied) and
  freeze records (window, state, extension days, reason) in live mode, with
  honest empty states in demo mode
- `src/app/(reception)/applications.tsx` — **created**: join-application
  review queue using `useJoinApplications`, `usePlans`, `decideApplication`;
  approve/reject decision sheet, submitted-only decisions, decided history,
  unsubmitted disclosure, demo seed clearly labelled and session-only
- `src/app/(reception)/transaction-history.tsx` — added the `issueReceipt`
  action on verified, non-reversal, not-yet-issued rows, with an explicit
  caption that it is one-way metadata and stores no PDF/image
- `src/app/(reception)/more.tsx` — added the Join Applications row; live
  detection now comes from `usePayments` so the demo badge and pending badge
  are correct in live mode; Transaction History hint mentions receipts
- `src/app/(reception)/_layout.tsx` — registered the `applications` route
- `src/app/(reception)/home.tsx` — corrected the payment alert wording to
  "until a different receptionist verifies" (self-verification is refused;
  the Owner is not the only verifier)
- `src/app/(reception)/plans.tsx` — recording the completed live rewrite
  from the start of this stage: live `usePlans`/`useMembers`/
  `usePendingAssignments`, `requestPlanAssignment`, server-recorded pending
  assignments, demo-only price editing, honest notices
- `docs/PHASE_5_PROGRESS_REPORT.md` (this section)

### Implementation notes
- The profile now shows real server rows instead of "Not recorded" for plan
  and freeze history. Validity is still derived by the server; the screen
  never computes or edits an expiry date. Demo mode states plainly that its
  records carry no terms or freezes rather than inventing them.
- Applications: a decision is only offered for `submitted` rows. Approval
  says what actually happens — a member record is created and membership
  activates on the first verified payment. No price, lock or verification
  flag is supplied by the client. Live refusals are shown verbatim.
- Receipts: the control appears only where the server would accept it
  (`verified`, not a reversal, `receipt_issued = false`). It calls the
  audited `issue_receipt` RPC, not a table update, and the screen keeps the
  existing "Receipt: Issued / Not issued" detail row.
- Demo applications are three illustrative rows marked by the workspace demo
  badge; their decisions are local state and the notice says nothing was
  saved. This avoids claiming a server write in demo mode.
- More now reports live mode accurately. Its pending badge reads the same
  authorised payment rows as Transaction History instead of the session store.

### DB changes
None. No migration, grant, policy or view change.

### Security controls exercised
- `decide_application` and `issue_receipt` are invoked as server RPCs; the
  screens never write tables directly and never send a role or actor.
- Receipt issuance remains receptionist + AAL2, verified-only, one-way, and
  audited (19-assertion suite from Stage 2).
- Application decisions are receptionist-only and allow one decision per
  application; the client offers no decision on drafts or unverified rows.
- Every new list is bounded by the existing query limits; no new read path,
  privilege or service-role reference was added.
- RLS and AAL2 enforcement are unchanged.

### Test results

| Check | Result |
|---|---|
| `npx tsc --noEmit` | **PASS** (exit 0) |
| `npx expo lint` | **PASS** (exit 0) |
| `npx jest` | **PASS** — 98/98 tests, 11 suites |
| SQL suites | **Not re-run** — no database change in this stage |

Failed: 0. Blocked: 0.

### Unresolved decisions
- No separate "Receipts" destination was added: receipts are a flag on the
  transaction row and a second screen would duplicate the register. The
  More-tab hint and the detail row are the discovery path. Recorded here in
  case the owner prefers a dedicated filter later.
- Demo join applications are illustrative seeds, not records from the demo
  session store, because the data model has never carried client-side
  applications. They are labelled by the demo badge and never presented as
  saved.

### Next stage
Stage 5 — Owner completion: settings, plan price/lifecycle, audit viewer,
dashboard applications link, and live UPI settings on the Payment QR screen.

---

## Stage 5 — Owner completion

**Status:** COMPLETE

### Files changed
- **Created** `src/app/(owner)/more.tsx` — management hub: Lost members,
  Join applications, Plans and prices, Gym settings, Audit log
- **Created** `src/app/(owner)/settings.tsx` — reads `useGymSettings`; edits
  time zone, gym UPI ID and attendance-token validity through
  `update_gym_settings`; shows stored values, validation and the audit
  consequence; demo shows the documented defaults with saving disabled
- **Created** `src/app/(owner)/plans.tsx` — live catalogue with create,
  price change and soft deactivation through `create_plan`,
  `update_plan_price` and `deactivate_plan`; states that locked prices and
  applied terms are untouched
- **Created** `src/app/(owner)/audit.tsx` — bounded, owner-only audit page
  from `useAuditLog`, newest first, searchable, with stored old/new JSON in a
  collapsed detail; no editing or export
- **Created** `src/app/(owner)/applications.tsx` — read-only application
  queue; the reception desk keeps the decision, so no control is offered
- **Created** `src/data/demo-applications.ts` — shared demo-labelled
  application rows (4 submitted, 1 approved) used by the demo queues
- `src/app/(owner)/_layout.tsx` — registered `more`, `applications`,
  `plans`, `settings`, `audit`; header comment updated
- `src/app/(owner)/dashboard.tsx` — the registration-requests attention item
  now opens the read-only owner queue; the notifications sheet copy now
  states that push/SMS/email delivery is not configured
- `src/components/owner/owner-ui.tsx` — the More tab points at the new hub
  instead of the lost-members screen; nav comment updated
- `src/types/domain.ts` — `MembershipPlan.isActive?` (additive; demo rows
  omit it and are treated as active)
- `src/services/data/mappers.ts` — `toPlan` copies `is_active`
- `src/app/(reception)/payment-qr.tsx` — live mode renders the owner-saved
  `app_settings.upi_id` (generated QR), loads/errors through
  `useGymSettings`, and never reads the session store; session QR editing
  remains demo-only.
- `src/app/(reception)/applications.tsx` — demo queue now uses the shared
  demo application rows instead of a screen-local copy
- `src/app/(reception)/member-profile.tsx` — history rows use plain list
  rows inside the existing card (no nested card)
- `docs/PHASE_5_PROGRESS_REPORT.md` (this section)

### Implementation notes
- The owner console previously had four tabs and no administrative home.
  The More tab is now a hub, matching the reception desk's pattern, and the
  lost-members list is its first row. This was needed so settings, plans,
  audit and applications have a real destination without adding a fifth
  tab or duplicating the report.
- Settings form edits are held in a draft overlay derived from the loaded
  row, avoiding a `setState`-in-effect sync. Blank fields are passed as
  `null`, which the server's COALESCE treats as "keep the stored value";
  the screen states this instead of implying a blank clears data.
- UPI ID validation is format-only (`name@bank`); the screen says the
  account is never verified. The server validates the time zone and the
  5–600 second bound; its refusal is shown verbatim.
- Plans are ordered active-first, then by price. The demo catalogue is
  read-only; every write control is disabled with an explanation.
- The audit page shows the raw action/table/target/actor and stored JSON.
  It never renames an action or claims a value that is not in the row.
- Payment QR in live mode becomes a read-only display of the owner-saved
  UPI ID; it no longer shows a session-edited ID or demo defaults. When no
  UPI ID is configured it says so rather than rendering a QR.
- Owner applications are read-only by design: `decide_application` is
  receptionist-only, so showing an approve button would be a lie.

### DB changes
None. No migration, grant, policy or view change.

### Security controls exercised
- All writes call the existing owner-gated functions (`update_gym_settings`,
  `create_plan`, `update_plan_price`, `deactivate_plan`). The client never
  sends a role, actor or price history.
- The audit page reads `audit_log_entries` under the existing owner-only
  policy and offers no update/delete path.
- `update_gym_settings` refuses a receptionist, validates the time zone and
  the 5–600 bound, and audits the change — asserted by the authority suites.
- Plan price changes are validated server-side (positive price), and
  deactivation is a soft flag, never a delete.
- Live Payment QR reads settings under the existing read policy; no storage
  bucket or secret is introduced.

### Test results

| Check | Result |
|---|---|
| `npx tsc --noEmit` | **PASS** (exit 0) |
| `npx expo lint` | **PASS** (exit 0) |
| `npx jest` | **PASS** — 98/98 tests, 11 suites |
| `0003_authority_functions_validation.sql` | **PASS** — 139/139 assertions |
| `0008_stage5_write_paths_validation.sql` | **PASS** — 22/22 assertions |

The two SQL suites were run on the current local database (`psql -f`,
`ON_ERROR_STOP=1`); 0003 reports 30 audit rows across the 15 designed
actions and zero residue, 0008 reports 22/22. Failed: 0. Blocked: 0.

Not run in this stage: the end-to-end `backend-readiness-check.mjs` and
`frontend-role-visibility-check.mjs` harnesses — reserved for the Stage 10
regression.

### Unresolved decisions
- The owner More tab now opens a hub; the lost-members list moved to its
  first row. This changes the Part 1 tab destination but not the screen or
  its data. Recorded because it is a navigation change.
- The settings RPC cannot set `upi_id` or the time zone back to null; blank
  means "keep". Clearing the UPI ID therefore requires either typing a new
  ID or a future server change. Disclosed on the screen; not worked around
  client-side.
- Plan `isActive` is optional on the domain type so the existing demo
  fixtures stay valid; a missing value is treated as active. Live rows
  always carry the stored flag.

### Next stage
Stage 6 — Member completion: own payments and receipts, without new
privileges.

### Next stage
Stage 7 — Notifications & in-app reminders (in-app only, delivery BLOCKED).

---

## Stage 6 — Member completion

**Status:** COMPLETE

### Files changed
- `src/app/(member)/payments.tsx` — **created**: the member's own payments and
  receipts view — read-only verified/pending totals, the records list with
  method / date / UTR / plan / receipt status, and honest demo copy
- `src/app/(member)/_layout.tsx` — registered the `payments` route in the member
  workspace stack
- `src/app/(member)/attendance.tsx` — added the "Payments" ActionTile on the
  fitness home, scrolling/jumping to the new screen
- `src/services/data/use-data.ts`, `src/services/data/queries.ts`, `src/services/data/mappers.ts`,
  `src/utils/payment.ts`, `src/utils/format.ts` — consumed the existing
  member-scoped read paths (`useMyPayments`, `usePlans`, `paymentStatusInfo`);
  no new query, RPC, table or write was added
- `docs/PHASE_5_PROGRESS_REPORT.md` (this section)

### Implementation notes
- The screen reads only the signed-in member's own rows via `useMyPayments`
  (resolves the caller's member row, then reads that member's payments). No
  cross-member id fetch exists here, and there is no write path at all: the
  member never records, verifies, reverses or issues anything.
- Totals are derived from the rows: verified paid minus verified reversals is
  the paid figure; `awaitingVerification` entries are summed separately and
  never counted as paid. A recorded UTR is a reference, not a verification.
- Receipt state is display-only (`Issued` / `Not issued` from the row flag).
  Issuance stays with the receptionist + AAL2 audited `issue_receipt` RPC; the
  member view cannot trigger it and no PDF/image exists to download.

### DB changes
None. No migration, grant, policy or view change.

### Security controls exercised
- Member-scoped reads through the existing RLS policies (`payments` restricted
  to the linked member); the query filter is defence in depth. Cross-member
  access is asserted in the Stage 10 harness.

### Test results

| Check | Result |
|---|---|
| `npx tsc --noEmit` | **PASS** (exit 0) — re-run after the Stage 6 edits |
| `npx expo lint` | **PASS** (exit 0) — re-run after the Stage 6 edits |
| `npx jest` | **PASS** — 98/98 tests, 11 suites (final run in Stage 7 verification) |

Failed: 0. Blocked: 0.

### Unresolved decisions
- No export/share was added in this stage; the CSV/text export belongs to
  Stage 8 (owner-side report export).

### Next stage
Stage 7 — Notifications & in-app reminders (in-app only, delivery BLOCKED).

---

## Stage 7 — Notifications & in-app reminders

**Status:** COMPLETE

### Files changed
- `src/types/domain.ts` — added the `InAppNotification` contract (id, title,
  detail, href, tone, count)
- `src/hooks/use-reception-notifications.ts` — **created**: derives in-app
  notification items from rows the signed-in receptionist may already read —
  pending verifications, unissued receipts on verified payments, submitted join
  applications, pending freeze requests, expiring memberships; zero-count items
  are omitted; honest loading/error/refresh result
- `src/components/notifications/notification-bell.tsx` — **created**: bell with
  live badge, modal sheet list, open-item navigation, in-memory read marks,
  retry
- `src/app/(reception)/home.tsx` — inserted the notification bell into the home
  header actions (next to SignOut); corrected the pending-payment alert wording
  to "until a different receptionist verifies"
- `src/data/demo-applications.ts` — **created** (shared with Stage 5): demo-labelled
  application rows used by demo notification derivations

### Implementation notes
- Every item is computed from the same authorised data sources the desk screens
  already use; no new query source, privilege or service-role reference was added.
- Delivery stays in-app only. Push, SMS and email remain BLOCKED for lack of
  provider credentials/consent; the bell copy states this and never claims a
  message was sent or delivered.
- Demo mode honestly omits freezes (demo freeze book is session-only) and uses
  the shared demo application rows; zero-count items never appear.

### DB changes
None. No migration, grant, policy or view change.

### Security controls exercised
- Derivation uses only authorised, RLS-scoped reads; the notification hrefs map
  to existing receptionist routes. No new authority surface.

### Test results

| Check | Result |
|---|---|
| `npx tsc --noEmit` | **PASS** (exit 0) |
| `npx expo lint` | **PASS** (exit 0) — after wrapping the derived arrays in `useMemo`, resolving the one `react-hooks/exhaustive-deps` warning |
| `npx jest` | **PASS** — 98/98 tests, 11 suites, final run after all Stage 6/7 edits |

SQL suites: not re-run in this stage (no database change).

Failed: 0. Blocked: 0.

### Unresolved decisions
- Push/SMS/email delivery remains BLOCKED; only in-app derived reminders ship.
- Bell read marks are session-memory only; no persisted read state was added.

### Next stage
Stage 8 — Analytics & export: live 7-day trends, capped ranges, CSV/text share
via the platform share sheet with explicit confirmation.

---

## Stage 8 — Analytics & export

**Status:** COMPLETE

### Files changed
- `src/app/(owner)/report.tsx` — **rewritten** for Stage 8: live period series
  from the bounded range reads, capped range selector (7/30/90 days), live
  deltas, and the CSV export action (button → confirmation sheet → share)
- `src/services/data/use-data.ts`, `src/services/data/queries.ts` — consumed
  the pre-existing bounded range hooks (`usePaymentsInRange`,
  `useAttendanceInRange`) as the first live consumers; no code change
- `docs/PHASE_5_PROGRESS_REPORT.md` (this section)

### Implementation notes
- Live mode now renders real period series instead of the former
  "charts omitted" notice:
  - **Attendance trend** — one `TrendPoint` per local day of the selected
    window from verified check-in rows (`checked_in_at` in `[from, to)`).
  - **Collections trend** — verified net collections (a reversal subtracts)
    per day when the window is ≤ 7 days, per Mon-start week when longer.
- The selected window and the immediately previous window of the same length
  are fetched through the bounded range reads; live deltas compare them
  (WoW for collections, in-window for attendance). Demo mode keeps the
  approved sample trends and deltas.
- Range options are capped (7 / 30 / 90 days); the selector is live-mode only
  and labels the rendered charts. Export rows come from the current view
  (live: the selected range rows; demo: the period rows) and are capped at 500
  rows before the CSV text is built and shared via React Native `Share.share`
  after explicit confirmation.

### DB changes
None. No migration, grant, policy or view change. The bounded range reads and
their indexes already existed from the Stage 2/3 backend work.

### Security controls exercised
- Charts and export read only through the existing RLS-scoped range queries; no
  new read path, privilege or service-role reference was added.
- Export is user-initiated via an explicit confirmation sheet; nothing uploads
  automatically; the payload is capped and excludes raw JSON/credentials.

### Test results

| Check | Result |
|---|---|
| `npx tsc --noEmit` | **PASS** (exit 0) |
| `npx expo lint` | **PASS** (exit 0) |
| `npx jest` | **PASS** — 98/98 tests, 11 suites |

SQL suites: not re-run in this stage (no database change).

Failed: 0. Blocked: 0.

### Unresolved decisions
- PDF/Excel export stays deferred; dependency-free CSV/text share shipped
  (`expo-print` / `expo-sharing` not installed).
- Live range bounds are local-day aligned through the existing half-open
  `[from, to)` reads; the DB applies the gym time zone inside its aggregates.

### Next stage
Stage 9 — Security review: grant/policy dumps and grep evidence for the
Phase 5 surfaces.

---

## Stage 9 — Security review

**Status:** COMPLETE

### Files changed
- `docs/PHASE_5_SECURITY_REVIEW.md` — **created**: Phase 5 security review —
  control posture at entry, reviewed additions (receipt issuance, Stage 5 write
  paths, new read surfaces), client posture, residual findings, verification
  evidence, sign-off.

### Implementation notes
- Reviewed migrations `0002`–`0005`, `0008`, `0009` plus the client write layer
  (`src/services/data/writes.ts`, auth provider) and the new read surfaces.
- Receipt issuance: one-way (false→true conditional update), verified-only,
  metadata-only, audited via `audit_authority`, EXECUTE to `authenticated` only.
- Stage 5 write paths follow the 0003 authority convention
  (`require_role` + `assert_aal2` + `audit_authority`, EXECUTE to authenticated
  only).
- No service-role reference and no direct table write outside RPC calls were
  found in `src/`.

### DB changes
None in this stage (review only).

### Security controls exercised
- `0009_receipt_issuance_validation.sql` — PASS (19/19 assertions).
- `0008_stage5_write_paths_validation.sql` — PASS (22/22 assertions).
- `0003_authority_functions_validation.sql` — PASS (139/139 assertions).

### Test results
- Full-reset run in Stage 10: all SQL suites green (732/732 assertions, see
  Stage 10).

### Unresolved decisions
- Residuals BLOCKED pending owner action: delivery providers (push/SMS/email),
  staff account administration, stored PDF receipts, production backups.

### Next stage
Stage 10 — Full reset & final regression over the Phase 5 surfaces.

---

## Stage 10 — Full reset & final regression

**Status:** COMPLETE

### Files changed
- `scripts/frontend-role-visibility-check.mjs` — extended with cross-member read
  checks and static route-registration checks.

### Implementation notes
- Cross-member reads: member A filtered by `member_id=eq.<member B>` returned 0
  rows; filtering to an unlinked member id returned 0 rows.
- Route registration checks: member layout registers `payments`; owner layout
  registers `more`, `applications`, `plans`, `settings`, `audit`; reception
  layout registers `applications`.

### DB changes
None.

### Security controls exercised
- Cross-member denial re-asserted live against the fresh local stack.

### Test results

| Check | Result |
|---|---|
| Full reset + all 9 SQL suites (`0001`–`0009`) | **PASS** — 732/732 assertions (56/56, 123/123, 139/139, 81/81, 126/126, 93/93, 73/73, 22/22, 19/19), all suites exited 0 |
| Frontend role visibility harness | **PASS** — 41/41 checks, 0 failures, exit 0 (incl. new cross-member + route checks) |
| Backend readiness harness | **PASS** — 62/62 checks, 0 failures, exit 0 |

One transient suite-0006 failure occurred mid-sequence (fixtures applied before
an unavailable `dblink` maintenance connection aborted the run); a fresh
`npx supabase db reset` and a clean re-run resolved it — the Stage 10 numbers
above are the clean-reset pass.

### Unresolved decisions
- None new. BLOCKED residuals carried forward to Stage 11.

### Next stage
Stage 11 — Release readiness & final report.

---

*End of current ledger. Stage 11 is appended next.*
