# Phase 5 — Implementation Plan

**Project:** Pulse GYM Management (`E:\GYM Management\gym-management-app`)
**Date:** 2026-11-19
**Status:** Planning artefact for Stage 1 of Phase 5. No application code,
migration, grant, policy or business rule is changed by this document.
**Companion:** `docs/PHASE_5_INITIAL_AUDIT.md` (read-only audit, 16-feature
register `P5-01` … `P5-16`).

---

## 1. Constraints that shape every stage

These are non-negotiable and are checked as a gate at the end of **each**
stage, not only at the end of Phase 5.

| # | Constraint | How it is verified |
|---|---|---|
| C1 | Phase 4 baseline stays green (suites `0001`–`0008`, backend readiness, frontend role visibility, `tsc`, `expo lint`, Jest) | Full re-run at Stages 2 and 10 |
| C2 | No RLS widening, no `USING (true)`, no policy relaxation | Diff review of `0002` and any new migration; suite `0005` re-run |
| C3 | AAL2 enforced on every privileged write exactly as in `0003` | New validation suite asserts `aal1` refusal |
| C4 | Audit attribution preserved; every new privileged write calls `audit_authority` | Validation suite asserts the audit row |
| C5 | Authorisation by `profiles.role` only — never JWT claims or UI state | `require_role` in every new function |
| C6 | No service-role key in the app; no unrestricted direct table writes | Grep of `src/`; privilege diff in the new migration |
| C7 | Approved business rules unchanged (calendar months, inclusive freezes, frozen-day extension, renewal anchoring, full payment only, reversal caps, 30-day inactivity, Asia/Kolkata, scan auto-resume, expired members may attend, multiple scans/day) | Suites `0007`, `0003`, `0004` re-run; no date-math code touched |
| C8 | No Git commit/push/deploy; no `supabase link`; local Supabase only; uncommitted Stage 5 work preserved | `git status` before/after each stage |
| C9 | No real customer messages, no paid accounts, no invented credentials | Blocked register (§9) honoured |
| C10 | New migrations only when genuinely needed, with least-privilege grants and a validation suite, tested from a fresh `db reset` | Stage 2 gate |

**Ban on fabricated results.** Any stage whose evidence is not an actual
command output is recorded as BLOCKED, never PASS.

---

## 2. The eleven stages

Stage sequencing is fixed. A stage may end BLOCKED (with the reason
recorded) but may not be skipped, and the next stage may not consume a
feature that the previous stage left incomplete without saying so.

| Stage | Name | Primary outcome |
|---|---|---|
| 1 | Initial audit | Read-only classification of the 16 features, security risks, migration assessment |
| 2 | Backend closure | `0009` receipt RPC + additive indexes + validation suite; fresh reset |
| 3 | Data layer completion | Scoped/bounded queries, mappers, hooks and write wrappers for every new surface |
| 4 | Reception completion | Live plan catalogue/assignment, application review, member history, receipt action |
| 5 | Owner completion | Settings, plan price/lifecycle, audit viewer, applications visibility |
| 6 | Member completion | Own payments/receipts view; no new privileges |
| 7 | Notifications & reminders | In-app derived notification centre; delivery stays BLOCKED |
| 8 | Analytics & export | Bounded-range analytics + dependency-free CSV/text export |
| 9 | Security review | Negative tests, privilege/RLS diff, `docs/PHASE_5_SECURITY_REVIEW.md` |
| 10 | Full regression verification | All suites, both harnesses, `tsc`, lint, Jest — actual results only |
| 11 | Release readiness & final report | `docs/PHASE_5_RELEASE_READINESS.md`, `docs/PHASE_5_FINAL_REPORT.md`, production-vs-RC decision |

---

## 3. Stage detail

Every stage lists: objective, scope, files, database changes, security
controls, acceptance gate. A stage is **done** only when its gate is
evidenced by real output, the progress report is updated, and `git status`
still shows only intended files.

---

### Stage 1 — Initial audit (COMPLETE)

**Objective.** Audit before building; classify all 16 features; decide what
is genuinely missing.

**Deliverables.**
- `docs/PHASE_5_INITIAL_AUDIT.md` — 16-feature register, screen-by-screen
  finding table, risks S1–S12, reusable assets, migration assessment,
  blocked dependencies, recommended order, owner decisions.
- `docs/PHASE_5_IMPLEMENTATION_PLAN.md` — this document.
- `docs/PHASE_5_PROGRESS_REPORT.md` — created and marked Stage 1 complete.

**Database changes.** None.
**Security controls.** None changed. The audit records the controls that
must remain true (§6.1 of the audit).

**Acceptance gate.**
- Every one of `P5-01` … `P5-16` has a status and a concrete evidence path.
- At least one non-obvious defect is documented with file/line evidence
  (found: `plans.tsx` renders demo data in live mode;
  `payment-qr.tsx` reads session QR state in live mode;
  `usePendingApplications` returns only a count; receipt metadata is
  unreachable).
- No file outside `docs/` touched. **PASS** — `git status` shows only the
  pre-existing Stage 5 writes plus the new docs.

---

### Stage 2 — Backend closure (`0009`)

**Objective.** Close the one genuine backend gap (receipt issuance) and
prove it from a fresh reset; record the measured index assessment.

**Scope.**
1. `supabase/migrations/0009_receipt_issuance.sql`
   - `issue_receipt(p_payment_id uuid) returns uuid`
     - `SECURITY DEFINER`, `set search_path = 'public'`
     - `perform public.require_role(array['receptionist'])`
     - `perform public.assert_aal2()`
     - row locked `for update`; must exist and be `state = 'verified'`
     - must be `receipt_issued = false` → one-way; a second call raises
       `55000` and changes nothing
     - optional guard: refuse a `reversal_of` row (receipts belong to
       money-in entries) — decided from the column semantics in `0001`
     - sets `receipt_issued = true`, `receipt_path = null`
     - `perform public.audit_authority('receipt.issued', 'payments',
       p_payment_id::text, null, jsonb_build_object('receipt_issued', true))`
       matching the `0003` helper signature exactly
   - **Index assessment (measured at Stage 2).** `0001` already provides
     every access path Phase 5 needs:
     `payments_recorded_at_idx`, `payments_member_recorded_idx`,
     `audit_time_idx`, `attendance_member_time_idx`, `freezes_member_idx`,
     `periods_member_start_idx`. No index is added — a duplicate index adds
     write cost for no read benefit. The migration header records this
     negative result.
   - Grants: `grant execute ... to authenticated`; `revoke ... from
     public, anon, service_role` — mirroring `0003`.
2. `supabase/tests/0009_receipt_issuance_validation.sql`
   - schema/privilege assertions (`has_function_privilege`, index existence)
   - `anon` refused; `member` refused; `owner` refused; `aal1`
     receptionist refused
   - unverified payment refused; second issue refused; state unchanged on
     refusal
   - success path flips exactly one row and writes exactly one
     `receipt.issued` audit row with the actor id
   - no financial column changes (price, payable, state, verified_by
     untouched)
3. `npx supabase db reset` on the local stack, then **all** suites
   `0001`–`0009` re-copied and re-run (reset wipes `/tmp` copies).

**Files.** the migration, the suite, `docs/PHASE_5_PROGRESS_REPORT.md`.
**Database changes.** one function, three indexes, two grant statements.
No table, column, policy, trigger or view change.
**Security controls.** C2–C6 above; the suite proves role/AAL2 refusal and
audit attribution.
**Acceptance gate.** Fresh reset applies `0001`–`0005`, `0008`, `0009`;
suite `0009` green; `0001`–`0008` still green; `receipt_issued` can only
move `false → true` through the RPC.

**Explicit non-goals.** No `receipt_path` value (no storage bucket), no PDF
generation in SQL, no change to `payments_insert_override`, no
`pending_plan_id` view column *unless* Stage 4 proves it is required (then
it is an additive column with no row-access change, decided here, not
smuggled in later).

---

### Stage 3 — Data layer completion

**Objective.** Make every Stage 4–8 surface possible without adding
privileges or fetching whole tables.

**Scope.**
- `src/services/data/queries.ts`
  - `fetchPaymentRowsForMember(memberId)` — `.eq('member_id', …)`, explicit
    columns, bounded limit
  - `fetchMembershipPeriodRowsForMember`, `fetchFreezeRowsForMember`
  - `fetchJoinApplicationRows` — full row (id, name, phone, email, state,
    submitted_at, auth_user_id presence), never a bare count
  - `fetchAuditLogRows({ limit, before })` — owner path, explicit columns
  - `fetchPaymentRowsInRange(from, to)` and
    `fetchAttendanceRowsInRange(from, to)` — replaces unbounded
    client-side filtering
- `src/services/data/rows.ts` — new row interfaces for the above
- `src/services/data/mappers.ts` — period/freeze-history, application,
  audit, method-split and trend mappers (no invented values; missing data
  stays `null`)
- `src/services/data/use-data.ts` — `useMemberHistory`,
  `useApplications`, `useAuditLog`, `useRevenueRange`, `useMemberPayments`
- `src/services/data/writes.ts` — `issueReceipt`, `requestPlanAssignment`,
  `decideApplication` wrappers (arguments and error surface only)
- `src/services/data/index.ts` — re-exports

**Database changes.** None.
**Security controls.** Every query keeps RLS as the row gate, selects an
explicit column list, and never widens scope by removing a filter the RPC
layer would enforce. No `.select('*')`.
**Acceptance gate.** New queries compile; member-scoped fetches never
return another member's rows (asserted by filter inspection and a live
check in Stage 10); no query is unbounded.

---

### Stage 4 — Reception completion

**Objective.** Remove the two misleading live surfaces and finish the
desk's missing workflows.

**Scope.**
- `plans.tsx` — live mode reads `usePlans()` and `useMembers()`; demo
  arrays only when `isLive === false`. Assignment calls
  `requestPlanAssignment` and renders the server result (pending →
  applies on next verified payment). Price edit in live mode is
  owner-only: the control is disabled with the reason, not silently local.
- **Application review** (new reception screen, e.g.
  `src/app/(reception)/applications.tsx`) — list `submitted` rows,
  approve/reject through `decideApplication`, show the created member id
  and the server's refusal wording when the RPC refuses.
- `member-profile.tsx` — membership history from `membership_periods` +
  `membership_freezes` (plans, renewals, freeze windows, status), replacing
  "Not recorded"; keep "Not recorded" only for fields the backend truly
  lacks (photo, DOB, gender, address, emergency contact).
- `transaction-history.tsx` — "Issue receipt" action on verified rows via
  `issueReceipt`; disabled with a stated reason on unverified/reversal
  rows; no share yet (Stage 8 owns export).
- `more.tsx` — links to Applications and (Stage 6/8) receipts.

**Database changes.** None expected. If a pending assignment must be
visible after navigation, add `pending_plan_id`/`pending_plan_requested_at`
to `v_member_status` in Stage 2's migration — decided at Stage 2, not here.
**Security controls.** Owner-only actions stay owner-only in the live
branch; every refusal is displayed verbatim; no client-computed price or
state.
**Acceptance gate.** In live mode no screen renders demo plans or demo
members; assignment and application decisions produce real server rows
(verified in Stage 10's live harness); owner-only controls are visibly
disabled for a receptionist.

---

### Stage 5 — Owner completion

**Objective.** Give the owner the surfaces the backend already authorises.

**Scope.**
- New owner settings screen — `app_settings.upi_id`, timezone
  (Asia/Kolkata default), attendance-token validity bounds
  (5–600 s) through `update_gym_settings`; shows current live values from
  `useGymSettings`.
- `payment-qr.tsx` — live mode renders `app_settings.upi_id` (generated
  QR) and states that configuration is owner-only; the session store is
  used **only** in demo mode.
- Plan management from the owner workspace — create/deactivate
  (`create_plan`/`deactivate_plan`) and price change (`update_plan_price`)
  with the current price and the audit consequence stated.
- New owner audit screen — `useAuditLog`, newest-first, bounded page,
  explicit columns (time, actor, action, table, target), no raw JSON dump
  beyond a collapsed detail.
- `dashboard.tsx` — the applications attention item links to a real
  destination (owner read-only list or the reception screen, per the owner
  decision in §10) instead of dead-ending.

**Database changes.** None.
**Security controls.** `owner`-gated RPCs only; audit viewer is read-only
and owner-only by existing policy; no export-to-URL.
**Acceptance gate.** Owner can read settings, change them, see the audit
row appear; receptionist is refused by the server and shown the refusal.

---

### Stage 6 — Member completion

**Objective.** Let a member see their own money and receipts without any
new privilege.

**Scope.**
- `src/app/(member)/` payments/receipts view reading only the caller's rows
  (RLS already restricts `payments` to the linked member).
- Receipt status (`issued` / `not issued`) and the exact verified amount,
  method, date, UTR where present.
- No share in this stage.

**Database changes.** None.
**Security controls.** Queries are member-scoped; the member cannot read
another member's row even by id (RLS is the gate; the query filter is
defence in depth).
**Acceptance gate.** Member workspace shows own payments only; a
cross-member id fetch returns no rows (asserted in Stage 10).

---

### Stage 7 — Notifications & reminders (in-app only)

**Objective.** Replace derived counters with an honest in-app notification
centre; keep delivery BLOCKED.

**Scope.**
- A derived notification model built from readable data only: expiring
  memberships, inactive members, pending payment verifications, pending
  applications, pending freezes, unissued receipts on verified payments.
- Per-role centre (owner, receptionist) with read state **in memory only**
  and clearly labelled as such — or persisted locally with no PII beyond
  an id if the owner approves the storage decision (§10).
- Deep links to the relevant screen; no notification claims an external
  message was sent.

**Database changes.** None.
**Security controls.** No provider payload, no PII in any third-party
channel; the centre cannot surface a row the session could not otherwise
read.
**Acceptance gate.** Every notification item traces to a live query; no
"sent"/"delivered" wording anywhere; push/SMS/email recorded BLOCKED.

---

### Stage 8 — Analytics & export

**Objective.** Real period analytics and a dependency-free export.

**Scope.**
- `report.tsx` — live 7-day attendance series and weekly collections from
  bounded range queries; payment-method split (cash/UPI) from the same
  rows; month-over-month trend from `v_month_revenue`. Remove the
  "charts omitted" notice only when real points exist.
- Custom range selection with a capped span and row limit.
- Export as CSV **text shared through the platform share sheet** (or a
  text-file write) built from the current view's rows; explicit user
  action, confirmation, and a caption stating exactly what leaves the
  device. No `expo-print`/`expo-sharing` install unless approved (§10).

**Database changes.** None (indexes from Stage 2 support it).
**Security controls.** Share is user-initiated; no automatic upload; the
export contains only rows the session may read; row cap prevents a bulk
dump.
**Acceptance gate.** Charts render only from live rows; the export content
matches the on-screen ledger exactly; canceling the share sends nothing.

---

### Stage 9 — Security review

**Objective.** Prove Phase 5 added no hole.

**Scope / evidence for `docs/PHASE_5_SECURITY_REVIEW.md`.**
- Full grant matrix dump (`information_schema.role_table_grants`,
  `has_function_privilege` for every RPC × role) before/after.
- `pg_policies` dump proving no policy was added, dropped or widened.
- Grep evidence: no `service_role`/secret key in `src/`; no
  `.rpc(` outside `writes.ts`; no `from(<table>).update|insert|delete`
  outside the two approved INSERT paths.
- Negative tests: `aal1` staff refused on every AAL2 RPC; `owner` refused
  on receptionist RPCs and vice versa; `anon` refused everywhere;
  cross-member read returns nothing; direct `UPDATE payments` still
  blocked by `assert_no_client_mutation`.
- Findings table with severity and resolution (or accepted-risk note).

**Database changes.** None.
**Acceptance gate.** Every control in §1 has a passing assertion; any
residual risk is written down, not hidden.

---

### Stage 10 — Full regression verification

**Objective.** Re-establish the whole baseline plus the new work, with real
output.

**Scope.**
1. `npx supabase db reset` (clean local DB).
2. Re-copy and run suites `0001`–`0009` (`0006` as `supabase_admin`).
3. `node scripts/backend-readiness-check.mjs` — extended with the new
   RPCs/reads; **`db reset` first** because the harness leaves plans and
   `is_active` residue.
4. `node scripts/frontend-role-visibility-check.mjs` — extended with the
   new screens/roles.
5. `npx tsc --noEmit`, `npx expo lint`, `npx jest`.
6. `npx supabase db reset` again afterwards to leave a clean local DB.

**Database changes.** None (reset only).
**Acceptance gate.** Actual pass/fail counts recorded per suite and per
harness in `docs/PHASE_5_PROGRESS_REPORT.md`; any failure either fixed or
recorded as a known failure — never reported as a pass.

---

### Stage 11 — Release readiness & final report

**Objective.** State honestly whether this is production-ready or a
release candidate, and what the owner must do.

**Deliverables.**
- `docs/PHASE_5_RELEASE_READINESS.md` — environment variables, external
  services still unconfigured, owner action items (staff accounts, storage
  bucket, backups, push credentials, store signing), residual risks,
  production vs release-candidate verdict with the reasoning.
- `docs/PHASE_5_FINAL_REPORT.md` — files created/changed, migrations,
  actual test results copied from Stage 10, security findings and
  resolutions, external services needing configuration, owner action
  items, and the final status.
- Update `PHASE_TRACKER.md` and the progress report to close the phase.

**Database changes.** None.
**Acceptance gate.** Every claim in the final report is traceable to a
command output or a file in the repo; the blocked register matches §9; no
test result is invented.

---

## 4. Per-stage file map

| Stage | Expected new/changed files |
|---|---|
| 1 | `docs/PHASE_5_INITIAL_AUDIT.md`, `docs/PHASE_5_IMPLEMENTATION_PLAN.md`, `docs/PHASE_5_PROGRESS_REPORT.md` |
| 2 | `supabase/migrations/0009_receipt_issuance.sql`, `supabase/tests/0009_receipt_issuance_validation.sql` |
| 3 | `src/services/data/{queries,rows,mappers,use-data,writes,index}.ts` |
| 4 | `src/app/(reception)/{plans,member-profile,transaction-history,more}.tsx`, new `(reception)/applications.tsx`, `src/services/data/*` as needed |
| 5 | new `(owner)/settings.tsx`, new `(owner)/audit.tsx`, `(owner)/dashboard.tsx`, `(owner)/plans.tsx` (or owner branch), `(reception)/payment-qr.tsx` |
| 6 | new `(member)` payments/receipts screen, member `_layout.tsx` tab entry |
| 7 | notification model/hook, owner + reception notification surfaces |
| 8 | `(owner)/report.tsx`, export helper in `src/utils/` |
| 9 | `docs/PHASE_5_SECURITY_REVIEW.md` |
| 10 | `scripts/backend-readiness-check.mjs`, `scripts/frontend-role-visibility-check.mjs` |
| 11 | `docs/PHASE_5_RELEASE_READINESS.md`, `docs/PHASE_5_FINAL_REPORT.md`, `PHASE_TRACKER.md` |

Exact filenames for Stages 5–8 are confirmed against the existing routing
conventions when each stage starts; a filename change is recorded in the
progress report rather than silently substituted.

---

## 5. Migration strategy

- Latest applied migration is `0008_stage5_write_paths.sql` (uncommitted,
  preserved). The next file is **`0009`**; no number may be reused.
- Only Stage 2 is expected to need a migration. Any later stage that
  believes it needs one must first prove the gap cannot be closed with an
  existing RPC/view; if it still does, it becomes `0010` with the same
  least-privilege + validation-suite + fresh-reset discipline, and the
  reason is written into the progress report.
- Each migration is additive: no `drop`, no `alter policy`, no
  `alter table ... drop`, no data rewrite.
- Each migration ships with its own `supabase/tests/000N_*_validation.sql`
  suite built from the `0008` template (`check_ok`, `expect_error`,
  role/AAL2 impersonation helpers, audit assertions).

---

## 6. Test strategy

| Layer | Tool | Cadence |
|---|---|---|
| Schema, RLS, triggers | suites `0001`, `0002`, `0005` | Stage 2 and Stage 10 |
| Authority functions | suites `0003`, `0008`, new `0009` | Every backend change and Stage 10 |
| Views / date math | suites `0004`, `0007` | Stage 10 |
| Concurrency / reversal cap | suite `0006` (as `supabase_admin`) | Stage 10 |
| Live backend behaviour | `scripts/backend-readiness-check.mjs` | After every reset; extended per stage |
| Role visibility / route guards | `scripts/frontend-role-visibility-check.mjs` | Stage 10 |
| Types / lint / unit | `tsc --noEmit`, `expo lint`, `jest` | Every stage that changes `src/` |

Rules:
- Run suites from `/tmp` copies inside the DB container; re-copy after
  every `db reset`.
- Never edit a passing suite to accommodate new code; extend it.
- Record the raw pass/fail counts. A suite that cannot run is BLOCKED.

---

## 7. Definition of done (per stage)

A stage is complete only when all of the following are true:

1. Scope above is delivered, or the un-delivered parts are listed as
   BLOCKED with the reason.
2. The stage's acceptance gate is evidenced by real command output.
3. `git status` shows only intended files; no unrelated file is reverted.
4. `docs/PHASE_5_PROGRESS_REPORT.md` is updated with: files changed,
   implementation notes, DB changes, security controls, test results
   (passed / failed / blocked), unresolved decisions.
5. No constraint in §1 is weakened.

---

## 8. Risk register for the build phase

| Risk | Mitigation |
|---|---|
| A new RPC omits `require_role`/`assert_aal2`/`audit_authority` | Copy the `0003` template verbatim; suite asserts refusal + audit row |
| Receipt issuance accidentally mutates financial columns | Suite asserts price/payable/state/verified_by unchanged |
| Live screens keep demo fallbacks by accident | Stage 4 gate + Stage 10 role harness asserts demo arrays are unreachable in live mode |
| Unbounded queries grow with data | Explicit `.limit()`/range on every new query; reviewed in Stage 9 |
| Export leaks PII/financial data | User-initiated only, confirmation, row cap, content = on-screen rows |
| Notification centre implies delivery that never happened | Wording audit in Stage 7; no "sent"/"delivered" strings |
| Harness residue corrupts the next live run | `db reset` before every live harness run |
| Owner-only work collides with the receptionist routes | Owner screens live in `(owner)`; the reception screen disables owner controls with a stated reason |
| Scope creep into Reminders/Push or staff admin | Blocked register §9 is authoritative; those items are documented, not built |

---

## 9. Blocked register (documented, not built)

| Item | Blocker | What Phase 5 delivers instead |
|---|---|---|
| Push reminders (`P5-03`) | No Expo Push/FCM/APNs credentials, no consent policy | In-app derived reminders (Stage 7) |
| SMS reminders (`P5-03`) | Paid provider, sender ID, DLT/consent | In-app only |
| Email reminders (`P5-03`) | Provider/SMTP credentials | In-app only |
| Automatic UPI reconciliation | No payment provider account; design is manual verification | Manual verify/reject unchanged |
| Stored receipt PDF/image (`P5-01`) | No Supabase Storage bucket | On-screen receipt + issued flag + text/CSV share |
| Staff account administration (`P5-12`) | Requires Admin API + service-role key, prohibited in app | Documented owner dashboard action + TOTP enrolment steps |
| Production backups (`P5-14`) | Provider/infrastructure | Local `pg_dump` verification note only |
| Store build/signing (`P5-16`) | EAS credentials, no deploy permitted | Release-readiness checklist and verdict |
| PDF/Excel export (`P5-05`) | Would need `expo-print`/`expo-sharing`, unapproved install | Dependency-free CSV/text export |
| Offline cache/queue (`P5-15`) | Conflict/security design undefined; caching financial data securely is out of scope | Explicit error + retry states (current behaviour, documented) |

---

## 10. Owner decisions required before/within Stage 2

1. **Confirm the reconstructed 16-feature register** (`P5-01` … `P5-16`). If
   the original list differs, supply it before Stage 2.
2. **Receipt semantics** — approve the one-way `issue_receipt` RPC that
   sets `receipt_issued = true` on an already-verified payment (no
   financial change, audited), or require receipts to stay purely
   read-only.
3. **Application review role** — confirm the reception desk owns
   approval (as `decide_application` enforces) and the owner sees a
   read-only count/list.
4. **Export format** — confirm dependency-free CSV/text share is
   acceptable for Phase 5, with PDF/Excel deferred.
5. **Reminder delivery** — confirm push/SMS/email stay BLOCKED and only
   in-app reminders ship.
6. **Staff administration** — confirm the owner dashboard path is the
   approved operational model.
7. **Notification read state** — memory-only, or persisted locally
   (ids only, no PII)?

Defaults if no answer is received: proceed with the recommendation in each
case and record the assumption in the progress report, so no stage is
silently blocked on an unanswered question.

---

## 11. Progress-report contract

`docs/PHASE_5_PROGRESS_REPORT.md` is the single running ledger. After every
stage it gains one section containing exactly:

- **Stage / status** (COMPLETE / PARTIAL / BLOCKED)
- **Files changed**
- **Implementation notes**
- **DB changes**
- **Security controls exercised**
- **Test results** — passed / failed / blocked, with counts and the command
  used
- **Unresolved decisions**
- **Next stage**

No stage is marked COMPLETE in the ledger without its gate evidence.

---

## 12. Immediate next action

Stage 2, once the owner confirms (or defaults apply to) decisions 1–3:
write `0009_receipt_issuance.sql` and its validation suite, run a fresh
`npx supabase db reset`, and re-run suites `0001`–`0009`.
