# Phase 4 — Stage 1 Backend Readiness Report

Scope: make the **local** Supabase backend ready for screen wiring — seed,
live auth/profile provisioning, contact verification, staff MFA/AAL2, role and
session linkage, and the settings-dependent RPCs. No UI integration, no rule
changes, no remote project touched.

Environment: local Supabase stack (`supabase_db_GYM_Management`, PostgreSQL 17,
GoTrue with local TOTP + test-OTP SMS), migrations `0001`–`0005` + `seed.sql`,
Expo SDK 58 app.

---

## 1. What was added

| File | Change |
|------|--------|
| `supabase/seed.sql` | New idempotent seed: `app_settings(id = 1)` and the four plans (`Monthly` 1200, `Quarterly` 3000, `Half yearly` 5500, `Yearly` 9600). Applied by `db reset` via `[db.seed] sql_paths`. |
| `supabase/migrations/0005_profile_provisioning.sql` | New caller-only `provision_member_profile(display_name, phone)` SECURITY DEFINER RPC. Creates **only** the caller's profile, **only** with role `member`; idempotent; no grants/policies/triggers changed; no `auth.users` trigger. |
| `src/services/auth/live-provider.ts` | Supabase-backed `AuthProvider`: password sign-in, sign-up, email/phone challenges, TOTP MFA, AAL2 enforcement for staff sessions, profile provisioning, refresh/logout, reset. Never sets `demoCode`. |
| `src/services/auth/provider.ts` | Single demo/live resolver: `EXPO_PUBLIC_AUTH_MODE=live` **and** a complete Supabase env are both required; otherwise demo. Resolution is cached per process. |
| `src/services/auth/auth-context.tsx` | Uses `resolveAuthProvider()` (memoised) instead of the demo singleton. |
| `src/services/auth/index.ts` | Exports the live provider and resolver. |
| `supabase/config.toml` | Local-only auth config: TOTP enroll/verify, SMS with `test_otp` numbers + dummy Twilio block (needed for the SDK to enable the phone provider), SMS confirmations on (so phone numbers stay unverified until the OTP), email rate limit 30/h, magic-link template override. |
| `supabase/templates/magic_link.html` | Local email template that includes `{{ .Token }}`, so the 6-digit email-code path can be exercised against Mailpit. |
| `scripts/backend-readiness-check.mjs` | End-to-end readiness harness (52 checks): seed, provisioning, email/phone OTP, TOTP/AAL2, session-profile linkage, decision linkage, payment verify/reverse gates, freeze gate, token minting, settings. Local-URL guards, `readiness-` fixtures, cleanup unless `--keep`. |
| `src/__tests__/auth-provider-selection.test.ts` | 7 unit tests pinning demo-by-default, live opt-in, incomplete-env fallback, unknown mode, legacy anon key, and per-process caching. |
| `.env.example` | Documents `EXPO_PUBLIC_AUTH_MODE=demo` as the default. |

`0001_core_schema_validation.sql` fixture inserts were made seed-tolerant
(`on conflict ... do nothing`) so the suite passes both on a seeded reset and on
`db reset --no-seed`.

---

## 2. Readiness harness result

`node scripts/backend-readiness-check.mjs` — **52 of 52 checks passed, 0 failures**;
fixtures removed afterwards.

| # | Section | Proves |
|---|---------|--------|
| 1 | Seed | 4 plans + `app_settings(id = 1)` present with the expected names/prices/timezone/60 s token lifetime |
| 2 | Member signup + provisioning | Signup returns a session; `provision_member_profile` succeeds for the caller; role is `member`; member cannot `PATCH profiles.role` (403) and sees only their own profile row |
| 3 | Phone verification | Phone change stays **unconfirmed** until the local `test_otp` code is verified; verification sets `phone_confirmed_at` |
| 4 | Email verification | Email OTP is delivered to Mailpit; `verify` with `type=email` sets `email_confirmed_at` |
| 5 | Staff MFA/AAL2 | Staff sign-in starts `aal1`; TOTP enrollment + verification yields an `aal2` JWT; a fresh `aal1` token is still `aal1` after enrollment |
| 6 | Session ↔ profile | Owner and receptionist sessions resolve to their own immutable `profiles.role`; staff can read the directory |
| 7 | Join decision | Service-created submitted application is approved by a receptionist **without AAL2**; exactly one `members` row is created, linked to the auth user and plan |
| 8 | Payments | Direct receptionist insert is server-overridden to `awaitingVerification` and attributed to the recorder; self-verification is refused; `verify_payment` is refused at `aal1`; owner is refused (receptionist-only); a different receptionist verifies at `aal2`; exactly one membership period is created and `membership_end` extends |
| 9 | Reversals | `create_reversal` refused at `aal1`; succeeds at `aal2`; reversal row is append-only and points at the original |
| 10 | Freezes | `decide_freeze` refused at `aal1`; passes the gate at `aal2` (then reports not-found for a random id); owner refused |
| 11 | Attendance token | `mint_attendance_token` refused at `aal1`; succeeds at `aal2`; stored hash-only with the seeded 60 s lifetime |
| 12 | Settings | Receptionist refused; owner updates and persists; restore is idempotent |

---

## 3. Database suites (fresh reset, documented order)

`npx supabase db reset` → `0001`–`0005` + seed, then:

| Suite | Result |
|-------|--------|
| `0001_core_schema_validation.sql` | 56/56 pass |
| `0002_rls_and_triggers_validation.sql` | 123/123 pass |
| `0003_authority_functions_validation.sql` | 139/139 pass |
| `0004_views_validation.sql` | 81/81 pass |
| `0005_security_validation.sql` | 126/126 pass |
| `0007_date_math_validation.sql` | 73/73 pass |
| `0006_concurrency_validation.sql` (as `supabase_admin`) | 93/93 pass |

Post-chain residue is the intended baseline only: `plans = 4` (seed), `members = 2`,
`profiles = 2`, and zero payments / periods / attendance / freezes / audit rows.
No `readiness-*` rows or auth users remain.

---

## 4. Static checks

- `npx tsc --noEmit` — clean.
- `npx expo lint` — no errors.
- `npx jest --silent` — 9 suites, 79 tests pass.

---

## 5. How to reproduce

```bash
npx supabase start          # or: npx supabase db reset
node scripts/backend-readiness-check.mjs
# optional: node scripts/backend-readiness-check.mjs --keep
```

The harness refuses a non-local API URL and a non-local Mailpit URL, resolves
the local URL and keys from `supabase status -o env` at runtime (or from
`SUPABASE_*` environment overrides), and prefixes every fixture with
`readiness-`. No key is stored in the repository.

---

## 6. Known gaps and blockers for Stage 2

1. **Join application submission has no client path.** `join_applications`
   INSERT remains `service_role`-only (documented in `0001`). `decide_application`
   works, but a real member cannot submit an application from the app yet; Stage 2
   needs a submit RPC (out of scope here — no rule change was made).
2. **No UI flow for staff TOTP enrollment.** The backend supports it and the live
   provider refuses a staff sign-in that cannot reach AAL2, but enrollment is
   currently only exercised by the harness. Receptionist/owner accounts must be
   provisioned service-side with a verified factor before they can use the app.
3. **Live provider is opt-in and untested against the remote project.** Default is
   still `demo` so the existing demo labelling stays honest. `EXPO_PUBLIC_AUTH_MODE=live`
   must be set only with a complete local/remote Supabase env.
4. **Email confirmation is disabled locally** (`[auth.email] enable_confirmations = false`),
   so signup auto-confirms and provisioning happens immediately. The email-OTP path
   is still proven end-to-end through the local template. A deployment with
   confirmations enabled relies on the join screen's verify-before-signup step;
   direct signup-then-confirm would need a provisioning step after verification.
5. **Pre-existing write gaps remain** (unchanged by this stage): member contact
   edits, plan creation/deactivation, and the UI/backend permission mismatches
   listed in `PHASE_4_IMPLEMENTATION_PLAN.md` §7.
6. **Staff AAL2 refresh is deliberately short.** `refreshSession` returns `revoked`
   unless the refreshed session is actually at `aal2`; a staff session that drops to
   `aal1` must re-verify MFA instead of silently continuing.
7. **Local auth config is development-only.** The dummy Twilio block, `test_otp`
   numbers, SMS confirmations, email rate limit 30 and the template override must
   not be copied to a remote project as-is.
