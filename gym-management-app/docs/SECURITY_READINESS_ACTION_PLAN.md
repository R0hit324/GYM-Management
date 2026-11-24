# SECURITY READINESS ACTION PLAN — GYM MANAGEMENT APP (SRAP)

**Project:** Gym Management App (`gym-management-app`)
**Repository:** `E:\GYM Management\gym-management-app`
**Date:** 2026-11-23
**Phase:** Security Readiness Action Plan (SRAP) — documentation-only deliverable
**Predecessor deliverable:** `docs/FINAL_SECURITY_REMEDIATION_AND_CLOSURE_REPORT.md`
**Inherited final security verdict:** **SECURITY PASS WITH CONDITIONS**

**Mode:** Documentation only. This phase created only `docs/SECURITY_READINESS_ACTION_PLAN.md`. No source code, migration, schema, RLS, function, policy, trigger, grant, Storage, dependency, retention, deletion, erasure, authentication, or operational change was made, and none was authorized by this phase.

---

## Section A — Executive Summary

### 1. Purpose of the SRAP

The Security Readiness Action Plan (SRAP) converts the remaining, evidence-supported security conditions identified through the final security closure program into a prioritized, dependency-aware remediation roadmap.

The SRAP is the controlled planning artifact that follows the final master closure report and before any controlled implementation phase.

### 2. Position relative to the final closure

The final security verdict, as recorded in the authoritative final master report (`docs/FINAL_SECURITY_REMEDIATION_AND_CLOSURE_REPORT.md`), is:

**SECURITY PASS WITH CONDITIONS.**

The conditions attached to that verdict are the basis of this action plan:

- Critical unresolved conditions remain gated on Owner, legal, accounting, or external validation decisions, or on hosted/production validation that was not performed.
- Technical residual risks remain documented but not automatically resolved.
- Local verification evidence supports a controlled security posture, not a production-security claim.

### 3. What the program already completed

The final closure program completed sequentially through:

1. Batch 2H — GAP-04 Migration Safety Remediation: **PARTIALLY COMPLETE**.
2. Batch 2I — GAP-01 Consent and Privacy Evidence Integrity: **BLOCKED**.
3. Batch 2J — GAP-02 Retention and Deletion Controls: **PARTIALLY COMPLETE**.
4. Batch 2K — GAP-08 Receipt and Storage Lifecycle Security: **PARTIALLY COMPLETE**.
5. Batch 2L — GAP-05 Hosted Initialization / GAP-06 Hosted Authentication Hardening: **PARTIALLY COMPLETE**.
6. Batch 2M — GAP-09 WhatsApp Notification Security: **PARTIALLY COMPLETE**.
7. Batch 2N — Final Security Regression, Audit and Closure: **COMPLETE**.
8. Comprehensive Final Master Report: **COMPLETE**.

The final master report is authoritative for gap status, final verdict, and residual risk.

### 4. Why the application is not yet production-security-ready

The remaining conditions prevent an unconditional production security approval:

- Consent/privacy evidence preservation risk (GAP-01) remains blocked pending Owner/legal/external validation.
- Retention execution remains blocked pending Owner/legal decisions (GAP-02).
- Inactivity boundary decision remains with the Owner (GAP-03).
- Hosted initialization remains blocked pending migration-history reconciliation and Owner approval (GAP-05).
- Hosted authentication hardening and GoTrue ban integration remain not tested (GAP-05/GAP-06/GAP-07).
- Receipt storage lifecycle remains not tested (GAP-08).
- WhatsApp notification security remains not implemented/blocked (GAP-09).
- Backup/restore validation remains not tested/blocked (final master residual risk set).

### 5. Purpose of this deliverable

The SRAP must:

- Convert remaining verified gaps into prioritized, actionable workstreams.
- Preserve owner, legal, accounting, and external decision dependencies.
- Define acceptance evidence for each workstream.
- Define dependency ordering so unsafe work cannot start prematurely.
- Remain documentation-only during this phase.

### 6. Bottom line

The deliverable status for this phase is:

**SECURITY READINESS ACTION PLAN — COMPLETE**

This does **not** mean the application is production-ready, compliant, or fully secure. It means the Security Readiness Action Plan deliverable has been completed and verified within its authorized scope.

---

## Section B — Authoritative Current Security Status

This section summarizes only evidence-supported current statuses. Status labels used consistently with the program:

- VERIFIED
- REMEDIATED AND VERIFIED
- PARTIALLY COMPLETE
- BLOCKED
- NOT TESTED
- NOT IMPLEMENTED
- OWNER DECISION REQUIRED
- LEGAL REVIEW REQUIRED
- ACCOUNTING REVIEW REQUIRED
- EXTERNAL VALIDATION REQUIRED
- REMEDIATED WITH CONDITIONS

### 1. Current status by domain

| Domain | Authoritative state | Status label |
|---|---|---|
| Final security verdict | SECURITY PASS WITH CONDITIONS | Final (Batch 2N / final master) |
| Migration safety (fresh execution) | Migration `0014`: 4/4 PASSED; migration history clean | VERIFIED (Batch 2H) |
| Migration safety (historical transaction boundaries) | Gaps in `0003`/`0008`/`0011`/`0004` immutability-blocked | PARTIALLY COMPLETE (GAP-04) |
| Privacy / consent evidence | Design verified; auth-user CASCADE risk unresolved | BLOCKED (GAP-01) |
| Retention / deletion execution | Design/protected state verified; execution blocked | BLOCKED (GAP-02) |
| Inactivity classification | Policy 30 vs implementation `> 30` divergent | OWNER DECISION REQUIRED (GAP-03) |
| Hosted initialization | Blocked; migration-history reconciliation required | BLOCKED (GAP-05) |
| Hosted authentication hardening | Not tested | NOT TESTED (GAP-06) |
| GoTrue ban integration | Not tested (DB revocation verified) | NOT TESTED (GAP-07) |
| Receipt / Storage lifecycle | M2 remediated/verified; lifecycle not tested | NOT TESTED (GAP-08) |
| WhatsApp notifications | Not implemented / blocked | NOT IMPLEMENTED / BLOCKED (GAP-09) |
| Financial / payment integrity | Design verified (append-only, full-payment, reversal) | VERIFIED (design) |
| QR attendance | Design verified | VERIFIED (design) |
| Mobile security | Design/assessment | ASSESSED |
| Supply chain | R-3A remediated; R-3B/R-3C assessed | REMEDIATED / ASSESSED |
| Operations / audit / monitoring / backup | Audit design verified; backup/restore not tested | DESIGN VERIFIED / NOT TESTED |

### 2. Final test and verification snapshot

Latest final-phase executed evidence (labels reflect phase of execution):

| Check | Result | Evidence source |
|---|---|---|
| Migration safety (`0014`) | **4 / 4 PASSED** | Batch 2H (fresh) |
| SQL auth/RBAC suite (`0003`) | **139 / 139 PASSED** | Batch 2H |
| SQL stage5/2F suites (`0008`) | **27 / 27 PASSED** | Batch 2H |
| SQL staff suite (`0011`) | **52 / 52 PASSED** | Batch 2H (after residue cleanup) |
| SQL privacy suite (`0012`) | **60 / 60 PASSED** | Batch 2J execution |
| Synthetic Batch 2F controls | **71 / 71 PASSED** | Batch 2F |
| SQL regression (`0004`/`0008`/`0011`/`0012`) | **220 / 220 PASSED** | Batch 2F |
| Jest | **19 suites / 243 tests PASSED** | Batch 2H |
| TypeScript | **`tsc --noEmit` exit 0** | Batch 2H |
| ESLint | **`expo lint` exit 0** | Batch 2H |
| Hosted / Storage lifecycle / GoTrue ban / WhatsApp | **NOT TESTED / NOT IMPLEMENTED / BLOCKED** | As applicable |

Limitations recorded in the final master report:

- `0010` was not executed fresh in the final phase (requires fresh-reset context; outside applicable final-phase set).
- Hosted/production validation was not performed.
- Real-user, real-data, destructive, erasure, retention execution, and notification action were not performed.

### 3. Authoritative status statement

The SRAP must treat the following as authoritative:

- No critical open technical exploit was demonstrated after remediation M1/M2 and migration-safety remediation posture M3.
- Critical unresolved items are decision/external-validation gated or hosted-blocked.
- No finding may be treated as resolved without the recorded evidence.
- No status may be upgraded during this documentation phase.

---

## Section C — Canonical Gap Register

The canonical consolidated gap register is maintained in:

- `docs/FINAL_SECURITY_REMEDIATION_AND_CLOSURE_REPORT.md` (final master register, GAP-01…GAP-14)
- `docs/SECURITY_BATCH_2G_SECURITY_GAP_CONSOLIDATION_AND_REMEDIATION_READINESS_REPORT.md` (canonical GAP-01…GAP-14 consolidation)

This SRAP references and does not duplicate findings beyond the required canonical set.

### 1. Required canonical gap coverage

The following gaps are required to be represented in this SRAP:

- GAP-01
- GAP-02
- GAP-03
- GAP-04
- GAP-05
- GAP-06
- GAP-07
- GAP-08
- GAP-09

### 2. Gap register table

| Gap ID | Finding | Severity | Current Status | Required Action | Dependencies | Acceptance Evidence |
|---|---|---|---|---|---|---|
| **GAP-01** | Auth-user deletion via `ON DELETE CASCADE` destroys `consent_records` / `privacy_requests` evidence; consent/privacy evidence loss risk | High (irreversible legal/privacy evidence loss) | **BLOCKED** — no fix implemented; **EXTERNAL VALIDATION REQUIRED** (L-06); **LEGAL/ACCOUNTING REVIEW REQUIRED**; **OWNER DECISION REQUIRED** | Decide evidence-preserving deletion semantics (e.g., non-cascading relationship such as `RESTRICT` with evidence-preserving lifecycle); obtain legal/provider validation; obtain Owner sign-off; implement via forward-only migration only after approvals | Owner decision; legal review; external validation (L-06); retention decisions (OD set) | Approved preservation model; synthetic auth-user deletion preservation test post-remediation; consent/privacy evidence preservation; FK behavior; audit evidence; no destructive operation; migration forward-only; regression evidence |
| **GAP-02** | Retention/purge/deletion execution not dispositioned or implemented; retention windows (attendance ~6 mo, financial ~1 yr, audit ~1 yr; receipts unresolved) pending decisions | Medium (financial/audit integrity and governance) | **BLOCKED** — implementation not authorized; decisions pending | Obtain Owner/legal retention decisions; finalize retention design; implement only after approvals; synthetic tests; dry-run; boundary tests; audit evidence | Owner decisions (OD-1…OD-12); legal reviews (L-1…L-5); accounting (L-5) | Approved retention policy; approved deletion authority; synthetic retention tests; dry-run evidence; audit preservation; no financial/audit record deletion without authorization |
| **GAP-03** | Policy: inactive after **30** consecutive days; implementation: `inactive_days > 30` (inactive at 31+) — divergence | Medium (classification; becomes retention-critical if deletion ever introduced) | **OWNER DECISION REQUIRED** (OD-7); not changed | Obtain Owner decision on inactivity boundary semantics; confirm classification is decision-only; update policy/implementation only with Owner approval and regression evidence | Owner decision (OD-7) | Boundary tests (day 29/30/31 behavior); Owner-approved policy text; implementation agreement; classification separate from deletion |
| **GAP-04** | Migration reapply / partial-failure risk; historical migrations non-idempotent; new migrations must be transactional/forward-only | Medium | **PARTIALLY COMPLETE** — forward-only remediation posture executed/verified; migration `0013` transactional; `0014` 4/4 PASSED; historical transaction-boundary gaps in `0003`/`0008`/`0011`/`0004` immutability-blocked | Complete disposition of historical transaction-boundary gaps (immutability-blocked); maintain forward-only discipline for new migrations; backup/export discipline; recovery procedures; no historical migration edits unless documented necessity and stop-before-proceed condition met | Migration safety assessment (M3/D-05); recovery discipline; Owner awareness | Migration reapply safety; partial-failure rollback; recovery; fresh execution evidence; regression evidence |
| **GAP-05** | Hosted initialization blocked: application schema absent in inspected public schema; migration-history reconciliation required; hosted apply not approved | High (operational) | **BLOCKED** | Migration-history reconciliation; Owner approval for hosted apply; owner-gated hosted apply; proceed via Batch R-4 path | Owner approval (D-3/D-4); migration reconciliation | Hosted init readiness checklist; migration-history reconciliation evidence; hosted apply approval record |
| **GAP-06** | Hosted auth-server hardening items (password policy, email confirmations, secure password change, CAPTCHA, MFA server) not tested; owner-managed | High (auth posture) | **NOT TESTED / DEFERRED / NEEDS MANUAL VERIFICATION** | Owner-driven hosted verification; manual verification in hosted environment | Owner control; hosted environment access | Hosted auth hardening test matrix; AAL2/MFA server verification; session/token verification; regression evidence |
| **GAP-07** | GoTrue ban / deactivation integration test not executed; DB revocation verified; live ban behaviour unverified | Medium | **NOT TESTED** | Future authorized integration test (auth admin API capability; live auth user required) | Auth admin API capability; live auth user | Live GoTrue ban integration test; auth-side revocation evidence |
| **GAP-08** | Receipt object lifecycle (upload/delete/retention) not exercised; Storage operations non-transactional; SQL rollback ≠ Storage rollback | Low–Medium | **NOT TESTED** | Isolated Storage lifecycle test + cleanup; retention owner decision; lifecycle design | Storage test discipline; Owner retention decision | Storage lifecycle test evidence; orphaned-file handling plan; retention decision |
| **GAP-09** | WhatsApp inactivity notifications: channel not implemented; trigger/consent/provider pending | Medium | **NOT IMPLEMENTED / BLOCKED** | Owner decision (OD-12); provider/legal decision (L-04); design/implementation owner-gated | Owner decision; provider selection; legal review | Notification consent/privacy requirements; safe logging design; provider readiness checklist; no real messaging |

### 3. Dispositions of GAP-10 through GAP-14

The final master report also dispositioned the extended register entries:

- **GAP-10** — Dependency findings: **RESOLVED / ASSESSED** (R-3A/B/C).
- **GAP-11** — Audit retention/purge authority: **BLOCKED**.
- **GAP-12** — Financial retention: **BLOCKED**.
- **GAP-13** — Privacy-request execution: **BLOCKED**.
- **GAP-14** — Backup/restore validation: **NOT TESTED / BLOCKED**.

These are referenced from the final master report and are not re-litigated here.

---

## Section D — Prioritized Workstreams

Workstreams are ordered by priority and gated independently.

### SRAP-01 — Privacy Evidence Integrity

- **Linked gap:** GAP-01
- **Priority:** CRITICAL
- **Status:** BLOCKED (Owner/legal/external decisions required)
- **Objective:** Establish and verify evidence-preserving consent/privacy behavior, including auth-user deletion semantics.

**Address:**

- Consent evidence preservation requirements.
- Privacy-request evidence preservation requirements.
- Auth-user deletion cascade risk.
- Foreign-key behavior.
- Evidence integrity.
- Legal/accounting/security preservation requirements.
- Owner decisions.
- Technical design options.
- Migration risk.
- Rollback strategy.

**Dependencies:**

- Owner approval.
- Legal review.
- External validation (L-6 / L-06-equivalent external legal/provider validation).
- Preservation requirements established.

**Acceptance criteria:**

- Approved preservation model exists.
- Evidence cannot be unintentionally cascaded away.
- Behavior verified through synthetic tests.
- Existing evidence preserved.
- No unauthorized destructive operation performed.

**Boundary:**

- Must not automatically alter CASCADE relationships before approval and implementation planning.

### SRAP-02 — Data Retention and Lifecycle

- **Linked gap:** GAP-02
- **Priority:** HIGH
- **Status:** BLOCKED (Owner/legal decisions required)

**Address:**

- Attendance retention: proposed six months.
- Financial retention: proposed one year.
- Audit retention: proposed one year.
- Membership history preservation.
- Receipt retention policy: unresolved.
- Privacy request lifecycle.
- Legal holds.
- Deletion eligibility.
- Archive design.
- Purge authorization.
- Scheduled job safety.
- Dry-run support.
- Logging and verification.
- Rollback limitations.

**Dependencies:**

- Owner decisions (retention set).
- Legal reviews (retention/deletion obligations).
- Accounting reviews (financial retention).

**Acceptance criteria:**

- Retention rules formally approved before implementation.
- Synthetic data only.
- Boundary testing.
- Dry-run evidence.
- Approved record selection.
- Referential integrity.
- Audit evidence.
- Failure handling.
- No accidental deletion of financial or security records.

### SRAP-03 — Inactivity Classification

- **Linked gap:** GAP-03
- **Priority:** MEDIUM
- **Status:** OWNER DECISION REQUIRED (OD-7)

**Address:**

- Policy definition of exactly 30 consecutive days.
- Existing implementation using `inactive_days > 30`.
- Expected behavior at day 29, 30, and 31.
- Owner approval.

**Dependencies:**

- Owner decision (OD-7).

**Acceptance criteria:**

- Policy and implementation agree.
- Boundary tests exist.
- Member lifecycle behavior documented.

**Boundary:**

- Do not decide the threshold on behalf of the Owner.

### SRAP-04 — Migration Safety

- **Linked gap:** GAP-04
- **Priority:** MEDIUM / HIGH
- **Status:** PARTIALLY COMPLETE

**Address:**

- Existing migration history.
- Migration transaction boundaries.
- Partial failure behavior.
- Idempotency.
- Reapplication safety.
- Forward-only migration policy.
- Recovery strategy.
- Local synthetic verification.
- Migration `0014` validation.

**Dependencies:**

- Migration safety assessment (M3); Owner awareness (D-05).

**Acceptance criteria:**

- Migration risks classified.
- Existing database state preserved.
- No destructive resets.
- Recovery procedures documented.
- Appropriate tests passed.

**Boundary:**

- Do not modify historical migrations automatically.

### SRAP-05 — Hosted Environment Readiness

- **Linked gap:** GAP-05
- **Priority:** HIGH
- **Status:** BLOCKED

**Address:**

- Hosted initialization.
- Schema reconciliation.
- Environment configuration.
- Secrets handling.
- Deployment configuration.
- Local versus hosted parity.
- Migration prerequisites.

**Dependencies:**

- Owner approval (D-3/D-4); migration-history reconciliation.

**Acceptance criteria:**

- Readiness checklist.
- Environment configuration verified through approved procedures.
- No secrets exposed.
- Hosted validation plan documented.

### SRAP-06 — Authentication and Session Security

- **Linked gaps:** GAP-06, GAP-07
- **Priority:** HIGH
- **Status:** NOT TESTED (hosted) / NOT TESTED (GoTrue ban)

**Address:**

- Authentication flows.
- AAL2/MFA.
- Session lifecycle.
- Token revocation.
- User bans.
- GoTrue integration.
- Authenticated role enforcement.
- Owner/Receptionist/Member authorization.
- Hosted testing requirements.

**Dependencies:**

- Owner/hosted control for hosted verification; Auth admin API capability for ban test.

**Acceptance criteria:**

- Authentication test matrix.
- Session revocation test matrix.
- GoTrue integration test plan.
- AAL2 verification.
- Authorization regression evidence.

### SRAP-07 — Receipt and Storage Lifecycle Security

- **Linked gap:** GAP-08
- **Priority:** HIGH
- **Status:** NOT TESTED

**Address:**

- Private receipt bucket.
- Receipt access control.
- File-path authorization.
- PDF restrictions.
- Size restrictions.
- Receipt retention decision.
- Storage deletion lifecycle.
- Orphaned files.
- Unauthorized access.
- Signed URL lifecycle.

**Dependencies:**

- Retention owner decision; storage test discipline.

**Acceptance criteria:**

- Storage lifecycle design.
- Unauthorized access test cases.
- Authorized access test cases.
- Retention/deletion decision.
- Orphaned-file handling plan.

### SRAP-08 — Notifications and WhatsApp Security

- **Linked gap:** GAP-09
- **Priority:** MEDIUM
- **Status:** NOT IMPLEMENTED / BLOCKED

**Address:**

- Member consent.
- WhatsApp provider selection.
- Provider security.
- Credential handling.
- Message content privacy.
- Inactivity messaging.
- Duplicate prevention.
- Delivery logs.
- Template management.
- Receptionist permissions.
- Opt-out behavior.
- Rate limits.
- Error handling.

**Dependencies:**

- Owner decision (OD-12); provider/legal decisions (L-4).

**Acceptance criteria:**

- Notification privacy requirements.
- Consent requirements.
- Duplicate prevention design.
- Safe logging design.
- Provider readiness checklist.

### SRAP-09 — Backup and Recovery Readiness

- **Linked gap:** GAP-14 (final master extended register)
- **Priority:** HIGH
- **Status:** NOT TESTED / BLOCKED

**Address:**

- Daily backups.
- Encryption.
- Access restrictions.
- Backup retention.
- Database backups.
- Storage backups.
- Recovery point objective.
- Recovery time objective.
- Restore testing.
- Backup verification.
- Provider plan limitations.

**Dependencies:**

- Infrastructure/legal decisions; backup capability verification.

**Acceptance criteria:**

- Backup inventory.
- Verified backup strategy.
- Storage backup coverage.
- Restore-test plan.
- Recovery evidence requirements.

### SRAP-10 — Monitoring and Incident Response

- **Priority:** MEDIUM
- **Status:** DESIGN VERIFIED / ASSESSED

**Address:**

- Authentication abuse.
- Unauthorized access.
- Staff misuse.
- Failed authorization.
- Payment manipulation.
- QR attendance abuse.
- Storage access abuse.
- Privacy incidents.
- Database failures.
- Notification failures.

**Address (define):**

- Security logging requirements.
- Alerting priorities.
- Incident classification.
- Escalation.
- Incident containment.
- Evidence preservation.
- Response responsibilities.

**Dependencies:**

- Audit design; operational design.

**Acceptance criteria:**

- Security logging design.
- Alerting design.
- Incident response design/evidence.

### SRAP-11 — Final Security Release Gate

- **Priority:** RELEASE BLOCKER
- **Status:** NOT SATISFIED

**Purpose:**

Define mandatory gates that must be satisfied before production security approval.

**Mandatory gate areas:**

- Owner decisions.
- Legal/accounting decisions.
- Critical and high security gaps.
- Privacy controls.
- Retention controls.
- Authentication.
- RLS.
- Storage.
- Notifications.
- Backup and restore.
- Hosted verification.
- Regression testing.
- Independent security review.
- Risk acceptance.
- Deployment approval.

**Boundary:**

- Production approval must not occur automatically.

---

## Section E — Dependency Graph

Execution order must respect dependencies and safety boundaries.

Key dependency statements (derived from authoritative reports):

1. Retention/privacy execution (GAP-02 / GAP-13) must not precede resolution of GAP-01 (consent evidence preservation) and Owner retention decisions (OD retention set).
2. Inactive-member deletion must not precede resolution of GAP-03 (inactivity boundary, OD-7) and retention decisions (H4).
3. Hosted initialization (GAP-05) must not precede migration-history reconciliation (M3 remediation path) and Owner approval (D-3/D-4).
4. Migration-safety remediation (GAP-04 / M3) is the most immediate technical de-risking step and has no known hard blocker, but should follow backup/export discipline.
5. Dependency upgrades (GAP-10 / R-3) require compatibility assessment before any staged upgrade.

Dependency graph summary:

- **Gate before SRAP-01 implementation:** Owner/legal/external decisions (L-6).
- **Gate before SRAP-02 implementation:** Owner/legal retention decisions.
- **Gate before SRAP-03 decision resolution:** Owner decision (OD-7).
- **Gate before SRAP-04 remediation:** Backup/export discipline; forward-only discipline; no historical edits without documented necessity.
- **Gate before SRAP-05 hosted work:** Migration-history reconciliation; Owner approval.
- **Gate before SRAP-06 hosted validation:** Owner/hosted control; manual verification capability.
- **Gate before SRAP-07 lifecycle implementation/testing:** Retention owner decision; storage test discipline.
- **Gate before SRAP-08 notification implementation:** Owner decision (OD-12); provider/legal (L-4).
- **Gate before SRAP-09 restore drills:** Infrastructure/legal decisions.
- **Gate before SRAP-11 release:** All critical/high conditions remediated or formally risk-accepted by authorized decision-makers; all workstreams accepted.

Independent parallelizable workstreams (where prerequisites allow):

- Documentation and readiness analysis.
- Migration-safety de-risking preparation (without implementation until backup/export discipline confirmed).

---

## Section F — Owner Decision Register

The SRAP consolidates existing Owner decisions and open decision points. It does not create new Owner decisions.

| Decision ID | Question | Current State | Required Decision | Risk if Unresolved | Blocking Workstreams |
|---|---|---|---|---|---|
| OD-1 | Attendance retention cutoff boundary | Pending (OD set) | Owner decision | Retention integrity | SRAP-02 |
| OD-2 | Timezone for retention boundaries | Pending (OD set) | Owner decision | Retention correctness | SRAP-02 |
| OD-3 | Attendance delete/archive/anonymize authority | Pending (OD set) | Owner decision | Data governance | SRAP-02 |
| OD-4 | Audit purge authority | Pending (OD set) | Owner decision | Audit integrity | SRAP-02, SRAP-10 |
| OD-5 | Retention evidence requirements | Pending (OD set) | Owner decision | Evidence chain | SRAP-02 |
| OD-6 | Receipt retention | Pending (OD set) | Owner decision | Retention/governance | SRAP-02, SRAP-07 |
| OD-7 | Inactivity boundary (30 vs `> 30`) | **OWNER DECISION REQUIRED** | Owner decision | Classification/retention correctness | SRAP-03, SRAP-02 |
| OD-8 | Privacy request execution authority | Pending (OD set) | Owner decision | Legal/privacy execution | SRAP-02, SRAP-09 |
| OD-9 | Receipt regeneration authority | Pending (OD set) | Owner decision | Financial/audit | SRAP-02, SRAP-07 |
| OD-10 | Consent withdrawal semantics | Pending (OD set) | Owner decision | Privacy/legal | SRAP-01, SRAP-02 |
| OD-11 | Backup/restore decisions | Pending (OD set) | Owner decision | Recovery | SRAP-09 |
| OD-12 | WhatsApp notification policy | Pending (OD set) | Owner decision | Notification/legal | SRAP-08 |
| D-1 / D-2 | Retention durations / financial-audit retention posture | Pending | Owner/legal decision | Retention/financial integrity | SRAP-02 |
| D-3 / D-4 | Hosted initialization approval / migration reconciliation | Pending / BLOCKED | Owner decision / reconciliation | Operational readiness | SRAP-05 |
| D-05 | Security finding decision (M3 migration risk) | Pending Owner decision | Owner decision | Migration safety | SRAP-04 |
| D-06 | Security finding decisions (M1/M2) | Decided and documented (Stage 2H) | — | — | Closed |

### 2. Owner decision summary for the SRAP

- No new Owner decision is to be made during this documentation phase.
- Open Owner decisions relevant to SRAP implementation are listed above and must be resolved before dependent workstreams begin implementation.

---

## Section G — External Dependency Register

| Dependency | Requirement | Status | Impact / Gate |
|---|---|---|---|
| L-01 | Final privacy policy text + lawful basis | Pending legal/privacy review | Legal review required |
| L-02 | Consent capture/versioning/withdrawal semantics | Pending owner/legal decision | Owner + legal |
| L-3 | Legal retention periods and deletion obligations | Pending legal/privacy review | Legal |
| L-4 | Notification consent handling | Pending legal/privacy review | Legal |
| L-5 | Financial retention & accounting retention rules | Pending legal/accounting review | Accounting/legal |
| L-6 | Consent/privacy evidence preservation & auth-user deletion CASCADE issue | **EXTERNAL VALIDATION REQUIRED**; **BLOCKED** pending decision | External legal/provider validation |
| Hosted auth-server hardening verification | Password policy, email confirmations, secure password change, CAPTCHA, MFA server | **NOT TESTED / NEEDS MANUAL VERIFICATION** | Owner-controlled; hosted verification |
| Backup/restore validation | Restore drills and evidence | **NOT TESTED / BLOCKED** | Infrastructure/legal decisions |
| GoTrue ban integration | Live auth user + Auth admin API | **NOT TESTED** | Future authorized integration test |
| WhatsApp provider behaviour | Provider selection/credentials/consent | **NOT IMPLEMENTED / BLOCKED** | Owner decision + provider/legal |

---

## Section H — Execution Roadmap

Roadmap stages must be executed in dependency order and must not start blocked prerequisites.

| Stage | Objective | Workstream focus | Prerequisites | Exit criteria |
|---|---|---|---|---|
| Stage 1 | Migration safety de-risking posture | SRAP-04 | Backup/export discipline; forward-only discipline | Migration risks classified; recovery documented; tests passed |
| Stage 2 | Privacy evidence remediation planning / gated work | SRAP-01 | Owner/legal/external decisions | Approved preservation model |
| Stage 3 | Retention design / gated work | SRAP-02 | Owner/legal retention decisions | Approved retention policy |
| Stage 4 | Inactivity boundary resolution | SRAP-03 | Owner decision (OD-7) | Owner-approved policy/impl |
| Stage 5 | Hosted initialization readiness | SRAP-05 | Migration reconciliation; Owner approval | Hosted init readiness cleared |
| Stage 6 | Hosted auth hardening validation | SRAP-06 | Owner/hosted control | Hosted auth hardening verified |
| Stage 7 | Receipt / Storage lifecycle | SRAP-07 | Retention owner decision; storage discipline | Lifecycle design/evidence |
| Stage 8 | WhatsApp notification security | SRAP-08 | Owner decision (OD-12); provider/legal (L-4) | Notification design approved |
| Stage 9 | Backup / restore validation | SRAP-09 | Infrastructure/legal decisions | Restore drills/evidence |
| Stage 10 | Monitoring / incident response | SRAP-10 | Audit/ops design | Logging/alert/incident design |
| Stage 11 | Final security release gate | SRAP-11 | Completion of prior stages/conditions | Mandatory gates satisfied; production approval |

Roadmap constraints:

- No stage may bypass an unresolved Owner, legal, accounting, or external validation dependency.
- No destructive retention/deletion/erasure execution may occur without separately approved operational plan.
- No hosted/production action may occur during planning or implementation without explicit authorization.

---

## Section I — Risk Register

| Risk ID | Description | Severity | Mitigation / Current control | Residual risk | Release blocking |
|---|---|---|---|---|---|
| GAP-01 | Consent/privacy evidence loss via auth-user cascade | High | Design analysis completed; remediation blocked pending decisions | High if auth-user deletion ever executed | Yes |
| GAP-02 | Retention/purge execution misapplication | Medium | Protected state verified; execution blocked | Medium | Yes (retention execution) |
| GAP-03 | Inactivity boundary divergence | Medium | Classification-only today | Medium | Yes (before deletion work) |
| GAP-04 | Migration reapply/partial failure | Medium | Forward-only posture executed/verified; historical gaps immutability-blocked | Medium | Conditional (historical gaps) |
| GAP-05 | Hosted initialization blocked | High (operational) | Migration reconciliation required; owner approval withheld | High | Yes |
| GAP-06 | Hosted auth hardening unverified | High (auth posture) | Local AAL2 verified; hosted not tested | High | Yes (hosted) |
| GAP-07 | GoTrue ban integration unverified | Medium | DB revocation verified | Medium | Yes (auth hardening) |
| GAP-08 | Storage receipt lifecycle unverified | Low–Medium | M2 remediated; lifecycle not tested | Low–Medium | Yes (lifecycle) |
| GAP-09 | WhatsApp notification security | Medium | Design assessed; not implemented/blocked | Medium | Yes (notification) |
| GAP-10–14 | Extended residual items | Various | Dispositioned in final master | Various | Per disposition |

---

## Section J — Evidence Requirements

For SRAP workstream closure, the following evidence is required:

| Workstream | Required closure evidence |
|---|---|
| SRAP-01 | Approved preservation model; synthetic consent/privacy preservation tests; FK behavior; audit evidence; legal/owner sign-off |
| SRAP-02 | Approved retention policy; synthetic retention tests; dry-run evidence; audit evidence; deletion authority approval |
| SRAP-03 | Owner-approved boundary; boundary tests; policy/impl agreement |
| SRAP-04 | Migration reapply/partial-failure evidence; recovery evidence; regression tests |
| SRAP-05 | Hosted init readiness; migration reconciliation evidence; owner approval |
| SRAP-06 | Hosted auth hardening test evidence; AAL2 server verification; GoTrue ban test evidence |
| SRAP-07 | Storage lifecycle test evidence; access-control test evidence; retention decision |
| SRAP-08 | Notification consent/privacy design evidence; duplicate prevention design; provider readiness |
| SRAP-09 | Backup inventory; restore drill evidence; backup verification |
| SRAP-10 | Security logging; alerting; incident response design/evidence |
| SRAP-11 | All prior workstream acceptance evidence; independent review; risk acceptance; deployment approval |

General evidence rules:

- Historical results remain labeled historical.
- No report is accepted as evidence for an unexecuted test.
- Hosted evidence is separate from local evidence.
- Synthetic-only fixtures are required for destructive-capable tests.

---

## Section K — Production Readiness Criteria

The application is not production-security-ready merely because local tests pass, RLS is enabled, or a report exists.

Mandatory production readiness gates include:

1. Final security verdict upgraded appropriately (not falsely upgraded).
2. All critical/high gaps remediated or formally risk-accepted by authorized decision-makers.
3. Owner decisions resolved or formally recorded with acceptance.
4. Legal/accounting reviews completed or formally documented as outstanding with risk acceptance.
5. Privacy/consent evidence controls verified.
6. Retention/deletion controls verified with approvals.
7. Authentication/MFA/session controls verified and hosted validation completed when required.
8. Database/RLS/security-definer controls verified.
9. Storage/receipt controls verified.
10. Notification controls verified or deliberately out of scope with documented acceptance.
11. Backup/restore verified or formally accepted.
12. Regression tests green.
13. Independent security review completed.
14. Deployment approval obtained.

Production approval must not occur automatically from SRAP completion.

---

## Section L — Final Document Quality

The SRAP must:

- Be technically detailed where action is required.
- Avoid duplicate findings.
- Preserve canonical gap IDs.
- Distinguish implementation from verification.
- Distinguish Owner decisions from technical tasks.
- Distinguish local testing from hosted testing.
- Preserve unresolved blockers.
- Avoid claiming compliance.
- Avoid invented approvals.
- Avoid invented test results.
- Be suitable as the authoritative next security roadmap.

---

## Section M — Final Verification

After writing this document, the following final verification checks were performed:

1. Confirmed `docs/SECURITY_READINESS_ACTION_PLAN.md` did not previously exist.
2. Confirmed authoritative inputs were read and reconciled.
3. Confirmed required SRAP sections A through N are present.
4. Confirmed GAP-01 through GAP-09 are represented.
5. Confirmed Owner Decision Register and External Dependency Register are included.
6. Confirmed workstreams include dependencies and acceptance criteria.
7. Confirmed no unresolved finding was silently closed.
8. Confirmed production readiness is not falsely declared.
9. Confirmed documentation-only scope.

Git diff inventory at time of final verification:

- Modified pre-existing files: `gym-management-app/package.json`, `gym-management-app/package-lock.json` (pre-existing R-3A changes; preserved).
- Newly created untracked files: final master report, Batch 2A–2M reports, Batch 2 data-retention closure report, `supabase/tests/0014_migration_safety_validation.sql` (authored in R-2), and the new SRAP file.
- No source, migration, schema, RLS, function, policy, trigger, grant, Storage, dependency, retention, deletion, erasure, authentication, or operational file was modified during the SRAP phase.

---

## Section N — Completion Report

| Item | Value |
|---|---|
| Status | **SECURITY READINESS ACTION PLAN — COMPLETE** |
| Document path | `docs/SECURITY_READINESS_ACTION_PLAN.md` |
| Sections created | Section A through Section N (Executive Summary, Authoritative Current Security Status, Canonical Gap Register, Prioritized Workstreams, Dependency Graph, Owner Decision Register, External Dependency Register, Execution Roadmap, Risk Register, Evidence Requirements, Production Readiness Criteria, Final Document Quality, Final Verification, Completion Report) |
| Gap coverage | GAP-01 through GAP-09 represented; GAP-10–GAP-14 referenced from final master register |
| Dependency roadmap | Included in Sections E and H |
| Owner decisions preserved | Yes — OD-1…OD-12, D-1…D-6, D-05/D-06, L-1…L-6 |
| External registers included | Yes — legal/external dependency register in Section G |
| Git diff inventory | SRAP new file; pre-existing package modifications preserved; no new source/migration/config/dependency files |
| Documentation-only scope | Confirmed — no implementation started in this phase |
| Implementation started | **NO** |
| Commit / push / deploy | **NO** |
| Limitations | Hosted/production validation not performed; `0010` not executed fresh in final phase; destructive actions and real-data fixtures excluded |

---

## Final Status

**SECURITY READINESS ACTION PLAN — COMPLETE**

The Security Readiness Action Plan deliverable has been completed within its documentation-only scope.

- Final security verdict: **SECURITY PASS WITH CONDITIONS**.
- Application is **not** yet production-security-ready.
- Remaining critical conditions: GAP-01 (BLOCKED), GAP-02 (BLOCKED), GAP-03 (OWNER DECISION REQUIRED), GAP-05 (BLOCKED), GAP-06 (NOT TESTED); residual technical condition: GAP-04 (PARTIALLY COMPLETE); deferred/not-tested: GAP-07/GAP-08/GAP-09.

## Stop Condition

After completion of this deliverable:

- Stop all SRAP implementation work.
- Do not begin implementing remediation tasks automatically.
- Do not commit, push, or deploy.
- Do not perform destructive retention/deletion/erasure actions.
- Do not access hosted/production systems.
- Do not claim full security or legal compliance.

Await the user's next explicit instruction before any further action.

---

## Section O — Master Security Readiness Execution Outcome (SRAP-01 through SRAP-11)

The MASTER SECURITY READINESS EXECUTION — SRAP-01 through SRAP-11 concluded with the following consolidated workstream outcome:

- SRAP-01: COMPLETED WITH CONDITIONS (investigation/design complete; remediation implementation BLOCKED pending Owner/legal/external decisions).
- SRAP-01A: COMPLETE — AWAITING APPROVAL.
- SRAP-02: IN PROGRESS / DESIGN (retention/lifecycle implementation gated).
- SRAP-03: BLOCKED (Owner decision required — OD-7).
- SRAP-04: PARTIALLY COMPLETE (forward-only executed/verified; historical gaps immutability-blocked).
- SRAP-05: BLOCKED (hosted initialization).
- SRAP-06: COMPLETED WITH CONDITIONS (local auth verified; hosted not tested).
- SRAP-07: PARTIALLY COMPLETE (M2 verified; lifecycle not tested).
- SRAP-08: BLOCKED (notifications).
- SRAP-09: BLOCKED / NOT TESTED (backup/restore).
- SRAP-10: IN PROGRESS / DESIGN (monitoring).
- SRAP-11: NOT SATISFIED (final release gate pending).

Authoritative final SRAP report: `docs/FINAL_SRP_SECURITY_READINESS_REPORT.md`.

The final SRAP security readiness verdict: **SECURITY PASS WITH CONDITIONS — NOT PRODUCTION READY.**

---

*End of SECURITY READINESS ACTION PLAN.*

*Documentation-only deliverable. No source, migration, schema, RLS, function, policy, trigger, grant, Storage, dependency, retention, deletion, erasure, authentication, or operational change was performed. No real member, attendance, payment, staff, consent, or privacy-request data was used as a fixture. No hosted/production access occurred. No commit, push, or deploy occurred.*
