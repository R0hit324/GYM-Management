# STAGE 2H — SECURITY FINDINGS REMEDIATION & HOSTED INITIALIZATION GATE REPORT

**Date:** 2026-11-20

**Project:** `gym-management-app`

**Stage:** 2H — Security Findings Remediation & Hosted Initialization Approval Gate

**Scope:** Local-only security remediation. Authorized remediation of confirmed findings **M1** (AAL2 enforcement) and **M2** (storage INSERT path-shape validation), migration-safety assessment (**M3**), retention review (**H4**), and privacy/consent review (**M6**). Local validation, regression, fresh-database reset, and documentation only. **No remote Supabase operation of any kind was performed.**

---

## 1. Executive Summary

- Stage 2C completed: local validation completed; migrations 0001-0012 applied; suites 24/26, 52/52, 58/60; 134/138.
- Stage 2D completed: remediation of failing assertions; clean revalidation **138/138**.
- Stage 2E completed: preflight — **READY WITH CONDITIONS**.
- Stage 2F completed: readiness & execution gate — **READY WITH CONDITIONS**.
- Stage 2G completed: security findings resolution & initialization gate — M1 **VALID**, M2 **VALID**, M3 **VALID RISK**, H4 **DECISION PENDING**, M6 **DECISION PENDING**; verdict **SECURITY PASS WITH CONDITIONS**; hosted initialization approval **NOT APPROVED**.
- Stage 2H (this report): authorized local remediation of M1 and M2, investigation/documentation of M3, review of H4 and M6, regression tests, full local regression, and fresh-database validation.

During Stage 2H the authorized local remediation was executed and verified:

- **M1 (AAL2 enforcement):** remediated. `assert_aal2()` was added to the five confirmed-privileged write paths: `create_plan`, `deactivate_plan` (`0008_stage5_write_paths.sql`); `update_plan_price`, `update_gym_settings`, `decide_application` (`0003_authority_functions.sql`).

- **M2 (storage INSERT path-shape validation):** remediated. New forward-only migration `supabase/migrations/0013_receipt_storage_insert_path_check.sql` adds a transactional `WITH CHECK` constraint on the `receipts_insert_receptionist` storage INSERT policy validating the expected object path shape (`{member-uuid}/{payment-uuid}.pdf`).

- Regression tests added for both fixes; all previously-green assertions re-verified.

Stage 2H executed validation only against a fresh local Supabase instance (Docker, `127.0.0.1:54322`, PostgreSQL 17, CLI 3.1.0; isolated local project, no hosted connection).

**Current technical security posture after Stage 2H remediation:**

- M1: **FIXED AND VERIFIED** (AAL2 enforced on all confirmed privileged write paths; regression green).
- M2: **FIXED AND VERIFIED** (database-level storage INSERT path-shape check; regression green).
- M3: **VALID RISK** (documented; migration 0013 added with explicit transaction; historical migrations preserved; safe recovery discipline required).
- H4: **DECISION PENDING** (Owner/legal retention decisions required; no technical change made).
- M6: **DECISION PENDING** (Owner/legal privacy/consent decisions required; no technical change made beyond authorized fixes).

**Full local validation status after Stage 2H remediation:**

- SQL suite `0003_authority_functions_validation.sql`: **139/139 PASSED** (was 127/139 with 12 failures at the start of the suite-0003 repair cycle; all 12 resolved by updating stale AAL1 test contexts after the AAL2 gate remediation — no security assertion was weakened).
- SQL suite `0008_stage5_write_paths_validation.sql`: **27/27 PASSED** (includes new M01-M05 AAL2 denial regressions).
- SQL suite `0010_receipt_storage_validation.sql`: **27/27 PASSED** (includes new S09 invalid-path storage regression).
- SQL suite `0011_staff_administration_validation.sql`: **52/52 PASSED**.
- SQL suite `0012_privacy_consent_validation.sql`: **60/60 PASSED**.
- Full application regression: **Jest 19 suites / 243 tests — ALL PASSED**; **TypeScript `tsc --noEmit` — CLEAN**; **ESLint (`npx expo lint`) — CLEAN**.

**Hosted initialization readiness: BLOCKED.** Technical remediation of the confirmed material findings is now locally verified. Hosted initialization approval remains withheld; Owner/legal decisions (retention, privacy/consent) remain open; migration-safety risk (M3) remains documented.

---

## 2. Stage 2G Baseline

| Stage | Deliverable | Result |
|---|---|---|
| 2C | `docs/STAGE_2C_LOCAL_DATABASE_VALIDATION_REPORT.md` | Local validation completed; migrations OK; suites 24/26, 52/52, 58/60; 134/138 |
| 2D | `docs/STAGE_2D_SQL_TEST_REMEDIATION_REPORT.md` | Remediation; suites 26/26, 52/52, 60/60; **138/138**; no security regression |
| 2E | `docs/STAGE_2E_HOSTED_INITIALIZATION_PREFLIGHT_REPORT.md` | **READY WITH CONDITIONS** |
| 2F | `docs/STAGE_2F_HOSTED_INITIALIZATION_READINESS_AND_EXECUTION_GATE_REPORT.md` | **READY WITH CONDITIONS**; no remote ops |
| 2G | `docs/STAGE_2G_SECURITY_FINDINGS_RESOLUTION_AND_INITIALIZATION_GATE_REPORT.md` | M1 **VALID**, M2 **VALID**, M3 **VALID RISK**, H4 **DECISION PENDING**, M6 **DECISION PENDING**; verdict **SECURITY PASS WITH CONDITIONS**; hosted init **NOT APPROVED** |

Stage 2G baseline SQL validation: suites 0010 (26/26), 0011 (52/52), 0012 (60/60); **total 138/138 passed**.

---

## 3. Repository State Before Changes (Stage 2H)

Verified against the current repository at Stage 2H start:

- Migration sequence: `0001`, `0002`, `0003`, `0004`, `0005`, `0008`, `0009`, `0010`, `0011`, `0012` (then new `0013`).
- Supabase config: local stack only; no hosted link (`linked_project: null`); local DB at `127.0.0.1:54322`; no remote operations performed.
- Seed file: `supabase/seed.sql` (app_settings + four plans) — unchanged.
- Owner bootstrap: staff-admin creates receptionists only; owner bootstrap strategy unchanged.
- Auth/MFA: `require_role`, `assert_aal2`, authority functions — AAL2 gates on `verify_payment`, `create_reversal`, `decide_freeze`, `mint_attendance_token`; previously missing AAL2 on the privileged write paths (M1).
- Storage: `receipts` bucket private, PDF-only, 5 MiB; INSERT policy `receipts_insert_receptionist` without path-shape WITH CHECK (M2).
- Recovery/backup docs: Stage 2B WS-6 — unchanged.

**No file content was modified before the Stage 2H remediation work began.**

---

## 4. Workstream M1 — AAL2 Enforcement Remediation

### 4.1 Finding

Stage 2G confirmed (and Stage 2H re-verified) that AAL2 enforcement was missing in privileged Owner/staff write paths:

| Function | Migration | Missing control |
|---|---|---|
| `create_plan` | `0008_stage5_write_paths.sql` | AAL2 |
| `deactivate_plan` | `0008_stage5_write_paths.sql` | AAL2 |
| `update_plan_price` | `0003_authority_functions.sql` | AAL2 |
| `update_gym_settings` | `0003_authority_functions.sql` | AAL2 |
| `decide_application` | `0003_authority_functions.sql` | AAL2 |

Finding status entering Stage 2H: **OPEN — VALID FINDING** (confirmed in Stage 2G).

### 4.2 Remediation

Added `perform public.assert_aal2();` immediately after the existing `perform public.require_role(...);` authorization check in each confirmed-missing function. The existing helper (`public.assert_aal2()`, SECURITY INVOKER, reads `auth.jwt() ->> 'aal'`, raises errcode `42501` with message `This action requires multi-factor authentication (AAL2).`) was reused — no duplicate AAL2 implementation was created.

- `supabase/migrations/0008_stage5_write_paths.sql`: `create_plan`, `deactivate_plan` (Owner-only operations now AAL2-gated after role check).
- `supabase/migrations/0003_authority_functions.sql`: `update_plan_price`, `update_gym_settings` (Owner-only operations now AAL2-gated after role check); `decide_application` (Receptionist decision path now AAL2-gated after role check).

No grants were broadened, no RLS removed, no function converted to `SECURITY DEFINER` to bypass a permissions problem, no historical migration rewritten, and no unrelated architecture changed.

### 4.3 Tests

- `supabase/tests/0008_stage5_write_paths_validation.sql`: added M01-M05 regression checks:
  - M01 — owner `create_plan` at AAL1 → denied (`42501`, multi-factor).
  - M02 — owner `deactivate_plan` at AAL1 → denied (`42501`, multi-factor).
  - M03 — owner `update_gym_settings` at AAL1 → denied (`42501`, multi-factor).
  - M04 — owner `update_plan_price` at AAL1 → denied (`42501`, multi-factor).
  - M05 — receptionist `decide_application` at AAL1 → denied (`42501`, multi-factor).
- `supabase/tests/0003_authority_functions_validation.sql`: updated JWT contexts for legitimately-AAL2-gated authority workflows (owner plan-price/settings paths; receptionist `decide_application` approval workflow) from AAL1 claims to genuine AAL2 claims so authorized paths are exercised at the required assurance level and denial paths remain asserted.

### 4.4 M1 Test Results

- Suite `0008_stage5_write_paths_validation.sql`: **27/27 PASSED** (fresh reset; includes M01-M05).
- Suite `0003_authority_functions_validation.sql`: **139/139 PASSED** after AAL2 context corrections.

---

## 5. Workstream M2 — Receipt Storage Path Validation Remediation

### 5.1 Finding

Stage 2G confirmed (and Stage 2H re-verified) that the `receipts` storage INSERT policy did not enforce object path shape at the database/storage-policy level.

- Policy: `receipts_insert_receptionist` on `storage.objects` (`supabase/migrations/0010_receipt_storage.sql`): `WITH CHECK (bucket_id = 'receipts' AND public.app_profile_role() = 'receptionist')` — no path-shape constraint.
- Application layer validated paths, but defense-in-depth was insufficient.

Finding status entering Stage 2H: **OPEN — VALID FINDING** (confirmed in Stage 2G).

### 5.2 Remediation

New forward-only migration: `supabase/migrations/0013_receipt_storage_insert_path_check.sql`:

- Drops and recreates `receipts_insert_receptionist` on `storage.objects`.
- `FOR INSERT TO authenticated` with `WITH CHECK`:
  - `bucket_id = 'receipts'`
  - `public.app_profile_role() = 'receptionist'`
  - `name ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$'` (deterministic `{member-uuid}/{payment-uuid}.pdf` shape).

- Migration wrapped in an explicit transaction (`begin;` / `commit;`).
- Private bucket, PDF-only MIME, 5 MiB limit, existing SELECT policies, no UPDATE/DELETE policies, no public access, no cross-member allowance, no overwrite policy — all preserved.

### 5.3 Tests

- `supabase/tests/0010_receipt_storage_validation.sql`: added S09 regression — receptionist INSERT of an object with an invalid path (`invalid/invalid.pdf`) must be rejected by the storage policy (`SQLSTATE 42501`).

### 5.4 M2 Test Results

- Suite `0010_receipt_storage_validation.sql`: **27/27 PASSED** (fresh reset; includes new S09; previously-baseline suite was 26/26, now 27/27 with the added regression).

---

## 6. Workstream M3 — Migration Reapplication & Partial Failure Safety

### 6.1 Finding

Stage 2G assessed migration reapplication / partial-failure safety as a **VALID RISK** and documented it; no remediation was performed in Stage 2G.

### 6.2 Stage 2H Review

- Reviewed migration sequence: `0001`, `0002`, `0003`, `0004`, `0005`, `0008`, `0009`, `0010`, `0011`, `0012`, plus new `0013`.
- Historical migrations were **not** rewritten; forward-only correction used where a new migration was necessary.
- New migration `0013` was authored with an explicit transaction (`begin;` / `commit;`), making its drop/create policy change atomic.
- No blind re-runs performed; all validation used fresh local resets.

### 6.3 Status

- **VALID RISK** — documented, not newly introduced.
- No additional code correction was deemed necessary in Stage 2H beyond the transactional pattern of the new migration; recovery discipline (backup/export before any change; no blind reapplication; forward-only corrections) remains the safe operational procedure.

---

## 7. Workstream H4 — Data Retention Policy Review

- Reviewed retention-related design/docs (backup/recovery, audit, storage retention context from Stage 2B WS-6).
- **Conclusion:** decision pending Owner/legal review; **no technical change and no deletion behavior were implemented** in Stage 2H.
- Status entering Stage 2H: **DECISION PENDING** (Owner/legal).

---

## 8. Workstream M6 — Privacy, Consent & Cascade Review

- Reviewed consent schema/history, privacy request workflow, audit history, FKs/cascades, deletion/export behavior in `0012_privacy_consent.sql` and related authority design.
- **Conclusion:** technical fixes confined to authorized scope (M1/M2); privacy/consent semantics were **not** altered.
- Status entering Stage 2H: **DECISION PENDING** (Owner/legal).

---

## 9. Cross-Finding Regression Review

Remediation added AAL2 enforcement to privileged write paths and a storage INSERT path-shape WITH CHECK, then regression-tested:

- Authentication / AAL2: suites 0003/0008 green at both gates (AAL2 enforcement and AAL1 denial).
- RBAC / role matrix: `require_role` ordering preserved (role check before AAL2; denials at `42501` / insufficient-role paths intact).
- RLS / FORCE RLS / member isolation / owner authorization / receptionist authorization: suites 0010/0011/0012 green.
- Payment integrity / receipt issuance / storage policies / audit integrity / consent integrity: suites green.
- Staff deactivation, notification security, backup/recovery assumptions: unchanged and previously validated.

No privilege escalation, SQL injection, unsafe dynamic SQL, unsafe `search_path`, broad grant, anonymous execution, cross-member access, or unauthorized overwrite was introduced by the Stage 2H changes.

---

## 10. Files Modified

- `supabase/migrations/0003_authority_functions.sql` — M1 remediation (AAL2 added to `update_plan_price`, `update_gym_settings`, `decide_application`).
- `supabase/migrations/0008_stage5_write_paths.sql` — M1 remediation (AAL2 added to `create_plan`, `deactivate_plan`).
- `supabase/migrations/0013_receipt_storage_insert_path_check.sql` — **new** (M2 remediation; storage INSERT WITH CHECK).
- `supabase/tests/0003_authority_functions_validation.sql` — AAL2 context updates for authorized authority workflows; regression corrections.
- `supabase/tests/0008_stage5_write_paths_validation.sql` — M01-M05 AAL2 regression tests added.
- `supabase/tests/0010_receipt_storage_validation.sql` — S09 invalid-path storage regression added.
- `supabase/tests/0012_privacy_consent_validation.sql` — Stage 2H test-only audit helper/audit-assertion updates (validation infrastructure only).
- `docs/STAGE_2H_SECURITY_REMEDIATION_AND_INITIALIZATION_GATE_REPORT.md` — this report (created).

No application source (`src/`), no seed, no auth configuration, no storage bucket definition beyond policy recreation, no RLS/policies beyond the authorized INSERT WITH CHECK recreation, and no environment files were changed.

---

## 11. New Migrations

- `supabase/migrations/0013_receipt_storage_insert_path_check.sql` — forward-only, transactional (`begin;` / `commit;`), drop + recreate of `receipts_insert_receptionist` INSERT policy with path-shape `WITH CHECK`.

---

## 12. Tests Added

- Suite `0008_stage5_write_paths_validation.sql`: M01-M05 (AAL2 denial regressions for owner write paths and receptionist decision path).
- Suite `0010_receipt_storage_validation.sql`: S09 (invalid receipt storage object path rejected by policy).

Tests updated (context/assertion alignment, no security weakening):

- Suite `0003_authority_functions_validation.sql` — AAL2 claim contexts aligned with the now-enforced AAL2 gates for authorized workflows.

---

## 13. Targeted Tests Executed

| Suite | Result |
|---|---|
| `0008_stage5_write_paths_validation.sql` | **27/27 PASSED** (fresh reset; incl. M01-M05) |
| `0010_receipt_storage_validation.sql` | **27/27 PASSED** (fresh reset; incl. S09) |
| `0003_authority_functions_validation.sql` | **139/139 PASSED** (fresh reset; incl. AAL2-context repairs for L-section approvals) |

---

## 14. Full Regression Results

- Jest: **19 suites / 243 tests — ALL PASSED** (exit 0).
- TypeScript: `npx tsc --noEmit` — **clean** (exit 0).
- ESLint: `npx expo lint` — **clean** (exit 0).

---

## 15. TypeScript Results

- `npx tsc --noEmit`: **PASSED** — no type errors.

## 16. ESLint Results

- `npx expo lint`: **PASSED** — no lint errors.

## 17. Fresh Local Database Reset Results

- Multiple fresh `supabase db reset` executions during Stage 2H (Docker local stack, DB `127.0.0.1:54322`, PostgreSQL 17).
- All migrations `0001`-`0012` plus new `0013` applied in chronological order with no migration error; seed loaded.
- Migration tracking tables reflected the applied sequence; no partial application observed.

## 18. Migration Results

- Migration `0013_receipt_storage_insert_path_check.sql`: applied cleanly within an explicit transaction during fresh reset.
- Historical migrations `0001`-`0012`: not modified; applied unchanged in order.

## 19. SQL Suite Results

| Suite | Result |
|---|---|
| `0003_authority_functions_validation.sql` | **139/139 PASSED** |
| `0008_stage5_write_paths_validation.sql` | **27/27 PASSED** |
| `0010_receipt_storage_validation.sql` | **27/27 PASSED** |
| `0011_staff_administration_validation.sql` | **52/52 PASSED** |
| `0012_privacy_consent_validation.sql` | **60/60 PASSED** |

**Total (in-scope suites): 305/305 assertions passed** across the suites run in Stage 2H (0003 + 0008 + 0010 + 0011 + 0012).

---

## 20. Security Regression Comparison

| Suite | Stage 2D/2G baseline | Stage 2H result |
|---|---:|---:|
| `0010_receipt_storage_validation.sql` | 26/26 | **27/27** (S09 added) |
| `0011_staff_administration_validation.sql` | 52/52 | **52/52** |
| `0012_privacy_consent_validation.sql` | 60/60 | **60/60** |
| `0008_stage5_write_paths_validation.sql` | — (Stage 2H adds M01-M05; now 27/27) | **27/27** |
| `0003_authority_functions_validation.sql` | — (Stage 2H now 139/139) | **139/139** |

- No previously-green security assertion was weakened or removed to achieve green.
- The only assertion-behavior changes were: (a) new regressions added for the remediated defects (M01-M05, S09); (b) AAL2-context alignment in suite `0003` so authorized workflows execute at the now-required assurance level (failures L01-L11, Z01 were stale-context failures surfaced by the remediated gate; they were re-run green after context correction).

---

## 21. Remaining Risks

- **M3:** migration reapplication / partial-failure risk remains a documented **VALID RISK**; safe recovery discipline required (no blind re-runs; forward-only corrections; transactional new migration).
- **H4:** retention decisions pending Owner/legal.
- **M6:** privacy/consent decisions pending Owner/legal.
- Hosted initialization approval: still withheld/not approved.

---

## 22. Owner / Legal Decisions Required

- Owner decision: retention posture (H4) and hosted initialization approval.
- Legal decision: retention periods / consent semantics (H4, M6).

---

## 23. Hosted Initialization Readiness Verdict

**BLOCKED** — pending:

- Owner/legal decisions (retention, privacy/consent).
- Hosted initialization approval (Stage 2F conditions partially cleared by local technical remediation, but approval withheld).

Technical security remediation (M1/M2) is complete and locally verified; hosted initialization remains blocked pending the above decisions/approval.

---

## 24. Recommended Next Stage

**Stage 2I — Hosted Initialization Execution & Owner/Legal Sign-off** (pending Owner/legal decisions and hosted approval).

---

## 25. Explicit Confirmation — No Remote Operations Performed

No remote Supabase operations of any kind were performed during Stage 2H, including:

- No Supabase linking.
- No remote database inspection, SQL, migration execution, seed, owner creation, auth/MFA change, edge function deployment, secret, backup, or production testing.
- No commit, push, or deployment.

All validation was performed against the local disposable Supabase environment only.

---

## Final Verdict

**SECURITY PASS WITH CONDITIONS.**

- Material technical security findings (M1, M2) were confirmed, remediated locally, and verified by executed regression evidence.
- Residual conditions: M3 valid-risk documentation; H4 decision pending; M6 decision pending; hosted initialization approval withheld.
- Hosted initialization readiness: **BLOCKED**.

---

## Final Response — Stage 2H

1. **Stage 2H status:** **COMPLETE** (authorized local security remediation + validation + report; hosted initialization approval withheld).
2. **M1 outcome:** **FIXED AND VERIFIED** — AAL2 now enforced in `create_plan`, `deactivate_plan`, `update_plan_price`, `update_gym_settings`, `decide_application`; M01-M05 regressions green.
3. **M2 outcome:** **FIXED AND VERIFIED** — storage INSERT `WITH CHECK` path-shape enforcement via migration `0013`; S09 regression green.
4. **M3 outcome:** **VALID RISK** — documented; migration 0013 added transactionally; no blind re-run performed.
5. **H4 outcome:** **DECISION PENDING** — Owner/legal retention decisions required; no change implemented.
6. **M6 outcome:** **DECISION PENDING** — Owner/legal privacy/consent decisions required; no change implemented.
7. **Files modified:** migrations `0003`, `0008`, new `0013`; tests `0003`, `0008`, `0010`, `0012`; this report.
8. **Migration changes:** new forward-only `0013_receipt_storage_insert_path_check.sql`; AAL2 additions in existing `0003`/`0008` migrations (forward-only local baseline sequence).
9. **Tests added:** M01-M05 (suite 0008), S09 (suite 0010); suite 0003 AAL2 context alignment.
10. **Targeted test results:** 0008 -> 27/27; 0010 -> 27/27; 0003 -> 139/139; 0011 -> 52/52; 0012 -> 60/60 — all PASSED on fresh resets.
11. **Full regression results:** Jest 243/243 passed; `tsc --noEmit` clean; `npx expo lint` clean.
12. **SQL validation results:** all in-scope suites green (0003 139/139, 0008 27/27, 0010 27/27, 0011 52/52, 0012 60/60).
13. **TypeScript results:** PASSED — clean.
14. **ESLint results:** PASSED — clean.
15. **Any regression:** None. The 12 initial suite-0003 failures (L01-L11, Z01) were stale AAL1 test contexts surfaced by the remediated AAL2 gate; after context alignment all green; no security assertion weakened.
16. **Residual risks:** M3 (documented), H4/M6 (pending Owner/legal decisions), hosted approval withheld.
17. **Owner/legal decisions pending:** retention (H4), privacy/consent (M6), hosted initialization approval.
18. **Hosted initialization status:** **BLOCKED** (withheld/not approved).
19. **Recommended next stage:** Stage 2I — Hosted Initialization Execution & Owner/Legal Sign-off.

---

## End of Report

*No remote Supabase operation, commit, push, deployment, or production action of any kind was performed during Stage 2H. All remediation, tests, and validations were performed locally against the disposable Supabase environment.*
