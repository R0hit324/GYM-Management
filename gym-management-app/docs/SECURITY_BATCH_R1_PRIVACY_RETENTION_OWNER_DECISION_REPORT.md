# BATCH R-1 — PRIVACY & DATA RETENTION OWNER DECISION PREPARATION (READ-ONLY)

**Project:** Gym Management App (`gym-management-app`)
**Date:** 2026-11-21
**Batch:** R-1 — Privacy & Data Retention Owner Decision Preparation (Owner-authorized **read-only** assessment and decision-preparation batch)
**Predecessor context:** `docs/SECURITY_REMEDIATION_PLAN.md` (R-1 owner-gated batch design), `docs/STAGE_2I_OWNER_LEGAL_DECISIONS_AND_HOSTED_INITIALIZATION_READINESS_GATE_REPORT.md`, `docs/STAGE_2J_A_HOSTED_DATABASE_STATE_VERIFICATION_REPORT.md`, `docs/DATABASE_INITIALIZATION_AUDIT_REPORT.md`
**Mode:** Assessment and decision-preparation only. **No implementation, no deletion, no retention change, no migration, no hosted action, no source change, no dependency change was performed.**

---

## 1. Executive Summary

- Batch R-1 was authorized as a strictly read-only assessment to inspect the application's actual data handling and prepare Owner decisions for privacy, retention, deletion, consent, and related governance areas.
- Verified repository facts were collected across migrations, RLS/policies, RPCs, storage, documentation, and source references.
- Key verified technical postures:
  - Append-only financial, membership, consent, and audit structures exist; no automatic retention/purge/deletion jobs are implemented.
  - Privacy requests are an Owner-reviewed queue; they do not execute erasure.
  - Account deletion is structurally constrained (FKs/append-only designs) and unresolved as an operational workflow.
  - Retention/deletion/offboarding decisions remain **PENDING OWNER/LEGAL** (H4, M6; Stage 2I D-01/D-02, L-01…L-04).
- Final verdict: **ASSESSMENT COMPLETE — OWNER DECISIONS READY** (decision-preparation deliverable produced; implementation remains future/owner-gated).

## 2. Project Baseline

- Branch: `main`; HEAD: `90753a4`; uncommitted changes present (R-3A/R-3B/R-3C artifacts + prior R-2 artifacts, untracked; plus modified `package.json`/`package-lock.json` from R-3A).
- Migrations present: `0001_core_schema.sql` … `0013_receipt_storage_insert_path_check.sql` (+ `0008_stage5_write_paths.sql`, `0011_staff_administration.sql` — note numbering gaps consistent with history).
- Node/npm: `v24.20.0` / `11.19.0`.
- Audit posture at time of assessment: 22 moderate / 0 critical / 0 high (post-R-3A).

## 3. Verified Data Inventory

### 3.1 Member identity data
- `public.profiles` (1:1 with `auth.users`; role, display_name, phone) and `public.members` (full_name, phone, email, plan_id, price_locked, discount_pct, membership_end, joined_on, pending_plan_id/By, archived_at).
- No date-of-birth column found in the verified schema.
- Member records are linked to auth users via `members`/`profiles`; join applications link via `auth_user_id`.

### 3.2 Membership data
- `public.plans`, `public.membership_periods` (append-only, one per verified payment), `public.membership_period_voids` (append-only voids), `public.membership_freezes`, `public.join_applications`.

### 3.3 Attendance data
- `public.attendance_events` (verified-only), `public.qr_tokens` (hash-only, server-minted), `public.membership_freezes`.

### 3.4 Financial data
- `public.payments` (append-only; payment/reversal rows; UTR, method `upi|cash`, state `awaitingVerification|verified|rejected`; no card-data column — payment references/records only).
- `public.membership_periods`, `public.plans` (prices deactivated, not deleted).

### 3.5 Staff data
- `public.profiles` with role `owner|receptionist|member`; staff administration via staff-admin Edge Function + owner+AAL2 DB fallback (0011); no separate staff PII table found.

### 3.6 Security and audit data
- `public.audit_log_entries` (append-only; actor, actor_role, action, table_name, row_id, old/new jsonb, at).
- Auth events primarily at provider level; authority actions emit audit rows.

### 3.7 Privacy-related data
- `public.consent_records` (append-only; auth_user_id, consent_type `privacy_policy|terms_of_service|marketing`, document_version, accepted, source, recorded_at).
- `public.privacy_requests` (auth_user_id, request_type `account_deletion|data_export|data_correction|privacy_inquiry`, details, state, resolution_note, timestamps).

### 3.8 Notifications
- No notification-persistence table was found in the verified migration inventory; notification handling was not fully resolved within this read-only stage.

### 3.9 Uploaded data
- Storage bucket `receipts` (private, `file_size_limit = 5242880`, MIME `application/pdf`); path `{member_uuid}/{payment_uuid}.pdf`; policies: select own (member), select staff (receptionist/owner), insert receptionist; no update/delete policy; receipts metadata in `payments.receipt_path`.

## 4. Data Flow and Storage

- Consent: recorded via `record_consent` (target always `auth.uid()`, no cross-user consent binding; mandatory docs accept-only; marketing accept/decline).
- Privacy requests: via `request_privacy_action`; resolution via `resolve_privacy_request` (Owner + AAL2; records decision, does not erase).
- Financial/audit/receipt retention: intentionally retained per design/owner decisions; no purge job.
- Storage: private bucket; no deletion path implemented for client roles; receipts immutable via Storage API.

## 5. Current Privacy Controls (verified)

- Consent writer least-privilege, target-bound; append-only guards; RLS (own + owner).
- Privacy request RLS (own + owner); state machine.
- RLS/FORCE on application tables; staff/member scopes; SECURITY DEFINER authority functions with pinned search_path; AAL2 on sensitive authority actions.
- Storage default-deny policies; private bucket.

## 6. Current Retention Behavior (verified)

- No retention, purge, or deletion jobs implemented.
- Consent evidence cascades on auth-user deletion (legal-evidence retention concern).
- Account deletion not implemented as operational flow; FK constraints structurally block some deletion paths.
- Financial/audit/receipt retention intentionally retained.

## 7. Data Lifecycle Analysis

Per category, verified current behavior and open questions:
- Member personal data: stored with membership/application context; offboarding semantics pending (H4).
- Attendance: append-only; inactivity classification; retention pending.
- Financial: append-only payments/reversals; receipt metadata; retention/audit obligations pending.
- Receipts: private storage + metadata; DB backups exclude Storage (Stage 2B WS-6 / Stage 2I).
- Audit/security: append-only; retention pending.
- Consent/privacy: consent + requests; retention pending.
- Staff: staff administration design; retention/access pending.
- Backup: no repo backup config; provider status unverified; Free plan no recovery point (Stage 2I F-03).

## 8. Delete vs Anonymize vs Deactivate

- **Deactivate:** potential for account disable; not implemented as member-facing deletion-offboarding flow; preserves history.
- **Delete:** structurally constrained (FKs RESTRICT; append-only); not automated; requires design for anonymization/retention paths.
- **Anonymize:** not implemented; considered for consent-evidence and financial/audit integrity scenarios.

## 9. Owner Decision Matrix

| Area | Current behavior | Options | Status |
|---|---|---|---|
| A. Member accounts | Retention/offboarding pending (H4) | Retain / deactivate / delete / anonymize | **PENDING OWNER DECISION** |
| B. Attendance | Append-only; retention pending | Retain/anonymize | Pending |
| C. Membership | Append-only history; retention pending | Retain/anonymize | Pending |
| D. Financial | Append-only; audit obligations | Retain/delete bounded | Pending |
| E. Receipts | Private storage + metadata | Retain/download/delete | Pending |
| F. Audit logs | Append-only | Retain/anonymize | Pending |
| G. Staff | Staff admin design | Retain/disable/remove | Pending |
| H. Privacy requests | Queue, Owner-reviewed | Implement execution/anonymization | Pending |
| I. Consent | Append-only records | Withdraw/retention semantics | Pending |
| J. Notifications | Not fully verified persistence | Retain/purge | Pending/not verified |
| K. Uploaded files | Private bucket `receipts` | Delete/mirror/retention | Pending |
| L. Backups | Provider-dependent | Enable/PITR/mirror | Pending (D-04) |

Owner decision column values: **PENDING OWNER DECISION** where owner/business choice required; **LEGAL REVIEW REQUIRED** where legal review needed; **NOT VERIFIED** where not verifiable.

## 10. Legal Review Items

- L-01: Final privacy policy text and lawful basis — **PENDING LEGAL/PRIVACY REVIEW**.
- L-02: Consent capture/versioning/withdrawal semantics — **PENDING OWNER/LEGAL DECISION**.
- L-03: Legal retention periods and deletion obligations — **PENDING LEGAL/PRIVACY REVIEW** (retention).
- L-04: Notification consent handling — **PENDING LEGAL/PRIVACY REVIEW**.
- Owner: D-01, D-02 (retention/deletion authority); D-04 (backup strategy); D-05/D-06.

## 11. Privacy Risk Register (condensed)

- F-05 (Medium): retention decisions pending (H4).
- F-06 (Medium): privacy/consent decisions pending (M6).
- H4 (High): account deletion structurally blocked / retention pending.
- M6 (Medium): consent evidence cascades with auth user deletion.
- F-03 (High): backup/recovery unverified; DB backups exclude Storage.

## 12. Recommended Owner Decisions

- Retain financial/audit/receipt history (design intent) pending explicit Owner decision.
- Decide retention windows and deletion/offboarding policy per category.
- Decide consent withdrawal and legal-evidence handling.
- Decide backup/PITR/mirror strategy (D-04).

## 13. Proposed Future Implementation Roadmap (proposals only, no implementation)

- R-1 implementation batches: retention design, consent withdrawal semantics, deletion/offboarding workflow, anonymization design, privacy-request execution design, storage cleanup, backup lifecycle, admin tooling, tests.

## 14. Verification Requirements (for future batches)

- SQL suites, negative privacy suites, tests for consent/privacy, tsc/lint/jest, backups.

## 15. Limitations

- Read-only; no hosted production access; no legal determination made; retention durations not invented.

## 16. Files Changed

- Created: `docs/SECURITY_BATCH_R1_PRIVACY_RETENTION_OWNER_DECISION_REPORT.md`.

## 17. Git Safety Confirmation

- No commit/push; HEAD `90753a4`; no source/migration/policy/auth/hosted/dependency change during R-1.

## 18. Final Verdict

**ASSESSMENT COMPLETE — OWNER DECISIONS READY** (decision-preparation batch; implementation not authorized/implemented).

---

## Final Response — Batch R-1

1. **Status:** **ASSESSMENT COMPLETE — OWNER DECISIONS READY**.
2. **Baseline:** verified (migrations incl. `0012_privacy_consent.sql`; audit 22 moderate; R-3A/R-3B/R-3C artifacts present, untracked).
3. **Data inventory:** 9 categories mapped to verified tables/buckets/functions.
4. **Retention behavior:** no purge/delete jobs; consent append-only; privacy requests queue-only; financial/audit/receipt retention retained.
5. **Owner decision areas:** A–L documented; decisions pending (Owner/legal).
6. **Legal items:** L-01…L-04 pending legal review.
7. **Files created:** `docs/SECURITY_BATCH_R1_PRIVACY_RETENTION_OWNER_DECISION_REPORT.md`. No other file changed in this stage.
8. **Git:** no commit/push; HEAD `90753a4`.
9. **Stop condition respected:** strictly read-only; implementation not performed; stopped for Owner review.

---

*End of Batch R-1 — Privacy & Data Retention Owner Decision Preparation. Read-only assessment completed; no implementation, deletion, retention change, migration, hosted action, or commit/push was performed during this stage.*

---

# SECURITY GOVERNANCE BATCH 1 — POLICY ALIGNMENT, DOCUMENTATION & IMPLEMENTATION PLANNING (FINAL REPORT)

**Date:** 2026-11-22
**Batch:** Security Governance Batch 1 — Policy Alignment, Documentation & Implementation Planning
**Mode:** STRICTLY DOCUMENTATION AND PLANNING. No implementation performed.

## 1. Batch 1 Summary

Batch 1 was executed with the objective to inspect the existing repository and security documentation, verify the current implementation against the Master Privacy, Security & Data Governance Policy, identify existing documentation that should be updated rather than duplicated, produce a structured implementation plan for the approved policy requirements, record implementation dependencies/risks/blockers and required Owner/legal/provider decisions, and establish a safe execution sequence for future implementation batches.

Executed tasks:
1. Repository inventory (read-only): security docs, policy drafts, retention/consent/backup docs, migrations, audit/notification/receipt/staff implementations.
2. Policy alignment matrix (A–L and policy sections 15–18) produced against verified states.
3. Implementation dependency plan produced.
4. Decision register produced.
5. Verification requirements produced.
6. Governance/batch approval workflow documented.

No implementation work was performed during Batch 1.

## 2. Repository Baseline

- Branch: `main`; HEAD: `90753a4`.
- Initial Git status: modified `package.json` + `package-lock.json` (R-3A); untracked Batch R-2/R-3/R-1 governance + R-2 test artifacts.
- Files changed during Batch 1: only `docs/SECURITY_BATCH_R1_PRIVACY_RETENTION_OWNER_DECISION_REPORT.md` (permitted deliverable).

## 3. Executive Summary

- Master policy requirements A–L and sections 15–18 were evaluated against verified implementation evidence.
- Most retention/deletion/audit/consent/backup requirements are policy-level targets not yet enforced or not yet verified in implementation.
- Prior findings preserved: Stage 1 (SECURITY PASS WITH CONDITIONS), Stage 2 (R-1/R-2 design), R-2 (M3 FIXED BUT NOT FULLY VERIFIED), R-3 (R-3A fixed TS-eslint; Jest/Expo remediation deferred).

## 4. Policy Alignment Matrix (A–L and Policy Sections 15–18)

| Requirement | Policy target | Current verified state | Gap | Status |
|---|---|---|---|---|
| A — Inactive members & deletion | Inactive marking; deletion w/ safeguards; preserve linked records; 30-day inactivity ≠ WhatsApp 7-day | Deletion workflow not implemented; FK/append-only constraints; inactivity classification known | Workflow pending | OWNER DECISION REQUIRED |
| B — Attendance retention | **6 months** | No retention enforcement | Pending | NOT IMPLEMENTED |
| C — Membership history | Member-facing limit; internal history preserved | Design intent | Partial | NOT IMPLEMENTED/PENDING |
| D — Financial retention | **1 year** | Retained intentionally; no purge | Pending | NOT IMPLEMENTED |
| E — Receipts | Remove rather than retain indefinitely; controlled lifecycle; separate from financial; no delete during Batch 1 | Bucket/metadata exist; no deletion path | Pending | NOT IMPLEMENTED |
| F — Audit logs | **1 year**; append-only; restricted/owner access; no ordinary manual deletion; controlled retention deletion; log events | Append-only implemented; retention not enforced | Pending | NOT IMPLEMENTED |
| G — Staff/account management | Owner add/remove; self-register; verify; revoke; preserve history | Staff admin design/implementation partial | Pending | PARTIALLY IMPLEMENTED/NOT VERIFIED |
| H — Personal data corrections | Receptionist cannot edit; controlled correction; auditable | Correction workflow not implemented | Pending | NOT IMPLEMENTED |
| I — Privacy & consent | Notice; consent records; withdrawal/request; owner review; legal compliance verify | Consent/records implemented; withdrawal/retention pending (M6) | Pending | LEGAL REVIEW REQUIRED |
| J — WhatsApp inactivity | **7 days** trigger; 2-day log retention; dedup; provider/consent verify; no 30-day confusion | Provider contract (email/sms/push) exists; WhatsApp provider/7-day/2-day not verified | Pending | PROVIDER CAPABILITY REQUIRED |
| K — User uploads | Disabled; system PDF receipts exception; no new upload | Receipts system-generated; no user uploads | Aligned | VERIFIED IMPLEMENTED |
| L — Backups/recovery | Daily; encryption; owner/admin; **30 days**; restore tests; not claimed implemented | Not implemented/verified; Free plan/no recovery point (F-03) | Pending | NOT VERIFIED |

Policy sections 15–18 (database, API/backend, mobile, staff, testing, governance, completion criteria, legal, owner approval gate) — mostly design-level; verified alignment assessed.

## 5. Implementation Plan (recommended future batches)

- Batch 2: Data retention + deletion safeguards (attendance 6 mo, financial 1 yr, audit 1 yr, receipts).
- Batch 3: Consent / privacy requests / corrections.
- Batch 4: Receipt lifecycle + Storage deletion.
- Batch 5: Audit-log retention + restricted access.
- Batch 6: WhatsApp verification, dedup, 2-day log retention.
- Batch 7: Backup/recovery capability assessment + implementation.
- Batch 8: Hosted Supabase readiness/identity verification.

## 6. Decision Register (unresolved)

- Owner: retention/deletion authority (H4/D-01/D-02); backup strategy (D-04); security decisions (D-05/D-06).
- Legal: L-01, L-02, L-03, L-04.
- Provider: WhatsApp capability/consent; backup plan.

## 7. Risk Register (high-impact)

- F-05, F-06, H4, M6, F-03, plus pending retention/deletion implementation risks.

## 8. Verification Requirements

- SQL suites, privacy/negative suites, retention-boundary tests, deletion/linked-integrity tests, consent tests, WhatsApp dedup tests, backup restore evidence, storage lifecycle verification, manual/hosted separation.

## 9. Rollback / Recovery Considerations

- Forward-only migration discipline; backup-before-apply; restore/PITR; no destructive retention until approved.

## 10. Owner / Legal / Provider Approvals Required

- Owner approval for each implementation batch; legal review for retention/consent; provider verification for backups/WhatsApp.

## 11. Batch 1 Closure Status

- **CLOSED** — Batch 1 documentation/planning objectives satisfied (policy alignment, implementation plan, decision register, verification requirements, governance workflow) without implementation.

## 12. Explicit Statement

- No implementation was performed during Batch 1. No source code, migrations, schemas, policies, RPCs, dependencies, hosted systems, environment variables, credentials, destructive operations, deployments, commits, or pushes were changed.

---

## Final Response — Security Governance Batch 1

1. **Status:** **CLOSED** (documentation & planning batch completed within strict scope).
2. **Batch 1 summary:** policy alignment, implementation plan, decision register, risk register, verification requirements, governance workflow produced; no implementation performed.
3. **Repository baseline:** `main` @ `90753a4`; permitted file updated: `docs/SECURITY_BATCH_R1_PRIVACY_RETENTION_OWNER_DECISION_REPORT.md`.
4. **Policy alignment:** A–L and 15–18 assessed; matrix produced.
5. **Implementation plan:** future batches B2–B8 recommended/sequenced.
6. **Decision register:** Owner/legal/provider issues recorded.
7. **Risk register:** high-impact risks recorded.
8. **Verification:** fresh read-only checks + historical results marked historical.
9. **Scope confirmation:** no source/migration/DB/deps/hosted/destructive/deploy/commit/push.
10. **Stop condition:** policy approval gate remains with Owner; implementation awaits Owner approval.

---

*End of Security Governance Batch 1 — Policy Alignment, Documentation & Implementation Planning (FINAL REPORT). No implementation, migration, database, hosted, destructive, credential, deployment, commit, or push work was performed during this batch.*
