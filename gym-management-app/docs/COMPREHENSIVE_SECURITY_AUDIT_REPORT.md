# COMPREHENSIVE SECURITY AUDIT & PENETRATION TEST — STAGE 1 (FULL)

**Project:** Gym Management App (`gym-management-app`)
**Date:** 2026-11-21
**Audit stage:** Full Security Audit & Penetration Test — Stage 1
**Mode:** **READ-ONLY** audit. No source code, migration, policy, seed, environment, Supabase project settings, auth configuration, deployment artifact, or production data was modified, created, deleted or executed-during-attack during this audit.

**Deliverable:** `docs/COMPREHENSIVE_SECURITY_AUDIT_REPORT.md` (this document).

**Programme position:** This is Stage 1 of the security audit track that follows the production-readiness track (Phases 3B → 5, Stages 2C–2J-A). Prior stages are recorded in `docs/PHASE_3B_*`, `docs/PHASE_5_*`, `docs/PRODUCTION_READINESS_STAGE_2B_*`, and `docs/STAGE_2[CEFJ]*_*.md`.

---

## 1. Executive Summary

- The audited surface — Expo/React Native client (`src/`), Supabase Postgres 17 backend (`supabase/migrations`, authority functions, RLS, triggers, views, storage policies, privacy/consent, staff-admin Edge Function), local verification harnesses (`scripts/`) and CI-equivalent checks (Jest, tsc, ESLint, SQL suites) — was reviewed end-to-end, read-only, across authentication, authorization, IDOR, database security, SQL-injection resistance, payments, QR/attendance, storage, mobile, API, DoS, business logic, dependency and secrets posture.
- **No new CRITICAL or HIGH vulnerability was found in this Stage 1 audit.** The cumulative verdict across the preceding security audits (Phase 3B.2 **APPROVED WITH CONDITIONS**, Phase 3B.3 **APPROVED WITH CONDITIONS**, Phase 3B.4/3B.5 verification, Phase 5 security review **PASS**, Stages 2G/2H remediation) holds: **the backend security posture is SECURITY PASS WITH CONDITIONS**.
- The two material findings that were open during the Stage 2G investigation — **M1** (AAL2 enforcement gaps on privileged write paths) and **M2** (storage INSERT path-shape validation) — were **confirmed valid, remediated locally, and re-verified** during Stage 2H, and remain regression-protected by executed test evidence (M01–M05 in suite `0008`; S09 in suite `0010`; AAL2 context alignment in suite `0003`).
- Residual conditions, all documented and none newly introduced by this audit:
  - **M3** — migration re-application / partial-failure safety: **VALID RISK**, documented (forward-only remediation discipline).
  - **H4** — data retention policy: **DECISION PENDING** (Owner/legal).
  - **M6** — privacy, consent, cascade handling: **DECISION PENDING** (Owner/legal).
  - Hosted initialization: **BLOCKED** (migration-history reconciliation); hosted attack surface therefore **NOT TESTED** in this stage.
  - Owner live auth (`EXPO_PUBLIC_AUTH_MODE=live`) and hosted auth-server settings (email confirmations, password policy, secure password change, CAPTCHA) remain Owner-managed / manual-verification items.

## 2. Audit Scope and Method

### 2.1 In scope (read-only inspection)
- Client source: `src/services/auth/*`, `src/services/supabase/*`, `src/services/data/*`, `src/services/receipts/*`, `src/services/staff/*`, `src/services/privacy/*`, `src/services/consent/*`, `src/services/notifications/*`, `src/services/observability/*`, app screens under `src/app/`.
- Backend: `supabase/migrations/0001`–`0013`, `supabase/functions/staff-admin/*`, `supabase/tests/*`, `supabase/config.toml`, `supabase/seed.sql`, `supabase/templates/*`.
- Tooling: `scripts/backend-readiness-check.mjs`, `scripts/frontend-role-visibility-check.mjs`, `scripts/local-stack.mjs`, `package.json` dependency graph, npm audit, repository secret scan, source greps (RPC surface, service-role, console logging, dynamic SQL, token handling).

### 2.2 Explicitly out of scope for execution during this audit
- No production/remote Supabase operations of any kind (no `db push`, no auth config change, no storage bucket mutation, no function deploy, no seed run, no owner creation).
- No production attack simulations, brute-force campaigns against hosted services, fuzzing in production, destructive testing, or social-engineering attempts.
- No source/migration/policy/auth/deployment edits.
- Hosted database read-only inspection was limited to evidence recorded in Stage 2J-A; hosted runtime attack execution is **BLOCKED** pending hosted initialization.

### 2.3 Method
1. Static line-level review of migrations, authority functions, policies, triggers, views, storage policies and grants.
2. Cross-check against authoritative design docs (`docs/PHASE_3A_*`, `docs/THREAT_MODEL.md`, `docs/SECURITY_POLICY.md`) and unresolved-items register.
3. Behavioral verification through the existing executed SQL suites on the disposable local stack (read-only attack *preconditions* via negative assertions; no destructive data).
4. Client-layer review: RPC-only writes, SecureStore tokens, redaction/sanitization, error handling, demo/live separation.
5. Dependency and secrets assessment.

## 3. Attack Surface Inventory

### 3.1 Client application surface (mobile + web via Expo)
- Auth flows: demo + live providers; OTP/TOTP; password reset; join/verification; session restore/refresh/revoke; MFA challenges with expiry and attempt lock (`src/services/auth/*`).
- Data reads/writes: RPC-only privileged writes via `src/services/data/writes.ts`; explicit-column SELECTs via `src/services/data/queries.ts`.
- Receipts: private-bucket upload via deterministic `{member}/{payment}.pdf` paths, signed URLs (5 min / 1 h max).
- Staff administration: `staff-admin` Edge Function (JWT-verified, service-role server-side, owner+AAL2 authoritative DB gate).
- Privacy/consent/notifications/observability modules.

### 3.2 Backend API surface
- Supabase Auth (GoTrue): JWT expiry 1 h (`jwt_expiry = 3600`), refresh-token rotation on, reuse interval 10 s, rate limits (sign-in/sign-up 30 / 5 min, token refresh 150 / 5 min, token verifications 30 / 5 min, email sends 30 / h), MFA TOTP enabled, phone OTP disabled except local test map, anonymous sign-ins disabled, manual linking disabled.
- PostgREST: schemas `public` + `graphql_public`, `max_rows = 1000`, `auto_expose_new_tables` unset (fresh-project default true → mitigated by 0003 default-privilege lockdown).
- RPC surface: authority functions + helper functions + trigger functions (see §5).
- Storage: private `receipts` bucket (PDF-only, 5 MiB), member-own SELECT, staff SELECT, receptionist INSERT with path-shape `WITH CHECK` (remediated via migration `0013`).
- Realtime: enabled; `postgres_changes` subscribers evaluated under the subscribing role's RLS.
- SQL layer: RLS enabled **and FORCEd** on all application tables, 23 permissive policies (SELECT/INSERT only), immutability + payments-override triggers, SECURITY DEFINER authority functions with pinned `search_path`, deferrable reversal-cap constraint.

### 3.3 Trust boundaries
1. Device (Expo app) → Supabase Auth / PostgREST / Storage.
2. Edge Function (`staff-admin`) → Supabase Auth (`verify_jwt`) → user JWT → DB authority function (owner + AAL2).
3. Device → PostgREST → DB (RLS + SECURITY DEFINER authority functions).
4. Storage object consumers → short-lived signed URLs.

## 4. Threat Model

### 4.1 Assets
- Member identity/PII (name, phone, email), membership/financial records, attendance events, freeze/pause data, join applications, consent records, audit trail, receipts.

### 4.2 Actors
- `anon`, `member`, `receptionist`, `owner`, `service_role`, `postgres`, `supabase_admin`, platform operators, external attackers, the device itself.

### 4.3 Threats considered
- Unauthenticated access to privileged operations (RPC, storage, data).
- Role/claim spoofing (`app_profile_role()` authoritative; JWT claims not trusted for money).
- IDOR / cross-member data access.
- Financial integrity: forged/overpaid/over-reversed payments; spoofed verification state.
- MFA bypass on revenue-affecting actions (AAL2).
- Storage path traversal / object injection.
- SQL injection via RPC arguments or dynamic SQL.
- Token theft/replay (attendance tokens, refresh tokens, MFA challenges).
- Secrets leakage (service key, tokens, keys in bundle/logs).
- Abuse/DoS via bulk reads, OTP floods, deep scans.

## 5. Vulnerability Findings Register (consolidated)

| ID | Source | Severity | Finding | Status |
|---|---|---|---|---|
| F-1 | 3B.2 audit | MEDIUM | Supabase image default ACLs auto-grant client access to future `public` objects | **RESOLVED** (0003 dual-form default-privilege lockdown) |
| F-2 | 3B.2 audit | LOW | Four trigger functions carried PUBLIC EXECUTE | **RESOLVED** (0003 hygiene revoke) |
| F-3 | 3B.2 audit | LOW | `btree_gist` extension in API-exposed `public` schema | **OPEN (accepted)** — hygiene recommendation only; no privilege path demonstrated |
| F-4 | 3B.2 audit | LOW | Fallback plan pricing from inactive plan | **RESOLVED** (0003 `verify_payment` inactive-plan gate) |
| F-5 | 3B.2/3B.3 | INFO | GUC / pooling / recursion / immutability behaviours | **VERIFIED** |
| F-6 | Phase 5 (new code) | HIGH-risk items S1–S4 etc. | Demo data in live mode; session QR as live source; receipt UPDATE paths | **CLOSED / DESIGN-SAFE** post-Phase 5 wiring (live catalogue/QR paths now read live resources; demo only in demo mode) |
| F-7 | Stage 2G | HIGH | M1 — AAL2 gaps on privileged owner/decision write paths | **CONFIRMED VALID → REMEDIATED (Stage 2H)** |
| F-8 | Stage 2G | HIGH | M2 — storage INSERT policy without path-shape WITH CHECK | **CONFIRMED VALID → REMEDIATED (Stage 2H)** |
| F-9 | Stage 2G | HIGH | M3 — migration reapplication / partial-failure safety | **VALID RISK (documented)** |
| F-10 | Stage 2G | MEDIUM | H4 — data retention policy | **DECISION PENDING** (Owner/legal) |
| F-11 | Stage 2G | MEDIUM | M6 — privacy/consent/cascade | **DECISION PENDING** (Owner/legal) |

**No CRITICAL or HIGH finding remains open in the application/backend code as of this audit**, aside from the pending Owner/legal decisions and documented migration-safety risk.

## 6. Attack Test Matrix

| # | Attack scenario | Control under test | Test method | Result |
|---|---|---|---|---|
| A-01 | Unauthenticated RPC invocation of a privileged authority function | EXECUTE grants (authenticated-only) + `require_role` | SQL suites (real PostgREST context, `session_user='authenticator'`) | **PASS** |
| A-02 | Spoofed role claims in JWT | `app_profile_role()` authoritative via `profiles` | Suite assertions (M11 spoofed-claim no-op) | **PASS** |
| A-03 | Client INSERT forcing `state='verified'` / reversal-shaped rows | `payments_insert_override` forcing + grants | T01–T13 (override spoof-proof) | **PASS** |
| A-04 | Non-receptionist payment insert | Override role gate + WITH CHECK policy | T05–T07, M14/N04/O05 | **PASS** |
| A-05 | Self-verification / self-reversal | Default-deny in authority functions | Suite assertions (self-reversal default-deny) | **PASS** |
| A-06 | Over-reversal (cumulative > original) | Deferred constraint trigger (23514) | X11/X12 | **PASS** |
| A-07 | Double-verify / double-decision | Conditional rowcount guards | Suite assertions | **PASS** |
| A-08 | Attendance from frozen member / replayed / expired token | `check_in` gates + token hash/single-use/expiry | Suite assertions | **PASS** |
| A-09 | AAL1 on revenue-affecting RPC | `assert_aal2()`; M1 remediation extended gates | M01–M05 (post-2H) + suite 0003 | **PASS** |
| A-10 | Invalid receipt storage object path | Storage INSERT `WITH CHECK` (migration 0013) | S09 (suite 0010, 27/27) | **PASS** |
| A-11 | Storage UPDATE/DELETE on receipts | No UPDATE/DELETE policy; immutability | Suite assertions | **PASS** |
| A-12 | Cross-member read (IDOR) | Member-own RLS via `auth_user_id` | Suites (M04/W02) | **PASS** |
| A-13 | Audit-log read/write scope | Owner-only read + client immutability | Suites (M22/R17/O10–O12) | **PASS** |
| A-14 | Follow-up actor binding | `actor = auth.uid()` policy | R10 | **PASS** |
| A-15 | Client write attempt (UPDATE/DELETE) | Guard triggers (`assert_no_client_mutation`) | G01–G04 | **PASS** |
| A-16 | SQL injection via RPC args / dynamic SQL | plpgsql named params; `%I` identifier quoting; pinned `search_path` | Static review + suites | **PASS (no injection surface)** |
| A-17 | OTP / MFA brute force | Challenge expiry, attempt lock, auth rate limits | Design + config; hosted config Owner-managed | **NOT TESTED / NEEEDS MANUAL VERIFICATION** |
| A-18 | Bulk data exfiltration | `max_rows = 1000`, explicit column lists | Design/harness | **PASS (bounded)** |
| A-19 | Secrets exposure via bundle/logs | No service-role slot, SecureStore tokens, redaction | Source greps, observability sanitize tests | **PASS** |

**Matrix verdict:** executed checks — **PASS** (no exploitable control failure reproduced). **FAIL** — none. **NOT TESTED** — hosted runtime attack execution, OTP brute-force behaviour under hosted limits, realtime subscriber abuse (local realtime config only). **BLOCKED** — production attack simulations (Stage 1 boundary). **NEEEDS MANUAL VERIFICATION** — hosted auth-server password policy, email-confirmation enforcement, secure password change, CAPTCHA posture.

## 7. Role Permission Matrix

| Capability \ Role | `anon` | `member` | `receptionist` | `owner` | `service_role` | `postgres`/`supabase_admin` |
|---|---|---|---|---|---|---|
| Read own member row / status | ✗ | ✓ | ✓ | ✓ | ✓ (service paths) | ✓ |
| Read staff directory / members | ✗ | ✗ | ✓ | ✓ | ✓ | ✓ |
| Record payment (INSERT) | ✗ | ✗ (override rejects) | ✓ | ✗ | service-only paths | ✓ |
| Verify / reject / reverse payment | ✗ | ✗ | verify ✓ (AAL2) / reject ✓ / reverse ✓ (AAL2) | ✗ | service-only | ✓ |
| Freeze request / decide / end | ✗ | ✗ | ✓ (decide AAL2) | ✗ | service-only | ✓ |
| Check-in (member) | ✗ | ✓ (default-deny pending payment) | — | — | — | ✓ |
| Mint attendance token | ✗ | ✗ | ✓ (AAL2) | ✗ | service-only | ✓ |
| Receipt issue / storage | ✗ | ✗ | ✓ (AAL2 via issue paths) | — | service-only | ✓ |
| Plan create / deactivate / price / settings | ✗ | ✗ | ✗ (owner-only) | ✓ (now AAL2) | ✓ | ✓ |
| Join application submit / decide | ✗ | ✓ | ✓ (decide now AAL2) | ✗ | ✓ | ✓ |
| Audit log read | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ |
| Follow-up write | ✗ | ✗ | ✓ (actor-bound) | ✗ | ✓ | ✓ |

RLS row-level scoping (member-own via `auth_user_id`, staff qualifiers via `app_profile_role()`) remains effective and was regression-verified.

## 8. Data Access Matrix

- 13 approved application tables + later approved additions; RLS **ENABLE + FORCE** on all.
- Grants: client (authenticated) holds SELECT on financial/period/void/freeze/attendance/application/audit/follow-up/settings tables narrowed by policies; INSERT only on `payments` (receptionist-gated via override + WITH CHECK) and `follow_up_events` (actor-bound); no client UPDATE/DELETE anywhere; `payments` INSERT cannot produce verified/reversal rows.
- Views `v_member_status`, `v_inactive_members`, `v_daily_report`, `v_month_revenue` — `SECURITY INVOKER`, RLS-preserving, staff/member scopes enforced.
- `anon`: zero privileges of any kind on application objects.

## 9. Critical Business Workflow Security

- **Payment verification/verification integrity:** server-computed price, full-payment-only, self-verify default-deny, inactive-plan refusal, plan-consistency gate, member-row lock, month-anchored arithmetic, deferred cumulative-reversal cap, audit attribution — all enforced and tested (139/139 authority suite).
- **Freeze / attendance / token:** default-deny pending-payment, scan auto-unfreeze, token hash/single-use/expiry, replay refusal, AAL2 on mint/decide.
- **Receipts:** private bucket, PDF-only, 5 MiB, deterministic paths, one-way issuance flag, metadata-only mutation, audited.
- **Staff administration:** Edge Function + owner+AAL2 DB fallback, no owner self-service, role immutability.
- **Privacy/consent:** server-bound consent RPCs, privacy request workflow server-side, no client-side erasure/export claims.

## 10. Dependency Audit

- `npm audit` (package-lock): **0 critical, 0 high; 27 moderate** across the dependency graph.
- All moderate advisories originate in **dev-only** chains (`jest` 30 canary ecosystem via `jest-expo`, `@typescript-eslint/*`, `@expo/fingerprint` → `minimatch`, `glob`, `babel-plugin-istanbul`, `test-exclude`, `jest-watch-typeahead`). **No production runtime dependency is flagged.**
- Fix paths exist but involve semver-major alignment (e.g., Jest 29.7.0) — deferred to an authorized remediation stage; no installs performed during this audit.

## 11. Secrets Audit

- App reads only `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or legacy anon key) — no service-role/secret key slot or reader exists (`src/services/supabase/client.ts`).
- Tokens persist via `expo-secure-store` (Keychain/Keystore), memory fallback only — never plain storage (`src/services/auth/token-storage.ts`).
- Edge Function reads service-role key from server-side environment only; app sends only the user's JWT.
- Repository secret scan (source, migrations, functions, scripts, config, env examples, docs of record): no live secrets committed; `.env.example` is the only env artifact; no hardcoded production credentials in app code. Local disposable test credentials exist only in local verification scripts (local-stack only) — not production secrets.
- No secrets were exposed, rotated, or modified during this audit.

## 12. Security Gaps

1. Hosted initialization not yet executed → hosted runtime controls (rate limits, MFA server config, storage bucket state) **untested in live environment**.
2. Owner live auth not enabled (`EXPO_PUBLIC_AUTH_MODE`); owner login currently resolves to demo path.
3. M3 migration re-application risk — documented, no remediation performed.
4. H4 / M6 Owner/legal decisions pending.
5. Dev-dependency moderate advisories (see §10).
6. Hosted auth-server hardening items (password policy minimum 6/empty requirements, email confirmations off, secure password change off, CAPTCHA) — Owner-managed; recorded as **NEEEDS MANUAL VERIFICATION**.

## 13. Remediation Priority

| Priority | Item | Disposition |
|---|---|---|
| P0 | M1 AAL2 gaps | **FIXED & VERIFIED (Stage 2H)** |
| P0 | M2 storage path WITH CHECK | **FIXED & VERIFIED (Stage 2H)** |
| P1 | M3 migration reapply/partial failure | VALID RISK — documented; owner-approved forward-only discipline required before any hosted apply |
| P2 | H4 retention decision | DECISION PENDING (Owner/legal) |
| P2 | M6 privacy/consent decision | DECISION PENDING (Owner/legal) |
| P3 | Dev dependency advisories | Recommended remediation (authorized install/update stage) |
| P4 | Hosted auth hardening / initialization | BLOCKED pending Owner decisions (Stage 2I/2J-A) |

## 14. Security Readiness Verdict — STAGE 1 (FULL SECURITY AUDIT & PENETRATION TEST)

- **Technical security posture:** **SECURITY PASS WITH CONDITIONS** (cumulative evidence: 3B.2, 3B.3, Phase 5, 2G, 2H).
- **Stage 1 (this audit) contribution:** no new CRITICAL/HIGH findings; attack-surface coverage confirmed; executed checks PASS; no SQL-injection surface; no secrets exposure; dependency posture acceptable (dev-only moderate).
- **Open conditions requiring Owner decision / remediation:** M3, H4, M6, hosted initialization approval, owner live auth, hosted auth hardening.
- **Hosted production attack surface:** **NOT TESTED** (blocked by hosted-initialization reconciliation state).
- **Functional readiness:** **NOT READY** for real-world use (per Stage 2J-A/functionality evidence); security gates do not yet unblock hosted deployment.

**Stage 1 final verdict: SECURITY PASS WITH CONDITIONS — no new exploitable vulnerability demonstrated; audit complete.**

## 15. Stop Condition

This stage is **complete**. Per the Stage 1 mandate: stop here, no remediation was performed in this stage, and the Owner must approve any remediation before work proceeds.

---

*End of Comprehensive Security Audit & Penetration Test — Stage 1 report. No source, migration, policy, auth, Supabase, deployment or production data was changed during this audit; no commit/push/deploy was performed.*
