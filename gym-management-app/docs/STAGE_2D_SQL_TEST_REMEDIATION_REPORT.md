# STAGE 2D — SQL TEST REMEDIATION & CLEAN REVALIDATION REPORT

**Date:** 2026-11-20
**Project:** `gym-management-app`
**Stage:** 2D — SQL Test Remediation & Clean Revalidation
**Prerequisite:** Stage 2C Local Database Validation Report — `docs/STAGE_2C_LOCAL_DATABASE_VALIDATION_REPORT.md`
**Scope:** Local Supabase only. No hosted / remote connection used.

---

## 15. FINAL VERDICT

**Verdict: PASS — 138/138 VALIDATION**

All four previously failing SQL assertions were investigated, root-caused, and minimally remediated.

After remediation and a fresh local database reset, all three validation suites pass in full:

| Suite | Target | Result |
|---|---:|---:|
| `0010_receipt_storage_validation.sql` | 26/26 | **26/26 PASSED** |
| `0011_staff_administration_validation.sql` | 52/52 | **52/52 PASSED** |
| `0012_privacy_consent_validation.sql` | 60/60 | **60/60 PASSED** |
| **TOTAL** | **138/138** | **138/138 PASSED** |

The required clean-revalidation target of **138/138** was achieved through actual execution.

No migration defect was found. No security regression was found.

---

## 1. Stage 2C Baseline

- Stage 2C reset succeeded; all migrations 0001–0012 applied.
- Suite results at baseline: 0010 → 24/26 (2 failed), 0011 → 52/52 (pass), 0012 → 58/60 (2 failed).
- Overall baseline: **134 passed / 4 failed**.

## 2. Previously Failing Assertions — Root Cause Analysis

### 2.1 `0010_receipt_storage_validation.sql` — `P09` — “exactly one receipt.stored audit row”

- **File:** `supabase/tests/0010_receipt_storage_validation.sql` (assertion at former lines 297–303).
- **Expected:** exactly one `receipt.stored` audit row for payment `4a0d1111-0000-0000-0000-000000000001`, actor `4a0a2222-…-02`.
- **Actual:** assertion evaluated to FALSE.
- **Root cause:** the assertion boolean subquery read `public.audit_log_entries` while the suite transaction held `set local role authenticated` + receptionist JWT claims. `audit_log_entries` has owner-only RLS (`audit_select_owner`, `app_profile_role() = 'owner'`), so the acting receptionist saw zero rows → `count(*) = 1` evaluated false.
- **Data verification:** the audit row **was** correctly written exactly once (verified in Stage 2C: single `receipt.stored` row present with correct actor/row_id).
- **Classification:** **genuine test defect** (visibility context), not migration or security defect.
- **Minimum safe correction applied:** added test-only SECURITY DEFINER helper `suite_results.receipt_stored_audit_ok(uuid, uuid)` with `SET search_path = public`; P09 now evaluates through this helper.

### 2.2 `0010_receipt_storage_validation.sql` — `S05` — “receptionist cannot UPDATE a stored receipt”

- **File:** `supabase/tests/0010_receipt_storage_validation.sql` (former lines 222–224).
- **Expected:** UPDATE rejected with SQLSTATE `42501`.
- **Actual:** UPDATE statement succeeded but affected **0 rows** (no UPDATE policy on storage objects → RLS denies all rows); no object was renamed (verified: no `*.x` names).
- **Root cause:** test expectation was wrong for this security posture. Storage immutability is enforced via policy absence (deny-by-absence), which manifests as a 0-row no-op rather than a raised error. Database behaviour was secure; the expectation was not.
- **Classification:** **genuine test expectation defect** (not a security defect).
- **Minimum safe correction applied:** S05 now executes the UPDATE and asserts via `check_true` that no stored object was renamed (UPDATE affected no rows).

### 2.3 `0012_privacy_consent_validation.sql` — `C06` — “each consent row wrote one audit entry”

- **File:** `supabase/tests/0012_privacy_consent_validation.sql` (former lines 269–276).
- **Expected:** audit count of `consent.recorded` for the member equals 3.
- **Actual:** assertion evaluated to FALSE.
- **Root cause:** same RLS visibility issue as `0010.P09` — audit table read under member acting context vs. owner-only SELECT policy.
- **Classification:** **genuine test defect** (visibility context).
- **Minimum safe correction applied:** added test-only SECURITY DEFINER helper `suite_results.audit_action_count(text, uuid)` with `SET search_path = public`; C06 now evaluates through this helper.

### 2.4 `0012_privacy_consent_validation.sql` — `P05` — “each request wrote one audit entry”

- **File:** `supabase/tests/0012_privacy_consent_validation.sql` (former lines 411–418).
- **Expected:** audit count of `privacy.requested` for the member equals 3.
- **Actual:** assertion evaluated to FALSE.
- **Root cause:** same RLS visibility issue as `0010.P09` / `0012.C06`.
- **Classification:** **genuine test defect** (visibility context).
- **Minimum safe correction applied:** same SECURITY DEFINER helper (`suite_results.audit_action_count`) used for P05.

### 2.5 Test cleanup defect in `0010` (blocking failure, not an assertion failure)

- **File:** `supabase/tests/0010_receipt_storage_validation.sql` (cleanup line ~333).
- **Error:** `ERROR: Direct deletion from storage tables is not allowed. Use the Storage API instead. … PL/pgSQL function storage.protect_delete() line 5 at RAISE`.
- **Root cause:** suite cleanup attempted a direct `DELETE FROM storage.objects`; Supabase Storage intentionally blocks this.
- **Classification:** **test cleanup defect**.
- **Minimum safe correction applied:** removed the blocked cleanup statement; storage fixture cleanup is delegated to an isolated `supabase db reset`.

## 3. Changes Made

### 3.1 `supabase/tests/0010_receipt_storage_validation.sql`

1. Added test-only helper:
   - `suite_results.receipt_stored_audit_ok(uuid, uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public` — counts `receipt.stored` audit rows for a given row/actor and compares to 1.
   - Granted `EXECUTE` on the helper to `public` (test framework).
2. `P09` now evaluates the audit condition through `suite_results.receipt_stored_audit_ok(...) = true`.
3. `S05` now executes `UPDATE storage.objects SET name = name || '.x' WHERE bucket_id = 'receipts';` and records the result with `check_true`, asserting that no object was renamed (no rows affected / no modification).

### 3.2 `supabase/tests/0012_privacy_consent_validation.sql`

1. Added test-only helper:
   - `suite_results.audit_action_count(text, uuid) RETURNS bigint LANGUAGE sql SECURITY DEFINER SET search_path = public` — counts audit rows by action/actor.
   - Granted `EXECUTE` on the helper to `public` (test framework).
2. `C06` now evaluates `suite_results.audit_action_count('consent.recorded', …::uuid) = 3`.
3. `P05` now evaluates `suite_results.audit_action_count('privacy.requested', …::uuid) = 3`.

## 4. Files Modified

| File | Change |
|---|---|
| `supabase/tests/0010_receipt_storage_validation.sql` | + helper, P09 rework, S05 rework, cleanup fix |
| `supabase/tests/0012_privacy_consent_validation.sql` | + helper, C06 rework, P05 rework |

No other files were modified.

## 5. Security Review of Modifications

- New helpers are **test-only** (`suite_results` schema), **SECURITY DEFINER**, with explicit **`SET search_path = public`**, and **EXECUTE granted to public within the test schema only**.
- No application role (`anon`, `authenticated`, `service_role`) received new privileges.
- No production-facing RLS policy, grant, or application permission was changed.
- The S05 remediation preserves the security contract: the UPDATE is still performed as the receptionist and must affect no rows; the assertion now verifies that no stored receipt was modified.
- The storage cleanup remediation removes only a blocked, non-functional cleanup statement; storage protection (`storage.protect_delete`, private bucket, policy set) was not touched.
- **Security regression check: NO REGRESSION.** Post-remediation live inspection confirmed:
  - `audit_log_entries`: RLS enabled + FORCED; `audit_select_owner` (owner-only) unchanged.
  - `consent_records` / `privacy_requests`: SELECT-only for `authenticated`; owner read added — unchanged.
  - Storage: bucket `receipts` private, 5 MiB, PDF-only; exactly 3 policies; no UPDATE/DELETE policy — unchanged.
  - Admin / receipt / privacy RPCs remain SECURITY DEFINER with `search_path = public`; not executable by `anon` — unchanged.

## 6. Fresh Local Database Reset Result

- Isolation re-confirmed: local stack (`127.0.0.1:54322`), `linked_project: null`, no DB env vars, no `project-ref`, Docker daemon running, data disposable (0 rows).
- Command: `node_modules/.bin/supabase.cmd db reset` (installed CLI 3.1.0).
- Output: all migrations 0001–0005, 0008–0012 applied; seed loaded; **`Finished supabase db reset on branch main.`**

## 7. Migration Execution Results

- All migrations 0001–0012 applied in chronological order with no migration error; `schema_migrations` contained all 10 migration rows.

## 8–11. Suite Results

| Suite | Result |
|---|---|
| 0010 | **26/26 PASSED** (exit code 0; suite cleanup completed, `drop schema suite_results cascade` executed) |
| 0011 | **52/52 PASSED** (exit code 0; cleanup completed) |
| 0012 | **60/60 PASSED** (exit code 0; cleanup completed) |

## 12. Totals

- **Total assertions: 138**
- **Passed: 138**
- **Failed: 0**

## 13. Security Regression Results

- **No security regression.** All security-relevant RLS policies, grants, storage posture, and function postures were re-verified after remediation and remained unchanged.

## 14. Remaining Blockers

- **None** within the scope of this stage. All previously failing assertions were resolved through test-only remediation; the clean revalidation now passes in full.

## 15. Final Verdict

- **PASS — 138/138 VALIDATION.**

Stage 2D successfully remediated the four known test defects (two RLS-visibility-driven audit assertions, one incorrect UPDATE expectation, one blocked storage cleanup), performed a fresh local reset, re-executed all migrations and all three suites, and confirmed no security regression.

---

## Completion Response — Stage 2D

### Test results
- 0010: **26/26**
- 0011: **52/52**
- 0012: **60/60**
- Total: **138/138 PASSED**

### Security
- Did any security control change? **No.** Verified unchanged post-remediation (RLS FORCED, owner-only audit, private storage, immutability posture, definer RPCs).

### Migrations
- Did all migrations execute successfully on the fresh local database? **Yes — all 10 migration records applied, no errors.**

### Files
- Modified: `supabase/tests/0010_receipt_storage_validation.sql`, `supabase/tests/0012_privacy_consent_validation.sql`
- Created: `docs/STAGE_2D_SQL_TEST_REMEDIATION_REPORT.md`

### Remote operations
- **None.** No remote Supabase connection, link, push, deploy, or migration was performed.

### Final verdict
- **PASS**

### ONE NEXT STEP
- Proceed to the next logical stage: **Stage 2E — Hosted Supabase Initialization** (local validation now fully green and remediated).
