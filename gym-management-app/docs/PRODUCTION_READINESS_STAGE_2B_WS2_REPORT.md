# Production Readiness — Stage 2B: WS-2 Live Authentication and Environment Configuration — Report

**Stage:** Production Readiness — Stage 2B, Workstream 2 (Live authentication / environment configuration).
**Type:** Verification + reporting stage (no implementation beyond inspection; no production access).

---

## 1. Existing configuration audit (Part 1 recap)

- Auth provider selection: `src/services/auth/provider.ts` — live only when
  `EXPO_PUBLIC_AUTH_MODE === 'live'` **and** `isSupabaseConfigured()`; otherwise demo.
- Supabase env read: `src/services/supabase/client.ts` — only
  `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or legacy anon),
  plus `EXPO_PUBLIC_AUTH_MODE`; service-role key has no app slot/reader.
- Live provider: `src/services/auth/live-provider.ts` (session/MFA gate; OTP, password,
  TOTP, reset, refresh; error mapping).
- Session storage: SecureStore (`expo-secure-store`, `WHEN_UNLOCKED_THIS_DEVICE_ONLY`) via
  supabase-js + token store (`src/services/auth/token-storage.ts`).

## 2. Live mode verification

- **Selection logic verified in code and by tests:** live provider is selected only when the
  mode flag is `live` and the Supabase environment is valid; otherwise demo.
- **Tests executed this stage:** auth-provider-selection, supabase-config, auth-demo and
  token-contract suites → **4/4 suites, 49/49 tests, all PASS** (exit 0).

## 3. Production URL / publishable key handling

- Only publishable key (or legacy anon) is read; publishable key is public by design; RLS
  server-side governs rows; no service-role key enters the bundle (typed + grep verified).

## 4. Local / demo preservation

- Default mode is `demo`; live requires explicit opt-in; local dev/demo behaviour preserved
  (no `.env` mutation performed in this stage).

## 5. Auth flows and checks (verified in code; live runtime verification outstanding)

- Registration/join → `submit_join_application` + `provision_member_profile`; email/phone
  verification state handling; password/TOTP/MFA login; logout; session restore (SecureStore +
  refresh rotation); staff writes AAL2 via `assert_aal2`; workspace role guards.

## 6. Error handling and redirect configuration

- Live provider maps OTP/MFA error codes; supabase client uses `detectSessionInUrl: false`
  (mobile); production redirect/OTP site URLs are owner-dashboard configuration items.

## 7. Tests and actual results

| Check | Result |
|---|---|
| `npx jest src/__tests__/auth-provider-selection.test.ts src/__tests__/supabase-config.test.ts src/__tests__/auth-demo.test.ts src/__tests__/token-contract.test.ts` | **PASS** — 4 suites / 49 tests, exit 0 |
| Full prior suite state (Stage 5 close) | PASS — 98/98 tests, 11 suites |
| `npx tsc --noEmit` / `npx expo lint` (prior final runs) | PASS / PASS |

## 8. Security checks

- No service-role key in app; no weakening of auth/MFA/RLS/authorization; SecureStore retained.

## 9. Outstanding owner actions

- Provide owner-provisioned production project URL + publishable key (owner action).
- Set production `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
  `EXPO_PUBLIC_AUTH_MODE=live` in the production environment.
- Configure production auth providers (email/SMS/MFA) and redirect URLs (dashboard actions).

## 10. Status

| Area | READY | NOT READY | BLOCKED |
|---|---|---|---|
| Live auth selection logic | ✅ | — | — |
| Auth-related tests | ✅ | — | — |
| Live runtime against owner-provisioned project | ❌ | ✅ (code verified) | ✅ (credentials / access) |

## 11. Remaining owner actions

1. Supply production Supabase project URL + publishable key.
2. Apply `EXPO_PUBLIC_AUTH_MODE=live` for production (owner-managed env).
3. Runtime-verify against production project (post-WS-1 provisioning).

---

*End of Stage 2B WS-2 report. Verification stage only; no production remote operations, no
migrations, no commit/push/deploy performed; no secrets printed; no `.env` mutation performed
in this stage.*
