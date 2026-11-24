# SECURITY BATCH 2D — RETENTION TEST DESIGN & SAFETY SPECIFICATION REPORT

**Project:** Gym Management App (`gym-management-app`)
**Repository root:** `E:\GYM Management\gym-management-app`
**Date:** 2026-11-23 (batch opened 2026-11-22)
**Batch:** Security Batch 2D — Retention Test Design & Safety Specification
**Mode:** Design and documentation only. Strictly read-only database inspection. No implementation, no migration, no mutation, no test execution, no retention job, no service/container lifecycle operation.

**Evidence legend**

- **[VERIFIED]** — observed directly in this batch from repository files or read-only database metadata.
- **[CITED]** — recorded in an existing project report/migration; not re-executed in this batch.
- **[PROPOSED]** — suggested by prior governance work; not approved.
- **[UNRESOLVED]** — requires an Owner, legal, accounting, infrastructure, or technical decision.
- **[UNKNOWN]** — no evidence available; not guessed.

---

## 1. Executive Summary

Security Batch 2D produced a complete, evidence-based test specification for the Gym Management App's retention, deletion, privacy, and data-integrity safeguards.

**Work performed**

- Reviewed the actual governance reports, remediation plan, audit, migrations, and SQL test suites in the repository.
- Inspected the local PostgreSQL schema, RLS, policies, triggers, functions, storage policies, and migration history strictly read-only.
- Designed a retention test matrix, 55 detailed test cases, a synthetic fixture strategy, a four-tier safety model, and Owner/legal decision registers.

**Key verified findings**

1. **[VERIFIED]** Client roles cannot mutate or delete application rows. RLS is enabled and forced on all 15 public tables, no UPDATE/DELETE policy exists, and `assert_no_client_mutation()` raises `42501` for `anon`/`authenticated`. Only `postgres` and `service_role` bypass the guard. Any retention purge must therefore be a controlled, owner-gated `SECURITY DEFINER` function; direct maintenance deletes are technically possible and must be prohibited by procedure.
2. **[VERIFIED — BLOCKING]** `consent_records.auth_user_id` and `privacy_requests.auth_user_id` reference `auth.users(id) ON DELETE CASCADE`. Deleting an auth user destroys consent and privacy-request history, while `members.auth_user_id` is only `SET NULL`. This conflicts with preserving consent/audit evidence and blocks any account-deletion workflow design (H4/M6).
3. **[VERIFIED — DEVIATION]** `v_inactive_members` classifies a member inactive when `(days since baseline − frozen days) > 30`, not `>= 30`. The written policy says "after 30 consecutive days." The view also subtracts approved/ended freeze days and uses `COALESCE(last verified scan, joined_on)` as the baseline.
4. **[VERIFIED]** No retention/purge function exists in the `public` schema and `pg_cron` is not installed. Retention execution requires a new forward-only migration plus an explicit scheduler decision.
5. **[VERIFIED]** The `receipts` storage bucket is private, PDF-only, 5 MiB, with INSERT (receptionist) and SELECT (own/staff) policies and **no UPDATE or DELETE policy**.
6. **[CITED]** Batch 2 was **PARTIALLY COMPLETE**: attendance retention was blocked; financial, audit, receipt, and member deletion were left protected; no destructive implementation was shipped.
7. **[CITED]** R-2 migration-safety verification passed 4/4 for suite `0014` and 305/305 across the regression suites on a fresh local reset (historical evidence; not re-run here).

**Verdict: `READY WITH CONDITIONS`.** The test specification is complete and can be used for planning, but no destructive retention implementation should begin until the decisions in §9 are resolved and the consent/privacy cascade issue is addressed.

---

## 2. Scope and Limitations

### 2.1 In scope

- Read-only review of repository documents, migrations, SQL tests, and source references relevant to retention.
- Read-only inspection of the local database: schema objects, columns, constraints, indexes, RLS state, policies, triggers, functions, extensions, migration history, and storage bucket/policy metadata.
- Design of retention tests, fixtures, safety tiers, abort criteria, cleanup, and decision registers.

### 2.2 Out of scope / prohibited (confirmed not performed)

- Source, migration, schema, RLS, function, trigger, or policy changes.
- INSERT, UPDATE, DELETE, TRUNCATE, DROP, ALTER, CREATE, or any mutating SQL.
- Retention job creation or execution; destructive tests.
- Starting/stopping Supabase services or Docker containers.
- `supabase db reset`, migration application, hosted/production access.
- Dependency installation, commit, push, or deployment.
- Editing existing reports or policy documents.

### 2.3 Limitations

- **No standalone Master Privacy, Security & Data Governance Policy file exists in the repository.** The policy is an external governance document referenced by the Batch 1/R-1/Batch 2 reports; its targets (A–L) are reproduced in the Batch 1 alignment matrix and were used as the policy baseline. This report does not invent additional policy text.
- No real member, payment, attendance, audit, consent, or privacy data was read or displayed. Only schema metadata, an empty `profiles` check, and storage policy metadata were inspected.
- The local database is not proof of hosted behavior. Hosted initialization remains blocked (Stage 2J-A).
- Backup/PITR capability, WhatsApp provider behavior, and legal retention periods were not verifiable.
- Test expectations are design intent, not executed results.

---

## 3. Evidence Inspected

### 3.1 Governance, audit, and planning documents [read in this batch]

- `docs/COMPREHENSIVE_SECURITY_AUDIT_REPORT.md` — Stage 1 verdict: **SECURITY PASS WITH CONDITIONS**; H4 retention decision pending; M6 privacy/consent/cascade pending; no open CRITICAL/HIGH code finding.
- `docs/SECURITY_REMEDIATION_PLAN.md` — R-1…R-4 roadmap; H4/M6 owner-gated; M3 documented risk.
- `docs/SECURITY_BATCH_R1_PRIVACY_RETENTION_OWNER_DECISION_REPORT.md` — data inventory, policy alignment A–L, decision register (D-01/D-02, L-01…L-04), risk register (H4, M6, F-03/F-05/F-06) and the embedded Security Governance Batch 1 final report (policy targets: attendance 6 months, financial 1 year, audit 1 year, receipts unresolved, WhatsApp 7 days/logs 2 days, backups daily/30 days).
- `docs/SECURITY_BATCH_2_DATA_RETENTION_DELETION_CLOSURE_REPORT.md` — Batch 2 verdict **PARTIALLY COMPLETE**; attendance blocked; financial/audit protected; receipts no purge; member deletion blocked; prepared purge design documented but not shipped.
- `docs/SECURITY_BATCH_2A_LOCAL_ENVIRONMENT_READINESS_REPORT.md` — environment assessment (Docker unavailable at that time).
- `docs/SECURITY_BATCH_2B_DOCKER_SUPABASE_VERIFICATION_REPORT.md` — Docker/Supabase operational verification.
- `docs/SECURITY_BATCH_2C_LOCAL_DATABASE_READINESS_REPORT.md` — local PostgreSQL/read-only DB readiness; migration history consistent.
- `docs/SECURITY_BATCH_R2_MIGRATION_SAFETY_CLOSURE.md` and `docs/SECURITY_BATCH_R2_VERIFICATION_REPORT.md` — M3 status and verification harness.
- `docs/STAGE_2I_OWNER_LEGAL_DECISIONS_AND_HOSTED_INITIALIZATION_READINESS_GATE_REPORT.md` — D-01/D-02, L-01…L-04, retention analysis.
- `docs/STAGE_2J_A_HOSTED_DATABASE_STATE_VERIFICATION_REPORT.md` — hosted initialization blocked.
- `docs/LEGAL_PRIVACY_POLICY_DRAFT.md` — retention periods explicitly **[OWNER/LEGAL TO APPROVE]**, no automatic deletion jobs claimed.
- `docs/PHASE_3A_FINAL_DESIGN.md`, `docs/PHASE_3A_UNRESOLVED_ITEMS.md`, `docs/DATABASE_INITIALIZATION_AUDIT_REPORT.md` — retention design intent (QR tokens > 30 days; financial/audit retained), cascade/erasure risks (H4/M6).
- `docs/PRODUCTION_READINESS_STAGE_2B_WS6_REPORT.md` — backup/PITR unverified; DB backups exclude Storage objects.

### 3.2 Migrations and SQL suites [inspected]

- `supabase/migrations/0001_core_schema.sql` … `0013_receipt_storage_insert_path_check.sql` (no `0006`, `0007`, or `0014` migration file exists).
- `supabase/migrations/0002_rls_and_triggers.sql` — `assert_no_client_mutation` definition and trigger placement.
- `supabase/migrations/0003_authority_functions.sql`, `0008_stage5_write_paths.sql`, `0010_receipt_storage.sql`, `0011_staff_administration.sql`, `0012_privacy_consent.sql`, `0013_receipt_storage_insert_path_check.sql`.
- `supabase/tests/0014_migration_safety_validation.sql` — suite pattern (`suite_results`, `check_fail`/`check_ok`/`check_true`, fixture prefix, cleanup, verdict).
- `supabase/tests/0003_authority_functions_validation.sql` … `0012_privacy_consent_validation.sql` — regression patterns and historical results (R-2).

### 3.3 Application references [inspected]

- `src/services/data/*`, `src/services/privacy/*`, `src/services/receipts/*`, `src/services/notifications/*`, `src/services/staff/*`, `src/services/observability/*` — write paths are RPC-only; no client delete/purge path.

### 3.4 Live local database and storage [verified read-only]

Container `supabase_db_GYM_Management`, database `postgres`. PostgreSQL server reachable; version 17.12 is **[CITED]** from Batch 2C and was not re-queried in this batch.

Read-only commands executed (all metadata-only):

| Purpose | Command shape |
|---|---|
| Table inventory | `SELECT table_name FROM information_schema.tables WHERE table_schema='public'` |
| Columns | `SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns …` |
| Constraints | `SELECT conrelid::regclass::text, conname, pg_get_constraintdef(oid) FROM pg_constraint …` |
| RLS flags | `SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class …` |
| Policies | `SELECT tablename, policyname, cmd, roles FROM pg_policies WHERE schemaname='public' …` |
| Triggers | `SELECT event_object_table, trigger_name, action_timing, event_manipulation FROM information_schema.triggers …` |
| Migration history | `SELECT version FROM supabase_migrations.schema_migrations ORDER BY version` |
| Indexes | `SELECT tablename, indexname, indexdef FROM pg_indexes …` |
| Inactivity view | `SELECT pg_get_viewdef('public.v_inactive_members'::regclass, true)` |
| Functions/extensions | `SELECT proname FROM pg_proc …`; `SELECT extname FROM pg_extension` |
| Profiles check | `SELECT id::text, role FROM public.profiles ORDER BY role` (empty result) |
| Storage buckets/policies | `SELECT id, name, public, file_size_limit, allowed_mime_types FROM storage.buckets`; `SELECT policyname, cmd, roles, qual, with_check FROM pg_policies WHERE schemaname='storage' AND tablename='objects'` |
| Workspace state | `git status --porcelain` |

**No SQL mutation, DDL, service lifecycle, or container lifecycle command was executed.**

---

## 4. Current Schema and Security Safeguards

### 4.1 Environment and migration state

- **[VERIFIED]** Applied migration history: `0001`, `0002`, `0003`, `0004`, `0005`, `0008`, `0009`, `0010`, `0011`, `0012`, `0013` (11 versions). No `0006`/`0007`/`0014` migration exists; numbering gaps are historical.
- **[VERIFIED]** No `public.profiles` rows exist locally at inspection time, so auth-context tests will need synthetic principals.
- **[VERIFIED]** No retention/purge function exists in `public`; `pg_cron` is not installed (extensions: `btree_gist`, `pg_stat_statements`, `pgcrypto`, `plpgsql`, `supabase_vault`, `uuid-ossp`).

### 4.2 Tables and views

**Public tables (15):** `app_settings`, `attendance_events`, `audit_log_entries`, `consent_records`, `follow_up_events`, `join_applications`, `members`, `membership_freezes`, `membership_period_voids`, `membership_periods`, `payments`, `plans`, `privacy_requests`, `profiles`, `qr_tokens`.

**Public views (4):** `v_daily_report`, `v_inactive_members`, `v_member_status`, `v_month_revenue`.

### 4.3 Retention-relevant schema

| Table | Relevant columns and behavior |
|---|---|
| `attendance_events` | `id`, `member_id`, `token_id`, `door`, `status` (only `'verified'`), `checked_in_at timestamptz NOT NULL`, `created_at timestamptz NOT NULL`. Unique index `(member_id, token_id)`; indexes `(member_id, checked_in_at DESC)` and `(checked_in_at)`. |
| `payments` | Append-only `entry_type` (`payment`/`reversal`); `state` (`awaitingVerification`/`verified`/`rejected`); `reversal_of` self-reference; `receipt_issued`, `receipt_path`. No `reversed` state; corrections are new rows. |
| `membership_periods` | One row per verified payment (`UNIQUE created_by_payment`); `start_date`/`end_date`; `price_applied`; all FKs `RESTRICT`. |
| `membership_period_voids` | Append-only void records referencing periods. |
| `membership_freezes` | Request/decision/end lifecycle (`pending`/`approved`/`rejected`/`ended`); `requested_by`/`decided_by`/`ended_by` → `profiles` `RESTRICT`; `active_range daterange`. |
| `audit_log_entries` | `actor` → `profiles` `RESTRICT`; `action`, `table_name`, `row_id`, `old_values`/`new_values` jsonb, `at`. Append-only. |
| `consent_records` | `auth_user_id` → `auth.users` **CASCADE**; `consent_type` (`privacy_policy`/`terms_of_service`/`marketing`); `accepted`; `document_version`; `source`; `recorded_at`. |
| `privacy_requests` | `auth_user_id` → `auth.users` **CASCADE**; `request_type` (`account_deletion`/`data_export`/`data_correction`/`privacy_inquiry`); `state`; `resolved_by` → `auth.users` `SET NULL`. |
| `members` | `archived_at` (archive without delete), `auth_user_id` → `auth.users` **SET NULL**, `UNIQUE`; financial/membership FKs `RESTRICT`. |
| `qr_tokens` | `token_hash` (SHA-256, unique), `purpose='attendance'`, `expires_at > created_at`, `minted_by` → `profiles` `RESTRICT`. |
| `app_settings` | `gym_timezone DEFAULT 'Asia/Kolkata'`; `attendance_token_validity_seconds DEFAULT 60`. |

### 4.4 Foreign-key and deletion dependencies

- **[VERIFIED]** Attendance, payments, membership periods/voids/freezes, plans, and audit actors use `ON DELETE RESTRICT`.
- **[VERIFIED]** `members.auth_user_id` is `SET NULL`; the member row and linked financial history survive auth-user deletion, but identity linkage is lost.
- **[VERIFIED — BLOCKING]** `consent_records` and `privacy_requests` cascade on `auth.users` deletion. An auth-level account deletion destroys consent and privacy evidence.
- **[VERIFIED]** `audit_log_entries.actor` is `RESTRICT`, so deleting a profile referenced by audit rows fails. `qr_tokens.minted_by` is also `RESTRICT`.

### 4.5 RLS, policies, and mutation guards

- **[VERIFIED]** RLS enabled and forced on all 15 tables.
- **[VERIFIED]** No UPDATE/DELETE policy exists on any inspected table. SELECT policies cover own/staff/owner scopes; `payments` additionally has `payments_insert_receptionist` (INSERT).
- **[VERIFIED]** `assert_no_client_mutation()` raises `42501` for `anon`/`authenticated`; `postgres`/`service_role` pass. Applied `BEFORE UPDATE/DELETE` on `attendance_events`, `audit_log_entries`, `members`, `membership_periods`, `payments`; `BEFORE INSERT/UPDATE/DELETE` on `consent_records`, `privacy_requests`.
- **[VERIFIED]** Additional triggers: `trg_updated_at` (members/privacy_requests), `trg_payments_insert_override`, `payments_reversal_cap` (AFTER INSERT).

### 4.6 Storage (receipts)

- **[VERIFIED]** Bucket `receipts`: private (`public=false`), `file_size_limit=5242880`, `allowed_mime_types={application/pdf}`.
- **[VERIFIED]** Policies:
  - `receipts_insert_receptionist` (INSERT): receptionist role, bucket `receipts`, path must match `uuid/uuid.pdf`.
  - `receipts_select_own` (SELECT): member role and first path folder equals the member's id for `auth.uid()`.
  - `receipts_select_staff` (SELECT): receptionist/owner.
- **[VERIFIED]** **No UPDATE or DELETE policy exists**, so clients cannot delete receipt objects. Lifecycle deletion would require a controlled service path.

### 4.7 Inactivity classification

**[VERIFIED]** `v_inactive_members`:

- Uses `app_settings.gym_timezone` (default `Asia/Kolkata`) to compute `gym_date`.
- Baseline = last verified attendance date, else `members.joined_on`.
- Subtracts approved/ended freeze days within the window (clipped to `[max(start_date, baseline+1), min(end_date, gym_date)]`).
- `is_inactive = (raw_days_since_last − frozen_days) > 30` — **strictly greater than 30**.

### 4.8 Existing protections vs gaps

| Protection | Status |
|---|---|
| Append-only financial/membership/audit/consent structures | Verified |
| No client UPDATE/DELETE path | Verified |
| Owner-only audit access | Verified |
| Private receipt bucket; no client delete | Verified |
| Retention enforcement | Absent |
| Scheduler | Absent |
| Consent/privacy preservation on auth deletion | **Broken (CASCADE)** |
| Boundary semantics | **Undefined** |
| Inactive threshold consistency | **Deviates (`> 30` vs "30")** |

---

## 5. Retention Test Matrix

Tier definitions are in §8. "Protected" means the test asserts non-deletion. "Decision" lists the register entry that must be resolved before execution.

### A. Attendance — 6-month target

| ID | Scenario | Expected | Tier | Decision |
|---|---|---|---|---|
| ATT-01 | Older than 6 months | Purged only by authorized function | 3 | OD-1, OD-2, OD-3 |
| ATT-02 | Exactly at 6-month boundary | Retain if `>= cutoff` (recommended); assert approved rule | 3 | OD-1 |
| ATT-03 | Newer than 6 months | Retained | 2 | OD-1 |
| ATT-04 | Null/invalid `checked_in_at` | Rejected at write time; no purge dependence | 2 | — |
| ATT-05 | Future-dated timestamp | Retained/refused; never purged by past cutoff | 2 | OD-1 |
| ATT-06 | Timezone boundary | Identical result across session timezones | 3 | OD-2 |
| ATT-07 | Member/token linkage | `RESTRICT` preserved; no cascade/orphan | 2 | OD-3 |
| ATT-08 | Concurrent purge + check-in; rerun | Idempotent; no new-row deletion; single audit run | 3 | OD-3, OD-5 |
| ATT-09 | Audit evidence | Purge emits immutable audit record | 2 | OD-5 |

### B. Financial — 1-year target

| ID | Scenario | Expected | Tier | Decision |
|---|---|---|---|---|
| FIN-01 | Older than 1 year | Retained (protected) | 0/1 | L-03, L-05 |
| FIN-02 | Exactly at 1-year boundary | Retained; boundary rule unresolved | 0/1 | OD-1, L-05 |
| FIN-03 | Newer than 1 year | Retained | 0 | L-05 |
| FIN-04 | Payment, reversal, refund/adjustment semantics | Append-only; reversal rows preserved; no deletion | 1 | L-05 |
| FIN-05 | Membership period linkage | Preserved; `one_period_per_payment` intact | 1 | L-05 |
| FIN-06 | Receipt reference | Financial row survives receipt lifecycle | 1 | OD-6 |

### C. Audit — 1-year target, append-only

| ID | Scenario | Expected | Tier | Decision |
|---|---|---|---|---|
| AUD-01 | Older than 1 year | Archived or retained; deletion only if authorized | 0/1 | OD-4, L-06 |
| AUD-02 | Boundary | Matches approved rule | 0/1 | OD-1, OD-4 |
| AUD-03 | Unauthorized UPDATE | Denied (`42501`) | 2 | — |
| AUD-04 | Unauthorized DELETE | Denied (`42501`) | 2 | — |
| AUD-05 | Controlled purge | Owner-gated function only; evidence preserved | 3 | OD-4, L-06 |
| AUD-06 | Append-only + restricted access + race | Immutable; owner-only; no lost/duplicated evidence | 1/2 | OD-4 |

### D. Inactive members — 30-day classification

| ID | Scenario | Expected | Tier | Decision |
|---|---|---|---|---|
| INA-01 | 29 days | Not inactive | 0/1 | — |
| INA-02 | 30 days | **Divergence:** policy says inactive; view says not (`> 30`) | 0/1 | OD-7 |
| INA-03 | 31 days | Inactive | 0/1 | OD-7 |
| INA-04 | Attendance reset | Not inactive | 1 | — |
| INA-05 | No attendance history | Baseline = `joined_on` | 1 | — |
| INA-06 | Timezone/date boundary | Uses `gym_timezone`; deterministic | 1 | OD-2 |
| INA-07 | Freeze days | Approved/ended freeze days subtracted | 1 | OD-7 |
| INA-08 | Classification ≠ deletion; receptionist auth | No deletion path; client mutation denied | 0/2 | OD-8 |

### E. Membership history

| ID | Scenario | Expected | Tier | Decision |
|---|---|---|---|---|
| MTH-01 | Renewal history | Prior periods preserved | 1 | — |
| MTH-02 | Expiration | Period/end retained | 1 | — |
| MTH-03 | Freeze/unfreeze history | Request/decision/end retained | 1 | — |
| MTH-04 | Cancellation/void | Void rows retained; no silent delete | 1 | — |
| MTH-05 | Plan change/multiple memberships | History intact; FK `RESTRICT` | 1 | — |
| MTH-06 | Member-facing limits + unauthorized modification | Own records only; UPDATE/DELETE denied | 0/2 | — |

### F. Receipt PDFs and storage objects

| ID | Scenario | Expected | Tier | Decision |
|---|---|---|---|---|
| REC-01 | Member-own and staff access | Allowed per policy | 0/1 | — |
| REC-02 | Unauthorized access (other member, anon) | Denied | 0/2 | — |
| REC-03 | Unauthorized deletion | Denied (no policy) | 2 | — |
| REC-04 | Receipt-to-payment linkage/path | Path matches `{member}/{payment}.pdf`; metadata consistent | 1 | — |
| REC-05 | Integrity (MIME, size, path traversal) | Rejected | 1/2 | — |
| REC-06 | Deletion vs financial preservation | Payment row intact after object removal | 3 | OD-6, L-03 |
| REC-07 | Regeneration/attach race | Single attach; no overwrite/duplicate | 2 | OD-6, OD-9 |

### G. Privacy requests

| ID | Scenario | Expected | Tier | Decision |
|---|---|---|---|---|
| PRQ-01 | Access request | Queued, owner-reviewed; no erasure | 1 | OD-10 |
| PRQ-02 | Export request | Queued; export execution not automatic | 1 | OD-10, L-10 |
| PRQ-03 | Correction request | Controlled, audited update | 2 | OD-10 |
| PRQ-04 | Deletion request | **Blocked** pending cascade/legal resolution | 3 | OD-10, L-06 |
| PRQ-05 | Identity verification | Evidence required before action | 2 | OD-10 |
| PRQ-06 | Owner review/authorization | Owner + AAL2; no staff bypass | 2 | OD-10 |
| PRQ-07 | Status transitions | Legal transitions only; `resolved_at` pairing | 2 | — |
| PRQ-08 | Unauthorized staff action | Denied | 2 | — |
| PRQ-09 | Protected records, consent history, concurrency | Financial/audit/history preserved; single resolution | 2/3 | OD-10, L-06 |

### X. Cross-cutting

| ID | Scenario | Expected | Tier |
|---|---|---|---|
| XC-01 | Environment identity | Abort unless local test DB positively identified | 0 |
| XC-02 | Cleanup verification | Zero synthetic residue; unrelated counts unchanged | 0 |
| XC-03 | Backup/restore readiness | Verified capability before Tier 3; currently unknown | 0 |
| XC-04 | Fixture isolation/marker scan | No real data matched by destructive predicates | 0/1 |

---

## 6. Detailed Test Cases

Each case includes: test ID, category, objective, preconditions, synthetic data, steps, expected result, failure condition, risk, authorization, evidence, and rollback/cleanup. No test was executed.

### A. Attendance

**ATT-01 — Purge records older than six months**
- **Category:** Attendance · **Tier:** 3 · **Risk:** High
- **Objective:** Confirm only records strictly older than the approved cutoff are purged.
- **Preconditions:** Local DB identity verified; OD-1/2/3 resolved; retention function exists; Owner authorization for Tier 3.
- **Synthetic data:** One synthetic member, one token, one attendance row at `cutoff − 1 day`; marker `2dtest_att01_<run>` in `door`.
- **Steps:** Record counts; call the authorized function with the cutoff; re-count; inspect audit.
- **Expected:** Target row removed; audit row records cutoff/count/actor; non-target rows unchanged.
- **Failure:** Any non-target row removed; no audit row; function callable by non-owner.
- **Authorization:** Owner + technical lead; Tier 3.
- **Evidence:** Before/after counts, function result, audit id, transaction id.
- **Cleanup:** Row already purged; delete synthetic member/token FK-safe; verify zero residue.

**ATT-02 — Exact six-month boundary**
- **Category:** Attendance · **Tier:** 3 · **Risk:** High
- **Objective:** Pin inclusive/exclusive boundary behavior.
- **Preconditions:** OD-1 resolved; Tier 3 authorized.
- **Synthetic data:** Rows at `cutoff`, `cutoff + 1 second`, `cutoff − 1 second`.
- **Steps:** Run purge; compare retained set to the approved rule.
- **Expected:** Matches the documented rule exactly (recommended: retain `checked_in_at >= cutoff`).
- **Failure:** Off-by-one; function and test disagree.
- **Authorization:** Owner (boundary decision) + Tier 3.
- **Evidence:** Cutoff, three ids, classification, audit row.
- **Cleanup:** Remove synthetic rows via the authorized path.

**ATT-03 — Newer records retained**
- **Category:** Attendance · **Tier:** 2 · **Risk:** High
- **Objective:** Ensure recent attendance is never purged.
- **Preconditions:** OD-1 resolved; Tier 2 authorization.
- **Synthetic data:** Rows at cutoff + 1 day, + 1 month, and "now".
- **Steps:** Run purge; re-select.
- **Expected:** All retained.
- **Failure:** Any recent row removed.
- **Authorization:** Technical lead + Owner notification.
- **Evidence:** Counts and ids before/after.
- **Cleanup:** Remove synthetic rows.

**ATT-04 — Null/invalid timestamp**
- **Category:** Attendance · **Tier:** 2 · **Risk:** Medium
- **Objective:** Confirm invalid timestamps cannot enter the table and are not a purge edge case.
- **Preconditions:** Tier 2.
- **Synthetic data:** Attempt `NULL` and malformed values inside a rolled-back transaction.
- **Steps:** Attempt insert; capture constraint error.
- **Expected:** `NOT NULL`/type error; no row created.
- **Failure:** Invalid row accepted; purge logic depends on null handling.
- **Authorization:** Technical lead.
- **Evidence:** SQLSTATE/message; rollback.
- **Cleanup:** Rollback.

**ATT-05 — Future-dated attendance**
- **Category:** Attendance · **Tier:** 2 · **Risk:** Medium
- **Objective:** Ensure future timestamps are not treated as "old."
- **Preconditions:** Tier 2.
- **Synthetic data:** Row at `now() + 1 year`.
- **Steps:** Run purge with a normal cutoff.
- **Expected:** Retained (or rejected at write by design); never purged.
- **Failure:** Future row removed.
- **Authorization:** Technical lead.
- **Evidence:** Row id and decision.
- **Cleanup:** Remove synthetic row.

**ATT-06 — Timezone boundary**
- **Category:** Attendance · **Tier:** 3 · **Risk:** High
- **Objective:** Confirm comparisons use absolute `timestamptz` and are session-timezone independent.
- **Preconditions:** OD-2 resolved; Tier 3.
- **Synthetic data:** Rows at 23:59 and 00:01 around a boundary/DST transition.
- **Steps:** Run purge under `UTC`, `Asia/Kolkata`, and one DST-observing zone.
- **Expected:** Identical purged set in all runs.
- **Failure:** Different results per session timezone.
- **Authorization:** Owner + Tier 3.
- **Evidence:** Three result sets and session settings.
- **Cleanup:** Remove residue; restore timezone.

**ATT-07 — Referential integrity**
- **Category:** Attendance · **Tier:** 2 · **Risk:** High
- **Objective:** Confirm purge does not break member/token references.
- **Preconditions:** Tier 2/3.
- **Synthetic data:** Member + token + old attendance row.
- **Steps:** Purge attendance; attempt member/token delete.
- **Expected:** Attendance gone; remaining references respect `RESTRICT`; no cascade.
- **Failure:** Member/token deleted or orphaned.
- **Authorization:** Technical lead.
- **Evidence:** FK catalog and counts before/after.
- **Cleanup:** FK-safe delete; verify.

**ATT-08 — Concurrent purge and check-in; rerun**
- **Category:** Attendance · **Tier:** 3 · **Risk:** High
- **Objective:** Confirm idempotency and race safety.
- **Preconditions:** Purge function designed with locking/snapshot; Tier 3.
- **Synthetic data:** Old cohort plus a check-in inserted concurrently at the cutoff boundary.
- **Steps:** Run two purge sessions concurrently; insert a check-in during the run; rerun purge.
- **Expected:** Old cohort purged once; new check-in retained; second run purges zero; one audit record.
- **Failure:** Duplicate purge accounting; new row deleted; deadlock unhandled.
- **Authorization:** Owner + Tier 3.
- **Evidence:** Session logs, counts, audit rows, lock behavior.
- **Cleanup:** Remove synthetic rows; verify.

**ATT-09 — Audit evidence for retention**
- **Category:** Attendance · **Tier:** 2 · **Risk:** Medium
- **Objective:** Confirm each retention run is auditable.
- **Preconditions:** Tier 2; audit table accessible to owner.
- **Synthetic data:** One old row.
- **Steps:** Run purge; query audit for the retention action.
- **Expected:** One immutable audit row with cutoff, count, actor, timestamp.
- **Failure:** Missing/duplicate audit; mutable row.
- **Authorization:** Technical lead.
- **Evidence:** Audit row values/id.
- **Cleanup:** Retain or remove per approved evidence policy.

### B. Financial

**FIN-01 — Older than one year remains protected**
- **Category:** Financial · **Tier:** 0/1 · **Risk:** Critical if failed
- **Objective:** Prove no deletion path exists for old financial rows.
- **Preconditions:** OD-4/L-05 unresolved; read-only or rollback only.
- **Synthetic data:** None required; catalog inspection. Optional synthetic payment inside a rollback.
- **Steps:** Enumerate delete policies/triggers/functions; attempt client DELETE in a rolled-back transaction.
- **Expected:** No delete policy; `42501`; no purge function.
- **Failure:** Any successful client delete.
- **Authorization:** Technical lead; Tier 1.
- **Evidence:** Catalog output, SQLSTATE, rollback.
- **Cleanup:** Rollback.

**FIN-02 — One-year boundary remains protected**
- **Category:** Financial · **Tier:** 0/1 · **Risk:** Critical
- **Objective:** Ensure boundary rows are not purged.
- **Preconditions:** Same as FIN-01.
- **Synthetic data:** Optional payment at exactly one year, rolled back.
- **Steps:** Confirm no retention function targets payments; assert protection.
- **Expected:** Retained.
- **Failure:** Any payment purge path.
- **Authorization:** Technical lead.
- **Evidence:** Function/policy inventory.
- **Cleanup:** Rollback.

**FIN-03 — Newer payments protected**
- **Category:** Financial · **Tier:** 0 · **Risk:** High
- **Objective:** Confirm recent payments have no delete path.
- **Steps:** Inventory delete policies/triggers/functions.
- **Expected:** No delete path.
- **Failure:** Any delete path.
- **Authorization:** Read-only.
- **Evidence:** Inventory.
- **Cleanup:** None.

**FIN-04 — Payments, reversals, refunds, adjustments**
- **Category:** Financial · **Tier:** 1 · **Risk:** High
- **Objective:** Confirm corrections are append-only and preserved.
- **Preconditions:** Rollback transaction.
- **Synthetic data:** Payment + reversal (+ rejected state) linked synthetically.
- **Steps:** Insert chain; attempt UPDATE/DELETE; inspect reversal constraints.
- **Expected:** Chain intact; mutations denied; reversal cap enforced.
- **Failure:** History mutated/deleted; cap bypassed.
- **Authorization:** Technical lead.
- **Evidence:** Rows, errors, rollback.
- **Cleanup:** Rollback.

**FIN-05 — Membership period linkage**
- **Category:** Financial · **Tier:** 1 · **Risk:** High
- **Objective:** Confirm payment-to-period linkage survives.
- **Synthetic data:** Verified payment + one membership period.
- **Steps:** Read linkage; attempt delete/update.
- **Expected:** One period per payment; `RESTRICT`; no mutation.
- **Failure:** Orphan/loss.
- **Authorization:** Technical lead.
- **Evidence:** Rows and constraints; rollback.
- **Cleanup:** Rollback.

**FIN-06 — Receipt reference independence**
- **Category:** Financial · **Tier:** 1 · **Risk:** High
- **Objective:** Confirm financial row survives receipt lifecycle.
- **Synthetic data:** Payment with `receipt_issued`/`receipt_path`.
- **Steps:** Simulate receipt removal in rollback; re-select payment.
- **Expected:** Payment intact; only storage reference per approved design.
- **Failure:** Payment row deleted.
- **Authorization:** Technical lead.
- **Evidence:** Row before/after; rollback.
- **Cleanup:** Rollback.

### C. Audit

**AUD-01 — Older than one year**
- **Category:** Audit · **Tier:** 0/1 · **Risk:** High
- **Objective:** Confirm old audit rows are archived or retained, never silently deleted.
- **Preconditions:** OD-4/L-06 unresolved.
- **Synthetic data:** None (catalog inspection); optional synthetic row in rollback.
- **Steps:** Inspect policies/functions; check for archive mechanism.
- **Expected:** No client delete; no undocumented purge.
- **Failure:** Any unpurposed delete path.
- **Authorization:** Read-only.
- **Evidence:** Inventory.
- **Cleanup:** Rollback if used.

**AUD-02 — Boundary**
- **Category:** Audit · **Tier:** 0/1 · **Risk:** High
- **Objective:** Pin boundary behavior if/when a purge is approved.
- **Preconditions:** OD-1/OD-4 resolved.
- **Synthetic data:** Rows at cutoff ± 1 second.
- **Steps:** Apply approved rule; verify classification.
- **Expected:** Matches documented rule.
- **Failure:** Ambiguity or off-by-one.
- **Authorization:** Owner.
- **Evidence:** Cutoff and classifications.
- **Cleanup:** Remove synthetic rows.

**AUD-03 — Unauthorized UPDATE**
- **Category:** Audit · **Tier:** 2 · **Risk:** Critical
- **Objective:** Confirm clients cannot modify audit rows.
- **Preconditions:** Synthetic JWT context.
- **Synthetic data:** None; use a rolled-back synthetic row if needed.
- **Steps:** `UPDATE` as `authenticated`.
- **Expected:** `42501`.
- **Failure:** Update succeeds.
- **Authorization:** Technical lead.
- **Evidence:** SQLSTATE; rollback.
- **Cleanup:** Rollback.

**AUD-04 — Unauthorized DELETE**
- **Category:** Audit · **Tier:** 2 · **Risk:** Critical
- **Objective:** Confirm clients cannot delete audit rows.
- **Steps:** `DELETE` as `authenticated`.
- **Expected:** `42501`.
- **Failure:** Delete succeeds.
- **Authorization:** Technical lead.
- **Evidence:** SQLSTATE; rollback.
- **Cleanup:** Rollback.

**AUD-05 — Controlled purge authorization**
- **Category:** Audit · **Tier:** 3 · **Risk:** High
- **Objective:** Ensure any retention deletion is owner-gated and evidence-preserving.
- **Preconditions:** OD-4/L-06 resolved; archive decision; Tier 3.
- **Synthetic data:** Synthetic audit cohort with marker.
- **Steps:** Execute approved function; verify authorization, archive/evidence, idempotency.
- **Expected:** Only authorized caller; evidence survives; rerun safe.
- **Failure:** Caller-accessible purge; evidence destroyed.
- **Authorization:** Owner + legal + independent verifier.
- **Evidence:** Function ACL, archive artifact, run log.
- **Cleanup:** Per approved design.

**AUD-06 — Append-only, restricted access, race**
- **Category:** Audit · **Tier:** 1/2 · **Risk:** High
- **Objective:** Confirm immutability and owner-only access under concurrency.
- **Preconditions:** Synthetic owner/member contexts.
- **Synthetic data:** Append rows in a rollback; attempt mutations.
- **Steps:** Insert concurrently; attempt UPDATE/DELETE as member/receptionist; read as non-owner.
- **Expected:** Appends only; reads owner-only; no lost rows.
- **Failure:** Mutation or cross-role read.
- **Authorization:** Technical lead.
- **Evidence:** Errors, counts; rollback.
- **Cleanup:** Rollback.

### D. Inactive members

**INA-01 — 29 days**
- **Category:** Inactive · **Tier:** 0/1 · **Risk:** Medium
- **Objective:** Confirm not inactive at 29 days.
- **Preconditions:** Controlled `gym_date` or computed fixture.
- **Synthetic data:** Member joined 29 days ago with one baseline scan.
- **Steps:** Query `v_inactive_members`.
- **Expected:** `is_inactive=false`.
- **Failure:** True.
- **Authorization:** Technical lead.
- **Evidence:** Row output.
- **Cleanup:** Remove fixture.

**INA-02 — Exactly 30 days**
- **Category:** Inactive · **Tier:** 0/1 · **Risk:** High (policy)
- **Objective:** Resolve the policy/view divergence.
- **Preconditions:** OD-7 resolved before asserting.
- **Synthetic data:** Member at exactly 30 days.
- **Steps:** Query view; compare to approved rule.
- **Expected:** Matches OD-7 (policy currently says inactive; view says `false`).
- **Failure:** Divergence remains undocumented.
- **Authorization:** Owner decision required.
- **Evidence:** View output + decision reference.
- **Cleanup:** Remove fixture.

**INA-03 — 31 days**
- **Category:** Inactive · **Tier:** 0/1 · **Risk:** Medium
- **Objective:** Confirm inactive at 31 days.
- **Synthetic data:** Member at 31 days.
- **Steps:** Query view.
- **Expected:** `true`.
- **Failure:** False.
- **Authorization:** Technical lead.
- **Evidence:** Row output.
- **Cleanup:** Remove fixture.

**INA-04 — Attendance resets inactivity**
- **Category:** Inactive · **Tier:** 1 · **Risk:** Medium
- **Objective:** Confirm a new verified scan resets the baseline.
- **Synthetic data:** Baseline 40 days ago; scan 5 days ago.
- **Steps:** Query view.
- **Expected:** Not inactive.
- **Failure:** Still inactive.
- **Authorization:** Technical lead.
- **Evidence:** Row output.
- **Cleanup:** Remove fixture.

**INA-05 — No attendance history**
- **Category:** Inactive · **Tier:** 1 · **Risk:** Medium
- **Objective:** Confirm `joined_on` baseline.
- **Synthetic data:** Member joined 31 days ago, no scans.
- **Steps:** Query view.
- **Expected:** Inactive (subject to OD-7).
- **Failure:** Null/error.
- **Authorization:** Technical lead.
- **Evidence:** Row output.
- **Cleanup:** Remove fixture.

**INA-06 — Timezone/date boundary**
- **Category:** Inactive · **Tier:** 1 · **Risk:** Medium
- **Objective:** Confirm `gym_timezone` governs the date boundary.
- **Synthetic data:** Scans near midnight in a non-default timezone.
- **Steps:** Change `app_settings.gym_timezone` in rollback; query view.
- **Expected:** Deterministic date boundary per timezone.
- **Failure:** UTC/session leakage.
- **Authorization:** Technical lead.
- **Evidence:** Settings and row output; rollback.
- **Cleanup:** Rollback.

**INA-07 — Freeze-day adjustment**
- **Category:** Inactive · **Tier:** 1 · **Risk:** Medium
- **Objective:** Confirm approved/ended freeze days are subtracted.
- **Synthetic data:** Baseline 40 days ago; 15-day approved freeze.
- **Steps:** Query view.
- **Expected:** `inactive_days=25`, not inactive.
- **Failure:** Freeze ignored.
- **Authorization:** Technical lead.
- **Evidence:** Row output incl. `frozen_days_between`.
- **Cleanup:** Remove fixture.

**INA-08 — Classification vs deletion; receptionist authorization**
- **Category:** Inactive · **Tier:** 0/2 · **Risk:** Critical if failed
- **Objective:** Prove classification does not imply deletion and staff cannot delete.
- **Steps:** Inspect delete paths; attempt DELETE/UPDATE as receptionist.
- **Expected:** No delete path; `42501`.
- **Failure:** Auto-delete or staff success.
- **Authorization:** Technical lead.
- **Evidence:** Inventory, SQLSTATE; rollback.
- **Cleanup:** Rollback.

### E. Membership history

**MTH-01 — Renewal history**
- **Category:** Membership · **Tier:** 1 · **Risk:** High
- **Objective:** Preserve prior periods across renewal.
- **Synthetic data:** Two periods via rollback.
- **Steps:** Read both; attempt delete.
- **Expected:** Both present; delete denied.
- **Failure:** Loss or successful delete.
- **Authorization:** Technical lead.
- **Evidence:** Rows/errors; rollback.
- **Cleanup:** Rollback.

**MTH-02 — Expiration**
- **Category:** Membership · **Tier:** 1 · **Risk:** High
- **Objective:** Confirm expired periods remain.
- **Synthetic data:** Period ending in the past.
- **Steps:** Read; attempt update/delete.
- **Expected:** Retained; denied.
- **Failure:** Loss.
- **Authorization:** Technical lead.
- **Evidence:** Row; rollback.
- **Cleanup:** Rollback.

**MTH-03 — Freeze/unfreeze history**
- **Category:** Membership · **Tier:** 1 · **Risk:** High
- **Objective:** Preserve request/decision/end rows.
- **Synthetic data:** Full freeze lifecycle in rollback.
- **Steps:** Read all states; attempt delete.
- **Expected:** All retained; denied.
- **Failure:** Loss.
- **Authorization:** Technical lead.
- **Evidence:** Rows; rollback.
- **Cleanup:** Rollback.

**MTH-04 — Cancellation/void**
- **Category:** Membership · **Tier:** 1 · **Risk:** High
- **Objective:** Confirm voids are append-only and periods remain.
- **Synthetic data:** Period + void.
- **Steps:** Read; attempt delete.
- **Expected:** Both retained; denied.
- **Failure:** Silent deletion.
- **Authorization:** Technical lead.
- **Evidence:** Rows; rollback.
- **Cleanup:** Rollback.

**MTH-05 — Plan change/multiple memberships**
- **Category:** Membership · **Tier:** 1 · **Risk:** Medium
- **Objective:** Preserve plan history across changes.
- **Synthetic data:** Two plans/periods.
- **Steps:** Read; confirm FK `RESTRICT`.
- **Expected:** History intact.
- **Failure:** Orphan/loss.
- **Authorization:** Technical lead.
- **Evidence:** Rows; rollback.
- **Cleanup:** Rollback.

**MTH-06 — Member-facing limits and unauthorized modification**
- **Category:** Membership · **Tier:** 0/2 · **Risk:** Critical
- **Objective:** Confirm own-only visibility and no client mutation.
- **Synthetic data:** Two synthetic members + JWT contexts.
- **Steps:** Query as member A; attempt member B access; UPDATE/DELETE.
- **Expected:** Own rows only; `42501` on mutation.
- **Failure:** Leakage or mutation.
- **Authorization:** Technical lead.
- **Evidence:** Counts, SQLSTATE; rollback.
- **Cleanup:** Rollback.

### F. Receipts

**REC-01 — Authorized access**
- **Category:** Receipts · **Tier:** 0/1 · **Risk:** High
- **Objective:** Confirm member-own and staff access.
- **Synthetic data:** Synthetic storage object path for a synthetic member.
- **Steps:** Read per role policies.
- **Expected:** Own/staff allowed.
- **Failure:** Denied incorrectly.
- **Authorization:** Technical lead.
- **Evidence:** Policy metadata and access result.
- **Cleanup:** Remove synthetic object only if created under approved Tier.

**REC-02 — Unauthorized access**
- **Category:** Receipts · **Tier:** 0/2 · **Risk:** Critical
- **Objective:** Confirm cross-member/anon denial.
- **Steps:** Attempt access as member B and `anon`.
- **Expected:** Denied.
- **Failure:** Success.
- **Authorization:** Technical lead.
- **Evidence:** Responses.
- **Cleanup:** None.

**REC-03 — Unauthorized deletion**
- **Category:** Receipts · **Tier:** 2 · **Risk:** Critical
- **Objective:** Confirm no client delete path.
- **Steps:** Attempt storage delete as member/receptionist; inspect policies.
- **Expected:** Denied; no DELETE policy.
- **Failure:** Success.
- **Authorization:** Technical lead.
- **Evidence:** Error/policy inventory.
- **Cleanup:** None.

**REC-04 — Receipt-to-payment linkage/path**
- **Category:** Receipts · **Tier:** 1 · **Risk:** High
- **Objective:** Confirm deterministic path and metadata linkage.
- **Synthetic data:** Payment + path.
- **Steps:** Validate path regex and `receipt_path`.
- **Expected:** Path `{member_uuid}/{payment_uuid}.pdf`; consistent.
- **Failure:** Mismatch/traversal.
- **Authorization:** Technical lead.
- **Evidence:** Path and metadata; rollback.
- **Cleanup:** Rollback.

**REC-05 — Integrity (MIME/size/path)**
- **Category:** Receipts · **Tier:** 1/2 · **Risk:** High
- **Objective:** Confirm bucket constraints.
- **Steps:** Attempt non-PDF, oversize, invalid path.
- **Expected:** Rejected.
- **Failure:** Accepted.
- **Authorization:** Technical lead.
- **Evidence:** Errors; rollback.
- **Cleanup:** Rollback.

**REC-06 — Deletion vs financial preservation**
- **Category:** Receipts · **Tier:** 3 · **Risk:** High
- **Objective:** Ensure financial row survives receipt removal.
- **Preconditions:** OD-6 resolved; controlled path exists.
- **Synthetic data:** Synthetic object + payment.
- **Steps:** Remove object via approved path; re-select payment.
- **Expected:** Payment intact.
- **Failure:** Payment removed.
- **Authorization:** Owner + Tier 3.
- **Evidence:** Row/state before/after.
- **Cleanup:** Remove synthetic artifacts.

**REC-07 — Regeneration/attach race**
- **Category:** Receipts · **Tier:** 2 · **Risk:** High
- **Objective:** Confirm single attach and no overwrite.
- **Preconditions:** OD-6/OD-9 resolved.
- **Synthetic data:** Two concurrent attaches.
- **Steps:** Race two attach calls; inspect path/flag.
- **Expected:** One succeeds; no duplicate/overwrite.
- **Failure:** Both succeed or object replaced.
- **Authorization:** Technical lead.
- **Evidence:** Results and final row.
- **Cleanup:** Rollback/remove synthetic artifacts.

### G. Privacy requests

**PRQ-01 — Access request**
- **Category:** Privacy · **Tier:** 1 · **Risk:** High
- **Objective:** Confirm queued, reviewed, no erasure.
- **Synthetic data:** Synthetic auth user + request.
- **Steps:** Submit; inspect state.
- **Expected:** `submitted`; no deletion.
- **Failure:** Automatic erasure.
- **Authorization:** Technical lead.
- **Evidence:** State; rollback.
- **Cleanup:** Rollback.

**PRQ-02 — Export request**
- **Category:** Privacy · **Tier:** 1 · **Risk:** High
- **Objective:** Confirm export is not automatic.
- **Synthetic data:** Export request.
- **Steps:** Submit; inspect behavior.
- **Expected:** Queue only; no data export path executed.
- **Failure:** Unauthorized export.
- **Authorization:** Technical lead.
- **Evidence:** State; rollback.
- **Cleanup:** Rollback.

**PRQ-03 — Correction request**
- **Category:** Privacy · **Tier:** 2 · **Risk:** High
- **Objective:** Confirm controlled correction with audit.
- **Synthetic data:** Correction request + synthetic member.
- **Steps:** Apply via approved path; inspect audit.
- **Expected:** Single controlled update; audit row.
- **Failure:** Direct client update.
- **Authorization:** Owner + technical lead.
- **Evidence:** Audit; rollback.
- **Cleanup:** Rollback.

**PRQ-04 — Deletion request**
- **Category:** Privacy · **Tier:** 3 · **Risk:** Critical
- **Objective:** Ensure protected records are not erased.
- **Preconditions:** **Blocked** by OD-10/L-06 and the consent/privacy CASCADE issue.
- **Synthetic data:** None until design approved.
- **Steps:** Not executable in this batch.
- **Expected:** Explicit refusal or legally approved partial action.
- **Failure:** Cascade erasure of consent/audit/financial data.
- **Authorization:** Owner + legal + Tier 3.
- **Evidence:** Decision record.
- **Cleanup:** N/A.

**PRQ-05 — Identity verification**
- **Category:** Privacy · **Tier:** 2 · **Risk:** High
- **Objective:** Confirm verification precedes action.
- **Steps:** Attempt resolution without verification.
- **Expected:** Refused.
- **Failure:** Action proceeds.
- **Authorization:** Owner.
- **Evidence:** Error/state.
- **Cleanup:** Rollback.

**PRQ-06 — Owner review/authorization**
- **Category:** Privacy · **Tier:** 2 · **Risk:** High
- **Objective:** Confirm Owner + AAL2 gate and no staff bypass.
- **Steps:** Attempt resolution as receptionist/AAL1.
- **Expected:** Denied.
- **Failure:** Success.
- **Authorization:** Technical lead.
- **Evidence:** SQLSTATE; rollback.
- **Cleanup:** Rollback.

**PRQ-07 — Status transitions**
- **Category:** Privacy · **Tier:** 2 · **Risk:** Medium
- **Objective:** Confirm legal transitions and `resolved_at` pairing.
- **Steps:** Attempt illegal transitions in rollback.
- **Expected:** Rejected.
- **Failure:** Illegal state accepted.
- **Authorization:** Technical lead.
- **Evidence:** Errors; rollback.
- **Cleanup:** Rollback.

**PRQ-08 — Unauthorized staff action**
- **Category:** Privacy · **Tier:** 2 · **Risk:** High
- **Objective:** Confirm receptionist cannot resolve/edit requests.
- **Steps:** Attempt as receptionist.
- **Expected:** Denied.
- **Failure:** Success.
- **Authorization:** Technical lead.
- **Evidence:** SQLSTATE; rollback.
- **Cleanup:** Rollback.

**PRQ-09 — Protected records, consent history, concurrency**
- **Category:** Privacy · **Tier:** 2/3 · **Risk:** Critical
- **Objective:** Ensure financial/audit/membership/consent evidence survives and resolution is single-winner.
- **Preconditions:** OD-10/L-06 resolved for any deletion variant.
- **Synthetic data:** Synthetic request + protected rows; two concurrent approvals.
- **Steps:** Attempt resolution; verify protected rows; race two approvers.
- **Expected:** Protected rows intact; one resolution; consent history retained.
- **Failure:** Erasure, duplicate resolution, missing evidence.
- **Authorization:** Owner + technical lead; Tier 3 only if deletion.
- **Evidence:** Before/after rows, audit, concurrency log.
- **Cleanup:** Rollback/remove synthetic rows.

### X. Cross-cutting

**XC-01 — Environment identity**
- **Category:** Safety · **Tier:** 0 · **Risk:** Critical
- **Objective:** Prevent tests against non-local data.
- **Steps:** Assert container name, port, database, local-only marker.
- **Expected:** Positive identification; otherwise abort.
- **Failure:** Ambiguity.
- **Authorization:** Batch owner.
- **Evidence:** Identity output in run log.
- **Cleanup:** None.

**XC-02 — Cleanup verification**
- **Category:** Safety · **Tier:** 0 · **Risk:** High
- **Objective:** Prove zero synthetic residue.
- **Steps:** Count marker rows in every touched table before/after cleanup.
- **Expected:** Zero residue; unrelated counts unchanged.
- **Failure:** Any residue.
- **Authorization:** Batch owner.
- **Evidence:** Count table.
- **Cleanup:** Repeat FK-safe cleanup and re-verify.

**XC-03 — Backup/restore readiness**
- **Category:** Safety · **Tier:** 0 · **Risk:** High
- **Objective:** Gate Tier 3 on restorable backups.
- **Preconditions:** Infrastructure authorization.
- **Steps:** Inspect backup inventory and restore evidence.
- **Expected:** Verified restore point.
- **Failure:** No evidence.
- **Authorization:** Owner + infrastructure.
- **Evidence:** Backup register/restore log.
- **Cleanup:** N/A.

**XC-04 — Fixture isolation and marker scan**
- **Category:** Safety · **Tier:** 0/1 · **Risk:** Critical
- **Objective:** Ensure destructive predicates can only match synthetic rows.
- **Steps:** Scan targets for non-marker rows; abort on any match.
- **Expected:** All targets marked synthetic.
- **Failure:** Real row in scope.
- **Authorization:** Technical lead.
- **Evidence:** Scan output.
- **Cleanup:** Remove fixtures.

---

## 7. Synthetic Fixture Design

**Design only. No fixture was created.**

### 7.1 Identifiers and marking

- **Run prefix:** `2dtest_<testid>_<runid>` in every textual field that accepts free text (`members.full_name`, `attendance_events.door`, `privacy_requests.details`, `payments.note`).
- **Synthetic member IDs:** generated UUIDv4 values recorded in an external run manifest (not hardcoded in the report).
- **Synthetic phone/email:** reserved test-only patterns, e.g. `2dtest+<runid>@example.invalid` and a documented synthetic phone range.
- **Synthetic UTR:** `2DTEST-<runid>-<n>` (satisfies unique constraint, clearly non-real).
- **Synthetic receipt paths:** `<synthetic_member_uuid>/<synthetic_payment_uuid>.pdf` under the private `receipts` bucket.
- **Synthetic consent:** `document_version = '2dtest-<runid>'`.
- **Synthetic audit:** `action = '2dtest_<testid>_<runid>'` with `actor` set to a synthetic profile.
- **Synthetic privacy request:** `details` starts with `2DTEST <testid> <runid>`.

### 7.2 Dependency and insertion order

1. `plans` (synthetic, if a plan FK is required).
2. `auth.users` + `profiles` (synthetic principals; required for audit/actor and JWT tests).
3. `members` (synthetic; `auth_user_id` optional).
4. `qr_tokens` (synthetic, `minted_by` = synthetic profile).
5. `membership_periods`, `membership_freezes`.
6. `payments` (then reversals).
7. `attendance_events`.
8. `consent_records`, `privacy_requests`.
9. Storage objects (only under Tier 2/3 with approved credentials).

Cleanup reverses this order, respecting `RESTRICT` vs `CASCADE`.

### 7.3 Isolation requirements

- Dedicated synthetic dataset only; never real members, payments, attendance, receipts, or hosted data.
- One run at a time per database; no concurrent unrelated fixtures.
- Tier 3 requires a dedicated isolated database or a freshly reset local stack with verified identity, not the shared working dataset.
- Auth-context tests use synthetic `auth.users`/`profiles` and JWT claims; never real staff accounts.

### 7.4 Transactions, rollback, and cleanup

- Tier 1/2: `BEGIN … ROLLBACK` where technically possible; capture rollback confirmation.
- Tier 3: cannot rely on rollback after a committing purge; use a dedicated synthetic cohort, a pre-run manifest, and a verified cleanup script.
- Cleanup must be FK-safe and idempotent; verify with counts of the run prefix in every touched table.
- Audit rows created by tests are retained only if the evidence policy requires them; otherwise remove through the approved controlled path.
- If cleanup partially fails, stop, record residue, and escalate; never broaden deletes.

### 7.5 Preconditions, postconditions, and abort conditions

- **Preconditions:** local identity verified; authorization recorded; fixture manifest complete; marker scan clean.
- **Postconditions:** target behavior observed; counts reconciled; zero marker residue; unrelated counts unchanged.
- **Abort:** ambiguous environment; non-synthetic row in scope; missing authorization; unexpected count change; cleanup not verifiable; required decision unresolved.

---

## 8. Test Safety Tiers

| Tier | Class | Allowed operations | Required approvals | Rollback expectation | Evidence |
|---|---|---|---|---|---|
| 0 | Read-only | Catalog/policy/RLS/SELECT/view queries; metadata only | Batch owner | N/A | Command log + outputs |
| 1 | Reversible synthetic | Transactional inserts/updates with `ROLLBACK`; read-back assertions | Technical lead | Full rollback verified | SQL log, before/after counts |
| 2 | Controlled synthetic mutation | JWT-context denial tests; authority-function calls in rollback; controlled attach tests | Technical lead + Owner notification | Rollback or verified cleanup | SQLSTATE, audit rows, counts |
| 3 | Destructive retention | Running purge/deletion functions; receipt-object deletion; audit purge (if ever approved) | **Explicit Owner authorization** + technical lead + independent verifier + verified backup | Dedicated synthetic cohort + cleanup script; restoration tested | Manifest, before/after counts, audit/archive, lock/race log |

**Universal requirements:** environment identity verification (XC-01), marker scan (XC-04), run manifest, and post-run cleanup verification (XC-02). Tier 3 additionally requires a tested backup/restore path (XC-03).

---

## 9. Owner and Legal Decision Register

### 9.1 Already recorded decisions/positions (not new approvals)

- **[CITED]** Batch 1 CLOSED; policy remains "Draft for Owner Approval" (no §23 gate pass).
- **[CITED]** Batches 2A/2B/2C CLOSED; local DB readiness verified.
- **[CITED]** R-2 verification complete (suite 4/4, regressions 305/305 historical).
- **[CITED]** R-3A fixed; R-3B/R-3C read-only assessments.
- **[CITED]** Batch 2: financial/audit protected, receipts no-purge, membership history preserved, member deletion blocked, attendance blocked.

### 9.2 Owner decisions

**OD-1 — Retention boundary semantics**
- **Question:** Is the cutoff inclusive or exclusive for attendance, financial, and audit retention?
- **Current known policy:** Targets exist (6 months / 1 year), but boundary semantics are not defined.
- **Options:** Retain `>= cutoff` / purge `>= cutoff` / another documented rule.
- **Risks:** Off-by-one deletion or unintended retention; inconsistent categories.
- **Impact:** Directly determines ATT-01/02, FIN-02, AUD-02 and the function predicate.
- **Decision owner:** Owner (legal input).
- **Recommended safe default:** Retain records at or after the cutoff and purge only strictly older (`checked_in_at < cutoff`); document per category.

**OD-2 — Timezone standard**
- **Question:** Which timezone governs retention calculations and display?
- **Current known policy:** `app_settings.gym_timezone` defaults to `Asia/Kolkata`; no retention standard stated.
- **Options:** UTC comparison + gym-timezone display / gym-timezone comparison / per-jurisdiction.
- **Risks:** Boundary records classified differently by session timezone; DST errors.
- **Impact:** ATT-06, INA-06, audit timestamps, scheduled run timing.
- **Decision owner:** Owner + technical lead.
- **Recommended safe default:** Compare in absolute `timestamptz` (UTC semantics), display in `gym_timezone`; pin `search_path`/session settings in the function.

**OD-3 — Attendance deletion vs archival/anonymization**
- **Question:** Should expired attendance be hard-deleted, archived, or anonymized?
- **Current known policy:** 6-month target; mechanism undefined; attendance underpins inactivity and history.
- **Options:** Hard delete / archive then delete / anonymize / retain.
- **Risks:** Loss of inactivity evidence and reporting history; irreversible deletion.
- **Impact:** ATT-01…09, schema/function design, storage of archives.
- **Decision owner:** Owner.
- **Recommended safe default:** Archive (or retain) rather than hard-delete; if deletion is approved, use an owner-gated function with audit evidence.

**OD-4 — Audit-log controlled purge authority**
- **Question:** May audit logs ever be deleted, and who authorizes it?
- **Current known policy:** 1-year target; append-only; "no ordinary deletion" (Batch 1 alignment).
- **Options:** Retain indefinitely / archive after 1 year / controlled purge with separate evidence.
- **Risks:** Destroying tamper evidence; purge-of-purge recursion; compliance breach.
- **Impact:** AUD-01…06, archive design, evidence policy.
- **Decision owner:** Owner + legal/security.
- **Recommended safe default:** Archive; do not delete audit rows until a legally reviewed, owner-gated evidence design exists.

**OD-5 — Purge audit/evidence design**
- **Question:** How is a retention run recorded without destroying its own evidence?
- **Current known policy:** `audit_authority` exists; no retention audit contract.
- **Options:** Audit row in the same table / separate archive / external immutable log.
- **Risks:** Recursive deletion; missing evidence; mutable evidence.
- **Impact:** ATT-08/09, AUD-05/06.
- **Decision owner:** Owner + technical lead.
- **Recommended safe default:** Write to a separate append-only archive/evidence store; never let a purge delete its own evidence row.

**OD-6 — Receipt PDF retention duration**
- **Question:** How long are receipt PDFs retained, and who may delete them?
- **Current known policy:** Unresolved; "remove rather than retain indefinitely" intent; duration not approved.
- **Options:** Retain with financial records / fixed period / delete after regeneration window.
- **Risks:** Losing proof of payment; inconsistency with accounting retention.
- **Impact:** REC-01…07, storage lifecycle, financial linkage.
- **Decision owner:** Owner + legal/accounting.
- **Recommended safe default:** No deletion until a duration and authority are approved; keep the financial row independent.

**OD-7 — Inactive threshold and deletion authority**
- **Question:** Is a member inactive at 30 or 31 days, and does classification authorize deletion?
- **Current known policy:** "30 consecutive days"; view uses `> 30`; deletion blocked (H4).
- **Options:** 30 / 31 / freeze-adjusted variants; classification-only / review workflow / deletion.
- **Risks:** Legal/product inconsistency; wrongful deletion.
- **Impact:** INA-01…08, UI wording, any future offboarding.
- **Decision owner:** Owner.
- **Recommended safe default:** Classification only (no deletion); align wording and view to one rule after approval.

**OD-8 — Privacy-request execution authority**
- **Question:** Who may execute access/export/correction/deletion requests, and with what evidence?
- **Current known policy:** Queue + Owner review; resolution records a decision, does not erase.
- **Options:** Owner only / Owner + AAL2 / delegated staff with limits.
- **Risks:** Unauthorized disclosure/erasure; identity fraud.
- **Impact:** PRQ-01…09, audit, consent/privacy cascade fix.
- **Decision owner:** Owner + legal.
- **Recommended safe default:** Owner + AAL2, with identity verification and an audit record per transition.

**OD-9 — Receipt regeneration rules**
- **Question:** May receipts be regenerated, and what happens to the old object?
- **Current known policy:** Not defined; storage has no update/delete policy; `attach_receipt_path` exists.
- **Options:** Immutable single object / regenerate with new path / overwrite (not recommended).
- **Risks:** Mismatch with financial evidence; duplicate paths.
- **Impact:** REC-04/07.
- **Decision owner:** Owner + technical lead.
- **Recommended safe default:** Immutable receipts; any regeneration creates a new controlled record, never overwrites.

**OD-10 — Consent withdrawal behavior**
- **Question:** What happens operationally when consent is withdrawn?
- **Current known policy:** Consent is append-only; withdrawal semantics pending (M6/L-02).
- **Options:** New withdrawal row / flag / delete (not recommended) / restrict processing.
- **Risks:** Destroying evidence; inconsistent processing.
- **Impact:** PRQ-03/09, consent history, privacy policy text.
- **Decision owner:** Owner + legal.
- **Recommended safe default:** Record withdrawal as a new append-only consent row; preserve history; no deletion.

**OD-11 — Backup retention and restore expectations**
- **Question:** What backup frequency, retention, encryption, and restore tests are required?
- **Current known policy:** Daily/30-day target (proposed); capability unverified; DB backups exclude Storage.
- **Options:** Provider backups / independent logical dumps / PITR / object mirror.
- **Risks:** Unrecoverable data; false assurance.
- **Impact:** XC-03, Tier 3 readiness, receipt preservation.
- **Decision owner:** Owner + infrastructure.
- **Recommended safe default:** No retention claims until a restorable backup and documented restore drill exist.

**OD-12 — WhatsApp inactivity notifications**
- **Question:** Is WhatsApp consent obtained, which provider is used, and how are 7-day triggers / 2-day logs enforced?
- **Current known policy:** 7-day trigger; 2-day log retention; provider capability unverified.
- **Options:** Provider contract / email-SMS-push fallback / defer.
- **Risks:** Non-compliant messaging; log over-retention.
- **Impact:** Notification tests, consent, operational retention.
- **Decision owner:** Owner + legal + provider.
- **Recommended safe default:** Keep disabled until consent and provider behavior are verified.

### 9.3 Legal/accounting decisions

**L-01 — Privacy policy and lawful basis**
- **Question:** Final text and lawful basis for processing.
- **Current known policy:** Draft exists with retention placeholders.
- **Options:** Finalize with counsel / defer launch.
- **Risks:** Non-compliant notice.
- **Impact:** All privacy workflows.
- **Decision owner:** Legal/Privacy.
- **Recommended safe default:** Do not publish retention claims before approval.

**L-02 — Consent capture/versioning/withdrawal**
- **Question:** Required consent granularity, versioning, and withdrawal semantics.
- **Current known policy:** Implementation exists; semantics pending.
- **Options:** Current model / revised model.
- **Risks:** Invalid consent evidence.
- **Impact:** OD-10, PRQ tests.
- **Decision owner:** Owner + legal.
- **Recommended safe default:** Preserve append-only evidence; record withdrawal without deletion.

**L-03 — Legal retention and deletion obligations**
- **Question:** Statutory retention periods and erasure obligations.
- **Current known policy:** Not established.
- **Options:** Legal-derived periods / retain pending advice.
- **Risks:** Premature deletion or over-retention.
- **Impact:** All categories; Tier 3 gating.
- **Decision owner:** Legal.
- **Recommended safe default:** Retain; no destructive jobs.

**L-04 — Notification consent**
- **Question:** Consent requirements for WhatsApp/email/SMS/push.
- **Current known policy:** Provider-dependent; unverified.
- **Options:** Opt-in / transactional-only / defer.
- **Risks:** Non-compliant messaging.
- **Impact:** OD-12.
- **Decision owner:** Legal + provider.
- **Recommended safe default:** Disable until verified.

**L-05 — Financial/accounting retention**
- **Question:** Minimum retention for payments, reversals, periods, and receipts.
- **Current known policy:** 1-year target; not legally confirmed.
- **Options:** Legal-derived period / retain indefinitely.
- **Risks:** Tax/audit non-compliance.
- **Impact:** FIN-01…06, REC-06.
- **Decision owner:** Legal/accounting.
- **Recommended safe default:** Retain; no financial deletion.

**L-06 — Erasure vs audit/consent evidence**
- **Question:** How to reconcile erasure requests with audit/consent retention and the `auth.users` CASCADE.
- **Current known policy:** Erasure not implemented; cascade destroys evidence.
- **Options:** Anonymize / retain protected subsets / restructure FKs (future migration).
- **Risks:** Evidence loss or unlawful retention.
- **Impact:** **Blocks PRQ-04 and any account-deletion workflow.**
- **Decision owner:** Legal + Owner.
- **Recommended safe default:** Do not delete auth users; preserve evidence; design anonymization before enabling erasure.

---

## 10. Implementation Dependency Roadmap

Conventions: "Testable now" refers to the ability to author/run Tier 0/1 tests safely today; Tier 3 always requires decisions.

| Workstream | Testable now | Blocking decisions | Schema/function change | Notes |
|---|---|---|---|---|
| Retention policy validation | Partly (Tier 0) | OD-1, OD-2 | None | Encode approved rules in a spec first |
| Attendance retention | Tier 1/2 only | OD-1, OD-2, OD-3, OD-5 | New forward-only migration + owner-gated `SECURITY DEFINER` function | Ship dark until scheduler/evidence approved |
| Financial protection | Tier 0/1 | L-03, L-05 | None | Verify no delete path; retain |
| Audit retention/append-only | Tier 0/2 | OD-4, OD-5, L-06 | Archive design; possibly new function | No purge without evidence design |
| Inactive classification | Tier 0/1 | OD-7 | View/text alignment (future) | Classification only |
| Membership history | Tier 0/1/2 | None for preservation | None | Preservation already enforced |
| Receipt lifecycle | Access tests now; lifecycle no | OD-6, OD-9, L-03 | Storage delete path/function | No deletion until approved |
| Privacy safeguards | Tier 1/2 partial; deletion no | OD-8, OD-10, L-02, L-06 | Cascade/anonymization design | Consent/privacy cascade is blocking |
| Automated tests | Yes (authoring) | Decisions per case | New test suite files only | Follow `0014` pattern |
| Migration safety | Yes (pattern) | None | New migration only | Never edit applied migrations |
| Operational monitoring | No | OD-5 + infra | Scheduler/alerting | `pg_cron` absent |
| Backup/restore | No | OD-11 | Infrastructure | No claims until verified |

### Smallest safe next batch

**[PROPOSED] Batch 2E — Decision closure and Tier 0/1 test harness (documentation/test-authoring only).** It should:

1. Obtain Owner decisions for OD-1, OD-2, OD-3, OD-7, OD-10 and legal answers for L-03/L-05/L-06.
2. Resolve the `consent_records`/`privacy_requests` CASCADE issue with a preservation-safe design (anonymization or FK/retention redesign) before any deletion workflow.
3. Author (but do not execute destructively) Tier 0/1 SQL tests for FIN-01…03, MTH-01…06, REC-01…03, INA-01…07, AUD-03/04, PRQ-05…08 using the `0014` suite pattern and synthetic fixtures.
4. Verify backup/restore readiness before any Tier 3 authorization.

**If the Owner instead authorizes implementation first,** the only defensible candidate is attendance retention in a synthetic-only cohort after OD-1/OD-2/OD-3 are resolved, shipped dark (not scheduled) until OD-5 and the scheduler are approved. Financial, audit, receipt, consent, and member deletion remain blocked.

---

## 11. Risks and Blockers

| ID | Risk | Severity | Evidence | Mitigation |
|---|---|---|---|---|
| R-01 | Auth-user deletion cascades to consent/privacy evidence | **High/Critical** | `ON DELETE CASCADE` verified | Resolve L-06 before any erasure; anonymize instead |
| R-02 | Undefined retention boundary semantics | High | No policy rule; function absent | OD-1 decision; explicit predicate tests |
| R-03 | Inactive threshold divergence (30 vs 31) | High | View uses `> 30` | OD-7 decision; align view/text |
| R-04 | `service_role` bypasses mutation guard | High | Guard checks only `anon`/`authenticated` | Procedural prohibition + owner-gated function |
| R-05 | No scheduler; retention would be manual | Medium | `pg_cron` absent | OD-5 + external scheduler decision |
| R-06 | Audit purge can destroy its own evidence | High | Append-only design; no archive | OD-4/OD-5; separate evidence store |
| R-07 | DB backups exclude Storage objects | High | WS-6 report | Object mirror + restore drill (OD-11) |
| R-08 | Backup/PITR unverified | High | WS-6; Stage 2I F-03 | No Tier 3 until verified |
| R-09 | Local DB ≠ hosted behavior | Medium | Hosted init blocked | Separate hosted readiness batch |
| R-10 | Synthetic fixture contamination | High | Real data risk | Marker scan + abort conditions |
| R-11 | Local `profiles` empty; auth fixtures complex | Medium | Verified empty | Synthetic auth users + cascade-aware cleanup |
| R-12 | Legal retention periods unknown | High | L-03/L-05 pending | Retain; no destructive jobs |

**Hard blockers:** (1) consent/privacy CASCADE; (2) OD-1/OD-2/OD-3 for attendance; (3) OD-4 for audit; (4) OD-6 for receipts; (5) OD-8/OD-10/L-06 for privacy deletion; (6) backup/restore for Tier 3.

---

## 12. Final Verdict

**`READY WITH CONDITIONS`**

**Why not "READY FOR IMPLEMENTATION PLANNING":** the test design is complete, but the prerequisites for implementation are unresolved — boundary semantics, timezone, deletion-vs-archive, audit purge authority, receipt duration, inactive threshold, privacy execution authority, legal retention, and the consent/privacy CASCADE defect.

**Why not "BLOCKED":** the specification, matrix, detailed cases, fixture strategy, safety tiers, and decision registers are complete and usable for planning, and Tier 0/1/2 tests can be authored and run safely once authorization is given (Tier 3 remains blocked).

### Completion confirmations

- **Documentation-only:** confirmed; no implementation, retention job, or destructive test.
- **Database inspection read-only:** confirmed; metadata/policy queries only.
- **SQL mutation executed:** none.
- **Service/container lifecycle operation:** none.
- **Data/volume modification:** none.
- **Real member/payment/attendance/audit data exposed:** none (only schema metadata; `profiles` check returned empty; no row contents read).
- **Files changed:** only `docs/SECURITY_BATCH_2D_RETENTION_TEST_DESIGN_REPORT.md` (this report). No pre-existing source, migration, policy, or report was modified.
- **Commit/push/deploy:** none.

**Report path:** `E:\GYM Management\gym-management-app\docs\SECURITY_BATCH_2D_RETENTION_TEST_DESIGN_REPORT.md`

**STOP — awaiting explicit Owner authorization for the next batch.**
