# Production Readiness — Stage 2B: WS-5 Secure Staff Administration — Report

**Stage:** Production Readiness — Stage 2B, Workstream 5 (staff account administration).
**Type:** Implementation + verification + reporting stage (no remote Supabase operations).
**Result:** **READY at code level · NOT READY for live operation until the migration + Edge function are applied and the SQL suite runs · BLOCKED by unavailable Docker and the no-remote-access restriction.**

---

## 1. Objective

Close the operational gap where Receptionist accounts could only be created by hand in the
Supabase dashboard, without weakening the existing auth/RBAC/RLS/MFA architecture:

- Owner can create a **Receptionist** account and share a temporary password.
- Owner can list and inspect staff accounts (owners + receptionists).
- Owner can activate / deactivate a Receptionist.
- No path exists to create an Owner, promote anyone, change a role, or modify an owner.
- No self-promotion and no self-deactivation.
- Every administrative action is owner-only, AAL2-gated and audited.
- Privileged auth-user creation uses a trusted server-side authority; the Expo app never holds a
  service-role key.
- A newly created Receptionist can enrol a TOTP factor instead of being locked out — without
  bypassing mandatory MFA.

## 2. Existing architecture audit (reused, not duplicated)

| Layer | Existing mechanism | WS-5 decision |
|---|---|---|
| Identity | Supabase Auth (GoTrue) via `@/services/supabase/client` singleton | Reused. **No second auth stack, client or table.** |
| Authorisation source | `public.profiles.role` read through RLS (`app_profile_role()`, `require_role()`) | Extended with `is_active`; helpers now deny inactive profiles. |
| Roles | `member`, `receptionist`, `owner` (fixed enum, guarded by `profiles_role_guard`) | Unchanged. Staff administration exposes only `receptionist` as a creatable role. |
| RLS | Policies in `0002_rls_and_triggers.sql`; profiles are service-only for writes | Unchanged. New functions are `SECURITY DEFINER` with pinned `search_path`. |
| MFA | Staff write RPCs call `assert_aal2()`; live provider refuses to report AAL1 staff sessions | Preserved; first-time enrolment added so new staff can reach AAL2. No bypass added. |
| Audit | `audit_authority(...)` + `audit_log_entries` (owner-select only) | Reused. New actions: `staff.created`, `staff.activated`, `staff.deactivated`, `staff.sessions_blocked`. |
| Privileged provisioning | None (dashboard-only) | New `staff-admin` Edge Function holding the service-role key **server-side only**. |
| App data layer | `src/services/data/{rows,queries,mappers,use-data}` | Extended with one owner-only directory query; no parallel data client. |
| Owner navigation | More hub + `(owner)` stack + workspace guard | New `staff` route added to the existing stack and More list. |

**Gaps found and closed:**

1. No supported Receptionist creation path; hand provisioning risked wrong roles and no audit row.
2. No way to revoke a staff account short of deleting the auth user.
3. A staff account with no TOTP factor could authenticate at AAL1 but could never use its write
   paths — a silent dead account.
4. No owner-only staff directory (email / last sign-in live in `auth.users`).
5. The live provider did not read `is_active`, so a deactivated account could still be reported as
   signed in if the auth-side ban were missed. **Fixed in this stage.**

## 3. Security model

### 3.1 Authority chain for privileged creation

```
Owner (AAL2 JWT)
   → app: createStaffAccount()            // no role field, ever
   → Edge Function `staff-admin`          // verify_jwt = true
        → auth.getUser(token)
        → caller-scoped profile read: role = 'owner' AND is_active = true
        → admin.auth.admin.createUser()  // service-role key, server env only
        → caller.rpc('admin_register_staff') // owner + AAL2 re-checked in SQL
   → profile inserted with literal role 'receptionist'
   → audit_authority('staff.created', …)
```

The Edge Function never returns the service key, a token, or a raw GoTrue payload. A partial create
(image auth user created, profile insert failed) is rolled back with `deleteUser`; if rollback also
fails the account remains profile-less and therefore denied.

### 3.2 Hard guarantees

| Guarantee | Enforcement |
|---|---|
| Cannot create an Owner | `admin_register_staff` inserts the literal `'receptionist'`; there is no role parameter; Edge rejects any body containing `role`. |
| Cannot promote / change role | No update path in any new function; `profiles_role_guard` still blocks client updates; profiles remain service-only for writes. |
| Cannot deactivate/modify an owner | `admin_set_staff_active` refuses any target whose role ≠ `receptionist`; Edge target check does the same; UI offers no control. |
| Cannot self-deactivate | SQL refuses `p_user_id = auth.uid()`; client refuses before any call. |
| Receptionist cannot administer | Every function calls `admin_staff_assert()` → `require_role(['owner'])` + `assert_aal2()`. |
| Inactive account denied immediately | `app_profile_role()` returns NULL for inactive profiles; `require_role()` refuses; every RLS policy and authority function denies. Live provider also refuses sign-in/session for `is_active = false`. |
| No service-role key in app | App reads only `EXPO_PUBLIC_SUPABASE_URL` + publishable/anon key; Edge reads `SUPABASE_SERVICE_ROLE_KEY` from its server environment. |
| MFA preserved | Staff sign-in never reports success below AAL2. Enrolment holds the AAL1 session only to create/verify a factor; authority functions still reject AAL1. |
| Audit integrity | Each successful state change writes exactly one `audit_authority` row with the owner as actor; idempotent calls write none. `audit_log_entries` remains owner-select only. |
| Fail secure | No branch assumes success. Failed Edge storage/activation surfaces an error; deactivation falls back to the database revocation; if both fail the operation fails. |

### 3.3 Deactivation and session revocation — what is actually true

Deactivation applies the **database switch first** (`profiles.is_active = false`), because that is the
authoritative revocation: the next request from any already-issued access token is denied by RLS and
by every authority function. The Edge Function then best-effort applies a long GoTrue ban
(`ban_duration: '876000h'`), which blocks new sign-in and refresh.

GoTrue exposes **no logout-by-user / revoke-all-sessions admin endpoint** in the supported API. WS-5
does not pretend otherwise:

- already-issued access tokens are **denied by the database** and expire normally;
- the ban blocks new sign-ins and refresh;
- if the ban cannot be applied, the result is reported as `sessionsBlocked: false` with an explicit
  warning, never as a completed session wipe.

Activation clears the ban first, then sets `is_active = true`. If the database step fails after the
unban, the account stays inactive — still no access — and the error is returned.

## 4. Database / backend changes

### 4.1 `supabase/migrations/0011_staff_administration.sql` (additive, not executed)

1. `public.profiles.is_active boolean not null default true` + `(is_active, role)` index.
2. `create or replace app_profile_role()` — returns the role only for an **active** profile.
3. `create or replace require_role(text[])` — denies inactive accounts.
4. `admin_staff_assert()` — internal owner + AAL2 guard; **no client EXECUTE**.
5. `admin_staff_directory()` — owner + AAL2; returns owners/receptionists only, joining
   `auth.users` for email and `last_sign_in_at`; never returns a credential or token.
6. `admin_register_staff(uuid, text, text)` — owner + AAL2; validates name/phone; requires an
   existing auth user; refuses an existing profile; refuses a member-linked auth user; inserts
   `role = 'receptionist'`; audits `staff.created`.
7. `admin_set_staff_active(uuid, boolean)` — owner + AAL2; row lock; refuses self, owners and
   members; idempotent; audits `staff.activated` / `staff.deactivated`.
8. `admin_record_staff_sessions_blocked(uuid)` — owner + AAL2; audits the applied GoTrue ban as
   `staff.sessions_blocked`.
9. Least-privilege grants: `authenticated` EXECUTE only; `anon` and `service_role` revoked; the
   internal guard has no client EXECUTE at all.

No table, column, policy, grant or business rule from earlier migrations is removed or weakened. Only
`app_profile_role` / `require_role` are replaced with tighter behaviour.

### 4.2 `supabase/functions/staff-admin/index.ts` (new, not deployed)

- `POST` only; CORS preflight; JWT verified by the platform (`verify_jwt = true`).
- Reads the caller profile through RLS and requires **active owner**.
- Rejects any request body containing a `role` field.
- Actions: `create`, `deactivate`, `activate`.
- `create`: validates name/email/password/phone; creates the auth user with `email_confirm: true`;
  inserts the profile via the owner's own JWT (so SQL re-checks owner + AAL2); compensating delete
  on failure.
- `deactivate`: verifies the target is a receptionist through the caller's RLS; DB deactivation
  first; then GoTrue ban; then audit acknowledgement. Ban failure returns `sessionsBlocked: false`
  with a warning.
- `activate`: verifies the target; clears the ban; then sets `is_active = true`; failure stays
  inactive.
- Missing server configuration returns **503** — it never falls back to a client-held key.
- No secret, token or raw auth error is echoed.

### 4.3 `supabase/config.toml`

```toml
[functions.staff-admin]
verify_jwt = true
```

### 4.4 `supabase/tests/0011_staff_administration_validation.sql` (authored, **unexecuted**)

**52 assertions** across:

- **R01–R06** least privilege: authenticated may execute; anon/service_role may not; the internal
  guard has no client EXECUTE; definer/search_path posture; `is_active` default.
- **I01–I04** inactive profiles denied by `app_profile_role()`, RLS, gated functions and the
  directory.
- **A01–A08** directory matrix: anon/member/receptionist/AAL1-owner refused; AAL2 owner allowed;
  owners + receptionists only; inactive staff reported honestly; no member exposed.
- **C01–C12** creation: member/receptionist/AAL1-owner refused; no 4-argument role call exists;
  blank name / unknown auth user / existing profile / member-linked auth user refused; AAL2 owner
  succeeds; created profile is receptionist + active; exactly one `staff.created` audit row; the
  new profile appears in the directory.
- **D01–D17** activation/deactivation: receptionist/AAL1-owner/self/other-owner/member/unknown
  refused; deactivation succeeds, writes one audit row, resolves role to NULL; repeat is a no-op
  with no second audit row; reactivation succeeds and audits `staff.activated`.
- **S01–S07** session-block acknowledgement (success/audit/owner/member/unknown refusals); direct
  client profile UPDATE still denied; roles never change through admin actions.

## 5. Client implementation

### 5.1 Owner staff screen — `src/app/(owner)/staff.tsx`

- Lists the server directory (owners first, then receptionists), with email, access state, last
  sign-in and honest labels (`Active · reception access`, `Deactivated · access denied`).
- Create modal: full name, email, optional phone, temporary password. No role selector exists.
- Inspect modal: read-only details plus Activate / Deactivate for receptionists only; owners and
  self are explained and have no action.
- Confirmation modal states exactly what deactivation does (database denial first, auth-side ban
  best-effort, tokens expire normally).
- Demo mode is read-only and **honestly empty** — the directory is server-produced, so no sample
  staff list is invented.
- Every success message names the audit action the server wrote.

### 5.2 Staff service — `src/services/staff/`

| File | Responsibility |
|---|---|
| `rules.ts` | Pure validation, normalisation, self/owner refusal, activation affordances, role-payload guard. No network. |
| `admin.ts` | Edge Function orchestration for create/activate/deactivate; honest error extraction; deactivation fallback to `admin_set_staff_active`; truthful `sessionsBlocked` / warnings. |
| `index.ts` | Screen-facing barrel. |

The deactivation fallback is deliberate: if the Edge Function is unreachable, the database RPC still
revokes access because it is owner + AAL2 gated and is the authoritative switch. The result is
reported as `sessionsBlocked: false` — the auth-side ban is not simulated.

### 5.3 First-time MFA enrolment

- `signIn` now returns `mfa_enrollment_required` when a staff account has no verified TOTP factor.
  The AAL1 session is retained **only** for enrolment; every authority function still rejects AAL1.
- Optional live-only provider methods `startMfaEnrollment` / `completeMfaEnrollment`:
  - reuse the existing session; remove abandoned unverified TOTP factors;
  - return the secret/otpauth URI once to the screen (never persisted or logged);
  - verify the code, then confirm the server actually promoted the session to AAL2 before reporting
    success.
- `src/app/(auth)/mfa-enroll.tsx` shows the QR (`react-native-qrcode-svg`, already a dependency), a
  selectable setup key, a 6-digit input and honest error states; on success it completes the same
  pending sign-in and routes to the normal workspace success screen.
- `login.tsx` routes the new status to `/mfa-enroll`; the auth stack registers the route.
- The demo provider does not implement the optional methods, so a screen cannot invent an enrolment
  in demo mode.

### 5.4 Data layer

- `StaffDirectoryRow` (`rows.ts`), `fetchStaffDirectoryRows()` → `admin_staff_directory` (`queries.ts`),
  `toStaffAccount` (`mappers.ts`), `useStaffDirectory()` (`use-data.ts`), barrel export.
- `StaffAccount` added to `src/types/domain.ts`.
- Demo mode returns `[]` because `useResource` does not call the live loader outside live auth.

### 5.5 Live provider hardening

`ProfileRow` now reads `is_active`. Sign-in, `completeSignIn` and `getSession` refuse an explicit
`false`, so deactivation is honoured even if the GoTrue ban is missing. A missing column on an older
deployment is treated as active for backward compatibility; migration 0011 always supplies it.

## 6. Files changed

**New**

| File | Purpose |
|---|---|
| `supabase/migrations/0011_staff_administration.sql` | DB authority, `is_active`, staff functions, grants, audits. |
| `supabase/tests/0011_staff_administration_validation.sql` | 52-assertion SQL proof suite (unexecuted). |
| `supabase/functions/staff-admin/index.ts` | Trusted auth-user creation / ban / unban. |
| `src/services/staff/rules.ts` | Pure staff rules. |
| `src/services/staff/admin.ts` | Edge/RPC orchestration + fallback. |
| `src/services/staff/index.ts` | Barrel. |
| `src/app/(owner)/staff.tsx` | Owner staff console. |
| `src/app/(auth)/mfa-enroll.tsx` | First-time TOTP enrolment. |
| `src/__tests__/staff-admin-rules.test.ts` | 16 pure-rule tests. |
| `src/__tests__/staff-admin-client.test.ts` | 19 mocked Edge/RPC tests. |
| `src/__tests__/auth-mfa-enrollment.test.ts` | 18 mocked MFA/enrolment tests. |
| `docs/PRODUCTION_READINESS_STAGE_2B_WS5_REPORT.md` | This report. |

**Modified**

| File | Change |
|---|---|
| `supabase/config.toml` | `[functions.staff-admin] verify_jwt = true`. |
| `tsconfig.json` | Exclude `supabase/functions/**` (Deno, not app TS). |
| `eslint.config.js` | Ignore `supabase/functions/**`. |
| `src/services/auth/types.ts` | `mfa_enrollment_required`, enrolment types, optional provider methods. |
| `src/services/auth/live-provider.ts` | Enrolment status/methods; `is_active` enforcement. |
| `src/services/auth/index.ts` | Type exports. |
| `src/app/(auth)/login.tsx` | Route to `/mfa-enroll`. |
| `src/app/(auth)/_layout.tsx` | Register `mfa-enroll`. |
| `src/app/(owner)/_layout.tsx` | Register `staff`. |
| `src/app/(owner)/more.tsx` | Staff accounts row. |
| `src/services/data/rows.ts` | `StaffDirectoryRow`. |
| `src/services/data/queries.ts` | `fetchStaffDirectoryRows`. |
| `src/services/data/mappers.ts` | `toStaffAccount`. |
| `src/services/data/use-data.ts` | `useStaffDirectory`. |
| `src/services/data/index.ts` | Barrel export. |
| `src/types/domain.ts` | `StaffAccount`. |

No duplicate auth system, Supabase client, profiles table, audit table, staff table or screen was
introduced.

## 7. Test results

### 7.1 New automated suites (Edge Function, RPC and Supabase client mocked)

| Suite | Tests | Result |
|---|---|---|
| `src/__tests__/staff-admin-rules.test.ts` | 16 | **PASS** |
| `src/__tests__/staff-admin-client.test.ts` | 19 | **PASS** |
| `src/__tests__/auth-mfa-enrollment.test.ts` | 18 | **PASS** |
| **WS-5 total** | **53** | **PASS** |

### 7.2 Required test list mapped

| Requirement | Where proven |
|---|---|
| Unauthorised creation | Client rules reject bad input locally; Edge 403 owner gate + SQL C01/C02/C03 (SQL **unexecuted**) |
| Receptionist → owner creation | No role parameter in SQL, Edge rejects a `role` field, client payload has no `role` (tested) |
| Role escalation / promotion | Literal `'receptionist'` insert; `profiles_role_guard`; client `payloadHasRoleField`; no update path |
| Unauthorised deactivation | SQL D01/D02 (unexecuted); client refuses self/owner/no-session before any call (tested) |
| Self-promotion / self-deactivation | No role path; SQL D03 + client self-refusal (client tested, SQL unexecuted) |
| MFA / AAL2 | 18 mocked auth tests: no factor → enrolment, factor → challenge, role mismatch, inactive profile, member unaffected, no AAL2 promotion → failure |
| Audit logging | SQL C11/D11/D17/S02 assert exactly one row and owner actor (**unexecuted**) |
| Activate / deactivate | Client success, partial, fallback, both-fail paths (tested); SQL D09–D17 **unexecuted** |
| Session revocation | DB-first deactivation + truthful `sessionsBlocked` semantics; client fallback test; **no GoTrue logout-by-user exists** |
| Cross-role access | SQL A01–A03, I01–I04 (**unexecuted**); client cannot reach any RPC without the owner session |
| Failure handling | Unreadable response, Edge failure, Edge+DB failure, partial activation, thrown transport error, missing user id (tested) |
| New staff MFA onboarding | 18 tests including QR payload, already-enrolled, stale-factor cleanup, wrong/expired/locked codes, AAL2 re-check |

### 7.3 Final gates (actual runs, this stage)

| Check | Result |
|---|---|
| `npx jest src/__tests__/staff-admin-rules.test.ts …` | **PASS** — 53/53, exit 0 |
| `npx jest` (full suite) | **PASS** — **17 suites / 203 tests**, exit 0 |
| `npx tsc --noEmit` | **PASS** — exit 0 |
| `npx expo lint` | **PASS** — exit 0 |
| `npx supabase status` | **FAIL** — Docker daemon unavailable (see 7.4) |

Full-suite delta vs. WS-4 close: **+3 suites / +53 tests** (14/150 → 17/203); every previously
passing suite remains green.

`npx expo-doctor` was not used as a WS-5 gate. WS-4 recorded a pre-existing exit 1 for 10
out-of-date Expo packages; WS-5 adds no native dependency (`react-native-qrcode-svg` was already
present).

### 7.4 SQL suite — NOT EXECUTED (honest status)

```
npx supabase status
→ StatusDbInspectError: failed to connect to the docker API at
  npipe:////./pipe/dockerDesktopLinuxEngine; check if the path is correct and if the
  daemon is running
```

Consequences, stated plainly:

- The 52 SQL assertions covering the role/AAL2 matrix, inactive-account denial, owner/receptionist
  separation, self/owner protection, audit counts and least privilege are **authored and
  code-reviewed, not database-proven**.
- The Edge Function has **not** been deployed or invoked; its behaviour is verified by code review
  and by the client contract tests with a mocked `functions.invoke`.
- No remote Supabase access, `supabase link`, `db push`, migration execution or function deployment
  was performed.
- No result is claimed for anything in this section.

## 8. Owner setup and smoke test (owner action — not performed)

1. **Apply migrations** `0001`→`0011` through the normal release process. `0011` is additive:
   it adds one column, one index, five functions and their grants.
2. **Deploy the Edge Function:** `supabase functions deploy staff-admin`. Confirm
   `verify_jwt = true` and that the server environment supplies `SUPABASE_URL`,
   `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` (platform-injected or set as a secret).
   The service-role key must exist **only** in the Edge environment — never in `.env`, Expo
   variables or the app bundle.
3. **Provision/confirm the Owner account** (unchanged dashboard step): create the auth user, insert
   its `public.profiles` row with `role = 'owner'` and `is_active = true`, and enrol a TOTP factor.
   Staff administration requires that owner to sign in at AAL2.
4. **Verify the schema:** `profiles.is_active` exists with default `true`; the five `admin_*`
   functions exist; `authenticated` has EXECUTE; `anon` and `service_role` do not; the internal
   guard has no client EXECUTE.
5. **Run the SQL suite** `supabase/tests/0011_staff_administration_validation.sql` on a reset local
   stack when Docker is available; record the pass/fail count.
6. **Smoke test on a non-production copy:**
   - owner (AAL2) creates a Receptionist → one `staff.created` audit row;
   - the Receptionist signs in for the first time → forced TOTP enrolment → workspace opens only
     after a valid code;
   - the Receptionist cannot read the staff directory or call any admin function;
   - owner deactivates the Receptionist → their next request is denied even with the old token;
     new sign-in is blocked; one `staff.deactivated` audit row;
   - owner reactivates → the account can sign in again and still requires MFA;
   - attempts to create an owner / pass a `role` / deactivate an owner / deactivate self are all
     refused.
7. **Confirm the app route** appears only in the owner workspace (`More → Staff accounts`) and that
   demo mode shows the honest empty directory.

## 9. Remaining owner actions

1. Apply migrations through `0011` and deploy the `staff-admin` Edge Function (WS-5 live enablement).
2. Keep the service-role key server-side only; verify it is absent from Expo variables and bundles.
3. Run and archive the `0011` SQL validation on a local/reset stack (Docker required).
4. Execute the §8.6 smoke test before promoting the migration.
5. Align the pre-existing Expo dependency drift in a separate change (WS-4 note).
6. Outstanding earlier-workstream owner actions remain: production project provisioning (WS-1/2),
   external notification providers (WS-3), receipt bucket apply and smoke test (WS-4).

## 10. Status

| Area | READY | NOT READY | BLOCKED |
|---|---|---|---|
| Owner staff console (list/inspect/create/activate/deactivate) | ✅ | — | — |
| Receptionist-only creation, no role parameter, no owner creation/promotion | ✅ (code) | — | SQL proof pending |
| Self/owner protection in client and SQL | ✅ (client tested) | — | SQL proof pending |
| Inactive-account denial (`is_active` in helpers, RLS, live provider) | ✅ (code) | — | SQL proof pending |
| Mandatory MFA preserved + first-time TOTP enrolment | ✅ 18 tests | — | Live factor flow needs a device |
| Audit rows for every admin action | ✅ (code) | — | SQL counts unexecuted |
| Edge Function with server-side service-role key | ✅ (code) | — | Not deployed |
| Deactivation revocation semantics | ✅ (DB-first + honest ban status) | — | No GoTrue logout-by-user exists |
| Mocked client/auth suites | ✅ 53/53 | — | — |
| Full local gates (jest, tsc, lint) | ✅ 17 suites / 203 tests | — | — |
| SQL proof of RBAC/RLS/audit/session matrix | ❌ | ✅ (52 assertions ready) | ✅ Docker daemon unavailable |
| Live Edge invocation and runtime staff flow | ❌ | ✅ (implementation ready) | ✅ No remote access/deploy permitted |
| `expo-doctor` dependency drift | ❌ | ✅ pre-existing | — |

**Overall: READY at code level for WS-5 (staff administration, mandatory-MFA onboarding, audited
activate/deactivate, 53 new tests, all local gates green) · NOT READY for live staff management
until migration 0011 is applied, the `staff-admin` Edge Function is deployed, and the SQL suite and
smoke test pass · BLOCKED by the unavailable Docker daemon and the explicit no-remote-access
restriction.**

## 11. Restrictions compliance

- No remote Supabase access; no `supabase link`, `db push`, migration execution or function deploy.
- No production migration, bucket, auth user or Edge Function created.
- No service-role key created, read, printed or committed; the app still reads only public keys.
- No MFA, RLS, AAL2, role rule, audit rule or existing grant weakened. `app_profile_role` and
  `require_role` were only **tightened** to deny inactive profiles.
- No duplicate table, auth system, Supabase client or screen; existing pieces were extended.
- No commit, push, publish or deploy; all work remains uncommitted in the working tree.
- No WS-6 work started.
- No fabricated results: the unexecuted SQL suite, undeployed Edge Function and pre-existing
  dependency drift are reported as they are.

---

*End of Stage 2B WS-5 report. Implementation and client-level verification complete; database,
Edge deployment and live runtime proof remain owner/Docker-blocked.*
