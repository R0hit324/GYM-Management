# Production Readiness — Stage 1: Pre-Deployment Audit

**Audit scope:** read-only pre-deployment audit of the Phase 5 release candidate
(Pulse GYM Management, `gym-management-app`).
**Audit type:** inspection + verification against existing artifacts (no execution of
new builds, no remote access, no modification of app code/migrations/config/docs).

---

## 1. Executive summary

The Phase 5 release candidate is **functionally complete and was verified green on
the local Supabase stack** (SQL suites 732/732 assertions; frontend visibility harness
41/41; backend readiness harness 62/62; `tsc --noEmit`, `expo lint`, `jest` all PASS).

However, the app is **NOT READY for production deployment in its current state**, and
several items that the Phase 5 close-out left open remain open:

1. **The shipped `.env` does not enable the live backend.** `EXPO_PUBLIC_SUPABASE_URL`
   and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are set, but `EXPO_PUBLIC_AUTH_MODE` is
   unset, so the app currently resolves to the **demo auth provider** even with the
   Supabase values present. A production build must set `EXPO_PUBLIC_AUTH_MODE=live`.
2. **External delivery, receipt storage, staff administration, backups and monitoring
   are not configured** — all BLOCKED or NOT VERIFIED, with owner action required.
3. **No Android release artifacts or signing/EAS configuration exist** in the
   repository; no release build has been produced or run.
4. **Legal/compliance artifacts (privacy policy, terms, consent flow) are not present
   in the repository.**

No critical or high-severity security defect was found in the reviewed Phase 5 code;
the Phase 5 security review returned **PASS** with BLOCKED residuals only. The most
material production blockers are configuration/operational, not code-level security.

---

## 2. Verified current project state

### 2.1 Repository state (verified)

- Branch: `main` (local; `origin/main` exists).
- No changes staged; Phase 5 implementation + docs remain **uncommitted** (preserved).
- Working tree contains Phase 5 changes: migrations `0008_stage5_write_paths.sql`,
  `0009_receipt_issuance.sql`; suites `0008_*`, `0009_*`; new screens/components/hooks;
  Phase 5 docs; harness updates.
- No Git commit/push/deploy performed during this audit.

### 2.2 Architecture and navigation (verified)

- Expo Router with role groups: `(auth)`, `(member)`, `(reception)`, `(owner)`.
- SCREENS: login, join, attendance (member/reception), fees, renewals, report (owner),
  lost, plus Phase 5 additions (member payments; reception applications; owner
  more/settings/plans/audit/applications; reception transaction-history/plans/more/
  payment-qr/member-profile/renewals/plans).
- Navigation is group-scoped with `useWorkspaceGuard` role guards.

### 2.3 Authentication and RBAC (verified)

- Auth provider selection: `src/services/auth/provider.ts` — default `demo`; live only
  when `EXPO_PUBLIC_AUTH_MODE === 'live'` **and** Supabase env valid.
- Live provider: `src/services/auth/live-provider.ts` + `src/services/supabase/client.ts`.
- Session persistence: SecureStore-backed (expo-secure-store; `WHEN_UNLOCKED_THIS_DEVICE_ONLY`
  keychain accessibility); supabase-js `persistSession` + `autoRefreshToken`; refresh
  rotation handled (single-use refresh token).
- MFA: TOTP enabled in `supabase/config.toml` ([auth.mfa.totp] enroll+verify enabled);
  staff write authority RPCs enforce AAL2 via `assert_aal2()`.
- Local auth config: email confirmations disabled (local), SMS via `test_otp` map only,
  rate limits raised locally for dev.

### 2.4 Supabase configuration (verified)

- Local stack config (`supabase/config.toml`): API 54321, DB 54322, Studio 54323, SMTP 54324;
  `max_rows = 1000`; storage enabled with `file_size_limit = "50MiB`; no storage buckets
  defined; realtime enabled; auth site_url `http://127.0.0.1:3000`; MFA TOTP enabled;
  signup enabled; rate limits configured.
- Only migrations `0001`–`0005`, `0008`, `0009` applied in sequence; suites `0006`/`0007`
  exercise logic embedded in earlier migrations.
- Authority functions: SECURITY DEFINER + `require_role` + AAL2 + `audit_authority`;
  EXECUTE to `authenticated` only (revoked from `public, anon, service_role`).

### 2.5 Environment / secrets handling (verified)

- App reads only `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  (or legacy anon), and `EXPO_PUBLIC_AUTH_MODE`.
- Service-role/secret key has no code slot and no reader (by design, typed + grep-verified).
- `EXPO_PUBLIC_*` are build-time inlined — acceptable for publishable key; all DB access
  controlled by RLS.
- `.env` is git-ignored (`gym-management-app/.gitignore`); only names, not values, were
  inspected during this audit (no secrets printed).
- Current `.env` state: Supabase URL + publishable key **set**; `EXPO_PUBLIC_AUTH_MODE` **not
  set** → live mode inactive (demo provider active).

### 2.6 Storage / receipts / notifications / analytics (verified)

- Receipt: metadata-only `receipt_issued` flag via one-way audited `issue_receipt`;
  `receipt_path` NULL (no bucket); PDF storage BLOCKED.
- Notifications: in-app derived only (bell); push/SMS/email not configured.
- Analytics/crash: no Sentry/EAS Monitor/crash SDK found in app dependencies/code.

### 2.7 Tests and verification evidence (verified)

- Full reset + suites 0001–0009: **PASS, 732/732 assertions** (incl. 0009 receipt 19/19,
  0008 write paths 22/22, 0003 authority 139/139).
- Frontend harness: **41/41 PASS** (incl. cross-member denial + route checks).
- Backend harness: **62/62 PASS**.
- Frontend gates: `tsc --noEmit` PASS; `expo lint` PASS; `jest` PASS (98/98, 11 suites).

---

## 3. Security findings by severity

### Critical

- **None identified** in the Phase 5 implementation or existing control baseline at the
  time of the Phase 5 security review.

### High

| # | Finding | Detail | Disposition |
|---|---|---|---|
| H1 | Live auth mode not enabled in current env | `EXPO_PUBLIC_AUTH_MODE` unset → app boots on demo provider despite Supabase credentials being present. | **BLOCKED / owner action**: set to `live` and repoint to production project. Not a code defect; a deployment-blocking configuration gap. |
| H2 | No production crash/monitoring observability wired | No crash reporting (EAS Monitor/Sentry) or structured log aggregation in app; only two `console` call sites exist (font error, supabase config warning). | **BLOCKED**: required for production incident response; owner action / provider integration. |

### Medium

| # | Finding | Detail | Disposition |
|---|---|---|---|
| M1 | Local SMTP/SMS/OTP configuration uses placeholders / local test maps | `supabase/config.toml` local-only values (dummy Twilio SID/service SID, `test_otp` map) are dev-only; production needs real provider config. | BLOCKED (external services). |
| M2 | No privacy policy / terms / consent artifacts in repo | Legal/compliance documentation absent from `docs/`. | NOT READY for store release; owner action. |
| M3 | Minimal API error observability | Error taxonomy exists client-side (`classifyWriteError`) and server messages surfaced; no external logging pipeline. | Accepted for RC; upgrade recommended. |

### Low

| # | Finding | Detail | Disposition |
|---|---|---|---|
| L1 | Export row cap (500) client-side; by design. | Documented. | Accepted. |
| L2 | `max_rows = 1000` on Supabase API views — large ledgers may truncate. | Design limit; Phase 5 analytics capped ranges/exports. | Accepted for RC; revisit at scale. |

### Security posture confirmed during Phase 5 (no new defect introduced)

- No weakening of RLS, AAL2, audit attribution, or authorisation-by-profile.
- No service-role key in app; writes via authority RPCs only; no direct table writes outside RPCs (grep-verified).
- Receipt one-way/metadata-only/verified-only; audited.
- Payment integrity and QR replay protection covered by suites.

---

## 4. Infrastructure readiness checklist

| # | Item | Status | Notes |
|---|---|---|---|
| I-1 | Supabase production project configuration | **NOT VERIFIED / BLOCKED** | No remote Supabase access performed (per operating restrictions). Must be provisioned + configured before production. |
| I-2 | Storage bucket + PDF receipt rendering | **BLOCKED** | No bucket in local env; `receipt_path` NULL; no PDF pipeline. |
| I-3 | Email / SMS / push notification providers | **BLOCKED** | Email local-only (Mailpit), SMS local `test_otp`; push none. |
| I-4 | Secure staff account administration | **BLOCKED** | Admin API/service-role prohibited in app; owner action required. |
| I-5 | Database backup and recovery strategy | **NOT VERIFIED / BLOCKED** | Local-only stack; no production backup plan. |
| I-6 | Android signing and release configuration | **NOT READY** | No `android/`/`ios/` folders, no `eas.json`, no signing config, no release build run. |
| I-7 | Privacy policy, terms, required user consent | **MISSING** | Not present in repo. |
| I-8 | Production monitoring and incident response | **MISSING** | No crash/log/monitoring SDK or pipeline wired. |

---

## 5. Android release readiness

- **Expo configuration** (`app.json`): SDK 58; slug `gym-management-app`; version `1.0.0`;
  portrait; icon paths; android adaptive icon; camera plugin (permission + barcode scanner +
  no audio capture); splash plugin; scheme `gymmanagementapp`; typed routes + React Compiler
  experiments.
- **Android permissions**: no explicit `permissions` block in `app.json`; camera permission
  supplied via plugin; INTERNET not declared in `app.json` (relies on Expo prebuild defaults).
- **Build profiles / signing**: no `eas.json`, no `android/` or `ios/` source folders, no
  keystore/signing config, no release build artifacts, no EAS build executed.
- **Environment-specific configuration**: only `.env` (Expo public vars) — no build-profile
  specific env split present.
- **Production API configuration**: blocked on live-mode env (`EXPO_PUBLIC_AUTH_MODE=live`,
  production Supabase URL/key).
- **Physical-device testing**: **NOT PERFORMED** (no release build produced).
- **Conclusion: NOT READY** — release build and physical device validation remain.

---

## 6. Missing configuration and external dependencies

| Dependency | State | Owner action |
|---|---|---|
| Live Supabase auth mode + production project | URL/key set; mode unset | Set `EXPO_PUBLIC_AUTH_MODE=live`; provision production project. |
| Push notifications | None | Expo push credentials + provider. |
| SMS | Local test only | Real gateway + consent. |
| Email | Local Mailpit only | Real SMTP/provider. |
| Receipt storage bucket + PDF | None | Bucket + renderer decision. |
| Staff account administration | Prohibited path | Owner action. |
| Backups | None | Backup/recovery plan. |
| Monitoring/crash/logging | None | SDK + pipeline. |
| Privacy policy / terms / consent | Missing | Legal artifacts. |
| Android release build | Not prepared | EAS build + signing. |

---

## 7. Risks and blockers

- **Deployment-blocking (owner action):** live auth mode, external providers, storage,
  staff admin, backups, monitoring, legal artifacts, Android release build.
- **Accepted for RC:** delivery residuals, stored-receipt decision, monitoring upgrade path,
  export row cap, large-ledger truncation risk.
- **Not verified (no access performed):** production Supabase project config, production
  backups, physical device behavior, store compliance review, penetration testing.

---

## 8. Recommended implementation sequence (next stages)

1. Owner + infra: provision production Supabase project; configure auth (MFA, rate limits,
   email/SMS providers); backups.
2. Set `EXPO_PUBLIC_AUTH_MODE=live` and production Supabase credentials in build env.
3. Delivery: push/SMS/email provider configuration and consent records.
4. Receipts: storage bucket + PDF rendering decision/implementation.
5. Observability: crash reporting (EAS Monitor/Sentry) + structured logging.
6. Legal: privacy policy, terms, consent screens/flows.
7. Android/iOS release: EAS build profiles, signing, store metadata, physical device testing.

---

## 9. READY / NOT READY / BLOCKED separation

| Area | READY | NOT READY | BLOCKED |
|---|---|---|---|
| Code implementation (Phase 5) | ✅ Local-verified | — | — |
| Security posture | ✅ No new critical/high defect | — | Residual delivery/storage/admin items |
| Database regression | ✅ 732/732 PASS | — | — |
| Frontend/backend behaviour | ✅ 41/41, 62/62 PASS | — | — |
| Frontend quality gates | ✅ tsc/lint/jest PASS | — | — |
| Live auth configuration | ❌ | ✅ (code path complete) | ✅ (`EXPO_PUBLIC_AUTH_MODE` unset) |
| Storage / receipts | ❌ | — | ✅ |
| Notifications delivery | ❌ | — | ✅ |
| Staff admin path | ❌ | — | ✅ |
| Backups/recovery | ❌ | — | ✅ |
| Monitoring/incident response | ❌ | — | ✅ |
| Legal/compliance artifacts | ❌ | — | ✅ |
| Android release build | ❌ | ✅ (config present) | ✅ (no artifacts) |

---

## 10. Audit confirmations and non-modifications

- Read-only audit: no application code, migrations, configuration, or existing docs were
  modified. Only the required deliverable `docs/PRODUCTION_READINESS_STAGE_1_AUDIT.md`
  was created.
- No remote Supabase access, no `supabase link` / `db push`, no production migrations, no
  commit/push/deploy, no release build, no secrets printed, no real customer messages sent.

---

*End of Stage 1 pre-deployment audit. No implementation work was begun under this stage.*
