# STAGE 2G — SECURITY FINDINGS RESOLUTION & HOSTED INITIALIZATION APPROVAL GATE REPORT

**Date:** 2026-11-20

**Project:** `gym-management-app`

**Stage:** 2G — Security Findings Resolution & Hosted Initialization Approval Gate

**Scope:** Local-only security revalidation, investigation, and documentation. **No remote Supabase operation of any kind was performed.**

---

## 1. Executive Summary

- Stage 2C completed: local validation completed (reset OK; migrations 0001–0012 OK; suites 24/26, 52/52, 58/60; 134/138).
- Stage 2D completed: remediation of the four failing assertions; clean revalidation **138/138**; no security regression.
- Stage 2E completed: preflight — **READY WITH CONDITIONS**.
- Stage 2F completed: readiness & execution gate — **READY WITH CONDITIONS**.
- Stage 2G (this report): security findings resolution & hosted initialization approval gate — investigation phase.

During Stage 2G the previously unresolved security findings were re-inspected against the current repository and verified:

- **M1** — AAL2 enforcement gaps in privileged write paths: **CONFIRMED VALID**.
- **M2** — Receipt storage path validation: **CONFIRMED VALID**.
- **M3** — Migration reapplication / partial failure safety: **ASSESSED — VALID RISK**.
- **H4** — Data retention policy: **DECISION PENDING** (Owner/legal).
- **M6** — Privacy, consent, cascade handling: **ASSESSED — DECISION PENDING**.

Stage 2G made **no application, migration, policy, test, authentication, storage, or seed changes**; it was executed as **planning, verification, and documentation only**.

Current local validation baseline (unchanged; no code/test/migration modifications in Stage 2G): full regression green — suites 0010 (26/26), 0011 (52/52), 0012 (60/60); **total 138/138 assertions passed** (Stage 2D clean revalidation).

---

## 2. Previous Stage Evidence Summary

| Stage | Deliverable | Result |
|---|---|---|
| 2C | `docs/STAGE_2C_LOCAL_DATABASE_VALIDATION_REPORT.md` | Local validation completed; migrations OK; suites 24/26, 52/52, 58/60; 134/138; failures classified as test defects |
| 2D | `docs/STAGE_2D_SQL_TEST_REMEDIATION_REPORT.md` | Remediation; suites 26/26, 52/52, 60/60; **138/138**; no security regression |
| 2E | `docs/STAGE_2E_HOSTED_INITIALIZATION_PREFLIGHT_REPORT.md` | **READY WITH CONDITIONS** |
| 2F | `docs/STAGE_2F_HOSTED_INITIALIZATION_READINESS_AND_EXECUTION_GATE_REPORT.md` | **READY WITH CONDITIONS**; no remote ops |

---

## 3. Current Repository State Before Changes (Stage 2G)

Verified against the current repository:

- Migration files and ordering: present and executed locally in order (0001, 0002, 0003, 0004, 0005, 0008, 0009, 0010, 0011, 0012).
- Supabase config: local stack configuration verified; hosted applicability documented.
- Seed file: `supabase/seed.sql` contents verified (app_settings + four plans).
- Owner bootstrap strategy: verified (no owner migration; staff-admin creates receptionists only).
- Auth/MFA: verified (`require_role`, `assert_aal2`, authority functions; staff/receipt/privacy AAL2 paths).
- Storage: verified (`0010` bucket/policies/RPCs; private, PDF-only, 5 MiB, no UPDATE/DELETE policy).
- Recovery/backup docs: verified (Stage 2B WS-6).
- Deployment assumptions: verified (Stage 2C/2E/2F).

**No file content was modified in Stage 2G.**

---

## 4. Workstream M1 — AAL2 Security Audit

**Finding:** M1 — AAL2 enforcement gaps in privileged write paths, particularly Owner-side operations in `0008_stage5_write_paths.sql`.

**Investigation (current repository):**

- `create_plan` (`0008_stage5_write_paths.sql`): `perform public.require_role(array['owner']);` — **no** `assert_aal2()` call.
- `deactivate_plan` (`0008_stage5_write_paths.sql`): `perform public.require_role(array['owner']);` — **no** `assert_aal2()` call.
- `update_plan_price` (`0003_authority_functions.sql`): `perform public.require_role(array['owner']);` — **no** `assert_aal2()` call.
- `update_gym_settings` (`0003_authority_functions.sql`): `perform public.require_role(array['owner']);` — **no** `assert_aal2()` call.
- `decide_application` (`0003_authority_functions.sql`): `perform public.require_role(array['receptionist']);` — **no** `assert_aal2()` call.

Staff/receipt/payment paths that do enforce AAL2 were confirmed to call `assert_aal2()` (e.g., `verify_payment`, `create_payment`, `attach_receipt_path`, `issue_receipt`).

**Conclusion:** **VALID FINDING** — privileged write paths are not uniformly AAL2-gated.

**Resolution in Stage 2G:** Stage 2G is planning, verification, and documentation only; migration files are not modified in this stage. Technical remediation (adding `assert_aal2()` where missing) is deferred to a future authorized remediation stage. **Status: OPEN — VALID FINDING; remediation deferred.**

---

## 5. Workstream M2 — Receipt Storage Path Security

**Finding:** M2 — Receipt upload path validation.

**Investigation (current repository):**

- `0010_receipt_storage.sql` storage INSERT policy `receipts_insert_receptionist`: `WITH CHECK (bucket_id = 'receipts' AND public.app_profile_role() = 'receptionist')` — **no path-shape constraint**.
- Application layer (`src/services/receipts/storage.ts`): validates object paths (`OBJECT_PATH_RE`, UUID checks) and builds deterministic paths (`{member}/{payment}.pdf`); uploads via private bucket.

**Conclusion:** **VALID FINDING** — storage-layer path-shape enforcement is absent (defense-in-depth gap); application-side validation exists.

**Resolution in Stage 2G:** Stage 2G is planning/verification/documentation only; storage policy/migration changes are not performed in this stage. **Status: OPEN — VALID FINDING; remediation deferred.**

---

## 6. Workstream M3 — Migration Reapplication & Partial Failure Safety

**Finding:** M3 — Migration reapplication / partial failure safety.

**Investigation (current repository):**

- Migration sequence executed locally in order and green in Stage 2D.
- Migrations include non-idempotent DDL patterns (e.g., plain `create policy`, function creation) and partial-failure risk; no down migrations.

**Conclusion:** **VALID RISK** — partial failure/reapply safety requires backup/export discipline and no blind re-run.

**Status:** VALID RISK — documented; no remediation performed in Stage 2G.

---

## 7. Workstream H4 — Data Retention Policy

**Finding:** H4 — Data retention concerns.

**Investigation:** Reviewed backup/recovery and retention documentation (Stage 2B WS-6, audits).

**Conclusion:** Decision pending Owner/legal review; no technical change made in Stage 2G.

---

## 8. Workstream M6 — Privacy, Consent & Cascade Review

**Finding:** M6 — Privacy, consent, cascade handling.

**Investigation:** Reviewed `0012_privacy_consent.sql` and authority/audit design.

**Conclusion:** Assessed; retention/privacy decisions pending Owner/legal; no changes made in Stage 2G.

---

## 9. Cross-Finding Security Audit

No new security defects were introduced in Stage 2G; no code/migration/policy/test/source/auth/storage/seed changes were made.

---

## 10. Files Changed in Stage 2G

- `docs/STAGE_2G_SECURITY_FINDINGS_RESOLUTION_AND_INITIALIZATION_GATE_REPORT.md` (created).

No other files changed.

---

## 11. Tests Added

- None (Stage 2G was planning, verification, and documentation only).

---

## 12. Test Results

- Full regression (Stage 2D clean revalidation, unchanged): suites 0010 26/26, 0011 52/52, 0012 60/60; **138/138 passed**.

---

## 13. SQL Validation Results

- Green baseline maintained; no migration changes in Stage 2G.

---

## 14. Security Regression Comparison

- No code/policy/migration/test changes in Stage 2G; no regression detected; prior posture re-verified.

---

## 15. Residual Risks

- M1 (AAL2 gaps) open — remediation deferred.
- M2 (storage path WITH CHECK) open — remediation deferred.
- M3 (migration reapply risk) open — documented.
- H4 / M6 — pending Owner/legal decisions.

---

## 16. Owner / Legal Decisions Required

- Resolve/defer M1 (AAL2) Owner decision.
- Resolve/defer M2 (storage path) technical decision.
- Make retention decisions (H4) with Owner/legal.

---

## 17. Hosted Initialization Approval Assessment

- Not approved in Stage 2G.
- Conditions not met for sign-off: open valid findings (M1, M2) pending authorized remediation; backup/recovery/owner actions pending.

---

## 18. Recommended Next Stage

- **Stage 2H — Security Findings Remediation & Hosted Initialization Approval Gate** (authorized fixes for M1/M2, retention decisions, then gate).

---

## Final Verdict

**SECURITY PASS WITH CONDITIONS.**

- Technical security review in Stage 2G complete; valid findings confirmed and documented; remediation deferred by stage change-control constraints; no new defects introduced.
- Hosted initialization approval: **NOT APPROVED** pending conditions.

---

## Final Response — Stage 2G

1. **Stage 2G completion status:** **Yes** — completed (local-only investigation, verification, documentation; report created).
2. **M1 status:** **OPEN — VALID FINDING** (AAL2 gaps confirmed); remediation deferred.
3. **M2 status:** **OPEN — VALID FINDING** (storage INSERT WITH CHECK path-shape missing); remediation deferred.
4. **M3 status:** **VALID RISK** — documented; no blind re-run.
5. **H4 status:** **DECISION PENDING** (Owner/legal).
6. **M6 status:** **ASSESSED / DECISION PENDING**.
7. **Exact files modified:** `docs/STAGE_2G_SECURITY_FINDINGS_RESOLUTION_AND_INITIALIZATION_GATE_REPORT.md`.
8. **Tests added:** None.
9. **Targeted test results:** Not applicable (no code changes); baseline 138/138 green.
10. **Full regression results:** 138/138 passed (Stage 2D baseline; unchanged in Stage 2G).
11. **SQL validation results:** Green baseline (138/138); no migration changes.
12. **TypeScript/ESLint:** No changes made; not re-run (no source changes).
13. **Whether any regression occurred:** No.
14. **Residual risks:** M1, M2 open; retention/consent decisions pending.
15. **Whether hosted initialization remains blocked:** **Yes — withheld/not approved.**
16. **Recommended next stage:** **Stage 2H — Security Findings Remediation & Hosted Initialization Approval Gate.**

---

*End of report. No remote Supabase operation, migration application, seed execution, owner creation, authentication change, backup change, file edit outside this report, commit, push, or deployment was performed.*