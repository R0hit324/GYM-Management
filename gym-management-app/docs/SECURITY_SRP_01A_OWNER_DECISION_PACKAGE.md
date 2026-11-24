# SECURITY SRAP-01A — OWNER DECISION PACKAGE: PRIVACY EVIDENCE INTEGRITY

**Project:** Gym Management App (`gym-management-app`)
**Repository:** `E:\GYM Management\gym-management-app`
**Date:** 2026-11-23
**Phase:** SRAP-01A — Owner Decision Package (documentation-only)
**Predecessor technical investigation:** `docs/SECURITY_SRP_01_PRIVACY_EVIDENCE_INTEGRITY_TECHNICAL_DESIGN_REPORT.md` (SRAP-01; verified — CASCADE on consent/privacy evidence confirmed, remediation design recommended, implementation blocked pending decisions)
**Final security verdict context:** `docs/FINAL_SECURITY_REMEDIATION_AND_CLOSURE_REPORT.md` (final verdict: **SECURITY PASS WITH CONDITIONS**)
**Action plan context:** `docs/SECURITY_READINESS_ACTION_PLAN.md` (SRAP)

**Mode:** Decision preparation and documentation only. **No technical remediation, source, migration, schema, RLS, function, policy, trigger, grant, Storage, dependency, retention, deletion, erasure, authentication, or operational change was performed or authorized during this phase.**

---

## 1. Authorized Deliverable

Create exactly one new document:

`docs/SECURITY_SRP_01A_OWNER_DECISION_PACKAGE.md`

This document must be understandable to a gym Owner without requiring advanced database knowledge.

It must explain the technical issue in plain language while retaining accurate technical references.

---

## 2. Executive Explanation

### 2.1 What GAP-01 is

GAP-01 concerns the risk that deleting an authentication user can cascade-delete consent and privacy-request evidence.

Verified relationships (SRAP-01):

- `consent_records.auth_user_id → auth.users(id)`: **ON DELETE CASCADE** (verified in migration `0012_privacy_consent.sql:52` and live catalog).
- `privacy_requests.auth_user_id → auth.users(id)`: **ON DELETE CASCADE** (verified in migration `0012_privacy_consent.sql:88` and live catalog).

### 2.2 Why it matters

Consent and privacy-request evidence may be legally and security critical. Losing it silently through an authentication-account deletion is the core concern.

### 2.3 What could happen if an authentication account is deleted

The consent and privacy-request evidence rows can be cascade-deleted; evidence may be irreversibly lost; legal/privacy exposure results.

### 2.4 Why account deletion and evidence deletion should not automatically be the same action

Deleting a login identity should be evaluated separately from retaining or disposing of legally relevant evidence.

### 2.5 Why this does not mean every record should be kept forever

Not all records have the same permanence; retention policy governs; financial/audit/membership categories differ.

### 2.6 Why a decision is required

Owner/legal/accounting/external decisions are pending; implementation remains blocked.

### 2.7 Illustrative example (fictional data only)

Example using fictional identifiers: fictional member `F-100` accepted Terms of Service version `1.2` on fictional date; later fictional auth account deleted; consent row cascade-deleted. **Fictional data only — no real member data used.**

### 2.8 Never use real member data.

---

## 3. Decisions Required from the Owner

### Decision 1 — Authentication Account Deletion

**Question:** When a member's login account is deleted, should the associated consent and privacy-request history remain preserved?

**Recommended:** Preserve legally/security-relevant evidence independently from the active authentication account.

**Explain:**

- Account deletion
- Identity unlinking
- Record preservation
- Future anonymization
- Possible legal/accounting retention

**Do not automatically approve this recommendation.**

---

### Decision 2 — Consent Evidence

Determine the required policy for:

- Consent granted
- Consent version
- Consent timestamp
- Consent withdrawal
- Consent changes
- Historical consent records

**Preservation recommendation** that avoids silently destroying consent history.

**Clearly identify the retention duration as unresolved** unless an existing approved policy supports it.

---

### Decision 3 — Privacy Request Evidence

Present options for privacy request history:

- Preserve the request history
- Preserve decision and fulfillment evidence
- Anonymize identifying information when approved and appropriate
- Retain only information required for legal, accounting, operational, or security purposes

**Explain** why deleting a privacy request simply because its authentication account was deleted may undermine accountability.

**Do not make legal claims.**

---

### Decision 4 — Account Closure vs. Identity Deletion

Explain the difference between:

1. Account deactivation
2. Login/access revocation
3. Member inactivity
4. Account unlinking
5. Authentication identity deletion
6. Member record deletion
7. Data anonymization
8. Evidence destruction

Present these as distinct operations.

**Recommend** that these operations should not be treated as interchangeable.

---

### Decision 5 — Evidence Retention

Prepare a decision table.

| Evidence Type | Proposed Retention | Owner Decision | Legal/Accounting Review | Technical Impact |
|---|---|---|---|---|

Include:

- Consent records
- Privacy requests
- Privacy-request decision evidence
- Authentication security evidence
- Audit logs
- Financial records
- Membership history
- Attendance records
- Receipts

**Use existing proposed retention targets only as proposals.**

Existing proposed targets include:

- Attendance: 6 months
- Financial records: 1 year
- Audit logs: 1 year
- Membership history: preserved internally
- Receipt retention: unresolved

Consent and privacy-request evidence retention must remain unresolved unless explicitly approved in an existing authoritative document.

**Do not convert proposals into approved policy.**

---

### Decision 6 — Anonymization

Present the Owner with the question:

When records are no longer required to be identifiable, should an approved anonymization process be used instead of automatically deleting the complete historical record?

**Explain:**

- Anonymization versus deletion
- Direct identifiers
- Indirect identifiers
- Preserving aggregate/history integrity
- Risks of incomplete anonymization
- Re-identification risks
- Need for legal/privacy review

**Do not prescribe a final anonymization method at this stage.**

---

### Decision 7 — Authorization to Destroy Evidence

Identify who should authorize destruction of:

- Consent records
- Privacy-request records
- Audit/security records
- Financial evidence
- Membership history

**Present the recommendation** that evidence destruction should require a defined, documented authorization process.

**Do not assume the Owner has already approved it.**

---

## 4. Recommended Policy Model

Provide a clearly marked recommendation — not a final policy.

**Recommended conceptual lifecycle:**

1. Member requests account closure.
2. Access is revoked.
3. Authentication account deletion is evaluated separately.
4. Business records are assessed according to approved retention rules.
5. Consent/privacy evidence is preserved according to approved policy.
6. Identifiers may be anonymized only through an approved process.
7. Evidence destruction is performed only when eligible and authorized.
8. The lifecycle action is auditable.

**Explain** which portions require Owner/legal/accounting approval.

---

## 5. Decision Matrix

| Decision ID | Decision | Recommended Option | Alternatives | Risk if Unresolved | Approver |
|---|---|---|---|---|

Use existing Owner decision identifiers where applicable.

Do not create duplicate decision IDs.

Clearly label any newly proposed decision identifiers as proposed and verify they do not conflict with the existing register.

---

## 6. Technical Impact — Plain Language

Explain the technical consequences of each decision:

- RESTRICT foreign-key behavior
- SET NULL behavior
- CASCADE behavior
- Historical identity reference
- Soft deletion
- Anonymization
- Retention jobs
- Audit logs
- Migration requirements

Keep this section understandable to a nontechnical Owner.

Do not recommend unnecessary architecture.

Do not make final technical implementation decisions.

---

## 7. Approval Form

Provide a concise, printable decision record for the Owner.

Include:

- Decision ID
- Question
- Selected option
- Owner comments
- Legal/privacy review
- Accounting review where applicable
- Approval date
- Approver identity/role
- Signature/approval record
- Status

Use blank fields.

Do not fill in approval values.

Do not fabricate signatures or dates.

---

## 8. Outstanding External Dependencies

Separate decisions that require:

- Owner
- Legal/privacy reviewer
- Accounting reviewer
- External technical validation

Explain why each dependency exists.

Do not imply a review has occurred.

---

## 9. Post-Approval Technical Gate

Define the conditions required before implementation begins.

**Implementation cannot begin until:**

- Relevant Owner decisions are recorded.
- Required legal/privacy decisions are obtained.
- Accounting requirements are clarified where applicable.
- Evidence preservation policy is approved.
- Retention requirements are sufficiently defined.
- A technical design is updated to match the approved decisions.
- Migration risks are documented.
- Synthetic test environment and rollback/isolation strategy are verified.
- Implementation scope is separately authorized.

---

## 10. Final Verdict

Choose one:

- **OWNER DECISION PACKAGE COMPLETE — AWAITING APPROVAL**
- OWNER DECISION PACKAGE INCOMPLETE — MISSING EVIDENCE

**Do not mark decisions as approved.**

**Do not implement GAP-01.**

---

## 11. Strict Restrictions

**DO NOT:**

- Modify application source code
- Modify migrations
- Create migrations
- Modify database schema
- Change foreign keys
- Change RLS
- Modify database functions
- Modify triggers
- Modify grants
- Change authentication configuration
- Modify Storage
- Install or upgrade dependencies
- Access hosted/production
- Delete or anonymize data
- Execute destructive SQL
- Send notifications
- Commit
- Push
- Deploy

**Only the authorized decision-package document may be created.**

---

## 12. Verification

After completion:

1. Verify the decision package exists.
2. Confirm every required section is present.
3. Verify the package agrees with SRAP-01.
4. Verify no Owner decision was invented.
5. Verify no legal/accounting approval was inferred.
6. Verify proposed retention durations remain proposals.
7. Verify no duplicate decision IDs were introduced.
8. Inspect Git diff.
9. Confirm only the new decision package was created.
10. Confirm no implementation work occurred.
11. Confirm no destructive or hosted/production action occurred.
12. Confirm no commit, push, or deployment occurred.

---

## 13. Final Report

Return:

- Status
- Document path
- Decision topics covered
- Decision identifiers used
- External review dependencies
- Implementation gate conditions
- Git diff inventory
- Scope confirmation
- Limitations

**Final status:**

**OWNER DECISION PACKAGE COMPLETE — AWAITING APPROVAL**

**STOP after completion.**

**Await the user's next explicit instruction.**
