# Production Readiness — Stage 2A: Infrastructure Preparation Plan

**Scope:** planning only — derived from the verified Phase 5 release candidate and the
Stage 1 pre-deployment audit. No implementation, no configuration change, no remote access.

---

## 1. Executive summary

The Phase 5 release candidate passes the full local verification set (732/732 SQL
assertions; 41/41 frontend visibility; 62/62 backend readiness; tsc/lint/jest green) and
the Phase 5 security review returned **PASS**. The Stage 1 audit therefore found **no
critical or high-severity code security defect**.

The remaining production blockers are **configuration, external-service and operational**,
not product-code security:

1. Live auth mode is not enabled in the shipped `.env`.
2. Delivery, storage, staff-administration, backup and monitoring workstreams are
   unconfigured or absent.
3. Android release build/signing/preview and legal artifacts are not in place.

This stage therefore produces a **dependency-ordered, implementation-ready** infrastructure
plan for the remaining workstreams. It is planning-only; execution begins with the first
implementation workstream after owner sign-off.

---

## 2. Current versus required infrastructure

| Area | Current (verified) | Required for production | Gap |
|---|---|---|---|
| Supabase project | Local stack (`GYM_Management`) + local config; production project not provisioned | Production Supabase project with isolated data, MFA, rate limits, backups, PITR-capable plan | Provisioning + dashboard configuration |
| Auth | Live provider code complete; `EXPO_PUBLIC_AUTH_MODE` unset | `EXPO_PUBLIC_AUTH_MODE=live` + production URL/key; production email/SMS/TOTP providers | Config change (allowed in this stage? **No** — owner action / later stage) |
| Database | Migrations `0001`–`0005`, `0008`, `0009`; reset-verified; suites green | Same migrations on production; backup/restore procedure | No production push (forbidden here); backup plan required |
| RLS / authority | Verified by suites and audits; no weakening | Preserve | Holding |
| Storage | Enabled, `file_size_limit = 50MiB`, **no buckets** | Receipt bucket + PDF rendering | Missing (BLOCKED) |
| Notifications | In-app derived only; push/SMS/email blocked | Provider wiring + consent | Blocked |
| Analytics/monitoring | None | Crash reporting (EAS Monitor/Sentry) + logging | Missing (BLOCKED for observability tooling) |
| Android release | No `android/`/`ios/`, no `eas.json`, no signing | EAS build + signing + store metadata | Missing (BLOCKED for credentials) |
| Legal | No privacy policy / terms / consent artifacts | Required artifacts + consent flow | Missing |

---

## 3. Workstream-by-workstream implementation plan

### WS-1 — Production Supabase provisioning and security configuration
- **Goal:** isolated production project; hardened auth/security config.
- **Code delta:** none (configuration/infrastructure).
- **Owner actions:** create production Supabase project; enable MFA TOTP; configure rate limits; configure email (SMTP) and SMS providers; enable appropriate plans/backups.
- **Acceptance:** project provisioned; no destructive operations.

### WS-2 — Live authentication mode and production environment configuration
- **Goal:** app runs against the production backend.
- **Code delta:** none in this stage; runtime env change in a later stage.
- **Owner actions:** set `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `EXPO_PUBLIC_AUTH_MODE=live`.
- **Security:** keep service-role out; keep SecureStore sessions; keep MFA.

### WS-3 — Email, SMS, OTP and push notification providers
- **Goal:** deliver reminders beyond in-app.
- **Code delta:** none in this stage; later implementation only via approved provider integration.
- **Owner actions:** provider accounts, sender IDs, consent records, push keys.
- **Status:** BLOCKED.

### WS-4 — Storage bucket and PDF receipt implementation
- **Goal:** store/render receipt PDFs.
- **Code delta:** later (storage + client code) only after bucket exists; `issue_receipt` already planned to be metadata-only.

### WS-5 — Secure staff account administration
- **Goal:** operational staff provisioning path.
- **Code delta:** none (owner-side dashboard path is the accepted design); app-level admin remains BLOCKED.

### WS-6 — Database backups and recovery
- **Goal:** backup/restore strategy.
- **Code delta:** none; infrastructure.

### WS-7 — Crash reporting, monitoring and structured logging
- **Goal:** observability.
- **Code delta:** later (SDK integration, structured logging); currently missing.

### WS-8 — Privacy policy, terms and user consent
- **Goal:** legal/compliance artifacts and consent handling.
- **Code delta:** later (docs/consent flow); currently missing.

---

## 4. Owner actions and manual dashboard steps

1. Create production Supabase project (new organisation/account if needed).
2. Apply migrations from source (via `supabase db push` against production — to be executed only in a later stage with explicit owner approval).
3. Configure auth: site URL, email templates, SMTP, SMS provider, TOTP MFA, rate limits, signup settings.
4. Create storage buckets if/when the receipt bucket is approved.
5. Create owner + staff accounts in the production Auth; enrol TOTP for staff.
6. Configure delivery provider accounts (push/SMS/email) when approved.
7. Set up database backups and restore drill.
8. Configure crash reporting and log ingestion when approved.

---

## 5. Required environment variables

| Variable | Purpose | Required state |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL | Set (local: `http://127.0.0.1:54321` → API; production: `https://<ref>.supabase.co`) |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key | Set (production key) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Legacy anon key alias | Only if publishable key absent |
| `EXPO_PUBLIC_AUTH_MODE` | Provider selection | `live` for production; `demo` default |

No secret variables are read by the app; the service-role key must never be introduced.
Secrets handling: local dev uses local stack values; production uses provider-hosted values;
no secrets in source/docs/Git.

---

## 6. Security controls (must be preserved)

- RLS enabled, no widening; authority RPCs keep `require_role` + `assert_aal2` +
  `audit_authority`; EXECUTE to `authenticated` only.
- Payments append-only; reversals new rows; receipt metadata one-way/audited.
- SecureStore token storage; refresh rotation; MFA.
- No service-role key in app; no direct writes outside RPCs.
- No destructive DB operations; no production data in local dev tests.

---

## 7. Cost and provider dependencies

| Workstream | Cost / dependency |
|---|---|
| Supabase production | Pro plan for PITR/backups likely required; compute. |
| Push (Expo) | Free tier/usage-based; needs Expo push credentials. |
| SMS | Paid gateway account + sender ID; consent. |
| Email | Provider SMTP/API account. |
| Storage | Bucket storage + egress. |
| Crash/logging | EAS Monitor/Sentry usage-based. |
| Build (EAS) | Usage-based; signing identity. |

---

## 8. Testing and acceptance criteria

- Per workstream: acceptance criteria recorded before implementation;
- full suite re-run after each database change (`npx supabase db reset` + all suites);
- harnesses re-run (frontend 41/41, backend 62/62) after changes;
- `tsc`, `lint`, `jest` green;
- security review re-run; no control weakened.

---

## 9. Rollback strategy

- Code: revert to last committed/uncommitted state; keep backups of any schema change.
- Env: switch provider selection back to `demo` or to local; never weaken RLS.
- Infra: stop providers; restore from backup; disable auth flows as needed; keep incident log.

---

## 10. Dependency-ordered execution sequence

1. WS-1 → WS-2 (infra/auth first).
2. WS-4 storage + receipt backend closure (safe, additive, independently verifiable).
3. WS-3 delivery providers (requires owner credentials).
4. WS-7 monitoring/logging + WS-8 legal (docs/consent).
5. WS-6 backups (infrastructure).
6. WS-5 staff admin (owner-side).
7. WS-4 PDF receipt client implementation (only after bucket).
8. Final Phase 5 closure and release-candidate freeze.

---

## 11. Status summary

| Area | READY | NOT READY | BLOCKED |
|---|---|---|---|
| Supabase production provisioning | ❌ | ✅ (local verified) | ✅ |
| Live auth mode | ❌ | ✅ (code verified) | ✅ |
| Delivery providers | ❌ | — | ✅ |
| Storage/PDF | ❌ | — | ✅ |
| Staff admin | ❌ | — | ✅ |
| Backups | ❌ | — | ✅ |
| Monitoring | ❌ | — | ✅ |
| Legal | ❌ | — | ✅ |

---

## 12. Deliverable and next steps

- Deliverable created: `docs/PRODUCTION_READINESS_STAGE_2A_INFRASTRUCTURE_PLAN.md`.
- **Stage 2A status: COMPLETE (planning only).**
- No remote Supabase access, no production accounts/projects created, no `.env`/code/migration changes, no provider configuration, no commit/push/deploy, no Stage 2B implementation performed.

---

*End of Stage 2A infrastructure preparation plan. No implementation work was begun under this stage.*
