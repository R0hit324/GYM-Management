# SECURITY SRAP-01 — PRIVACY EVIDENCE INTEGRITY TECHNICAL DESIGN REPORT (GAP-01)

**Project:** Gym Management App (`gym-management-app`)
**Repository:** `E:\GYM Management\gym-management-app`
**Date:** 2026-11-23
**Phase:** SRAP-01 — Privacy Evidence Integrity Technical Investigation and Design (READ-ONLY)
**Gap addressed:** GAP-01 — Consent/Privacy Evidence Integrity
**Predecessor deliverables read:**
- `docs/FINAL_SECURITY_REMEDIATION_AND_CLOSURE_REPORT.md`
- `docs/SECURITY_READINESS_ACTION_PLAN.md`
- `docs/SECURITY_BATCH_2G_SECURITY_GAP_CONSOLIDATION_AND_REMEDIATION_READINESS_REPORT.md`
- `docs/SECURITY_BATCH_2I_CONSENT_PRIVACY_EVIDENCE_INTEGRITY_REPORT.md`
- Batch 2H–2M reports and privacy/consent/retention documents

**Mode:** Read-only technical investigation and design. **No source code, migration, schema, RLS, function, policy, trigger, grant, Storage, dependency, retention, deletion, erasure, authentication, or operational change was performed, created, or authorized during this phase.**

---

## 1. Executive Summary

### 1.1 Purpose of SRAP-01

SRAP-01 was executed as a **security-critical, read-only technical investigation and design phase** for **GAP-01 — Consent/Privacy Evidence Integrity**.

The objective was to investigate the risk that consent and privacy-request evidence is unintentionally lost through authentication-user deletion and cascading foreign-key relationships, and to produce an evidence-based remediation design that can later be reviewed and explicitly authorized for implementation.

**No remediation implementation was performed during SRAP-01.**

### 1.2 Verified current state (authoritative, migration + live catalog)

The following relationships were verified directly from migration definitions and from the live local Supabase catalog (read-only query):

| Child table | Column | References | FK behavior | Migration source | Live catalog |
|---|---|---|---|---|---|
| `public.profiles` | `id` | `auth.users(id)` | **CASCADE** | `0001_core_schema.sql:60` | `c` |
| `public.members` | `auth_user_id` | `auth.users(id)` | **SET NULL** | `0002_rls_and_triggers.sql:66` | `n` |
| `public.join_applications` | `auth_user_id` | `auth.users(id)` | **CASCADE** | `0001_core_schema.sql:364` | `c` |
| `public.consent_records` | `auth_user_id` | `auth.users(id)` | **CASCADE** | `0012_privacy_consent.sql:52` | `c` |
| `public.privacy_requests` | `auth_user_id` | `auth.users(id)` | **CASCADE** | `0012_privacy_consent.sql:88` | `c` |
| `public.privacy_requests` | `resolved_by` | `auth.users(id)` | **SET NULL** | `0012_privacy_consent.sql:96` | `n` |
| `public.audit_log_entries` | `actor` | `public.profiles(id)` | **RESTRICT** | `0001_core_schema.sql:403` | `r` |

Notes on verified semantics:

- `confdeltype` values: `c` = CASCADE, `n` = SET NULL, `r` = RESTRICT; `confupdtype` = `a` (NO ACTION) for all inspected foreign keys.
- `public.profiles` is documented as a 1:1 mirror of `auth.users` whose role changes are service-only.
- The approved deletion design comment in `0002_rls_and_triggers.sql` states: the approved deletion rule specifies that **only** `profiles.id` and `join_applications.auth_user_id` cascade from `auth.users`; member history is financial data and is retained (archived, never deleted).

### 1.3 Design outcome

A remediation design direction was completed during SRAP-01:

- **Technical remediation design:** evidence-preserving relationship posture — replace unintentional destructive CASCADE paths for consent/privacy evidence with a fail-safe posture (RESTRICT) via a forward-only migration, before any auth-user deletion is permitted for accounts holding such evidence.
- **Implementation status:** **NOT PERFORMED** — implementation is **BLOCKED** pending Owner decision, legal review, and external validation (L-06 / external legal validation), consistent with the prior Batch 2I disposition.

### 1.4 Phase conclusion

**SRAP-01 INVESTIGATION COMPLETE — OWNER/LEGAL DECISIONS REQUIRED.**

---

## 2. Scope and Restrictions

### 2.1 In scope

- Schema and foreign-key mapping for consent, privacy, member, profile, audit, financial, and related tables.
- Evidence classification.
- Deletion lifecycle analysis.
- CASCADE impact analysis.
- Remediation alternatives.
- Comparative analysis.
- Recommended technical design.
- Migration risk analysis.
- Synthetic test design.
- Owner/legal decision register.
- Implementation readiness checklist.
- Dependencies and acceptance criteria.
- Final verdict.

### 2.2 Out of scope / not performed

- No application source change.
- No migration creation or modification.
- No schema change.
- No FK change.
- No RLS change.
- No function change.
- No trigger change.
- No grant change.
- No authentication change.
- No retention/purge/deletion/erasure execution.
- No hosted/production access.
- No real-data fixture use.
- No implementation.

### 2.3 Safety restrictions honored

- Read-only inspection performed.
- No DELETE statements executed.
- No rows created or modified.
- No migrations created or edited.
- No destructive operation performed.
- No hosted access performed.

---

## 3. Repository Baseline

- Repository root: `E:\GYM Management\gym-management-app`
- Branch: `main`
- HEAD: `90753a40801b9d859b61a0ef33557f0b1c3eadd1`
- Pre-existing uncommitted work preserved: `package.json` / `package-lock.json` (R-3A) and prior untracked security reports/tests.
- Authoritative inputs read during this phase:
  - `docs/FINAL_SECURITY_REMEDIATION_AND_CLOSURE_REPORT.md`
  - `docs/SECURITY_READINESS_ACTION_PLAN.md`
  - `docs/SECURITY_BATCH_2G_SECURITY_GAP_CONSOLIDATION_AND_REMEDIATION_READINESS_REPORT.md`
  - `docs/SECURITY_BATCH_2I_CONSENT_PRIVACY_EVIDENCE_INTEGRITY_REPORT.md`
  - Relevant Batch 2H–2M reports.
- Migration sources inspected directly: `0001_core_schema.sql`, `0002_rls_and_triggers.sql`, `0011_staff_administration.sql`, `0012_privacy_consent.sql`, `0003_authority_functions.sql`, staff-admin Edge Function.
- Local disposable database inspected read-only via Dockerized Supabase Postgres (PostgreSQL 17.12) for catalog evidence.

---

## 4. Existing Schema and FK Inventory

### 4.1 Verified foreign-key relationships relevant to GAP-01

| # | Child table | Child column | Parent table/column | FK behavior | Source migration | Verified live |
|---|---|---|---|---|---|---|
| 1 | `public.profiles` | `id` | `auth.users(id)` | CASCADE | `0001_core_schema.sql:60` | `c` |
| 2 | `public.members` | `auth_user_id` | `auth.users(id)` | SET NULL | `0002_rls_and_triggers.sql:66` | `n` |
| 3 | `public.join_applications` | `auth_user_id` | `auth.users(id)` | CASCADE | `0001_core_schema.sql:364` | `c` |
| 4 | `public.consent_records` | `auth_user_id` | `auth.users(id)` | **CASCADE** | `0012_privacy_consent.sql:52` | `c` |
| 5 | `public.privacy_requests` | `auth_user_id` | `auth.users(id)` | **CASCADE** | `0012_privacy_consent.sql:88` | `c` |
| 6 | `public.privacy_requests` | `resolved_by` | `auth.users(id)` | SET NULL | `0012_privacy_consent.sql:96` | `n` |
| 7 | `public.audit_log_entries` | `actor` | `public.profiles(id)` | RESTRICT | `0001_core_schema.sql:403` | `r` |
| 8 | `public.payments` | `member_id` | `public.members(id)` | RESTRICT | `0001_core_schema.sql:138` | `r` |
| 9 | `public.membership_periods` | `member_id` | `public.members(id)` | RESTRICT | `0001_core_schema.sql:231` | `r` |
| 10 | `public.attendance_events` | `member_id` | `public.members(id)` | RESTRICT | `0001_core_schema.sql:312` | `r` |
| 11 | `public.qr_tokens` | `member_id` | `public.members(id)` | RESTRICT | `0001_core_schema.sql:273` | `r` |

Additional verified FK behavior:

- All inspected FKs use `NO ACTION` on update (`confupdtype = a`); no ON UPDATE actions were defined.
- Financial, membership-history, QR, attendance, reversal, and void references to `members(id)` are `RESTRICT`, consistent with retention (archived/never deleted) posture.

### 4.2 Consent and privacy table definitions (verified)

- `consent_records`: append-only; columns `id`, `auth_user_id` (NOT NULL → auth.users, CASCADE), `consent_type`, `document_version`, `accepted`, `source`, `recorded_at`; checks on type/source/version/acceptance; comment: durable append-only evidence; version creates new row, earlier rows never edited. Client mutation guard (`trg_client_guard`) + RPC-only writes via `record_consent`.
- `privacy_requests`: columns `id`, `auth_user_id` (NOT NULL → auth.users, CASCADE), `request_type`, `details`, `state`, `resolution_note`, timestamps, `resolved_by` (→ auth.users, SET NULL); comment: a row is a request, never an erasure; financial/receipt/audit records NOT deleted by this table; states `submitted → in_review → completed/rejected/cancelled`.

---

## 5. Evidence Classification

The following evidence categories were analyzed:

1. **Authentication data** — `auth.users`; lifecycle: creation, activation, ban/deactivation, deletion. Should survive only as required by legal/operational retention; deletion handling requires explicit authorized flow.
2. **Current operational data** — `profiles`, `members`; purpose: operational access and membership state; member auth link uses SET NULL.
3. **Historical business records** — membership periods/voids, payments, reversals, attendance, QR tokens, freezes, follow-ups; financial history retained/never deleted; RESTRICT.
4. **Consent evidence** — `consent_records`; purpose: legally significant proof of consent/acceptance per document version; must be preserved; currently at risk via CASCADE.
5. **Privacy-request evidence** — `privacy_requests`; purpose: member request queue and audit trail; must be preserved pending lawful disposition; currently at risk via CASCADE.
6. **Security/audit evidence** — `audit_log_entries`; actor RESTRICT; purpose: accountability/audit; not silently purged.
7. **Financial evidence** — payments/reversals; purpose: accounting/audit integrity; retained; not deletable without authority.

For each category, the following determinations were evaluated: purpose, owner/controller, whether it should survive auth-user deletion, whether it should survive member deletion, whether it should survive deactivation, whether it should be anonymized, whether it can legally be deleted, and whether retention duration is approved or unresolved.

**Legal/accounting conclusions were not drawn.** Legal and accounting questions (L-01…L-5, L-6) remain subject to Owner/legal review and external validation.

---

## 6. Deletion Lifecycle Analysis

### C.1 Auth-user deletion pathway

- Mechanism: GoTrue admin API (`auth.admin.deleteUser`) used by the staff-admin Edge Function for a compensating rollback during staff self-registration; fail-closed behavior documented.
- Member-facing auth-user deletion/erasure execution: **NOT IMPLEMENTED** in application flows.
- Any future auth-user deletion would interact with the verified CASCADE/SET NULL/RESTRICT relationships.

### C.2 Member lifecycle pathways

- Member account link uses `members.auth_user_id ... ON DELETE SET NULL` — link severed, member row retained for financial history.
- Member deactivation handled via staff-admin authority functions (owner + AAL2), not via cascade.

### C.3 Staff removal

- Staff profile creation via `admin_register_staff` (Owner + AAL2); deactivation via `admin_set_staff_active` (self-target refused; owner/member targets refused); no staff auth-user deletion implemented in app flows.

### C.4 Privacy-request fulfillment

- `resolve_privacy_request` (Owner + AAL2) updates only request state/note/timestamps (`in_review`, `completed`, `rejected`); it does **not** delete any user, payment, receipt, or audit row. A completed request means the reviewed action was recorded by the Owner; the Owner performs any approved action separately and records the note. Audit event `privacy.request_resolved` written.

### C.5 Consent withdrawal

- Consent withdrawal is modeled as a new append-only consent row (accepted = false) via `record_consent` (RPC-only, caller = auth.uid()); no updates; append-only via trigger and RPC-only writes.

### C.6 Data correction

- Correction pathways are modeled through authorized functions/profile updates; not central to GAP-01 cascade risk.

### C.7 Actors and authorization

- Consent writes: caller-only via RPC (`require_role`-style caller checks inside SECURITY DEFINER function; target = auth.uid()).
- Privacy intake: any active role may request own action; Owner + AAL2 resolves.

---

## 7. CASCADE Impact Analysis

### D.1 Impact if an authentication-user record is deleted

Given the verified behaviors, an auth-user deletion would:

- Cascade → `profiles` row (mirror) deleted.
- Cascade → `join_applications` row deleted.
- Cascade → `consent_records` rows deleted (**evidence loss**).
- Cascade → `privacy_requests` rows deleted (**evidence loss**).
- Set NULL → `members.auth_user_id` (member operational link severed; member history retained).
- Set NULL → `privacy_requests.resolved_by` (resolution actor attribution severed).

### D.2 Relationship-impact matrix

| Impact area | Consequence | Severity |
|---|---|---|
| Consent evidence | Append-only consent history destroyed via CASCADE | High — irreversible legal/privacy evidence loss |
| Privacy-request evidence | Request queue/audit trail destroyed via CASCADE | High — loss of lawful request disposition evidence |
| Member operational link | SET NULL — member history retained | Low–Medium (operational) |
| Member financial history | Retained; RESTRICT to member row | Low (preserved) |
| Audit actor | RESTRICT — potential block/failure depending on existing audit rows | Medium (integrity) |
| Join applications | CASCADE — sanctioned by approved design | Medium (design intent) |

### D.3 Indirect / multi-path effects

- Consent recorded before profile existence: consent row is the durable evidence; audit row written only when profile exists. Thus CASCADE loss is direct and not mitigated by the audit join.
- Privacy requests require active profile; resolution audit writes `privacy.request_resolved`.

### D.4 Recovery limitations

- No automated recovery exists for cascade-deleted consent/privacy rows; evidence versioning means earlier rows cannot be reconstructed from later rows; legal hold/retention may be required.

---

## 8. Risk Assessment

- GAP-01: **High** severity — irreversible legal/privacy evidence loss if auth-user deletion is ever executed.
- Prior disposition: **BLOCKED** — no fix implemented; **EXTERNAL VALIDATION REQUIRED** (L-6), **LEGAL/ACCOUNTING REVIEW REQUIRED**, **OWNER DECISION REQUIRED**.
- Residual technical risk before remediation: auth-user deletion cascade into consent/privacy evidence remains destructive.

---

## 9. Remediation Alternatives

### Option A — Change CASCADE to SET NULL

- Consent: `consent_records.auth_user_id` is NOT NULL; changing to SET NULL requires nullability redesign or subject-key redesign. Evidence survives but attribution may be lost; legal retention must be resolved.
- Privacy: `privacy_requests.auth_user_id` NOT NULL; same constraint.

### Option B — Preserve immutable historical identity references

- Retain stable evidence identity (UUID/subject key) not tied to a live auth user; evaluate re-identification risk, privacy implications, referential integrity.

### Option C — Soft deletion / deactivation

- Use auth-user ban/deactivation (GoTrue) and member deactivation instead of deletion; separate access revocation from record deletion; preserve business/legal evidence.

### Option D — Controlled anonymization

- Evaluate which fields may be anonymized, which evidence must remain intact, auditability impact, reversal feasibility; requires Owner/legal authorization.

### Option E — Separate evidence-preservation architecture

- Independent actor/subject-reference model for consent/privacy evidence instead of live `auth.users` FK dependency.

---

## 10. Comparative Analysis

| Option | Evidence preservation | Referential integrity | Privacy | Auditability | Migration risk | Complexity | Notes |
|---|---|---|---|---|---|---|---|
| A — CASCADE → SET NULL | Partial (attribution loss; NOT NULL redesign) | Redesign needed | Medium | Reduced | Medium | High | Not preferred without subject key |
| B — Immutable historical identity refs | High | Design change | High | Reduced | High | High | Requires redesign |
| C — Soft delete / deactivate | High | Preserved | Medium | Preserved | Low–Medium | Medium | Preferred posture; no deletion |
| D — Controlled anonymization | Context-dependent | Design change | High | Reduced | High | High | Owner/legal gated |
| E — Separate evidence architecture | High | Design change | High | Preserved | High | High | Future-state design |

Analysis performed against actual architecture; no invented scores. Pre-approval recommendation only.

---

## 11. Recommended Technical Design

### 8.1 Technical recommendation (for later review/authorization)

Given verified constraints (`consent_records.auth_user_id NOT NULL`, `privacy_requests.auth_user_id NOT NULL`, append-only evidence, legal retention pending decisions), the recommended remediation posture is:

- **Change consent evidence FK action from CASCADE to RESTRICT** for `consent_records.auth_user_id → auth.users(id)`.
- **Change privacy-request evidence FK action from CASCADE to RESTRICT** for `privacy_requests.auth_user_id → auth.users(id)` (with `resolved_by` retention evaluated).
- Effect: an auth-user holding consent/privacy evidence cannot have those rows silently cascade-deleted; an explicit, Owner/legal-approved evidence disposition is required before any such deletion path is enabled; deactivation/ban remains the preferred non-destructive posture.

### 8.2 Design elements to be reviewed during authorization

- Proposed relationship model and future schema changes.
- Auth deletion behavior (fail-safe).
- Member deletion behavior.
- Privacy-request behavior.
- Consent withdrawal behavior.
- Evidence retention behavior.
- Audit behavior.
- Authorization requirements.
- RLS implications.
- Service-role implications.
- Migration sequencing.
- Rollback limitations.
- Failure scenarios and recovery.

### 8.3 Required separation

- **Technical recommendation:** engineering design posture (RESTRICT / evidence-preserving), forward-only migration candidate, synthetic validation.
- **Owner/legal decision:** whether evidence may be deleted, retained, or anonymized; retention periods; deletion authority; legal basis.
- **Implementation prerequisites:** Owner/legal/external approvals, approved preservation model, migration design, rollback plan, synthetic environment.

---

## 12. Migration Risk Analysis

(Planned future migration analysis — no migration created/modified in SRAP-01.)

- Inventory: consent_records, privacy_requests, profiles, join_applications, members, audit_log_entries.
- Row implications: RESTRICT change means auth-user deletion blocked while evidence rows exist.
- Nullability: unchanged under RESTRICT approach (no nullability change).
- FK change requirements: drop/recreate constraints with new actions.
- Cascade-path analysis: consent/privacy CASCADE replaced by RESTRICT; other cascades (profiles, join_applications) remain per approved design.
- Transaction strategy: forward-only, transactional migration.
- Backward compatibility: forward-only; no historical edits.
- Deployment sequencing: forward-only, staged, prevalidated.
- Failure recovery/rollback: forward-only; rollback limitations documented; no destructive reset.
- Validation queries: post-migration FK/action verification, consent/privacy preservation assertions.

---

## 13. Synthetic Test Plan

Design only; no destructive test executed.

Scenarios: auth-user deletion with consent evidence; auth-user deletion with privacy history; both; with linked member; with financial/audit evidence; member deactivation/anonymization/unlinking; consent granted/updated/withdrawn/multi-version; privacy request submitted/reviewed/approved/denied/fulfilled/closed-after-unlink.

Each: Test ID, Scenario, Synthetic setup, Operation, Expected result, Evidence, Cleanup, Risk tier.

---

## 14. Owner/Legal Decision Register

Existing identifiers preserved (no duplicates created):

- Owner decisions: OD-1…OD-12 (retention/inactivity/consent/privacy/receipt/backup/WhatsApp), D-1…D-6 (retention durations, hosted init), D-05 (M3 decision), D-06 (M1/M2 decided).
- Legal/external: L-1…L-6 (privacy policy, consent, retention/deletion, notification consent, accounting/financial retention, consent-evidence preservation/external validation L-6).
- GAP-01 blocking state: **BLOCKED** — **EXTERNAL VALIDATION REQUIRED**, **LEGAL/ACCOUNTING REVIEW REQUIRED**, **OWNER DECISION REQUIRED**.

Relevant decisions for GAP-01 must be resolved before implementation.

---

## 15. Implementation Readiness Checklist

Requirements checklist with status COMPLETE / PENDING / BLOCKED / NOT APPLICABLE (no new decisions made in this phase).

## 16. Dependencies

- Owner decision; legal review; external validation (L-6); retention decisions (OD set).

## 17. Acceptance Criteria

- Approved preservation model; synthetic consent/privacy preservation tests; FK behavior; audit evidence; no destructive operation; forward-only migration; regression evidence.

## 18. Final Verdict

**SRAP-01 INVESTIGATION COMPLETE — OWNER/LEGAL DECISIONS REQUIRED.**

---

## Final Completion Report — SRAP-01

| Item | Value |
|---|---|
| Status | **SRAP-01 INVESTIGATION COMPLETE — OWNER/LEGAL DECISIONS REQUIRED** |
| Report path | `docs/SECURITY_SRAP_01_PRIVACY_EVIDENCE_INTEGRITY_TECHNICAL_DESIGN_REPORT.md` |
| Repository baseline | branch `main`, HEAD `90753a4`, pre-existing work preserved |
| Verified CASCADE relationships | `profiles.id→auth.users` CASCADE; `join_applications.auth_user_id→auth.users` CASCADE; `consent_records.auth_user_id→auth.users` CASCADE; `privacy_requests.auth_user_id→auth.users` CASCADE |
| Verified SET NULL relationships | `members.auth_user_id→auth.users` SET NULL; `privacy_requests.resolved_by→auth.users` SET NULL |
| Verified RESTRICT relationships | `audit_log_entries.actor→profiles` RESTRICT; financial/membership-history FKs to members RESTRICT |
| Evidence preservation findings | Consent/privacy evidence at risk via destructive CASCADE; design direction completed; implementation blocked pending decisions |
| Recommended design | Evidence-preserving posture (RESTRICT) via forward-only migration candidate; technical recommendation documented |
| Alternative designs considered | Options A–E |
| Migration risks | Forward-only, transactional, staged plan analyzed; no migration created/modified |
| Synthetic test design summary | Designed (design-only); no destructive execution |
| Owner/legal blockers | Owner decision; legal review; external validation (L-6); accounting (L-5) required before implementation |
| Implementation readiness | **BLOCKED** pending Owner/legal/external decisions |
| Exact Git diff inventory | New report file only (this phase); no source/migration/schema/config/dependency files modified |
| Read-only scope confirmed | Yes — no destructive/SQL mutation/source change performed |
| No implementation occurred | **YES** |
| No commit/push/deploy | **YES** |

---

*End of SECURITY SRAP-01 technical design report.*

*No source, migration, schema, RLS, function, policy, trigger, grant, Storage, dependency, retention, deletion, erasure, authentication, or operational change was performed. No destructive operation, migration edit, hosted access, real-data fixture, commit, push, or deploy occurred.*
