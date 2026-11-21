# STAGE 2I — OWNER/LEGAL DECISIONS & HOSTED INITIALIZATION READINESS GATE REPORT

**Date:** 2026-11-21

**Project:** `gym-management-app`

**Stage:** 2I — Owner/Legal Decisions & Hosted Initialization Readiness Gate

**Scope:** Read-only readiness assessment. This stage reviewed prior-stage evidence (Stages 2C–2H), current repository state, pending Owner/legal decisions, and hosted-initialization prerequisites; it produced a decision register, readiness assessment, findings, and Stage 2J checklist. **No hosted Supabase operation of any kind was performed, and no application implementation, migration, policy, test, seed, environment, or production configuration was changed.**

---

## 1. Executive Summary

- Stages 2C–2H have now been completed and reported:
  - **2C** — Local Database Validation: **COMPLETED** (local reset/migrations OK; suites 24/26, 52/52, 58/60; 134/138).
  - **2D** — SQL Test Remediation: **COMPLETED** (fresh reset; **138/138**; no security regression).
  - **2E** — Hosted Initialization Preflight: **COMPLETED** — **READY WITH CONDITIONS**; hosted execution unverified; conditions C1–C6 tracked.
  - **2F** — Hosted Initialization Readiness & Execution Gate: **COMPLETED** — **READY WITH CONDITIONS**; hosted initialization **NOT authorized/executed**; C2–C6 open.
  - **2G** — Security Findings Investigation: **COMPLETED** — M1 **VALID**, M2 **VALID**, M3 **VALID RISK**, H4 **DECISION PENDING**, M6 **DECISION PENDING**; verdict **SECURITY PASS WITH CONDITIONS**.
  - **2H** — Security Remediation: **COMPLETED** — M1 **FIXED AND VERIFIED**, M2 **FIXED AND VERIFIED**, M3 **VALID RISK (documented)**, H4/M6 **DECISION PENDING**; suites green (0003 139/139, 0008 27/27, 0010 27/27, 0011 52/52, 0012 60/60; total 305/305), Jest 243/243, TypeScript clean, ESLint clean; verdict **SECURITY PASS WITH CONDITIONS**.
- Stage 2H remediation outcome: technical security posture materially improved and locally verified; hosted initialization remains **BLOCKED** pending Owner/legal decisions, hosted capability confirmation, and explicit approval.

## 2. Stage Objective and Scope

Stage 2I had the objective of independently reviewing existing project evidence, identifying unresolved Owner/legal/privacy/security/operational decisions, and determining whether the project is ready to proceed to Stage 2J (Hosted Supabase Initialization).

This stage was executed strictly as a **read-only readiness assessment and decision-documentation stage**.

## 3. Explicit Out-of-Scope Operations

The following were **prohibited and not performed** during Stage 2I:

- Connecting to the remote Supabase project.
- `supabase link`, `supabase db push`, remote migrations, or any remote SQL.
- Creating hosted users, Owner, MFA state, Storage objects, Edge Functions, secrets, backups, or infrastructure.
- Modifying application source, migrations, policies, tests, seed, or environment files.
- Committing, pushing, deploying, or publishing builds.
- Drafting or finalizing legal documents or selecting legal retention periods.
- Executing recovery tests, restore drills, or backup changes.

## 4. Evidence Reviewed

Reviewed/inspected:

- Stage 2C, 2D, 2E, 2F, 2G, and 2H reports.
- `docs/DATABASE_INITIALIZATION_AUDIT_REPORT.md` and related production-readiness reports (2A plan; 2B WS1–WS8; Phase 5 reports).
- `docs/SECURITY_POLICY.md`, `docs/THREAT_MODEL.md`, authority/audit design docs (Phase 3B reports).
- Legal drafts: `docs/LEGAL_PRIVACY_POLICY_DRAFT.md`, `docs/LEGAL_TERMS_OF_SERVICE_DRAFT.md`.
- Current migrations and migration sequence: `0001`, `0002`, `0003`, `0004`, `0005`, `0008`, `0009`, `0010`, `0011`, `0012`, plus new `0013_receipt_storage_insert_path_check.sql` (0006/0007 gaps documented).
- `supabase/config.toml` (local-development values; no hosted values).
- `supabase/seed.sql` (app_settings + four plans).
- Auth implementation (`src/services/auth/*`, MFA screens/tests) and staff-admin implementation.
- Storage design (`0010_receipt_storage.sql`, post-2H `0013`) and receipt services.
- Backup/recovery documentation (`docs/PRODUCTION_READINESS_STAGE_2B_WS6_REPORT.md`).
- Local SQL test suites and validation outputs (Stage 2H runs).

## 5. Previous-Stage Verification Status

| Stage | Report | Status | Key outcome relevant to Stage 2I |
|---|---|---|---|
| 2C | `docs/STAGE_2C_LOCAL_DATABASE_VALIDATION_REPORT.md` | COMPLETED | Local reset/migrations OK; initial SQL baseline. |
| 2D | `docs/STAGE_2D_SQL_TEST_REMEDIATION_REPORT.md` | COMPLETED | Fresh reset; **138/138**; no security regression. |
| 2E | `docs/STAGE_2E_HOSTED_INITIALIZATION_PREFLIGHT_REPORT.md` | COMPLETED | **READY WITH CONDITIONS**; hosted verification pending; C1–C6 tracked. |
| 2F | `docs/STAGE_2F_HOSTED_INITIALIZATION_READINESS_AND_EXECUTION_GATE_REPORT.md` | COMPLETED | **READY WITH CONDITIONS**; hosted init **NOT authorized/executed**. |
| 2G | `docs/STAGE_2G_SECURITY_FINDINGS_RESOLUTION_AND_INITIALIZATION_GATE_REPORT.md` | COMPLETED | M1 **VALID**, M2 **VALID**, M3 **VALID RISK**, H4 **DECISION PENDING**, M6 **DECISION PENDING**. |
| 2H | `docs/STAGE_2H_SECURITY_REMEDIATION_AND_INITIALIZATION_GATE_REPORT.md` | COMPLETED | M1 **FIXED AND VERIFIED**, M2 **FIXED AND VERIFIED**, M3 **VALID RISK**, H4/M6 **DECISION PENDING**; suites/regression green; verdict **SECURITY PASS WITH CONDITIONS**. |

## 6. Current Project State (as of Stage 2I assessment)

- **Migration posture:** Local clean-reset execution is green for the applied sequence; historical migrations preserved; new forward-only migration `0013` added transactionally for the M2 storage INSERT path-shape fix; AAL2 enforcement added to privileged write paths via existing migrations (0003/0008) without duplication.
- **Security posture:** Material technical findings M1 and M2 remediated and regression-verified; M3 assessed as valid risk and documented; H4 and M6 decisions pending.
- **Hosted posture:** Not initialized; no hosted state touched; hosted capability/identity/backup/MFA verification outstanding.

## 7. Owner Decision Register

| Decision ID | Decision | Category | Current evidence | Options | Recommendation | Risks | Approver | Status | Blocks Stage 2J |
|---|---|---|---|---|---|---|---|---|---|
| D-01 | Member/financial/security/technical data retention periods | Retention | Technical facts documented; legal retention periods not established | Retain-indefinitely / fixed periods / legal-driven | Recommend fixed legally-derived periods; not to be silently chosen | Extended retention increases privacy risk; premature deletion risks legal/audit | Owner + legal | **PENDING OWNER DECISION** | Conditional (design-phase; may block destructive workflows before init) |
| D-02 | Retention/deletion policy on member offboarding | Retention | Deletion workflows/pending decisions per prior stages | Retain / delete-on-offboarding / legal-driven | Recommend explicit owner-approved offboarding policy | Data loss risk | Owner | **PENDING OWNER DECISION** | Conditional |
| D-03 | Hosted initialization approval | Operations/Governance | Stage 2F/2H withheld/not approved | Approve / defer / cancel | Recommend defer until conditions cleared | Unauthorized hosted state change | Owner | **PENDING OWNER DECISION** | **YES (blocking)** |
| D-04 | Backup strategy approval (daily backups, PITR, storage mirroring) | Operations/Backup | WS-6: no repo backup config; provider unverified; DB backups exclude Storage | Enable Pro backups / PITR / mirror / other | Recommend enable daily backups (Pro+), decide PITR, mirror receipts bucket, break-glass | No recovery capability currently demonstrated | Owner | **PENDING OWNER DECISION** | Blocking/conditional |
| D-05 | Security finding decision — M3 (migration reapplication/partial failure) | Security | **VALID RISK**; migration 0013 transactional; historical batches non-idempotent; no blind re-run | Accept risk / remediate now | Recommend accept + enforce no-blind-rerun + pre-migration export discipline | Failed partial apply could require forward fix/restore | Owner/technical lead | **PENDING OWNER DECISION** | Conditional |
| D-06 | Security finding decision — M1/M2 (technical) | Security | **FIXED AND VERIFIED** (M1), **FIXED AND VERIFIED** (M2) via Stage 2H | Accept fixes as final | Accept fixes as final (verified locally) | Residual: hosted-side enforcement still requires hosted verification | Owner sign-off recommended | **DECIDED — DOCUMENTED** (technical) | Resolved for remediation; hosted verification still pending |

## 8. Legal/Privacy Decision Register

| Decision ID | Decision | Category | Current evidence | Status | Owner/Legal |
|---|---|---|---|---|---|
| L-01 | Final privacy policy text and lawful basis | Legal/Privacy | Draft exists (`docs/LEGAL_PRIVACY_POLICY_DRAFT.md`); finalization not done | **PENDING LEGAL/PRIVACY REVIEW** | Legal |
| L-02 | Consent capture/versioning/withdrawal semantics | Legal/Privacy | Consent implementation in `0012_privacy_consent.sql`; decisions pending | **PENDING OWNER/LEGAL DECISION** | Owner + Legal |
| L-03 | Legal retention periods and deletion obligations | Legal/Privacy | Retention decisions pending (H4) | **PENDING LEGAL/PRIVACY REVIEW** | Legal |
| L-04 | Notification consent handling | Legal/Privacy | Consent/audit design; final policy needed | **PENDING LEGAL/PRIVACY REVIEW** | Legal |

## 9. Data Retention Analysis

| Data category | Current technical behavior (as evidenced) | Retention risk | Proposed decision | Owner approval | Legal approval |
|---|---|---|---|---|---|
| Member personal data | Stored with membership/application context; offboarding semantics pending decision | Retention/indefinite storage | Owner-approved retention/offboarding policy | Pending | Pending |
| Attendance data | Append-only events; inactivity classification | Retention | Fixed retention or legal-driven | Pending | Pending |
| Financial data | Append-only payments/reversals; receipt metadata | Retention/audit obligations | Owner-approved retention | Pending | Pending |
| Receipts | Storage objects (private, PDF-only, 5 MiB) + metadata; DB backups exclude Storage | Storage retention/backup coverage | Owner-approved storage retention/backup | Pending | Pending |
| Audit/security logs | Append-only authority/audit trail | Retention | Owner-approved retention | Pending | Pending |
| Consent/privacy requests | Consent records + requests flow; owner+AAL2 resolution | Retention | Owner/legal decision | Pending | Pending |
| Staff records | Staff administration design | Retention/access | Owner-approved | Pending | Pending |
| Backup data | Provider backup status unverified; PITR unverified | Recovery capability | Owner-approved backup/PITR plan | Pending | Pending |

**Conclusion:** Technical retention behavior is implemented/reported; legal retention periods, deletion policy, and retention governance remain Owner/legal decisions.

## 10. Privacy and Consent Analysis

- Consent schema/history and privacy-request workflow were reviewed; technical enforcement present (consent records, requests, owner+AAL2 resolution).
- Final privacy policy text, consent language, withdrawal semantics, notification consent, data-subject rights process (access/export/deletion), and incident handling documentation were **not** finalized/verified as complete in prior stages.
- **Status: PENDING LEGAL/PRIVACY REVIEW** for policy/consent finalization; Owner decision required where implementation/operations choices exist.

## 11. Backup and Disaster Recovery Analysis

- Stage 2B WS-6 concluded: no backup configuration in repo; provider backup status unverified; Free plan → no recovery point; DB backups exclude Storage (receipts not covered); no recovery test executed; PITR unverified.
- Owner actions identified: confirm plan, enable daily backups (Pro+), decide PITR, create break-glass account, start independent encrypted exports, mirror `receipts` bucket off-platform, run first isolated restore drill.

**Stage 2I position:** Backup/recovery readiness **NOT fully resolved**; requires Owner decision and hosted verification before Stage 2J.

## 12. Hosted Project Identity Assessment

- Local `.env` referenced hosted project URL `https://nyeybfpojbvzcmhtlgns.supabase.co` (publishable key present; `EXPO_PUBLIC_AUTH_MODE` unset → demo mode).
- `supabase/config.toml` `project_id = "GYM_Management"` (local identifier, not hosted ref).
- Hosted project ref/identity **cannot be verified** without remote access; marked **UNVERIFIED** from repository evidence.
- **Stage 2I position:** hosted identity verification is a mandatory precondition for safe Stage 2J initialization.

## 13. Hosted MFA and Authentication Capability

- Local: MFA TOTP (enroll/verify) enabled (`max_enrolled_factors = 10`); AAL2 gates in DB authority functions; owner+AAL2 privacy resolution; staff-admin JWT verify + owner+AAL2 server-side.
- Hosted: MFA capability **NOT verified**; TOTP requires paid plan (Pro/Team/Enterprise); auth settings in config are local-oriented (`enable_confirmations = false`, SMS local-only, sessions defaults).

**Stage 2I position:** hosted MFA/AAL2 capability verification is **REQUIRED** before initialization; local verification does not transfer to hosted.

## 14. Owner Bootstrap Readiness

- Design: no Owner-creation migration; dashboard-based Owner auth user + profile (`owner`, `is_active=true`) → TOTP → AAL2; staff-admin creates only Receptionists; safe-bootstrap requirements documented.
- **Status:** designed/ready for review; **not executed**; must be executed only in a separately authorized Stage 2J with explicit Owner approval.

## 15. Seed Data Readiness

- `supabase/seed.sql`: app_settings singleton + four plans; idempotent; **not run by `db push`**; must be executed after migration push; reviewed values aligned with local catalog.

## 16. Storage, Receipts and File Privacy Readiness

- Post-2H: private `receipts` bucket, PDF-only, 5 MiB, member/staff policies, M2 `WITH CHECK` path-shape enforcement (0013), S09 regression green.
- Hosted-side storage privilege ownership (e.g., `postgres` creating storage policies/buckets) remains unverified (Stage 2E C2).

## 17. Monitoring, Incident Response and Operations Readiness

- Not yet documented/verified at required launch level (monitoring, alerting, incident response, security alerting, backup verification, restore testing, responsibilities).

## 18. Required Policy Documents

- Drafts exist (privacy policy, terms of service); finalization requires legal review; retention/consent/deletion policies required.

## 19. Findings

| ID | Severity | Finding | Evidence | Impact | Recommendation | Blocking for Stage 2J |
|---|---|---|---|---|---|---|
| F-01 | **HIGH** | Hosted MFA/AAL2 capability not verified | Stage 2E/2F; config local; plan requirement | High | Verify hosted plan/auth config before init | Yes (condition) |
| F-02 | **HIGH** | Hosted project identity unverified | Stage 2E; config `GYM_Management` vs hosted ref; no remote access | High | Confirm identity in Stage 2J before link/push | Yes |
| F-03 | **HIGH** | Backup/recovery capability unverified; DB backups exclude Storage | Stage 2B WS-6; Stage 2E/2F | High | Enable backups/PITR; mirror receipts; restore drill | Conditional |
| F-04 | **MEDIUM** | Migration reapplication/partial-failure risk | M3 **VALID RISK**; migrations non-idempotent batches; 0013 transactional | Medium | Accept + no-blind-rerun + pre-migration export | Conditional |
| F-05 | **MEDIUM** | Retention decisions pending | H4 **DECISION PENDING** | Medium | Owner/legal decisions required | Yes |
| F-06 | **MEDIUM** | Privacy/consent decisions pending | M6 **DECISION PENDING** | Medium | Owner/legal decisions required | Yes |
| F-07 | **LOW** | Owner bootstrap not executed | Design ready; execution pending | Low | Execute in authorized Stage 2J | No (design verified) |
| F-08 | **LOW** | Monitoring/ops documentation incomplete | Stage 2I assessment | Low | Define before launch | No |

## 20. Stage 2J Pre-Initialization Checklist

## A. Project Identity
- [ ] Correct Supabase account/project confirmed.
- [ ] Project identity verified (ref/URL/organisation/region).
- [ ] Environment separation confirmed.

## B. Owner Decisions
- [ ] Retention policy decided (D-01, D-02).
- [ ] Privacy/consent decisions documented (L-1–L-4).
- [ ] Backup strategy approved (D-04).
- [ ] Security findings decisions recorded (D-05, D-06).

## C. Security
- [ ] Hosted MFA/AAL2 capability verified (F-01).
- [ ] AAL2 enforcement verified hosted-side.
- [ ] Storage policy capability verified hosted-side (C2).

## D. Migration Safety
- [ ] Migration sequence/order verified.
- [ ] Fresh local reset + SQL suites green.
- [ ] No blind re-run; pre-migration export discipline.

## E. Seed and Owner Bootstrap
- [ ] Seed execution path confirmed (`db push` does not run seed).
- [ ] Owner bootstrap executed with MFA/AAL2.

## F. Storage
- [ ] Storage privileges/buckets verified hosted.

## G. Operations
- [ ] Monitoring/alerting/backup/restore plans confirmed.

## H. Explicit Approval
- [ ] Owner approves unresolved decisions.
- [ ] Owner approves Stage 2J hosted initialization.

## 21. Owner Approval Requirements

- Explicit approval for hosted initialization (Stage 2J).
- Owner decisions for retention/offboarding/backup/security findings.
- Legal review for privacy/consent/retention policies.

## 22. Risk Register

- Hosted initialization blocked by unresolved Owner/legal decisions (retention, privacy/consent) and pending hosted capability/backup/identity verification.
- Migration risk (M3) accepted-as-risk with controls.
- Technical security remediation (M1/M2) verified locally; hosted-side re-verification pending.

## 23. Blockers

1. Hosted initialization approval withheld/not approved (Stage 2F/2H).
2. Retention and privacy/consent decisions pending Owner/legal (H4/M6).
3. Hosted MFA/AAL2 capability unverified (F-01).
4. Hosted project identity unverified (F-02).
5. Backup/recovery readiness incomplete (F-03).
6. Migration safety condition (M3) not yet formally accepted.

## 24. Recommendations

- Proceed to Stage 2J only after resolving/accepting the above blockers and obtaining explicit Owner approval.
- Complete hosted capability verification, backup enablement, identity confirmation, seed/owner bootstrap, and launch operations checklist before any hosted action.

## 25. Stage Verdict

**BLOCKED.**

- Hosted initialization readiness is **not yet approved** to proceed to Stage 2J.
- Technical security remediation completed and locally verified; however, unresolved Owner/legal decisions and outstanding hosted capability/backup/identity verification keep hosted initialization blocked.

## 26. Next Stage Definition

**Stage 2J — Hosted Supabase Initialization — Explicitly Authorized Execution.**

Scope (only after explicit approval and resolved conditions): confirm hosted project identity; verify hosted capabilities (MFA/AAL2, storage privileges, backup); pre-push export; `supabase link --project-ref <ref>` → migration list → `db push` → execute reviewed seed → Owner bootstrap (auth user → profile → TOTP → AAL2) → deploy staff-admin → hosted verification → smoke tests.

Stage 2J must not begin automatically from Stage 2I; explicit separate approval is required.

## 27. Explicit Confirmation — No Remote Operations Performed

No remote Supabase operation, migration application, seed execution, owner creation, auth/MFA change, backup change, file edit outside the Stage 2I report, commit, push, deployment, or production action was performed during Stage 2I.

---

## Final Response — Stage 2I

1. **Stage 2I status:** **COMPLETE** (read-only readiness assessment + decision documentation).
2. **Final verdict:** **BLOCKED** — project not ready to proceed to Stage 2J at this time.
3. **Owner decisions required:** retention (D-01/D-02), privacy/consent (L-1–L-4), backup strategy (D-04), hosted init approval (D-03), security decision acceptance (D-05/D-06).
4. **Legal decisions required:** retention periods, privacy policy finalization, consent/deletion semantics (L-1–L-3).
5. **Critical findings:** F-01 (hosted MFA/AAL2 unverified), F-02 (hosted identity unverified), F-03 (backup/recovery unverified).
6. **High findings:** F-01, F-02, F-03.
7. **Medium findings:** F-04, F-05, F-06.
8. **Stage 2J blockers:** unresolved Owner/legal decisions; pending hosted capability/backup/identity verification; migration-safety condition; missing explicit hosted init approval.
9. **What was changed:** only `docs/STAGE_2I_OWNER_LEGAL_DECISIONS_AND_HOSTED_INITIALIZATION_READINESS_GATE_REPORT.md` created.
10. **What was not changed:** application source, migrations, policies, tests, seed, env, infra, docs other than the new report.
11. **Validation performed:** evidence review only; no SQL execution against hosted; local suites not re-run in Stage 2I (relying on Stage 2H executed evidence).
12. **No hosted operations performed:** confirmed.
13. **No secrets exposed:** maintained.
14. **Recommended next step:** obtain explicit Owner approval and resolve Owner/legal decisions; then Stage 2J (Hosted Supabase Initialization — Explicitly Authorized Execution).

---

## End of Report

*No remote Supabase operation, commit, push, deployment, or production action of any kind was performed during Stage 2I. All assessment was performed from repository evidence and local validation outputs only.*
