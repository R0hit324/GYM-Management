# SECURITY BATCH 2F — NON-DESTRUCTIVE SECURITY CONTROL VERIFICATION — REPORT

**Project:** Gym Management App (`gym-management-app`)
**Batch:** Batch 2F — Non-Destructive Security Control Verification
**Date:** 2026-11-23
**Mode:** Read-only static inspection + **synthetic-data tests inside a single rolled-back transaction**. No production/hosted access, no schema/migration/source changes.
**Predecessor:** Batch 2E accepted as a documentation deliverable, with two accuracy corrections applied in Part A of this batch.

---

## 1. Executive Summary

Batch 2F verified four independent security controls with synthetic fixtures and re-ran the relevant project regression suites. **No product defect was found in any of the four controls.** The known inactivity policy/implementation boundary discrepancy remains **unresolved** and is recorded as an Owner decision (OD-7), not silently changed.

### Results at a glance

| Control | Tests | Result | Evidence class |
|---|---|---|---|
| 2F-A — Receptionist access revocation | 22 | **22 / 22 passed** | TESTED |
| 2F-B — Member contact correction authorization | 15 | **15 / 15 passed** | TESTED |
| 2F-C — Inactive-member classification | 14 | **14 / 14 passed** | TESTED |
| 2F-D — Membership history protection | 12 | **12 / 12 passed** | TESTED |
| Static/catalog checks (RLS, triggers, grants, FKs) | 8 | **8 / 8 passed** | STATICALLY VERIFIED + TESTED |
| **Batch 2F synthetic suite total** | **71** | **71 / 71 passed** | TESTED |
| Existing SQL regression suites | 220 assertions | **220 / 220 passed** (0004 81, 0008 27, 0011 52, 0012 60) | TESTED |
| Jest unit/component suite | 243 tests / 19 suites | **243 / 243 passed** | TESTED |
| TypeScript (`tsc --noEmit`) | — | **exit 0** | VERIFIED |
| ESLint (`expo lint`) | — | **exit 0** | VERIFIED |

### Key outcomes
- **Access revocation works at the database layer:** `profiles.is_active = false` is honoured by `app_profile_role()`, `require_role()`, RLS and authority functions immediately; a deactivated receptionist resolves to `NULL` role and is denied protected operations. The Edge Function applies the database switch **before** the GoTrue ban, so a failed auth-side ban cannot leave application authorization enabled. [STATICALLY VERIFIED + TESTED]
- **Contact correction is correctly gated:** receptionist + AAL2 succeeds; member, owner, AAL1 receptionist, inactive receptionist and direct table writes are denied; phone/email validation runs; membership state is untouched; one audit row is written per successful update. [TESTED]
- **Inactive classification:** 29 days → not inactive; **exactly 30 days → not inactive**; 31 days → inactive; freeze-day subtraction and timezone handling behave as implemented. The 30-day boundary **diverges from policy wording** and remains **OWNER DECISION REQUIRED**. [TESTED]
- **Membership history is protected:** no client UPDATE/DELETE privilege; `trg_client_guard` present; RESTRICT FKs block member/payment/plan deletion; archiving a member does not erase history; void/reversal linkage is intact. [TESTED + STATICALLY VERIFIED]
- **Isolation proven:** all 71 tests ran inside one transaction ending in `ROLLBACK`; after the run every table count matched the pre-run baseline, no `suite_results` schema remained, and no `SYNTH-B2F` rows existed. [VERIFIED]

### Batch 2E accuracy corrections (Part A)
Tier 1 readiness was re-expressed as three separate levels — test design (ready), harness implementation (not validated), execution (**CONDITIONAL / BLOCKED**) — and the inactivity boundary divergence was strengthened in §4.4 and §10. No conclusion was weakened and no historical evidence was erased.

---

## 2. Batch 2E Correction Summary

The following narrowly scoped edits were made to `docs/SECURITY_BATCH_2E_DECISION_CLOSURE_AND_TIER_0_1_PREPARATION_REPORT.md`. The report was already uncommitted; no historical closure report was altered.

| # | Location | Correction |
|---|---|---|
| C-1 | §1 executive table | Tier 1 row changed to **DESIGN ONLY**; harness not implemented; isolation/rollback/residue not validated; execution **CONDITIONAL / BLOCKED** |
| C-2 | §9 opening | Added an explicit **accuracy correction** note (Batch 2F review) stating the original wording overstated readiness |
| C-3 | §9.1 | Added three separately-scored readiness levels: **test design**, **harness implementation**, **execution** |
| C-4 | §9.1a | Added environment facts, reclassified fixture capability and rollback harness as **NOT IMPLEMENTED / NOT VALIDATED** |
| C-5 | §9.7 | Conclusion now: test design ready; harness not validated; execution **CONDITIONAL / BLOCKED** |
| C-6 | §4.4 + §10 row 4 | Inactivity divergence explicitly described: policy 30 days vs implementation `inactive_days > 30` (inactive at 31+); **unresolved, Owner decision required**, threshold not changed |
| C-7 | §10 rows 12–13, §13, §15 | Removed "environment-ready" overstatement; noted a validated Tier 1 harness is still required; logged the correction in the change inventory |

**Preserved:** all VERIFIED facts, prior conclusions, historical evidence, the cascade blocker, and all Owner/external decision registers. No evidence was deleted.

---

## 3. Scope and Safety

### In scope
- Four controls: receptionist access revocation; member contact correction; inactive-member classification; membership history protection.
- Synthetic fixtures only, inside one transaction, ending in `ROLLBACK`.
- Read-only static inspection of migrations, functions, RLS, triggers, grants, FKs and the staff-admin Edge Function.
- Re-running the existing relevant SQL suites and Jest/tsc/lint.

### Out of scope (not performed)
- Retention, purge, deletion, anonymization, scheduling, privacy-request execution.
- Any destructive migration or schema change; any source change.
- Any real member/payment/attendance/staff data creation, modification or deletion.
- Hosted/production access; `supabase reset`/`db reset`/seed.
- Dependency install/upgrade; commit/push/deploy.
- Resolving the 30-day policy discrepancy; modifying the consent/privacy CASCADE.

### Safety mechanics actually used
- All fixtures named `SYNTH-B2F-*` with deterministic UUID namespace `b2f00000-0000-4000-8000-…`.
- Persona simulation via `SET LOCAL ROLE` + transaction-local `request.jwt.claims` (session_user stayed `postgres`, so fixture inserts were trusted and role switching could not persist).
- Assertions collected in a transaction-local `suite_results` schema; the whole schema was dropped by `ROLLBACK`.
- Baseline counts captured before the run and re-checked after `ROLLBACK`.
- No Storage object tests (Storage is outside SQL transactions); no GoTrue admin API calls.

---

## 4. Preflight Environment Evidence

### 4.1 Repository state [VERIFIED]
- Branch: `main`; HEAD `90753a40801b9d859b61a0ef33557f0b1c3eadd1` (`docs: stage 1 comprehensive security audit report and stage 2 security remediation plan`).
- Pre-existing working-tree changes preserved: modified `package.json` / `package-lock.json` (R-3A) and untracked prior-batch reports plus `supabase/tests/0014_migration_safety_validation.sql`. Nothing was deleted or reverted.

### 4.2 Local service state [VERIFIED]
`docker ps` showed a healthy local Supabase stack, including:
- `supabase_db_GYM_Management` — `public.ecr.aws/supabase/postgres:17.12.0.000` — **Up (healthy)** — `0.0.0.0:54322->5432/tcp`
- `supabase_auth_GYM_Management` (gotrue), `supabase_rest_GYM_Management`, `supabase_storage_GYM_Management`, `supabase_kong_GYM_Management`, and others healthy.
- `supabase_vector_GYM_Management` was restarting; unrelated to database testing.

### 4.3 Database identity and locality [VERIFIED]
- `SELECT version()` → **PostgreSQL 17.12**.
- Connection target: `docker exec supabase_db_GYM_Management psql -U postgres -d postgres` (local container, host port **54322**).
- `supabase/config.toml`: `project_id = "GYM_Management"`, local DB port `54322`, shadow port `54320`. This matches the local container name.
- **No hosted URL was contacted.** `.env` contains `EXPO_PUBLIC_SUPABASE_URL` / publishable key only (values not read into this report); no service-role key, no remote management command was used.

### 4.4 Baseline row counts before testing [VERIFIED]
| Table | Baseline |
|---|---|
| `auth.users` | 0 |
| `public.profiles` | 0 |
| `public.members` | 0 |
| `public.plans` | 4 (seeded) |
| `public.payments` | 0 |
| `public.membership_periods` | 0 |
| `public.membership_period_voids` | 0 |
| `public.attendance_events` | 0 |
| `public.membership_freezes` | 0 |
| `public.qr_tokens` | 0 |
| `public.audit_log_entries` | 0 |
| `public.consent_records` | 0 |
| `public.privacy_requests` | 0 |
| `public.app_settings` | 1 |

The database was pristine, so any residue would have been immediately visible.

### 4.5 Existing test infrastructure [VERIFIED]
- SQL suites: `supabase/tests/0001…0012` plus `0014`; `0011_staff_administration_validation.sql`, `0008_stage5_write_paths_validation.sql`, `0004_views_validation.sql`, `0012_privacy_consent_validation.sql` are directly relevant.
- Jest config: `jest.config.js` (`preset: jest-expo`, `testEnvironment: node`); 19 test files under `src/__tests__/`.
- The existing SQL suites create committed fixtures and then delete them by synthetic prefix and `drop schema suite_results cascade`; this was verified before re-running them.

---

## 5. Synthetic Fixture Strategy

### 5.1 Isolation model
Everything ran in **one** SQL transaction:

```
begin;
  create schema suite_results;          -- transaction-local
  insert synthetic auth/users/profiles/members/…;
  run assertions as postgres and as simulated personas;
  select results;                       -- printed before rollback
rollback;                               -- removes schema, fixtures, grants, audit rows
```

Persona switches used `SET LOCAL ROLE authenticated` plus:
```
SET LOCAL request.jwt.claims = '{"sub":"<uuid>","role":"…","aal":"aal2"}';
SET LOCAL request.jwt.claim.sub = '<uuid>';
```
`RESET ROLE` and `RESET request.jwt.*` returned the session to `postgres` between blocks. `SET LOCAL` cannot outlive the transaction.

### 5.2 Fixture namespace
- Names: `SYNTH-B2F Owner`, `SYNTH-B2F Receptionist`, `SYNTH-B2F Rec Inactive`, `SYNTH-B2F Member`, `SYNTH-B2F Owner Two`, plus view-only members (`SYNTH-B2F J29/J30/J31/A29/A30/A31/F1/F12/AfterFreeze/Multi`).
- UUIDs: `b2f00000-0000-4000-8000-0000000000xx`.
- Emails: `synth-b2f-*@example.invalid` (reserved invalid TLD); phones `+91990000xxxx`.
- Plan: `SYNTH-B2F-Plan` (monthly, INR 1000).
- Tokens: `md5(...)||md5(...)` 64-hex hashes; no plaintext.
- Payments: one verified `payment` and one verified `reversal`; one `membership_period`; one `membership_period_void`.

### 5.3 Transactional risks evaluated
| Risk | Finding |
|---|---|
| Auth fixture creation | `auth.users` inserts are ordinary transactional inserts; **no trigger** on `auth.users` auto-creates profiles (checked `pg_trigger`). Rolled back cleanly. |
| Storage | Not exercised; would be non-transactional, so excluded. |
| Role switching persistence | `SET LOCAL ROLE` + `RESET ROLE`; cannot persist beyond the transaction. |
| Fixture collision | UUID namespace and `SYNTH-B2F` prefix are unique; confirmed zero pre-existing matches. |
| Protected data | No real rows existed; no real identifier used. |

### 5.4 Rollback and residue proof [VERIFIED]
After the final run, the counts were **identical to the §4.4 baseline**: `auth.users 0`, `profiles 0`, `members 0`, `plans 4`, `payments 0`, `periods 0`, `voids 0`, `attendance 0`, `freezes 0`, `qr_tokens 0`, `audit 0`, `consent 0`, `privacy 0`, `app_settings 1`. Additionally:
- `suite_results` schema count = **0**;
- `SYNTH-B2F` members = **0**;
- `synth-b2f` auth users = **0**.

**Isolation, rollback, and residue detection are therefore proven for this harness** (the gap identified in the Batch 2E correction).

---

## 6. Test Results — 2F-A Receptionist Access Revocation

**Control under test:** `profiles.is_active` revocation, role gates, RLS denial, owner-only boundaries, and the Edge Function deactivation ordering.

### 6.1 Static verification [STATICALLY VERIFIED]
- `0011_staff_administration.sql`: `profiles.is_active boolean not null default true`; `app_profile_role()` and `require_role()` filter on `is_active`; `admin_set_staff_active()` refuses self, owner and member targets; `admin_staff_assert()` requires owner + AAL2.
- `supabase/functions/staff-admin/index.ts` (`action === 'deactivate'`): calls `admin_set_staff_active(p_active:false)` **first**, then applies the GoTrue long ban. If the ban fails, the response still reports `deactivated: true` and the database switch is already authoritative ("the account is deactivated and denied by the database, but the auth-side session block could not be applied"). This satisfies "a failed external auth deactivation must not leave application authorization enabled."
- Regression suite `0011` recorded **52/52** assertions.

### 6.2 Executed tests [TESTED]
| ID | Assertion | Result |
|---|---|---|
| A01 | Active receptionist resolves to role `receptionist` | PASS |
| A02 | Active receptionist can mint an attendance token | PASS |
| A03 | Inactive receptionist resolves to `NULL` role | PASS |
| A04 | Inactive receptionist cannot mint a token (`42501`) | PASS |
| A05 | Inactive receptionist sees 0 member rows via RLS | PASS |
| A06 | Inactive receptionist sees 0 profile rows via RLS | PASS |
| A07 | Member cannot mint a token (`42501`) | PASS |
| A08 | Member cannot read the staff directory (`42501`) | PASS |
| A09 | Active receptionist cannot read the owner-only staff directory (`42501`) | PASS |
| A09b | Active receptionist cannot deactivate staff (`42501`) | PASS |
| A10 | Active owner at AAL2 can read the staff directory | PASS |
| A10b | Directory excludes member-role profiles | PASS |
| A11 | Owner cannot mint an attendance token (owner read-only on operational writes, `42501`) | PASS |
| A11b | Owner at AAL1 is denied staff administration (`42501`) | PASS |
| A12 | Owner cannot deactivate own account (`42501`) | PASS |
| A13 | Owner cannot deactivate another owner (`42501`) | PASS |
| A14 | Owner cannot deactivate a member-role profile (`42501`) | PASS |
| A15 | Owner deactivates an active receptionist | PASS |
| A15b | Deactivated profile has `is_active = false` | PASS |
| A16 | Deactivated receptionist resolves to `NULL` role | PASS |
| A16b | Deactivated receptionist cannot mint a token (`42501`) | PASS |
| A17 | Owner reactivates the receptionist | PASS |

**2F-A: 22 / 22 passed.**

### 6.3 Assessment
- Revocation is **immediate at the database layer** and does not depend on JWT claims.
- **Owner-only operations remain owner-only**; receptionists and members are denied.
- **Members cannot gain staff access.**
- The GoTrue ban is a secondary control; its failure does not restore access.

---

## 7. Test Results — 2F-B Member Contact Correction Authorization

**Control under test:** `update_member_contact(p_member_id, p_phone, p_email)` in `0008_stage5_write_paths.sql`.

### 7.1 Static verification [STATICALLY VERIFIED]
- Requires `require_role(['receptionist'])` **and** `assert_aal2()`.
- Updates only `phone`, `email`, `updated_at`; locks the member row `FOR UPDATE`; does not touch membership state.
- Phone required (non-empty); email optional but must contain `@`.
- Writes `audit_authority('member.contact_updated', 'members', …)` with old/new phone/email.

### 7.2 Executed tests [TESTED]
| ID | Assertion | Result |
|---|---|---|
| B01 | Active receptionist (AAL2) updates contact | PASS |
| B01b | Phone and email updated through the authorized pathway | PASS |
| B02 | `membership_end` unchanged | PASS |
| B03 | Plan linkage unchanged | PASS |
| B04 | One audit row per successful update (2 updates → 2 rows) | PASS |
| B05 | Audit row carries old/new phone values | PASS |
| B06 | Invalid email rejected (`55000`) | PASS |
| B07 | Empty phone rejected (`55000`) | PASS |
| B08 | Member denied (`42501`) | PASS |
| B09 | Owner denied — operation is receptionist-only (`42501`) | PASS |
| B10 | Receptionist at AAL1 denied (`42501`) | PASS |
| B11 | Unknown member rejected (`P0002`) | PASS |
| B12 | Receptionist cannot update `members` directly (`42501`) | PASS |
| B13 | Null email allowed (optional) | PASS |
| B13b | Null email persisted | PASS |

**2F-B: 15 / 15 passed.**

### 7.3 Assessment
- Role boundary, AAL2 requirement, field validation, membership isolation and audit evidence all behave as documented.
- Member and owner cannot use the receptionist pathway; direct client writes are denied.

---

## 8. Test Results — 2F-C Inactive-Member Classification

**Control under test:** `v_inactive_members` in `0004_views.sql`. The view subtracts approved/ended freeze days between the day after last attendance (or `joined_on`) and gym today, then sets `is_inactive = (inactive_days > 30)`, using `app_settings.gym_timezone` (default `Asia/Kolkata`) and **verified** attendance only.

### 8.1 Executed tests [TESTED]
| ID | Scenario | Result |
|---|---|---|
| C01 | No attendance; joined 29 days ago → not inactive, raw 29 | PASS |
| C02 | No attendance; joined **exactly 30** days ago → **NOT** inactive, raw 30 | PASS |
| C03 | No attendance; joined 31 days ago → inactive, raw 31 | PASS |
| C04 | Verified attendance 29 days ago → not inactive, inactive_days 29 | PASS |
| C05 | Verified attendance **exactly 30** days ago → **NOT** inactive, inactive_days 30 | PASS |
| C06 | Verified attendance 31 days ago → inactive, inactive_days 31 | PASS |
| C07 | 1 frozen day subtracted from 30 → inactive_days 29, not inactive | PASS |
| C08 | 12 frozen days subtracted from 40 → inactive_days 28, not inactive | PASS |
| C09 | Attendance after an earlier freeze → freeze ignored, inactive_days 5 | PASS |
| C10 | Multiple attendance rows → most recent used, inactive_days 3 | PASS |
| C11 | `is_inactive` equals `(inactive_days > 30)` for every row | PASS |
| C12 | `gym_date` follows `gym_timezone = 'UTC'` | PASS |
| C13 | `gym_date` follows `gym_timezone = 'Asia/Kolkata'` | PASS |
| C14 | Classification does not delete members | PASS |
| S06 | Inactive-member view exists (`to_regclass`) | PASS |

**2F-C: 14 / 14 passed.**

### 8.2 Boundary outcome — UNRESOLVED (OWNER DECISION REQUIRED)
- Policy wording: inactive after **30 consecutive days**.
- Implementation: inactive only when `inactive_days > 30`, i.e. **after the threshold exceeds 30 (at 31+ days)**.
- Both **C02 (no attendance, 30 days)** and **C05 (verified attendance, 30 days)** confirm a member is **not** classified inactive at exactly 30 days; **C03/C06** confirm inactive at 31 days.
- This batch **did not change the threshold or the view**. The discrepancy remains **OWNER DECISION REQUIRED (OD-7)** and must be resolved in authoritative documentation before any policy behavior changes.
- Classification is **not connected to deletion**; no deletion/purge function exists (S07 below).

---

## 9. Test Results — 2F-D Membership History Protection

**Control under test:** append-only `membership_periods` / `membership_period_voids`, RESTRICT FKs, least-privilege grants and `trg_client_guard`.

### 9.1 Static/catalog verification [STATICALLY VERIFIED]
| ID | Assertion | Result |
|---|---|---|
| S01 | RLS enabled **and forced** on both history tables | PASS |
| S02 | `trg_client_guard` present on both history tables | PASS |
| S03 | No UPDATE/DELETE RLS policy on either table | PASS |
| S04 | `authenticated` has no UPDATE/DELETE privilege on either table | PASS |
| S05 | `anon` has no SELECT on either table | PASS |
| S07 | No retention/purge/cleanup function exists in `public` | PASS |
| S08 | Domain FKs on history tables are `RESTRICT` | PASS |

### 9.2 Executed tests [TESTED]
| ID | Assertion | Result |
|---|---|---|
| D01 | Member cannot UPDATE `membership_periods` (`42501`) | PASS |
| D02 | Member cannot DELETE `membership_periods` (`42501`) | PASS |
| D03 | Receptionist cannot UPDATE `membership_periods` (`42501`) | PASS |
| D04 | Receptionist cannot DELETE `membership_period_voids` (`42501`) | PASS |
| D05 | `anon` cannot SELECT `membership_periods` (`42501`) | PASS |
| D05b | `anon` cannot SELECT `members` (`42501`) | PASS |
| D06 | Cannot delete a member that owns membership history (FK `23503`) | PASS |
| D07 | Cannot delete a payment referenced by history (FK `23503`) | PASS |
| D08 | Cannot delete a plan referenced by history (FK `23503`) | PASS |
| D09 | Period and void survive the failed deletes | PASS |
| D10 | Archiving a member does not erase periods | PASS |
| D11 | Void/reversal append-only linkage is intact | PASS |

**2F-D: 12 / 12 passed (plus 7 static checks; S06 counted under 2F-C).**

### 9.3 Assessment
- Client roles cannot mutate history even with direct table access; the guard trigger is present as a second layer.
- `RESTRICT` prevents member/payment/plan deletion from orphaning or cascading history.
- Member lifecycle (`archived_at`) does not erase history.
- Void/reversal corrections are append-only and preserve the original period.

---

## 10. Defects Found

### 10.1 Product defects
**None.** No defect was reproduced in any of the four controls. No source, schema, RLS, function, policy, trigger or grant change is required.

### 10.2 Test-harness expectation errors (not product defects)
The first execution produced 4 failures that were traced to incorrect assertions in the temporary harness, not to product behavior. They were corrected before the authoritative run:

| Initial failure | Cause | Correction |
|---|---|---|
| A11 "owner without AAL2 denied directory" | The block still carried an `aal2` claim, so the call correctly succeeded | Replaced with an owner operational-write denial (owner cannot mint) |
| B04 "one audit row" | Two successful contact updates correctly wrote **two** audit rows | Expectation changed to 2 |
| C14 "member count = 10" | Fixture set contained 11 `SYNTH-B2F` members (1 linked + 10 view members) | Expectation changed to 11 |
| D06 FK message check | Deletion was correctly blocked by `payments_member_id_fkey` before the period FK | Removed the over-specific message assertion; still requires `23503` |

**Authoritative final run: 71 / 71 passed.** The intermediate failures are recorded here for transparency and do not indicate a control defect.

### 10.3 Known issue (not a defect)
- Inactive 30-day boundary divergence — **OWNER DECISION REQUIRED** (OD-7). Unchanged.

---

## 11. Fixes Implemented

**No product fix was implemented** because no in-scope defect was verified.

- No source file changed.
- No migration created or applied.
- No RLS/policy/trigger/function/grant changed.
- No dependency changed.
- No test fixtures persisted.

The only changes are documentation:
1. The authorized Batch 2E accuracy corrections (§2).
2. This Batch 2F report.

The verification harness itself was a temporary SQL script (outside the repository) executed inside a rolled-back transaction; it is not part of the product tree.

---

## 12. Regression Verification

### 12.1 Existing SQL suites (all self-clean; residue re-checked)
| Suite | Assertions | Result | Exit |
|---|---|---|---|
| `0004_views_validation.sql` | 81 | **81 / 81 passed** | 0 |
| `0008_stage5_write_paths_validation.sql` | 27 | **27 / 27 passed** | 0 |
| `0011_staff_administration_validation.sql` | 52 | **52 / 52 passed** | 0 |
| `0012_privacy_consent_validation.sql` | 60 | **60 / 60 passed** | 0 |
| **Total** | **220** | **220 / 220 passed** | 0 |

After these suites, the database returned to the §4.4 baseline (`auth.users 0`, `profiles 0`, `members 0`, `plans 4`, `payments 0`, `audit 0`, `consent 0`, `privacy 0`, `suite_results 0`).

### 12.2 JavaScript/TypeScript verification
| Check | Command | Result |
|---|---|---|
| Jest | `npx jest --ci --silent` | **19 suites / 243 tests passed**, exit 0 |
| TypeScript | `npx tsc --noEmit` | **exit 0**, no diagnostics |
| ESLint | `npx expo lint` | **exit 0** (only an npm `allow-scripts` warning) |

### 12.3 Not executed (and why)
- `0003`, `0005`, `0006`, `0007`, `0009`, `0010`, `0014` SQL suites: not required for the four controls; `0010` involves Storage objects that are non-transactional. Historical baselines remain cited, not re-claimed.
- Hosted/GoTrue integration test of the ban: **NOT TESTED** (would require the Auth admin API and a live auth user; out of non-destructive local scope).
- Storage object lifecycle: **NOT TESTED** (non-transactional).
- Retention/purge/deletion: **BLOCKED / out of scope**.

---

## 13. Change Inventory

| Change | Path | Type | Status |
|---|---|---|---|
| New Batch 2F report | `docs/SECURITY_BATCH_2F_NON_DESTRUCTIVE_SECURITY_CONTROL_VERIFICATION_REPORT.md` | Documentation (new file) | Created |
| Batch 2E accuracy correction | `docs/SECURITY_BATCH_2E_DECISION_CLOSURE_AND_TIER_0_1_PREPARATION_REPORT.md` | Documentation (narrow authorized edit) | Modified |

**No product changes:**
- No source, migration, schema, RLS, function, policy, config, or dependency edits.
- No new test file added to the repository.
- No real data created, modified, or deleted.
- No commit, push, or deploy.

---

## 14. Residual Risks and Owner Decisions

| ID | Item | Status | Required action |
|---|---|---|---|
| R2F-01 | Inactive 30-day boundary: policy says 30, implementation triggers at 31+ | **UNRESOLVED** | **OWNER DECISION REQUIRED (OD-7)**; do not change behavior until documented |
| R2F-02 | GoTrue session ban not executed in tests (DB revocation verified; ordering statically verified) | **NOT TESTED** | Future authorized integration test of the staff-admin Edge Function |
| R2F-03 | Consent/privacy `ON DELETE CASCADE` still destroys evidence | **BLOCKED** | **EXTERNAL VALIDATION REQUIRED (L-06)**; do not implement erasure |
| R2F-04 | Retention/purge/deletion not implemented | **BLOCKED** | Owner/legal decisions; out of Batch 2F |
| R2F-05 | Storage object lifecycle (receipts) not exercised | **NOT TESTED** | Future isolated Storage test with cleanup |
| R2F-06 | Hosted/production behavior not tested | **NOT TESTED** | Separate deployment gate |

Other Owner decisions from Batch 2E remain open (OD-1…OD-12); this batch resolves none of them.

---

## 15. Final Verdict

### Batch 2F
**`BATCH 2F — COMPLETE`**

- Four controls verified with synthetic fixtures: **access revocation 22/22**, **contact correction 15/15**, **inactive classification 14/14**, **membership history protection 12/12**, plus **8/8** static/catalog checks — **71/71 total**.
- Existing regressions: **220/220 SQL assertions**, **243/243 Jest tests**, `tsc` clean, `lint` clean.
- **No product defect** found; **no fix or migration** required.
- Isolation, rollback and residue detection **proven**: baseline counts restored and zero synthetic residue.
- Batch 2E accuracy corrections applied; Tier 1 execution is now correctly **CONDITIONAL / BLOCKED** (design ready, harness validated here for these four controls).
- The 30-day inactivity boundary remains **unresolved** and is **OWNER DECISION REQUIRED (OD-7)**; it was not changed.
- The consent/privacy CASCADE remains a separate critical blocker and was not touched.

### Confirmation
- No retention, purge, deletion, anonymization, scheduling or privacy-request execution was implemented.
- No real member/payment/attendance/staff data was created, modified or deleted.
- No hosted/production access, database reset, destructive migration, dependency change, commit, push or deploy occurred.

**STOP.** Await explicit review and authorization before Batch 2G or any retention/erasure implementation.
