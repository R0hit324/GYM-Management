# SECURITY BATCH 2E — DECISION CLOSURE & TIER 0/1 TEST HARNESS PREPARATION — REPORT

**Project:** Gym Management App (`gym-management-app`)
**Batch:** Batch 2E — Decision Closure & Tier 0/1 Test Harness Preparation
**Date:** 2026-11-23
**Mode:** STRICTLY READ-ONLY / DOCUMENTATION. No mutation, no migration, no service lifecycle change, no dependency change, no schema/RLS/function change, no source edit, no commit/push/deploy.
**Predecessor status:** Batch 2 = **PARTIALLY COMPLETE**; Batches 2A, 2B, 2C, 2D CLOSED (Batch 2D verdict `READY WITH CONDITIONS`).

---

## 1. Executive Summary

Batch 2E reassessed the remaining Batch 2 retention and privacy controls, separated decisions the Gym Owner must make from decisions requiring external (legal/accounting/provider) validation, reassessed the consent/privacy cascade risk without any mutation, and prepared Tier 0 (read-only) and Tier 1 (synthetic, rollback-only) test readiness.

### Headline results

| Area | Result |
|---|---|
| Batch 2 remaining controls reassessed | **14 of 14** classified with evidence |
| Owner decisions | **12 open** (OD-1 … OD-12); none decided in this batch |
| External dependencies | **6 open** (L-01 … L-06) |
| Consent/privacy cascade risk | **CONFIRMED at schema level** — `ON DELETE CASCADE` on `auth.users` for `consent_records` and `privacy_requests` |
| Tier 0 read-only verification | **EXECUTED** against live local DB; results recorded (Docker healthy at execution time) |
| Tier 1 readiness | **DESIGN ONLY:** test cases drafted; harness **NOT implemented**; isolation/rollback/residue detection **NOT validated**; execution **CONDITIONAL / BLOCKED** (not authorized) |
| Retention/privacy implementation | **NOT IMPLEMENTED** in this batch (out of scope) |
| Deliverable | Exactly one new report (this file) |

### What was verified live (read-only)

- PostgreSQL **17.12**; migrations **0001,0002,0003,0004,0005,0008,0009,0010,0011,0012,0013** (11 rows; no `0006`/`0007`/`0014`).
- **15 base tables, 4 views**; RLS **forced on 15/15** tables.
- Policies: `SELECT` widely granted; **`INSERT` only** on `follow_up_events` and `payments`; **no `UPDATE` or `DELETE` policy exists** on any public table.
- Grants: `authenticated` has `SELECT` (and those two `INSERT`s) only; **no `anon` grants**.
- Cascade FKs confirmed: `consent_records.auth_user_id` → `auth.users` **CASCADE**; `privacy_requests.auth_user_id` → `auth.users` **CASCADE**; `privacy_requests.resolved_by` → **SET NULL**; `members.auth_user_id` → **SET NULL**.
- `attendance_events.member_id`, `audit_log_entries.actor`, `membership_periods.member_id/created_by_payment` → **RESTRICT**.
- Extensions: `btree_gist, pg_stat_statements, pgcrypto, plpgsql, supabase_vault, uuid-ossp`; `pg_cron` **installed = 0**, available = 1.
- `archive_mode = off`; `archive_command = (disabled)`.
- Storage bucket `receipts`: **private**, 5,242,880-byte limit, `{application/pdf}`; policies = insert (receptionist), select own, select staff; **no update/delete**.
- `public.profiles` count = **0** (empty); `profiles.is_active` exists; `v_inactive_members` exists; all 7 target functions exist; **no** `purge|retention|cleanup|delete` function exists.

### Bottom line

Batch 2E is **complete as a documentation deliverable**. Retention/purge/deletion/anonymization/scheduling/privacy-request execution is **not implemented** and remains **BLOCKED** behind Owner decisions (OD-1/2/3/4/6/7/8/10/11/12) and external validation (L-02/L-03/L-05/L-06). The single hardest blocker is the **consent/privacy CASCADE**: deleting an auth user destroys consent and privacy-request evidence. No production-readiness claim is made.

---

## 2. Scope and Safety Statement

### In scope
- Read-only review of Batch 2/2A/2B/2C/2D and related policy, retention, consent, audit, receipt, backup, and migration documentation.
- Read-only schema/catalog inspection of the local database (metadata only; no personal data).
- Classification of 14 remaining controls; Owner vs external decision registers; cascade risk assessment; Tier 0 results; Tier 1 harness readiness; implementation-readiness classification.

### Explicitly out of scope (and not performed)
- Retention, purge, deletion, anonymization, scheduling, or privacy-request execution.
- Any `INSERT/UPDATE/DELETE/TRUNCATE/DROP/ALTER/CREATE` or migration execution.
- `supabase reset`, `db reset`, seed, or destructive commands.
- Starting/stopping/restarting/recreating/modifying Docker/Supabase services or volumes.
- Hosted/production/external database access.
- Reading or revealing real member/payment/attendance/personal data.
- Dependency install/remove/upgrade; source edits; existing-report edits; commits/pushes/deploys.
- Batch 2F or any later batch.

### Safety controls actually observed
- All SQL was `SELECT`-only catalog/`information_schema`/`pg_catalog`/`storage` metadata, plus `SELECT count(*)` on `profiles` (returned 0).
- No auth-context role switching, no `set role`, no `insert`, no function execution.
- Docker was **started by the operator**, not by this batch; no lifecycle command was issued by the agent.
- Exactly one new file created (this report); no existing file modified.

### Boundary behavior
- When the Docker daemon was transiently unavailable mid-batch, live checks were paused and would have been reported **BLOCKED** rather than improvised. The operator subsequently started Docker; live checks then ran and are recorded as **VERIFIED** for the timestamp of execution (see §8, §14).

---

## 3. Evidence Reviewed

### 3.1 Prior batch reports (documentation claims; cited, not re-verified unless noted)
- `docs/SECURITY_BATCH_2_DATA_RETENTION_DELETION_CLOSURE_REPORT.md` — Batch 2 = PARTIALLY COMPLETE; financial/audit protected; receipts no-purge; membership history preserved; member deletion blocked; attendance blocked.
- `docs/SECURITY_BATCH_2A_LOCAL_ENVIRONMENT_READINESS_REPORT.md` — environment `BLOCKED` at time of writing (Docker unavailable).
- `docs/SECURITY_BATCH_2B_DOCKER_SUPABASE_VERIFICATION_REPORT.md` — `READY WITH CONDITIONS`.
- `docs/SECURITY_BATCH_2C_LOCAL_DATABASE_READINESS_REPORT.md` — read-only DB readiness `READY WITH CONDITIONS`.
- `docs/SECURITY_BATCH_2D_RETENTION_TEST_DESIGN_REPORT.md` — 55 test cases, OD-1…OD-12, L-01…L-06, verdict `READY WITH CONDITIONS`.
- `docs/SECURITY_BATCH_R1_PRIVACY_RETENTION_OWNER_DECISION_REPORT.md` — policy alignment matrix A–L (the de-facto policy targets; no standalone Master Privacy Policy file exists in-repo).
- `docs/SECURITY_BATCH_R2_VERIFICATION_REPORT.md` / `docs/SECURITY_BATCH_R2_MIGRATION_SAFETY_CLOSURE.md` — historical suite 0014 4/4; regressions 305/305.
- `docs/STAGE_2I_OWNER_LEGAL_DECISIONS_AND_HOSTED_INITIALIZATION_READINESS_GATE_REPORT.md` — D-01/D-02, L-01…L-04, backup/provider findings.
- `docs/PRODUCTION_READINESS_STAGE_2B_WS6_REPORT.md` — backup/PITR unverified; DB backups exclude Storage; Free plan has no recovery point.

### 3.2 Migrations (static source; read directly)
- `supabase/migrations/0001_core_schema.sql` — core tables; extensions `pgcrypto`, `btree_gist`.
- `supabase/migrations/0002_rls_and_triggers.sql` — enables + forces RLS per table; client mutation guard triggers (13 guard triggers).
- `supabase/migrations/0004_views.sql` — four `SECURITY INVOKER` views; `v_inactive_members` logic.
- `supabase/migrations/0008_stage5_write_paths.sql` — `update_member_contact` (receptionist + AAL2 + audit).
- `supabase/migrations/0010_receipt_storage.sql` / `0013_receipt_storage_insert_path_check.sql` — receipt bucket and insert-path check.
- `supabase/migrations/0011_staff_administration.sql` — `profiles.is_active`; staff admin functions.
- `supabase/migrations/0012_privacy_consent.sql` — `consent_records`, `privacy_requests`, `request_privacy_action`, `resolve_privacy_request`, CASCADE FKs.

### 3.3 Application code (static source; read directly)
- `src/services/notifications/provider.ts` — channels are `email | sms | push`; **no WhatsApp channel**.
- `supabase/functions/staff-admin/index.ts` — deactivate = `admin_set_staff_active(false)` then GoTrue long ban; activation failure leaves `is_active=false`; `deleteUser` only on registration rollback.

### 3.4 Live database (read-only; executed 2026-11-23)
- `docker ps` → `supabase_db_GYM_Management | Up (healthy) | 0.0.0.0:54322->5432/tcp`.
- Catalog queries as recorded in §8 and §14.

### 3.5 Evidence-class legend used in this report
- **[VERIFIED]** — directly observed in live catalog or static source during this batch.
- **[CITED]** — documented in a prior report; not independently re-verified here.
- **[INFERENCE]** — reasoned conclusion from verified facts.
- **[UNVERIFIED]** — no source of truth available in-repo.
- **[BLOCKED]** — requires decision/authorization or unavailable capability.
- **[OWNER DECISION]** / **[EXTERNAL VALIDATION]** — decision not made by this batch.

---

## 4. Batch 2 Remaining-Gap Matrix

### 4.0 Classification summary (14 controls)

| # | Control | Policy target | Classification |
|---|---|---|---|
| 1 | Attendance retention | 6 months | **BLOCKED BY OWNER DECISION** |
| 2 | Financial record retention | 1 year | **BLOCKED BY LEGAL/ACCOUNTING DECISION** |
| 3 | Audit log retention | 1 year, append-only | **BLOCKED BY OWNER DECISION** |
| 4 | Inactive member classification | 30 consecutive days | **IMPLEMENTED BUT NOT FULLY VERIFIED** |
| 5 | Membership history preservation | Preserve | **IMPLEMENTED AND VERIFIED** |
| 6 | Receipt PDF retention | Unresolved duration | **BLOCKED BY OWNER DECISION** |
| 7 | Privacy request execution | Queue + controlled execution | **DOCUMENTED ONLY** |
| 8 | Consent withdrawal | Append-only, semantics pending | **DOCUMENTED ONLY** |
| 9 | Consent evidence preservation | Preserve evidence | **NOT IMPLEMENTED** (CASCADE destroys) |
| 10 | Backup retention and restoration | Daily / 30 days | **BLOCKED BY EXTERNAL/PROVIDER DECISION** |
| 11 | WhatsApp inactivity notification | 7-day trigger / 2-day logs | **BLOCKED BY EXTERNAL/PROVIDER DECISION** |
| 12 | Access revocation on receptionist removal | Immediate revocation | **IMPLEMENTED BUT NOT FULLY VERIFIED** |
| 13 | Member personal-data correction workflow | Controlled + audited | **IMPLEMENTED BUT NOT FULLY VERIFIED** |
| 14 | Data deletion safeguards / cascade risk | No evidence loss | **BLOCKED BY LEGAL DECISION** |

### 4.1 Attendance retention — 6 months
- **Policy target:** Retain 6 months, then (per approved mechanism) remove/archive. [CITED: R-1 matrix B]
- **Existing implementation:** Append-only `attendance_events`; no retention function; no scheduler. [VERIFIED: no `purge|retention|cleanup|delete` function; `pg_cron` installed=0]
- **Evidence/source:** `0001_core_schema.sql`, `0002_rls_and_triggers.sql`, `0004_views.sql`.
- **Verification evidence:** 15/15 tables RLS forced; no DELETE policy; no retention function. [VERIFIED live]
- **Remaining gap:** No approved boundary (OD-1), timezone (OD-2), or destruction mechanism (OD-3); no scheduler (OD-5).
- **Dependencies:** OD-1, OD-2, OD-3, OD-5; scheduler decision.
- **Safest next action:** Owner decides OD-1/2/3; ship any future purge dark (unscheduled) in a synthetic cohort first.

### 4.2 Financial record retention — 1 year
- **Policy target:** 1 year. [CITED: R-1 matrix D]
- **Existing implementation:** `payments` append-only (payment/reversal rows), `one_period_per_payment`; no purge. [VERIFIED: no DELETE policy; RESTRICT links]
- **Evidence/source:** `0001_core_schema.sql`, `0002_rls_and_triggers.sql`, R-1 matrix D, WS-6.
- **Verification evidence:** No UPDATE/DELETE policy on `payments`; `authenticated` INSERT+SELECT only; `membership_periods.created_by_payment` RESTRICT. [VERIFIED live]
- **Remaining gap:** Statutory/accounting period not confirmed (L-03/L-05); boundary semantics (OD-1).
- **Dependencies:** L-03, L-05; OD-1.
- **Safest next action:** Retain; no financial deletion until legal confirms.

### 4.3 Audit log retention — 1 year, append-only
- **Policy target:** 1 year; append-only; restricted/owner access; no ordinary manual deletion. [CITED: R-1 matrix F]
- **Existing implementation:** `audit_log_entries` append-only; `authenticated` SELECT only; no purge; `audit_authority` writer. [VERIFIED]
- **Evidence/source:** `0001_core_schema.sql`, `0008_stage5_write_paths.sql`, `0012_privacy_consent.sql`, R-1 matrix F.
- **Verification evidence:** `audit_log_entries|SELECT|1` policy; no UPDATE/DELETE; `actor` FK RESTRICT. [VERIFIED live]
- **Remaining gap:** No archive/evidence-preserving purge design (OD-4/OD-5); legal reconciliation with erasure (L-06).
- **Dependencies:** OD-4, OD-5, L-06.
- **Safest next action:** Archive design only; no purge until evidence store exists.

### 4.4 Inactive member classification — 30 consecutive days
- **Policy target:** Inactive after 30 consecutive days without check-in. [CITED: R-1 matrix A; AGENTS business rules]
- **Existing implementation:** `v_inactive_members` subtracts frozen days and tests `inactive_days > 30` (i.e. inactive at 31+), using `gym_timezone` (default `Asia/Kolkata`) and last **verified** attendance. [VERIFIED: `0004_views.sql` lines 168–277]
- **Evidence/source:** `supabase/migrations/0004_views.sql`; live `to_regclass('public.v_inactive_members') IS NOT NULL` = true.
- **Verification evidence:** View exists; RLS on underlying tables filters rows (security invoker). [VERIFIED]
- **Remaining gap:** **Policy/implementation boundary discrepancy (unresolved).** Policy states inactive after **30 consecutive days**; the view classifies inactive only when `inactive_days > 30`, i.e. **after the threshold exceeds 30 (at 31+ days)**. The 30-day boundary must remain **unresolved** pending an explicit Owner decision (OD-7); classification must not authorize deletion (H4). This batch does **not** change the threshold or the view.
- **Dependencies:** OD-7 (boundary decision); OD-2 for timezone determinism.
- **Safest next action:** Keep the current behavior and document the divergence; Owner decides 30 vs 31 and confirms classification-only; align view + UI wording only in a later authorized batch.

### 4.5 Membership history preservation
- **Policy target:** Preserve membership history. [CITED: R-1 matrix C]
- **Existing implementation:** Append-only `membership_periods` / `membership_period_voids`; RESTRICT FKs to members/payments/plans. [VERIFIED]
- **Evidence/source:** `0001_core_schema.sql`, `0002_rls_and_triggers.sql`.
- **Verification evidence:** `membership_periods_member_id_fkey` RESTRICT, `created_by_payment` RESTRICT; no UPDATE/DELETE policies. [VERIFIED live]
- **Remaining gap:** None for preservation; lifecycle wording (retain vs anonymize) pending but does not threaten integrity.
- **Dependencies:** None to preserve.
- **Safest next action:** Keep PROTECTED; no deletion authorized.

### 4.6 Receipt PDF retention
- **Policy target:** Unresolved duration; "remove rather than retain indefinitely"; keep separate from financial record. [CITED: R-1 matrix E]
- **Existing implementation:** Private `receipts` bucket (5 MiB, PDF-only); insert (receptionist), select own/staff; **no update/delete**; metadata in `payments.receipt_path`. [VERIFIED]
- **Evidence/source:** `0010_receipt_storage.sql`, `0013_receipt_storage_insert_path_check.sql`; live storage policies.
- **Verification evidence:** Bucket private; `receipts_insert_receptionist`, `receipts_select_own`, `receipts_select_staff`; no update/delete. [VERIFIED live]
- **Remaining gap:** No approved duration/authority (OD-6); regeneration rules (OD-9); accounting reconciliation (L-03).
- **Dependencies:** OD-6, OD-9, L-03.
- **Safest next action:** No deletion; keep financial row independent of object lifecycle.

### 4.7 Privacy request execution
- **Policy target:** Controlled execution of access/export/correction/deletion with identity verification and audit. [CITED: Batch 2D]
- **Existing implementation:** `privacy_requests` queue; `request_privacy_action` caller-only intake; `resolve_privacy_request` Owner+AAL2 **status only**; no erasure/export execution. [VERIFIED]
- **Evidence/source:** `0012_privacy_consent.sql` (lines 250–388).
- **Verification evidence:** Function exists; Owner+AAL2 required; queue-only; no execution path found. [VERIFIED static + function existence live]
- **Remaining gap:** No execution authority/workflow (OD-8); deletion blocked by cascade + L-06; export not automated.
- **Dependencies:** OD-8, OD-10, L-06; cascade fix.
- **Safest next action:** Design-only; no execution until authority + evidence path approved.

### 4.8 Consent withdrawal
- **Policy target:** Consent is append-only; withdrawal must not destroy evidence. [CITED: R-1 matrix I; L-02]
- **Existing implementation:** `consent_records` append-only (type/version/accepted/source/timestamp); `record_consent` caller-only. [VERIFIED]
- **Evidence/source:** `0012_privacy_consent.sql` (lines 50–245).
- **Verification evidence:** Table + writer exist; `authenticated` SELECT only, writer via definer function. [VERIFIED]
- **Remaining gap:** Withdrawal semantics not defined (OD-10/L-02); no withdrawal-specific pathway.
- **Dependencies:** OD-10, L-02.
- **Safest next action:** Model withdrawal as a new append-only row; no deletion.

### 4.9 Consent evidence preservation
- **Policy target:** Preserve consent evidence for the required period. [CITED: L-02, L-06]
- **Existing implementation:** `consent_records.auth_user_id` → `auth.users` **ON DELETE CASCADE**. [VERIFIED live + source line 52]
- **Evidence/source:** `0012_privacy_consent.sql` line 52; live `pg_constraint` shows `confdeltype = c`.
- **Verification evidence:** CASCADE confirmed live. [VERIFIED]
- **Remaining gap:** Auth-user deletion destroys consent evidence — directly conflicts with preservation. **Blocking.**
- **Dependencies:** L-06; anonymization/FK redesign.
- **Safest next action:** Do not delete auth users; design anonymization before any erasure (see §7).

### 4.10 Backup retention and restoration
- **Policy target:** Daily backups; encrypted; ~30-day retention; restore tests; not claimed implemented. [CITED: R-1 matrix L]
- **Existing implementation:** **No backup/restore scripts or config in repo**; `archive_mode=off`; DB backups exclude Storage. [VERIFIED: no files; live settings]
- **Evidence/source:** WS-6 report; Stage 2I F-03; live `pg_settings`.
- **Verification evidence:** `archive_mode=off`, `archive_command=(disabled)`; no repo backup artifacts. [VERIFIED]
- **Remaining gap:** Provider capability/plan unverified; no PITR; Storage not covered; no restore drill.
- **Dependencies:** OD-11; provider plan; infrastructure.
- **Safest next action:** No retention claims; define and verify a restorable backup + drill.

### 4.11 WhatsApp inactivity notification — 7-day trigger / 2-day logs
- **Policy target:** 7-day inactivity trigger; 2-day notification-log retention; dedup; consent verified. [CITED: R-1 matrix J]
- **Existing implementation:** Notification provider supports **email/sms/push only**; **no WhatsApp channel**; no notification-persistence table. [VERIFIED static + schema]
- **Evidence/source:** `src/services/notifications/provider.ts`; live table list (no notification log table).
- **Verification evidence:** Channel union excludes WhatsApp; no log table in 15 base tables. [VERIFIED]
- **Remaining gap:** Provider absent; consent (L-04); log retention unimplemented.
- **Dependencies:** OD-12, L-04, provider contract.
- **Safest next action:** Keep disabled until consent + provider behavior verified.

### 4.12 Access revocation when receptionists are removed
- **Policy target:** Immediate revocation of access on staff removal. [CITED: Batch 1/R-1]
- **Existing implementation:** `profiles.is_active` switch honored by authorization helpers; `admin_set_staff_active`; edge function sets `is_active=false` then GoTrue long ban; failed activation leaves `is_active=false`. [VERIFIED static + schema]
- **Evidence/source:** `0011_staff_administration.sql`; `supabase/functions/staff-admin/index.ts`.
- **Verification evidence:** `profiles.is_active` exists; `admin_set_staff_active` exists; helpers honor `is_active`. [VERIFIED]
- **Remaining gap:** No live auth-context execution (profiles empty); GoTrue ban behavior not live-tested; no revocation audit assertion run.
- **Dependencies:** Synthetic fixtures; Tier 1 authorization.
- **Safest next action:** Tier 1 synthetic test of deactivate → denied access; no live staff accounts needed.

### 4.13 Member personal-data correction workflow
- **Policy target:** Controlled, audited correction of member contact data. [CITED: Batch 1]
- **Existing implementation:** `update_member_contact` — receptionist + AAL2, phone (required) + email (optional), membership untouched, `audit_authority('member.contact_updated', …)`. [VERIFIED static]
- **Evidence/source:** `0008_stage5_write_paths.sql` (8.1).
- **Verification evidence:** Function exists; role+AAL2 guards; audit call present. [VERIFIED static + existence live]
- **Remaining gap:** No live authorization/negative test run; field scope limited to contact.
- **Dependencies:** Synthetic fixtures; Tier 1 authorization.
- **Safest next action:** Tier 1 test of positive/negative/authz cases.

### 4.14 Data deletion safeguards and cascading deletion risks
- **Policy target:** Deletion must not destroy protected financial/audit/membership/consent evidence. [CITED: Batch 2/2D]
- **Existing implementation:** RESTRICT FKs protect financial/audit/attendance/history; **CASCADE** on `consent_records`/`privacy_requests` destroys consent/privacy evidence on auth-user deletion; `members.auth_user_id` SET NULL. [VERIFIED]
- **Evidence/source:** `0012_privacy_consent.sql`; live `pg_constraint`.
- **Verification evidence:** Cascade vs restrict matrix confirmed live (§8). [VERIFIED]
- **Remaining gap:** No erasure workflow; CASCADE conflicts with preservation (L-06); audit purge unresolved (OD-4).
- **Dependencies:** L-06, OD-4, OD-8, OD-10.
- **Safest next action:** Design anonymization + FK restructure; no auth-user deletion.

---

## 5. Owner Decision Register

All decisions below are **open**. This batch makes **none** of them on the Owner's behalf. Source: Batch 2D §9.2, reinforced by live evidence.

| ID | Question | Why it matters | Affected data | Current status | Decision-maker | Technical impact | Risk if unresolved | Next action |
|---|---|---|---|---|---|---|---|---|
| **OD-1** | Is the retention cutoff inclusive or exclusive (attendance/financial/audit)? | Governs off-by-one deletion/retention | attendance, payments, audit | Open; no policy rule | Owner (legal input) | Defines purge predicate; tests ATT-01/02, FIN-02, AUD-02 | Off-by-one deletion or unintended retention | Owner decides rule; document per category |
| **OD-2** | Which timezone governs retention/display? | Boundary classification consistency | attendance, inactive, audit timestamps | Open; `gym_timezone` default Asia/Kolkata | Owner + tech lead | Function session/predicate design | Boundary records differ by session TZ; DST errors | Pin UTC compare + gym TZ display |
| **OD-3** | Hard-delete vs archive vs anonymize attendance? | Irreversibility; inactivity evidence | attendance_events | Open; mechanism undefined | Owner | Schema/function + archive storage | Loss of reporting/inactivity history | Prefer archive/retain; else owner-gated + audited |
| **OD-4** | May audit logs ever be deleted, and who authorizes? | Tamper evidence | audit_log_entries | Open; append-only, no purge | Owner + legal/security | Archive/purge design | Purge destroys its own evidence | Archive; no deletion without evidence design |
| **OD-5** | How is a retention run recorded without destroying its evidence? | Evidence integrity | audit, retention runs | Open; no retention audit contract | Owner + tech lead | Separate append-only evidence store | Recursive deletion / missing/mutable evidence | Separate evidence store; never self-delete |
| **OD-6** | Receipt PDF retention duration and deletion authority? | Proof of payment; accounting | receipts bucket + `payments.receipt_path` | Open; duration unapproved | Owner + legal/accounting | Storage lifecycle/function | Loss of payment proof | No deletion until approved; keep row independent |
| **OD-7** | Inactive at 30 or 31 days; does classification authorize deletion? | Wrongful deletion risk | members, attendance | Open; view uses `> 30` | Owner | View/UI alignment; offboarding | Legal/product inconsistency; wrongful deletion | Classification only; align to one rule |
| **OD-8** | Who may execute access/export/correction/deletion, with what evidence? | Unauthorized disclosure/erasure | privacy_requests, members, consent | Open; queue + Owner status only | Owner + legal | Execution workflow + audit | Unauthorized disclosure/erasure | Owner + AAL2 + identity verification + audit |
| **OD-9** | May receipts be regenerated; what happens to old object? | Financial evidence integrity | receipts, payments | Open; no update/delete policy | Owner + tech lead | Immutability/regeneration path | Duplicate/overwritten evidence | Immutable; new record per regeneration |
| **OD-10** | Operational behavior on consent withdrawal? | Evidence + processing consistency | consent_records | Open; append-only, semantics pending | Owner + legal | Withdrawal pathway | Destroyed evidence / inconsistent processing | New append-only withdrawal row; preserve history |
| **OD-11** | Required backup frequency/retention/encryption/restore tests? | Recoverability; false assurance | all DB + Storage | Open; daily/30-day proposed, unverified | Owner + infrastructure | Backup/PITR/mirror + drills | Unrecoverable data; Storage gap | No claims until restorable backup + drill |
| **OD-12** | WhatsApp consent, provider, 7-day trigger / 2-day logs? | Compliant messaging | notifications, consent | Open; provider absent | Owner + legal + provider | Provider + log retention | Non-compliant messaging / log over-retention | Keep disabled until verified |

---

## 6. External Dependency Register

All items below require validation outside this batch. None is resolved here.

| ID | Question | Why it matters | Affected data | Current status | Decision-maker | Technical impact | Risk if unresolved | Next action |
|---|---|---|---|---|---|---|---|---|
| **L-01** | Final privacy-policy text and lawful basis | Compliant notice | all privacy workflows | Open; draft with placeholders | Legal/Privacy | Publication gating | Non-compliant notice | Do not publish retention claims pre-approval |
| **L-02** | Required consent granularity, versioning, withdrawal semantics | Valid consent evidence | consent_records | Open; implementation exists, semantics pending | Owner + legal | Consent model + OD-10 | Invalid consent evidence | Preserve append-only; withdraw without deletion |
| **L-03** | Statutory retention and erasure obligations | Bounds all deletions | all categories | Open; not established | Legal | Retention periods + Tier 3 gating | Premature deletion / over-retention | Retain; no destructive jobs |
| **L-04** | Notification consent (WhatsApp/email/SMS/push) | Compliant messaging | notifications | Open; provider-dependent | Legal + provider | Channel enablement | Non-compliant messaging | Disable until verified |
| **L-05** | Minimum financial/accounting retention | Tax/audit compliance | payments, reversals, periods, receipts | Open; 1-year target unconfirmed | Legal/accounting | Financial retention floor | Tax/audit non-compliance | Retain; no financial deletion |
| **L-06** | Reconcile erasure with audit/consent retention and `auth.users` CASCADE | Prevent evidence loss vs unlawful retention | consent, privacy, audit, members | Open; erasure unimplemented; cascade destroys evidence | Legal + Owner | Anonymization / FK restructure | **Blocks PRQ-04 and any account deletion** | Design anonymization before enabling erasure |

**Additional external items surfaced during investigation (tracked under the above, not new IDs):**
- Provider backup/plan capability and PITR (under L-03/OD-11).
- Storage object backup coverage (WS-6; under OD-11).
- Hosted migration-history reconciliation remains a separate gate (Stage 2I), not a Batch 2E item.

---

## 7. Consent/Privacy Cascade Risk Assessment (Design-Only)

### 7.1 Risk statement
`consent_records.auth_user_id` and `privacy_requests.auth_user_id` are declared `REFERENCES auth.users(id) ON DELETE CASCADE`. Deleting an `auth.users` row (e.g., via GoTrue admin user deletion or any future account-deletion workflow) **automatically and irreversibly deletes** the member's consent records and privacy-request queue history. This destroys evidence that the system is designed to preserve for consent (L-02/L-06) and privacy-request auditability (OD-8). It also makes any "delete my account" request self-defeating: the record of the request and the consent history vanish with the account.

### 7.2 Confirmed schema behavior [VERIFIED]
| Constraint | Table.column → target | Delete action |
|---|---|---|
| `consent_records_auth_user_id_fkey` | `consent_records.auth_user_id` → `auth.users.id` | **CASCADE** (`c`) |
| `privacy_requests_auth_user_id_fkey` | `privacy_requests.auth_user_id` → `auth.users.id` | **CASCADE** (`c`) |
| `privacy_requests_resolved_by_fkey` | `privacy_requests.resolved_by` → `auth.users.id` | **SET NULL** (`n`) |
| `members_auth_user_id_fkey` | `members.auth_user_id` → `auth.users.id` | **SET NULL** (`n`) |
| `attendance_events_member_id_fkey` | `attendance_events.member_id` → `members.id` | **RESTRICT** (`r`) |
| `audit_log_entries_actor_fkey` | `audit_log_entries.actor` → `profiles.id` | **RESTRICT** (`r`) |
| `membership_periods_member_id_fkey` | `membership_periods.member_id` → `members.id` | **RESTRICT** (`r`) |
| `membership_periods_created_by_payment_fkey` | `membership_periods.created_by_payment` → `payments.id` | **RESTRICT** (`r`) |

Source: live `pg_constraint` on 2026-11-23; `0012_privacy_consent.sql` lines 52, 88, 96.

### 7.3 What evidence may be erased
- **Consent history:** every `consent_records` row for that user (privacy policy / terms / marketing acceptance or rejection, version, source, timestamp).
- **Privacy-request history:** every `privacy_requests` row for that user (request type, details, status, timestamps) — i.e., the audit trail of the request itself.
- **Not erased (different behavior):** `members.auth_user_id` becomes `NULL` (**SET NULL**), so the member row survives but loses the link to the auth identity. Attendance/payments/membership/audit are **RESTRICT**-protected and cannot be silently cascade-deleted through this path.

### 7.4 Can consent/privacy records become orphaned or deleted?
- **Deleted:** yes — CASCADE deletes them outright; they do not become orphaned.
- **Auth-identity orphan:** `members.auth_user_id = NULL` leaves a member record with no auth linkage. Consent rows are already gone (deleted, not orphaned). This creates a **preservation gap, not a dangling-row gap**.

### 7.5 Referential-integrity behavior that exists today
- Append-only tables; `authenticated` has `SELECT` only (no `UPDATE`/`DELETE` policies) → clients cannot delete these rows.
- Deletion can only occur via `service_role`/superuser or a cascading `auth.users` delete; the risk is therefore **administrative/erasure-path**, not client-facing.

### 7.6 Why this conflicts with the policy
- **Consent evidence preservation:** consent must remain provable for the retention period; CASCADE makes it unprovable after account deletion.
- **Privacy-request auditability:** the request and its resolution are the record of compliance; CASCADE erases the proof that a request was handled.
- **Erasure vs retention (L-06):** a lawful erasure request and a lawful retention obligation collide; CASCADE solves neither — it destroys evidence without a documented legal basis.

### 7.7 Reproduction conditions (DESCRIBE ONLY — DO NOT EXECUTE)
A destructive reproduction would be: create a synthetic auth user + consent + privacy rows, delete the auth user, observe the cascade removing those rows. **This batch did not execute this and must not.** It requires Tier 1 authorization and synthetic fixtures; it belongs to a future authorized batch.

### 7.8 Impact / Likelihood / Severity
- **Impact:** High — permanent loss of consent and privacy-request evidence; weakens compliance defensibility and any dispute over consent.
- **Likelihood:** Medium today (erasure path not enabled), **High** the moment account deletion is enabled without a fix.
- **Severity:** **High / Critical for the erasure workflow**; not exploitable by ordinary clients.

### 7.9 Existing safeguards
- Append-only tables; no client DELETE policy; RLS forced; `authenticated` SELECT-only.
- `resolve_privacy_request` is Owner + AAL2 (status only) — no staff bypass.
- Financial/audit/history protected by RESTRICT.

### 7.10 Possible mitigation designs (design options only)
| Option | Description | Trade-offs |
|---|---|---|
| **A. Anonymize, don't delete** | Keep consent/privacy rows; replace direct identifiers with a pseudonymous token; null the auth link. | Preserves evidence; needs pseudonymization design + legal sign-off (L-06). |
| **B. Restructure FKs** | Change `consent_records`/`privacy_requests` `auth_user_id` FK to `ON DELETE SET NULL` (with a non-identifying `subject_ref`). | Preserves rows; requires a forward-only migration; historical rows retain old linkage. |
| **C. De-identify then retain** | On erasure, strip identifiers from the subject while keeping the consent/request fact + timestamp. | Strong privacy posture; needs a controlled, audited function. |
| **D. Retain a protected subset** | Block deletion of consent/privacy rows while the auth user is deleted; keep them as legal records. | Simplest; must be legally justified as retention. |
| **E. Status quo (no erasure)** | Keep erasure unimplemented; do not delete auth users. | Safe but blocks PRQ-04 indefinitely. |

### 7.11 Recommended options for Owner/technical review
1. **Immediate:** keep erasure disabled; no `auth.users` deletion outside controlled registration rollback (already the case).
2. **Preferred design direction:** **Option B + A/C** — `SET NULL` FK plus an anonymization function that preserves the consent/request fact with a pseudonymous subject reference, gated by Owner + AAL2 and fully audited.
3. **Do not** accept CASCADE as the erasure mechanism; it destroys the evidence the program is trying to protect.
4. Require **L-06** sign-off before any implementation; no schema change in Batch 2E.

---

## 8. Tier 0 Read-Only Verification Checklist and Results

**Tier 0 = read-only.** All checks are safe `SELECT`/catalog inspection. Executed 2026-11-23 against `supabase_db_GYM_Management` (Up, healthy, `127.0.0.1:54322`). Docker was started by the operator; no lifecycle command was issued by this batch. An earlier transient Docker outage in this session is recorded as **historical**; live checks below reflect the healthy state.

| # | Check | Method | Expected / reference | Result | Evidence class |
|---|---|---|---|---|---|
| T0-01 | Server & identity | `SELECT version(); current_database(); current_user;` | PostgreSQL 17.x; `postgres` | **17.12**; `postgres`/`postgres` | VERIFIED |
| T0-02 | Migration history | `SELECT version FROM supabase_migrations.schema_migrations` | 0001–0013 with known gaps | **11 rows:** 0001,0002,0003,0004,0005,0008,0009,0010,0011,0012,0013 | VERIFIED |
| T0-03 | Table/view counts | `information_schema` | 15 tables / 4 views | **15 tables / 4 views** | VERIFIED |
| T0-04 | RLS forced | `pg_class` where `relrowsecurity AND relforcerowsecurity` | 15/15 | **15/15** | VERIFIED |
| T0-05 | Policy commands | `pg_policies` grouped by `cmd` | SELECT + limited INSERT; no UPDATE/DELETE | SELECT widespread; INSERT on `follow_up_events`, `payments`; **no UPDATE/DELETE** | VERIFIED |
| T0-06 | Client grants | `information_schema.role_table_grants` | authenticated SELECT (+2 INSERT); no anon | authenticated only; **no anon**; views SELECT | VERIFIED |
| T0-07 | Cascade FKs | `pg_constraint` on target tables | consent/privacy CASCADE; members SET NULL; rest RESTRICT | **as expected** (§7.2) | VERIFIED |
| T0-08 | Retention objects | `pg_proc` name regex `purge|retention|cleanup|delete` | none | **0 matches** | VERIFIED |
| T0-09 | Extensions | `pg_extension` | known set | btree_gist, pg_stat_statements, pgcrypto, plpgsql, supabase_vault, uuid-ossp | VERIFIED |
| T0-10 | `pg_cron` availability | `pg_extension` / `pg_available_extensions` | installed vs available | **installed=0, available=1** | VERIFIED |
| T0-11 | Archiving / backup indicators | `pg_settings` | archive on/off | `archive_mode=off`, `archive_command=(disabled)` | VERIFIED |
| T0-12 | Storage bucket privacy | `storage.buckets` | receipts private, 5 MiB, PDF | **private; 5,242,880; {application/pdf}** | VERIFIED |
| T0-13 | Storage policies | `pg_policies` in `storage` | insert/select only; no update/delete | insert receptionist; select own; select staff; **no update/delete** | VERIFIED |
| T0-14 | `profiles.is_active` | `information_schema.columns` | exists | **1 match** | VERIFIED |
| T0-15 | Inactive view | `to_regclass('public.v_inactive_members')` | exists | **true** | VERIFIED |
| T0-16 | Target functions | `information_schema.routines` | 7 functions exist | **7** (update_member_contact, admin_set_staff_active, admin_register_staff, admin_staff_directory, record_consent, request_privacy_action, resolve_privacy_request) | VERIFIED |
| T0-17 | `profiles` rows | `SELECT count(*)` | 0 (no live staff) | **0** | VERIFIED |
| T0-18 | Inactive view logic | static `0004_views.sql` | `> 30`, freeze-adjusted, gym TZ | confirmed in source | VERIFIED (static) |
| T0-19 | Privacy workflow structure | static `0012_privacy_consent.sql` | queue-only; Owner+AAL2 status | confirmed in source | VERIFIED (static) |
| T0-20 | WhatsApp channel | static `provider.ts` + schema | email/sms/push only; no log table | confirmed; no WhatsApp; no log table | VERIFIED (static) |
| T0-21 | Backup scripts/config | repo search | documented absent | **no backup/restore/pg_dump files** | VERIFIED |
| T0-22 | Personal-data exposure | all queries | metadata only | only `count(*)` on profiles (=0); no row content read | VERIFIED |

### Tier 0 notes
- **No member/payment/attendance content was read.** Only counts and catalog metadata.
- Historical Batch 2A Docker outage and the brief outage in this session are **not** current-state failures; current DB is healthy.
- `pg_cron` availability (1) means a scheduler *could* be installed later, but it is **not installed** and no job exists.
- Backup indicators (`archive_mode=off`) mean point-in-time recovery is **not** enabled locally; this is a capability gap, not a defect.

---

## 9. Tier 1 Test Harness Readiness Assessment

**Tier 1 = synthetic data in a reversible, isolated, rollback-only context.** This section is **design/readiness only**; no Tier 1 test was executed.

> **Accuracy correction (Batch 2F review, 2026-11-23) — narrowly scoped.** The original wording in this section overstated Tier 1 readiness. Readiness is now split into three separately-scored levels, and overall Tier 1 execution status is **CONDITIONAL / BLOCKED** until isolation, rollback, and residue detection are actually validated. No conclusion is weakened and no evidence is erased.

### 9.1 Readiness levels (corrected)
| Level | Meaning | Status |
|---|---|---|
| **9.1.1 Test design readiness** | Test cases and fixture plan exist (Batch 2D + §9.2/§9.3 here) | **READY — design drafted** |
| **9.1.2 Harness implementation readiness** | A runnable harness (fixtures, persona simulation, assertion helpers, rollback wrapper) exists and has been dry-run | **NOT IMPLEMENTED / NOT VALIDATED** — no harness was built or dry-run |
| **9.1.3 Execution readiness** | Isolation proven, rollback proven, residue detection proven, and authorization granted | **CONDITIONAL / BLOCKED** — isolation/rollback/residue not demonstrated; authorization is a separate gate |

**Clarifications recorded for accuracy:**
- The local database **was reachable** (PostgreSQL 17.12, healthy) at the time of the Tier 0 checks. Reachability is **not** the same as execution readiness.
- Synthetic fixtures are **designed only**; none was created or validated in Batch 2E.
- **No Tier 1 mutation test was executed** in Batch 2E.
- **Authorization to execute tests is a separate gate**; it was not granted for Batch 2E.

### 9.1a Environment facts (verified, but not execution readiness)
| Dimension | Status | Note |
|---|---|---|
| Local DB reachable | **VERIFIED** | PostgreSQL 17.12, healthy |
| Baseline migrations applied | **VERIFIED** | 0001–0013 (known gaps) |
| RLS/policies/grants verified | **VERIFIED** | 15/15 forced; SELECT-limited |
| Synthetic fixture capability | **NOT IMPLEMENTED** | `profiles` empty; fixtures designed only |
| Transaction rollback harness | **NOT VALIDATED** | `begin; … rollback;` pattern exists in `supabase/tests/*`, but not proven for these fixtures |
| Execution authorization | **BLOCKED** | No mutation/test execution authorized in Batch 2E |

### 9.2 Test placement by safety tier
| Test family | Safe in a rolled-back transaction? | Needs isolated DB? | Needs synthetic fixtures? | Notes |
|---|---|---|---|---|
| ATT-01…09 (attendance retention) | Partly (needs a retention function that does not yet exist) | Yes for destructive variants | Yes (synthetic member/token) | No retention function today; Tier 3 for real purge |
| FIN-01…06 (financial protection) | **Yes** (assert no delete path) | No | Yes (synthetic payment/period) | Read/denial assertions safe |
| AUD-01…06 (audit append-only) | Partly | Yes for purge design | Yes (synthetic actor/profile) | Purge design unresolved (OD-4/5) |
| INA-01…08 (inactive classification) | **Yes** | No | Yes (synthetic member + attendance + freeze) | Classification read-only; no deletion |
| MTH-* (membership history) | **Yes** | No | Yes | RESTRICT assertions |
| REC-01…07 (receipts) | Partly (Storage objects are outside a SQL transaction) | Yes for object lifecycle | Yes (synthetic path) | Storage delete requires cleanup strategy |
| PRQ-01…09 (privacy requests) | Partly | Yes for deletion variants | Yes (synthetic auth users/consent) | PRQ-04 blocked by cascade/L-06 |
| XC-01…04 (cross-cutting) | Partly | Yes for backup/restore | Possibly | Backup/restore needs infrastructure |

### 9.3 Synthetic fixture design (marking)
- Use a fixed synthetic namespace, e.g. member name prefix **`SYNTH-B2E-`**, phone `+9100000000xx`, and deterministic UUIDs (e.g. `00000000-0000-4000-8000-00000000XXXX`) so any residual row is unmistakable.
- Synthetic `auth.users` + `profiles` rows created only inside the transaction (or in a dedicated test schema/DB) so rollback removes them.
- Never reuse real member identifiers; never copy production data.

### 9.4 Required assertions before execution
1. Baseline row counts captured for every touched table.
2. `search_path` pinned; session role/timezone set explicitly.
3. Confirm `begin` opened and autocommit off.
4. Confirm the test targets only `SYNTH-`-prefixed rows.
5. Confirm RLS/role context matches the test's intent (client vs definer).

### 9.5 Required rollback / residue verification
- After `rollback`: re-count every touched table and assert **equal to baseline**.
- Assert no `SYNTH-` rows remain (marker scan across tables).
- Assert no new `audit_log_entries` rows from the synthetic run (unless the test intends an audit assertion, in which case they must also be rolled back).
- Assert no Storage objects remain under the synthetic prefix (object tests need explicit cleanup, because Storage is not transactional).

### 9.6 Abort conditions
Abort immediately if: a prerequisite count differs from baseline; a real (non-`SYNTH-`) identifier is touched; a `commit` occurs unexpectedly; a destructive statement runs outside the transaction; Storage objects cannot be cleaned; or any decision-dependent behavior is ambiguous.

### 9.7 Readiness conclusion
**Test design is ready; harness implementation is NOT validated; execution is CONDITIONAL / BLOCKED.** The environment is reachable and the design is drafted, but isolation, rollback, and residue detection have not been demonstrated, and execution was not authorized in Batch 2E. Tier 3 (real/destructive) remains blocked by decisions and backup/restore.

---

## 10. Implementation Readiness Classification

| # | Control | Classification | Rationale |
|---|---|---|---|
| 1 | Attendance retention | **READY AFTER OWNER DECISION** | Needs OD-1/2/3 (and OD-5 for evidence); no function/scheduler yet |
| 2 | Financial record retention | **PROTECTED — NO DELETION AUTHORIZED** | Append-only; L-03/L-05 pending; no delete path |
| 3 | Audit log retention | **PROTECTED — NO DELETION AUTHORIZED** | Append-only; no evidence-preserving purge (OD-4/5, L-06) |
| 4 | Inactive classification | **READY AFTER OWNER DECISION** | View exists; **policy says 30 days but implementation triggers only at `inactive_days > 30` (31+)**; boundary unresolved pending OD-7; classification only |
| 5 | Membership history preservation | **PROTECTED — NO DELETION AUTHORIZED** | RESTRICT FKs; append-only; preserve |
| 6 | Receipt PDF retention | **PROTECTED — NO DELETION AUTHORIZED** | No delete policy; OD-6/OD-9, L-03 pending |
| 7 | Privacy request execution | **BLOCKED** | OD-8/OD-10 + L-06 + cascade destroy evidence |
| 8 | Consent withdrawal | **READY AFTER OWNER DECISION** | Append-only model supports new withdrawal row (OD-10/L-02) |
| 9 | Consent evidence preservation | **BLOCKED** | CASCADE deletes evidence; needs L-06 + FK/anonymization redesign |
| 10 | Backup retention/restoration | **READY AFTER EXTERNAL VALIDATION** | Provider/plan/PITR unverified; Storage not covered |
| 11 | WhatsApp inactivity notification | **READY AFTER EXTERNAL VALIDATION** | Provider absent; L-04 consent required |
| 12 | Access revocation (receptionist removal) | **READY AFTER TEST ENVIRONMENT PREPARATION** | `is_active` + GoTrue ban implemented; requires a validated Tier 1 harness (not yet built) to execute the synthetic test |
| 13 | Member contact correction | **READY AFTER TEST ENVIRONMENT PREPARATION** | `update_member_contact` implemented; requires a validated Tier 1 harness (not yet built) to execute the synthetic authz tests |
| 14 | Data deletion safeguards / cascade | **BLOCKED** | L-06 unresolved; CASCADE destroys evidence |

### 10.1 Independently implementable (without touching protected data)
- **Access revocation (#12)** and **contact correction (#13)** — both are additive/authorization tests against synthetic fixtures and do not touch financial/audit/history/consent evidence.
- **Inactive classification alignment (#4)** and **consent-withdrawal-as-new-row (#8)** — additive, after their Owner decisions; do not delete protected data.
- **Backup verification (#10)** — infrastructure, after OD-11; does not touch records.

### 10.2 Must remain blocked
- Any hard deletion of attendance/financial/audit/receipt/consent/member data.
- Any erasure workflow, privacy-request execution that deletes, or auth-user deletion.
- Any purge schedule.

---

## 11. Blockers and Risks

| ID | Blocker/Risk | Category | Severity | Evidence | Mitigation |
|---|---|---|---|---|---|
| B-01 | Consent/privacy `auth.users` **CASCADE** destroys evidence | Legal/schema | **Critical** | live `pg_constraint`; `0012` | L-06 + anonymization / `SET NULL` redesign |
| B-02 | No retention function | Implementation | High | 0 functions matched; `0012` absent | Forward-only migration in a later authorized batch |
| B-03 | No scheduler (`pg_cron` installed=0) | Operations | Medium | live extension check | Install/approve scheduler later |
| B-04 | Inactive threshold divergence (`> 30` vs "30") | Policy/logic | High | `0004_views.sql` | OD-7; align view + wording |
| B-05 | Boundary/timezone undefined | Policy | High | OD-1/OD-2 open | Owner decisions; pin UTC compare |
| B-06 | Audit purge can destroy its own evidence | Integrity | High | append-only, no archive | OD-4/OD-5; separate evidence store |
| B-07 | Backup/PITR unverified; Storage excluded | Recovery | High | WS-6; `archive_mode=off` | OD-11; restorable backup + drill |
| B-08 | Receipt retention duration/authority unresolved | Legal/ops | High | OD-6/OD-9; L-03 | No deletion; Owner/legal |
| B-09 | WhatsApp provider absent; no log table | Provider | Medium | `provider.ts`; schema | OD-12/L-04; defer |
| B-10 | Privacy-request execution not implemented | Workflow | High | queue-only; Owner+AAL2 status | OD-8/OD-10; design first |
| B-11 | Hosted migration-history reconciliation pending | Deployment | High | Stage 2I | Separate gate; not Batch 2E |
| B-12 | Tier 1 execution not authorized | Process | Expected | Batch rules | Authorize explicitly in a later batch |

---

## 12. Recommended Next Batch 2 Step

**Order of operations (smallest safe increments):**

1. **Owner decision pass (no code):** resolve OD-1, OD-2, OD-3, OD-5, OD-7, OD-10 (attendance/inactive/evidence/withdrawal). This unblocks the highest-value, lowest-risk work.
2. **External validation pass:** obtain L-02, L-03, L-05, L-06 answers (consent, retention floor, financial, erasure-vs-evidence). L-06 is the gate for any erasure work.
3. **Tier 1 harness build (no mutation in Batch 2E):** implement the synthetic `SYNTH-B2E-` fixture + rollback + residue checks for **#12 access revocation**, **#13 contact correction**, **#4 inactive classification**, and **#5 membership preservation** — these are additive and do not require deletion.
4. **Cascade remediation design:** approve the `SET NULL` + anonymization approach (§7.11) before any erasure or privacy-request execution is enabled.
5. **Only after 1–4:** author a forward-only retention migration for attendance, shipped **dark** (no schedule), tested in the synthetic cohort; leave financial/audit/receipt/consent deletion blocked until L-03/L-05/L-06 and OD-4/OD-6 are resolved.

**Not recommended:** starting Batch 2F or implementing any purge/deletion/scheduling now.

**Smallest next step:** Owner reviews §5 (OD-1/2/3/7/10) and legal reviews §6 (L-02/03/05/06), then authorize a Tier 1 harness batch for controls #4/#5/#12/#13.

---

## 13. Change Inventory

| Change | Path | Type | Status |
|---|---|---|---|
| New Batch 2E report | `docs/SECURITY_BATCH_2E_DECISION_CLOSURE_AND_TIER_0_1_PREPARATION_REPORT.md` | Documentation (new file) | Created |
| Post-review accuracy correction (2026-11-23) | same report | Documentation (narrow edit) | Tier 1 readiness wording in §1, §9, §10, §15 corrected to distinguish design / implementation / execution readiness; inactivity boundary divergence strengthened in §4.4/§10. No conclusion weakened; no evidence erased. |

**No other changes:**
- No source, migration, schema, RLS, function, policy, or config edits.
- No existing report modified.
- No dependency change.
- No commit, push, or deploy.

---

## 14. Verification Evidence

| # | Verification | Method | Result |
|---|---|---|---|
| V-01 | Report exists at exact path | file read | **PASS** |
| V-02 | All 15 required sections present | section scan | **PASS** (see below) |
| V-03 | No leaked tool/markup artifacts | regex scan for artifact markers | **PASS** (0 matches) — re-run at close |
| V-04 | Only the new report changed | `git status --porcelain` | new report only (plus pre-existing unrelated working-tree items) |
| V-05 | No source/migration modified | `git status` scoped | **PASS** |
| V-06 | No DB mutation | review of executed SQL | **PASS** (SELECT/catalog only) |
| V-07 | No service lifecycle by agent | command log | **PASS** (operator started Docker) |
| V-08 | No dependency change | `package.json`/lock untouched by this batch | **PASS** |
| V-09 | No commit/push/deploy | git log/status | **PASS** |
| V-10 | Live Tier 0 executed | `docker exec … psql` read-only | **PASS** (Docker healthy) |

**Sections present:** 1 Executive Summary; 2 Scope and Safety; 3 Evidence Reviewed; 4 Remaining-Gap Matrix; 5 Owner Decision Register; 6 External Dependency Register; 7 Cascade Risk Assessment; 8 Tier 0 Checklist/Results; 9 Tier 1 Readiness; 10 Implementation Readiness; 11 Blockers and Risks; 12 Recommended Next Step; 13 Change Inventory; 14 Verification Evidence; 15 Final Verdict.

**Verification limits:**
- Tier 1/Tier 3 behavior could not be verified (execution not authorized).
- Provider backup/restore capability could not be verified (external).
- No live auth-context role test was run (`profiles` empty; no mutation authorized).

---

## 15. Final Verdict

### Batch 2E deliverable
**`BATCH 2E — COMPLETE`** (documentation deliverable produced within strict read-only scope; exactly one new report; no prohibited operations).

### Retention/privacy implementation readiness
**`BLOCKED`** — no retention, purge, deletion, anonymization, scheduling, or privacy-request execution is implemented or authorized. The controls split into:
- **Protected — no deletion authorized:** financial, audit, membership history, receipts.
- **Ready after Owner decision:** attendance retention, inactive classification, consent withdrawal.
- **Ready after test-environment preparation:** access revocation, contact correction.
- **Ready after external validation:** backup/restore, WhatsApp notifications.
- **Blocked:** privacy-request execution, consent evidence preservation, data-deletion/cascade safeguards.

### Single most important finding
The **`ON DELETE CASCADE` from `auth.users` to `consent_records` and `privacy_requests`** destroys the very evidence the program is trying to preserve. It must be redesigned (anonymization and/or `SET NULL`) with L-06 legal sign-off before any erasure workflow is enabled.

### Confirmation
- Tier 0 read-only checks **passed** against the live local DB.
- Tier 1 **test design** is ready; **harness implementation is not validated**; **execution was not performed** and remains **CONDITIONAL / BLOCKED** (isolation/rollback/residue unproven; authorization not granted).
- No database mutation, service lifecycle change, schema change, dependency change, source edit, existing-report edit, commit, push, or deploy occurred.

**STOP.** Batch 2E complete. Await explicit review/authorization before beginning any Batch 2F work or any retention/purge/erasure implementation.
