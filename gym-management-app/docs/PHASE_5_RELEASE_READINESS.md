# Phase 5 — Release Readiness

**Scope:** Phase 5 (product completion, advanced features, production readiness) of
the Pulse GYM Management app, local Supabase stack (`127.0.0.1:54322` REST, Kong
`127.0.0.1:8000`).

**Verdict context:** the Phase 5 implementation, security posture and regression
evidence are **complete and green on the local stack**. This document separates
what is *shippable as a release candidate* today from what still requires owner
action before any production deployment.

---

## 1. What is verified (local, release-candidate evidence)

| Area | Evidence |
|---|---|
| Database baseline + new work | Fresh `npx supabase db reset`; suites `0001`–`0009` all PASS (732/732 assertions) |
| Authority / receipt surfaces | `0009_receipt_issuance.sql` + suite PASS (19/19); write-path suite PASS (22/22); authority suite PASS (139/139) |
| Read visibility | Frontend role-visibility harness PASS (41/41) incl. cross-member denial |
| Backend behaviour | Backend readiness harness PASS (62/62) |
| Frontend gates | `npx tsc --noEmit` PASS, `npx expo lint` PASS, `npx jest` PASS (98/98, 11 suites) — final run after Stage 8 report rewrite |

**Release-candidate status:** the local environment now satisfies the Phase 5
acceptance gates — clean reset, all suites green, both harnesses green, typecheck
and lint clean, unit tests green.

## 2. External services still unconfigured (BLOCKED / owner action)

| Service | Status | Owner action |
|---|---|---|
| Push notifications (APNs/FCM via Expo) | BLOCKED — no provider credentials/consent | Configure Expo push credentials; owner action |
| SMS delivery | BLOCKED — no gateway account/consent | Configure SMS provider; owner action |
| Email delivery | BLOCKED — no SMTP/provider account | Configure transactional email; owner action |
| Receipt storage (Supabase Storage bucket + PDF render) | BLOCKED — no bucket in environment | Owner decision (P5-07) |
| Staff account administration (Admin API / service role) | BLOCKED — prohibited in app | Owner action (P5-06) |
| Production backups / store builds | BLOCKED | Owner action (P5-08) |

In-app derived reminders (bell) are the only delivery that ships in this phase;
the above remain open and are documented, not hidden.

## 3. Owner action items before production

1. **Staff account administration** — a server-side admin/staff-invite path is
   required; the app intentionally keeps no service-role key and uses
   narrowly-scoped authority RPCs only.
2. **Push/SMS/email provider configuration** and consent records for member
   notifications.
3. **Receipt storage** decision — bucket + PDF/image rendering for `receipt_path`.
4. **Backup & release build** pipeline (Supabase Pro backups, EAS store build).

## 4. Residual risks (accepted / blocked)

- Delivery residuals (push/SMS/email) — BLOCKED, owner action.
- Stored receipt artefacts — BLOCKED, owner decision.
- No production deployment performed in this phase (no remote access, no deploy).

## 5. Production vs release candidate

- **Shippable now as a release candidate** for the verified local baseline: all
  functional, security-regression and frontend gates green.
- **Not yet production-ready** until the owner completes the action items in §2–3
  and an explicit production deployment decision is made (with backups, secrets
  management and monitoring in place).

---

*Owner action required before any production go-live. No production deployment
was performed during Phase 5.*
