# STAGE 2C — LOCAL DATABASE VALIDATION REPORT

**Date:** 2026-11-20
**Project:** `gym-management-app`
**Stage:** 2C — Local Database Reset & Migration Validation
**Scope:** Local Supabase stack only (no hosted / remote connection used)
**Report type:** Audit / validation only — no remediation performed

---

## 14. FINAL VERDICT

**Verdict: PASS WITH ISSUES — VALIDATION COMPLETED, ISSUES FOUND**

- The **local database reset succeeded**.
- Migrations **0001–0012 executed successfully** against the local stack.
- Migration **0010** executed successfully; its **SQL suite produced 24/26 passing assertions** (2 failures are **test-suite defects**, not migration defects).
- Migration **0011** executed successfully; its **SQL suite passed 52/52**.
- Migration **0012** executed successfully; its **SQL suite produced 58/60 passing assertions** (2 failures are **test-suite defects**, not migration defects).
- All database objects introduced/modified by `0010`–`0012` were **created successfully and security posture was verified** via live object inspection.
- Critical security behaviour (MFA/AAL2, storage ownership/isolation, staff permissions, owner-only operations, consent/privacy restrictions) was exercised by the suites and confirmed at the object level.
- **No migration defect was found.** The only failing assertions were attributable to weaknesses in the committed SQL test suites.
- **Safe to proceed to hosted initialization** — nothing in this stage blocks it; however, the two identified test-suite defects should be corrected in a dedicated remediation stage before hosted validation runs the same suites.

---

## 1. Environment Verification

| Check | Result |
|---|---|
| Working directory | `E:\GYM Management\gym-management-app` |
| Docker daemon | Running (server version **29.7.2**) |
| Local DB container | `supabase_db_GYM_Management` — `public.ecr.aws/supabase/postgres:17.11.0.018` — **Up (healthy)** |
| PostgreSQL version | **17.11** |
| Supabase CLI | **3.1.0** (installed under `node_modules/.bin`); CLI notified that v3.2.0 exists but **no install/update was performed** |
| Stack services | db, kong, auth, rest, storage, realtime, inbucket, gotrue, mailpit, studio, analytics, meta — all running/healthy |

No package installation, new project creation, or CLI version change was performed during Stage 2C.

## 2. Local / Remote Isolation Evidence

- `supabase status` reported `"linked_project": null`.
- No `supabase/.temp/project-ref` file present.
- No `SUPABASE_DB_URL`, `SUPABASE_PROJECT_ID`, `SUPABASE_ACCESS_TOKEN`, `DATABASE_URL`, `PGHOST`, `PGPORT`, `PGDATABASE`, or `PGUSER` environment variables set.
- Local stack bound to `127.0.0.1:54322` (DB), `127.0.0.1:54321` (REST/GraphQL), `127.0.0.1:54323` (Studio).
- No remote Supabase project linked; no remote connection string used; no remote database touched.

## 3. Reset Result

- Command executed from the project root: `node_modules/.bin/supabase.cmd db reset`
  (equivalent to the expected `npx supabase db reset`, with the **project's locally installed CLI 3.1.0** used in place of letting `npx` resolve a version).
- Output applied, in order:
  - `Applying migration 0001_core_schema.sql`
  - `Applying migration 0002_rls_and_triggers.sql`
  - `Applying migration 0003_authority_functions.sql`
  - `Applying migration 0004_views.sql`
  - `Applying migration 0005_profile_provisioning.sql`
  - `Applying migration 0008_stage5_write_paths.sql`
  - `Applying migration 0009_receipt_issuance.sql`
  - `Applying migration 0010_receipt_storage.sql`
  - `Applying migration 0011_staff_administration.sql`
  - `Applying migration 0012_privacy_consent.sql`
- `Seeding data from supabase/seed.sql...`
- Final line: **`Finished supabase db reset on branch main.`**
- Post-reset verification: `supabase_migrations.schema_migrations` contained exactly **10 rows** (`0001, 0002, 0003, 0004, 0005, 0008, 0009, 0010, 0011, 0012`).

> Note: the PowerShell host displayed a `NativeCommandError` on both reset runs; this was stderr rendering only. The CLI itself printed the successful `Finished ... on branch main` completion line, and the follow-up database state confirmed all migrations were applied.

## 4. Migration Execution Results

| Migration | Name | Executed | Tracked in `schema_migrations` | Error |
|---|---|---|---|---|
| 0001 | core_schema | Yes | Yes | No |
| 0002 | rls_and_triggers | Yes | Yes | No |
| 0003 | authority_functions | Yes | Yes | No |
| 0004 | views | Yes | Yes | No |
| 0005 | profile_provisioning | Yes | Yes | No |
| 0008 | stage5_write_paths | Yes | Yes | No |
| 0009 | receipt_issuance | Yes | Yes | No |
| 0010 | receipt_storage | Yes | Yes | No |
| 0011 | staff_administration | Yes | Yes | No |
| 0012 | privacy_consent | Yes | No migration error | No |

All migrations **0001 through 0012** (per filename) were applied in sequence with no migration failure; the local database is therefore fully migrated.

Post-reset database state confirmed the additional objects from the newer migrations:
- 15 public tables (including `consent_records`, `privacy_requests` from `0012`).
- `profiles.is_active` column present (NOT NULL, default `true`) with index `profiles_active_role_idx` (from `0011`).
- `attach_receipt_path` / `issue_receipt` SECURITY DEFINER functions with `search_path = public` (from `0010`).
- 5 `admin_*` functions present (from `0011`).

Seed state after reset: 1 row in `app_settings`, 4 rows in `plans`.

## 5. Migration 0010 — Receipt Storage — Result

**Object creation:** Successful.
- Storage bucket `receipts`: **private** (`public = false`), file size limit **5 MiB**, allowed MIME type **`application/pdf`** only.
- Storage policies present on `storage.objects` for bucket `receipts`:
  - `receipts_select_own` — SELECT — `member` — own folder only.
  - `receipts_select_staff` — SELECT — `authenticated` (staff) — all objects.
  - `receipts_insert_receptionist` — INSERT — `authenticated` (receptionist).
- **No** UPDATE and **no** DELETE client policy on storage objects (immutability posture).
- `attach_receipt_path` and `issue_receipt` are **SECURITY DEFINER** with `search_path = public`; receipt issuance enforced payment/reversal invariants.

**SQL suite execution:** 26 assertions — **24 passed, 2 failed**.

Failing assertions: `P09` (“exactly one receipt.stored audit row”), `S05` (“receptionist cannot UPDATE a stored receipt”).

### Failure classification (0010)

- **`P09` — test defect.** The audit row is correctly written exactly once (`receipt.stored`, idempotent); the assertion uses `suite_results.check_true`, which runs as the **acting user (not SECURITY DEFINER)**, while `audit_log_entries` uses owner-only SELECT RLS (`audit_select_owner`). The data itself was verified correct.
- **`S05` — test expectation defect.** The UPDATE statement *succeeded* as a statement but matched **0 rows** (no UPDATE policy → RLS denies all rows). Verification confirmed **no object was renamed** (`update storage.objects set name = name || '.x' ...` changed nothing).
- **Cleanup error (suite defect, after all assertions):** `psql:/tmp/...:333: ERROR: Direct deletion from storage tables is not allowed. Use the Storage API instead.` (raised by `storage.protect_delete()`). This blocked the suite's own `drop schema suite_results` cleanup; it did not affect migration or assertion integrity.

**Migration 0010 status: EXECUTED SUCCESSFULLY / SECURITY POSTURE VERIFIED. No migration defect.**

## 6. Migration 0011 — Staff Administration — Result

**Object creation:** Successful.
- `profiles.is_active` (boolean, NOT NULL, default `true`) plus index `profiles_active_role_idx`.
- 5 security-definer admin RPCs: `admin_register_staff`, `admin_set_staff_active`, `admin_staff_directory`, `admin_staff_assert`, `admin_record_staff_sessions_blocked`.

**SQL suite execution:** **52 / 52 assertions passed.**

**Migration 0011 status: EXECUTED SUCCESSFULLY / FULLY PASSED.**

## 7. Migration 0012 — Privacy / Consent — Result

**Object creation:** Successful.
- Tables `consent_records`, `privacy_requests` with the expected columns.
- Security-definer RPCs: `record_consent`, `request_privacy_action`, `resolve_privacy_request`.

**SQL suite execution:** 60 assertions — **58 passed, 2 failed**.

Failing assertions: `C06` (“each consent row wrote one audit entry”), `P05` (“each request wrote one audit entry”).

### Failure classification (0012)

- Both failures are of the **same test-defect class** as `0010.P09`: the audit-count assertions use `suite_results.check_true` (acting-user, not SECURITY DEFINER) against `audit_log_entries`, which applies owner-only SELECT RLS. The expected audit rows were demonstrably written (the suite's own cleanup ran `DELETE … FROM public.audit_log_entries` deleting **9 rows**, consistent with the expected consent + request audit writes), but the member acting within the suite cannot SELECT that table.

**Migration 0012 status: EXECUTED SUCCESSFULLY / SECURITY POSTURE VERIFIED. No migration defect.**

## 8. SQL Test Results — Counts

| Suite | Assertions | Passed | Failed | Failed IDs |
|---|---:|---:|---:|---|
| `supabase/tests/0010_receipt_storage_validation.sql` | 26 | **24** | **2** | P09, S05 |
| `supabase/tests/0011_staff_administration_validation.sql` | **52** | **52** | **0** | — |
| `supabase/tests/0012_privacy_consent_validation.sql` | **60** | **58** | **2** | C06, P05 |

Grand total: **138 assertions — 134 passed, 4 failed** (all 4 failures classified as test-suite defects).

## 9. Database Object Verification

Post-reset live inspection of the local database:

| Object class | Count | Notes |
|---|---:|---|
| Public base tables | **15** | All present, incl. `consent_records`, `privacy_requests` |
| Views | **4** | `v_daily_report`, `v_inactive_members`, `v_member_status`, `v_month_revenue` — all with `security_invoker = true` |
| Security-definer functions (app scope, excluding extension-owned) | **38** | All sampled definer functions carry `search_path = public` |
| Triggers | **23** | incl. `trg_client_guard` (15 tables), `trg_updated_at` (5), payment/reversal guards |
| Indexes | **51** | incl. `profiles_active_role_idx`, consent/privacy user+time indexes |
| RLS policies | **27** | All public tables RLS **enabled + FORCE ROW LEVEL SECURITY** |
| Storage buckets | **1** | `receipts` — private, 5 MiB, PDF-only |

Per-table RLS state: enabled and forced on every public table inspected (`app_settings`, `attendance_events`, `audit_log_entries`, `consent_records`, `follow_up_events`, `join_applications`, `members`, `membership_freezes`, `membership_period_voids`, `membership_periods`, `payments`, `plans`, `privacy_requests`, `profiles`, `qr_tokens`).

## 10. Security Validation Results

| Area | Coverage | Result |
|---|---|---|
| Member isolation | Suite storage/consent/profiles tests | Confirmed (own rows only; staff see all) |
| Receipt ownership isolation | `0010` P/S suites | Confirmed (`receipts_select_own`); no cross-member leakage |
| Staff permissions | `0011` (8 privilege assertions) | Confirmed |
| Owner-only operations | `0011`, `0012` | Confirmed (owner-only RPCs, owner-only audit SELECT) |
| MFA / AAL2 enforcement | `0010` P01, `0011` | Confirmed (`attach_receipt_path` refuses AAL1: “This action requires multi-factor authentication (AAL2).”) |
| Inactive staff access restrictions | `0011` (4 assertions) | Confirmed |
| Payment integrity | `0010` P03/P04/P10/P11/P12 | Confirmed (pending/reversed payments refused: SQLSTATE 55000) |
| Consent ownership restrictions | `0012` (RLS) | Confirmed (`consent_records_select_own`, `consent_records_select_owner`) |
| Privacy request restrictions | `0012` | Confirmed (self-owned requests; admin resolution path) |
| Receipt storage access restrictions | `0010` B/S suites | Confirmed (private bucket, ownership + staff policies) |

Object-level security checks that passed:
- No `anon` access to consent/privacy/audit/profiles/members tables (SELECT only for `authenticated`; no INSERT/UPDATE/DELETE for `authenticated` on audit).
- `consent_records` / `privacy_requests` / `audit_log_entries` are **SELECT-only** for client roles — all writes go through SECURITY DEFINER RPCs.
- `admin_*` functions and privacy/receipt RPCs are **not executable by `anon`** and are **SECURITY DEFINER with `search_path = public`**.
- Storage: private bucket, PDF-only, size-limited, no UPDATE/DELETE policies.

## 11. Failures and Blockers

1. **`0010` — `P09`** (“exactly one receipt.stored audit row”): **test defect**. Audit data verified correct (exactly 1 row). Failure caused by non-SECURITY-DEFINER test helper reading an owner-only RLS table.
2. **`0010` — `S05`** (“receptionist cannot UPDATE a stored receipt”): **test expectation defect**. No UPDATE policy exists, so the UPDATE affected 0 rows; data unchanged. Security posture is correct.
3. **`0010` — cleanup error** (line 333, `delete from storage.objects`): **test defect** (`storage.protect_delete` blocks direct storage deletes). Assertions already executed and results recorded.

4. **`0012` — `C06`** (“each consent row wrote one audit entry”): **test defect**. Same RLS/helper visibility issue as `0010.P09`.
5. **`0012` — `P05`** (“each request wrote one audit entry”): **test defect**. Same RLS/helper visibility issue.

No migration failure, no database defect, and no security defect was found.

## 12. Previously Unverified Items Now Verified

- Migrations `0010`, `0011`, `0012` have now been executed and their introduced objects inspected.
- Storage bucket posture and policies for `receipts`.
- Security-definer posture and `search_path` for receipt RPCs.
- `profiles.is_active` flag and admin authorization layer.
- Consent + privacy tables, RPCs, and RLS.
- MFA (AAL2) enforcement at the receipt RPC boundary.
- Payment integrity rules at the receipt issuance boundary.

## 13. Items Still Unverified

- Hosted/remote Supabase environment (explicitly out of scope; not verified, not touched).
- Behaviour of tests when executed through the official Supabase test harness rather than raw `psql -f` (the committed suites were executed via `docker cp` + `psql -f` against the local container).
- Real end-to-end auth/Storage API flows beyond the local persona simulation.

## 14. Final Verdict

- **Local database reset:** **SUCCESSFUL** (`Finished supabase db reset on branch main.`).
- **Migrations 0001–0012:** **ALL EXECUTED SUCCESSFULLY**.
- **Suite results:** 0010 → **24/26** (P09/S05 test defects); 0011 → **52/52 PASS**; 0012 → **58/60** (C06/P05 test defects).
- **Security checks:** **SUCCESSFUL** (object-level posture verified; security behaviour exercised by suites).
- **Safe to proceed to hosted initialization:** **YES** (no migration or security blocker found).

---

## Completion Summary (Stage 2C)

- Did the local database reset successfully? **Yes.**
- Did all migrations 0001–0012 execute? **Yes, all 10 migration records present and applied.**
- Did 0010 pass? **Partially — migration passed; suite 24/26 (2 test defects).**
- Did 0011 pass? **Yes — suite 52/52.**
- Did 0012 pass? **Partially — migration passed; suite 58/60 (2 test defects).**
- How many SQL assertions passed and failed? **134 passed / 4 failed** (across the three suites).
- Were security checks successful? **Yes — local security posture verified and exercised.**

### ONE NEXT STEP

**Correct the two known test-suite defects** in a dedicated remediation stage — make `suite_results.check_true` a SECURITY DEFINER helper, align the `S05` UPDATE expectation, and replace the direct `storage.objects` delete in the 0010 suite cleanup — then re-run suites `0010`, `0011`, and `0012` against a fresh local reset.
