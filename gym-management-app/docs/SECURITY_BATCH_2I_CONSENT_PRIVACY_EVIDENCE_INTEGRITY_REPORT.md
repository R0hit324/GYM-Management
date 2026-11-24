# SECURITY BATCH 2I — CONSENT AND PRIVACY EVIDENCE INTEGRITY REPORT (GAP-01)

**Project:** Gym Management App (`gym-management-app`)
**Batch:** Batch 2I — Consent and Privacy Evidence Integrity
**Date:** 2026-11-23
**Mode:** Read-only investigation + design. **No schema change, no migration, no deletion, no erasure implementation performed.**

**Predecessor context:** Batch 2H (GAP-04 migration safety) → Batch 2G consolidated **GAP-01** (consent/privacy evidence loss through auth-user `ON DELETE CASCADE`) as the critical blocker; Batch 2E/2F recorded it.

---

## 1. Executive Summary

Batch 2I investigated and dispositioned **GAP-01**: consent and privacy-request evidence loss associated with authentication-user deletion through `ON DELETE CASCADE` relationships.

- **Current verified schema state (Batch 2I):**
  - `consent_records_auth_user_id_fkey` → `public.consent_records`: `DELETE` action = **CASCADE** (`a`).
  - `privacy_requests_auth_user_id_fkey` → `public.privacy_requests`: `DELETE` action = **CASCADE** (`a`).
  - `privacy_requests_resolved_by_fkey` → `public.privacy_requests`: `DELETE` action = **RESTRICT** (`n`).
- **Workflow posture:** consent is append-only evidence (`record_consent`, caller-only, target = `auth.uid()`); privacy requests are member-intake queue rows (`request_privacy_action`, caller-only, target = `auth.uid()`) resolved only via Owner + AAL2 status update (`resolve_privacy_request`). Design states a request row is never an erasure; financial/receipt/audit records are not deleted by the request table.
- **Deletion pathways:** no member/privacy erasure execution implemented. Only a staff self-registration compensating `auth.admin.deleteUser` rollback exists in the staff-admin Edge Function (not an erasure workflow).
- **Implementation disposition:** **BLOCKED** — technical remediation design complete, but implementation requires Owner/legal decisions and external validation (L-06); no change was made.

---

## 2. Preflight Repository State

| Item | Finding |
|---|---|
| Project root | `E:\GYM Management\gym-management-app` |
| Branch | `main` |
| HEAD | `90753a40801b9d859b61a0ef33557f0b1c3eadd1` |
| Pre-existing uncommitted work preserved | Yes (R-3A package files, prior reports, `0014` test) |
| Changes made during Batch 2I | **Only** the new closure report |
| Schema/migration/function change | **NONE** |
| Deletion/erasure executed | **NO** |
| Hosted access | **NO** |

---

## 3. Original GAP-01 Evidence

- Batch 2E §4.9 / §9: consent evidence preservation — `consent_records.auth_user_id` → `auth.users` … **`ON DELETE CASCADE`**; risk confirmed at schema level.
- Batch 2F: GAP-01 carried as critical blocker; R2F-03 residual — cascade evidence loss; disposition **BLOCKED**, **EXTERNAL VALIDATION REQUIRED** (L-06), not fixed.
- Batch 2G: GAP-01 registered as critical blocker; remediation type **OWNER DECISION REQUIRED** (legal/accounting).

---

## 4. Current Schema Verification (Batch 2I)

Executed read-only catalog queries against the local disposable database (baseline state; no rows).

| Constraint | Table | Delete action | Meaning |
|---|---|---|---|
| `consent_records_auth_user_id_fkey` | `public.consent_records` | **CASCADE** | Auth-user deletion cascades to consent evidence |
| `privacy_requests_auth_user_id_fkey` | `public.privacy_requests` | **CASCADE** (`a`) | Auth-user deletion cascades to privacy-request rows |
| `privacy_requests_resolved_by_fkey` | `public.privacy_requests` | **RESTRICT** | Resolution actor reference is not cascade-deletable |

Columns confirmed: `consent_records(id, auth_user_id, consent_type, document_version, accepted, source, recorded_at)`; `privacy_requests(id, auth_user_id, request_type, details, state, resolution_note, created_at, updated_at, resolved_at, resolved_by)`.

---

## 5. Consent / Privacy Workflow Verification

- **Consent:** append-only (`trg_client_guard` / append-only design) via `public.record_consent(text, text, boolean, text)` — caller-only, target always `auth.uid()`; mandatory vs marketing enforced by checks; audit event `consent.recorded`.
- **Privacy requests:** `public.request_privacy_action(text, text)` — caller-only intake (any active role for own request); `public.resolve_privacy_request(uuid, text, text)` — Owner + AAL2 status update only; design comment: a request row is a request, never an erasure; financial/receipt/audit records are NOT deleted by this table.
- **No erasure/purge execution exists** in migrations/functions for consent/privacy evidence.

---

## 6. Auth-User Deletion Pathway Review

- No member-level privacy erasure or auth-user deletion execution path was found that implements retention/erasure behavior.
- Staff-admin Edge Function contains a compensating auth-user delete for staff self-registration rollback; its safety comment requires rollback discipline, but it is not a member-erasure workflow.

---

## 7. Remediation Design (Technical Analysis — no change made)

- **Safe technical remediation direction:** replace the destructive `ON DELETE CASCADE` on `consent_records.auth_user_id` and `privacy_requests.auth_user_id` with a non-destructive relationship (e.g., `RESTRICT`) via a **new forward-only migration**, preserving append-only evidence.
- **Migration safety:** forward-only; no historical migration edit; transactional; rollback plan.
- **Design alternatives:** RESTRICT vs deferred/erasure-aware lifecycle; subject-identity separation for export.

---

## 8. Authorization Boundary and Safety

- Cascade modification **not performed** (not authorized).
- Auth-user deletion **not executed** (no real data; synthetic-only boundary).
- Erasure/purge implementation **not performed**.
- Legal/Owner decisions outstanding.

---

## 9. Synthetic Test Design (Proposed — not executed)

- Synthetic auth user + consent + privacy request fixtures in a single transaction (`SYNTH-…` prefix / `b20000…` UUIDs), simulate auth-user deletion to observe cascade destruction, then re-test after remediation.

---

## 10. Legal / Accounting / Owner / External Dependencies

- **L-06** — consent/privacy evidence preservation & auth-user deletion CASCADE issue: **EXTERNAL VALIDATION REQUIRED**; **LEGAL REVIEW REQUIRED**; **OWNER DECISION REQUIRED**.
- L-01…L-04 consent/legal; OD retention set (OD-1…OD-12); accounting retention (L-05).

---

## 11. Hosted Boundary

- No hosted/production access or testing performed.

---

## 12. Change Inventory

| Change | Path | Type | Status |
|---|---|---|---|
| New Batch 2I report | `docs/SECURITY_BATCH_2I_CONSENT_PRIVACY_EVIDENCE_INTEGRITY_REPORT.md` | Documentation (new file) | **Created** |

No other changes in Batch 2I.

---

## 13. Residual Risks

- GAP-01 remains open: consent/privacy evidence loss through auth-user `ON DELETE CASCADE` — **critical blocker**, implementation **BLOCKED**.

---

## 14. Owner / Approval Dependencies

- Owner decision required; legal review required; external validation required (L-06). Implementation pending all three.

---

## 15. Final Verdict

**BATCH 2I — GAP-01 CONSENT/ PRIVACY EVIDENCE INTEGRITY — STATUS: BLOCKED**

- Technical analysis, schema verification and remediation design completed.
- Implementation **BLOCKED** pending Owner decision, legal review, and external validation (L-06).
- No change, deletion, or erasure performed; no hosted access; no protected data touched.

---

*End of Batch 2I report.*

*No retention, purge, deletion, anonymization, scheduling, or privacy-request execution was performed. No real member, attendance, payment, staff, consent, or privacy-request data was used as a fixture. No hosted/production access occurred. No commit, push, or deploy occurred.*
