# Phase 4 — Stage 3: Write Integration Report

Scope: connect the existing Expo screens to the verified Supabase write
surface for attendance, payments and freezes, while keeping demo mode intact.
No migration, policy, grant, trigger, function or view was changed. No remote
project was contacted and no Git operation was performed.

Environment: local Supabase stack (`supabase_db_GYM_Management`, PostgreSQL 17),
migrations `0001`–`0005` plus the pristine seed, Expo SDK 58 app. Live mode is
still opt-in via `EXPO_PUBLIC_AUTH_MODE=live`; the default remains `demo`.

---

## 1. Screens wired in this stage

| Screen | What is now live | What stays demo |
|--------|------------------|-----------------|
| `(member)/attendance.tsx` | Camera QR scan → `check_in`; success refresh of the member's own `v_member_status` and attendance; server-refusal states for invalid, expired, replayed, pending-payment and unlinked scans. | The explicit review control and demo history remain, labelled and hidden in live mode. |
| `(reception)/door-qr.tsx` | `mint_attendance_token` (receptionist + AAL2), one-time plaintext QR, countdown from the requested validity, automatic rotation at expiry, manual refresh, honest minting/error states. | The inert approved demo payload with its disclosure. |
| `(reception)/fees.tsx` | Authorised `payments` INSERT through the server override trigger; the returned row is displayed (server prices/state/attribution); server refusals are shown verbatim with a retry path; live member/plan/payment reads, pull-to-refresh and load-error states. | The session payment store and its explicit "resets on restart" copy. |
| `(reception)/transaction-history.tsx` | Live verify/reject (`verify_payment` / `reject_payment`) with the self-recorded guard, reversal sheet (`create_reversal`: whole rupees, remaining-amount cap, self-reversal guard), reversal rows, reversal-aware month totals, live refresh. | The session register when the provider is demo. |
| `(reception)/freeze.tsx` | `request_freeze`, `decide_freeze` (approve/reject) and `end_freeze`, pending/approved/rejected/ended history, server-derived member expiry, refresh of members/freezes, server messages verbatim. | The session-only request book that never approves or edits a date. |

Screens that only received copy corrections so they no longer contradict the
verified backend: `(reception)/more.tsx`, `(reception)/renewals.tsx`,
`(reception)/member-profile.tsx` (freeze and verification authority is the
receptionist's; the Owner has no freeze write path).

---

## 2. Part A — Member attendance

- `src/components/scan/qr-scanner.tsx` uses `expo-camera` (`CameraView`,
  `useCameraPermissions`), requests the OS permission with a plain-language
  reason, pauses while the screen is unfocused, and throttles repeated reads.
  It never validates a payload.
- `(member)/attendance.tsx` passes the raw payload to `checkIn(token)` in
  `src/services/data/writes.ts`, which calls `check_in`. The screen maps the
  server answer to honest states:

| Server answer | Screen state |
|---------------|--------------|
| success | checked in; `v_member_status` and attendance refresh |
| pending payment | not permitted (inactive) |
| no linked member | not permitted, server message shown |
| invalid token | refused |
| expired token | expired code |
| replay of the same token | refused, server message shown |

A frozen member's successful scan auto-ends the freeze and records attendance —
the refresh picks up both changes. Expired members check in normally, matching
the backend rule. No failed scan is ever stored.

## 3. Part B — Receptionist attendance QR

`src/hooks/use-attendance-token.ts` mints through `mint_attendance_token`, stores
only the returned plaintext in memory, counts down the same validity the client
requested (from `app_settings.attendance_token_validity_seconds`, bounded
5–600 s), and mints a replacement at expiry or on demand. The token hash is
never requested or displayed. `(reception)/door-qr.tsx` shows honest
minting/ready/error states and keeps the screen attendance-only (no UPI
content). Server-side expiry still decides every scan.

## 4. Part C — Payments

- **Recording:** `recordPayment` performs the authorised `payments` INSERT with
  only `member_id`, `plan_id`, `method`, `utr`, `discount_pct`, `note`. The 0002
  BEFORE INSERT trigger forces `entry_type`, server prices, `awaitingVerification`
  state and `recorded_by`. The screen displays the returned row; confirmation
  copy in live mode is server-aware.
- **Verification / rejection:** `verifyPayment` / `rejectPayment` call the
  authority functions. The UI does not offer verification to the person who
  recorded the row (the server refuses self-verification); AAL2 is required and
  its absence is shown as the server's message.
- **Reversal:** `createReversal` opens from a verified payment only, enforces
  whole-rupee positive input and the remaining refundable amount client-side for
  UX, and is hidden for the person who recorded or verified the original (the
  server refuses self-reversal). The original row is never edited; the reversal
  is a new immediately-verified row.
- **History:** live rows replace the session register, showing entry type and
  reversal linkage. `monthPaymentTotals` deducts verified reversals from the
  month they were recorded in (by method), never counts them as revenue, and
  reports reversal amount/count separately.

## 5. Part D — Freezes

- `request_freeze` records the request; live eligibility is a server decision
  (the view has no "payment pending" status, so the client does not try to
  reproduce it). Date format and ordering are the only client checks.
- `decide_freeze` offers approve/reject on pending rows; `end_freeze` offers
  early ending on approved rows. Both are receptionist-only backend paths; the
  Owner has no freeze write route. Approval requires AAL2 and its refusal is
  displayed verbatim.
- The screen displays `effective_expiry` from `v_member_status` (payment
  periods plus approved pauses) and the server's `extension_days`. It never
  edits a membership date.
- History filters include rejected; rows show extension days and whether an
  ended freeze ended via entrance scan or the desk.

---

## 6. Architecture and safety invariants

- One Supabase client: every read and write uses the existing
  `getSupabaseClient()` singleton.
- No duplicated screens, services or auth providers.
- Writes only through the verified RPCs or the authorised INSERT; no direct
  update/delete, no service-role key, no client-side price or membership math
  trusted.
- `src/services/data/writes.ts` classifies failures only to choose an honest UI
  state; the raw server message is always preserved and displayed.
- Demo mode remains the default and every demo screen keeps its disclosure.
  Live mode never falls back to demo data.
- Raw actor ids (`recorded_by`, `verified_by`) are used only for the
  segregation-of-duties check; they are never rendered as a person's name.

## 7. Files added / changed

Added:

| File | Purpose |
|------|---------|
| `src/services/data/writes.ts` | Typed wrappers for `check_in`, `mint_attendance_token`, the payments INSERT, `verify_payment`, `reject_payment`, `create_reversal`, `request_freeze`, `decide_freeze`, `end_freeze`; failure classification. |
| `src/components/scan/qr-scanner.tsx` | Expo camera QR scanner with permission, focus and throttle handling. |
| `src/hooks/use-attendance-token.ts` | Attendance-token mint/countdown/rotation lifecycle. |
| `src/__tests__/write-failures.test.ts` | Classification tests for write and check-in failures. |

Changed: `app.json` (expo-camera plugin), `package.json` (`expo-camera
~58.0.14`, installed with `npm install … --ignore-scripts` because Expo install
hit `EALLOWSCRIPTS`), `src/services/data/{rows,queries,mappers,use-data,index}.ts`,
`src/types/domain.ts`, `src/utils/payment.ts`,
`src/__tests__/payment-totals.test.ts`, and the screens listed in §1.

## 8. Verification results

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | pass |
| `npx expo lint` | pass (0 errors, 0 warnings) |
| `npx jest --silent` | 10 suites, 90 tests passed |
| `node scripts/frontend-role-visibility-check.mjs` | 32 of 32 checks passed, fixtures cleaned |
| `0001_core_schema_validation` | 56/56 |
| `0002_rls_and_triggers_validation` | 123/123 |
| `0003_authority_functions_validation` | 139/139 |
| `0004_views_validation` | 81/81 |
| `0005_security_validation` | 126/126 |
| `0006_concurrency_validation` | 93/93 (as `supabase_admin`) |
| `0007_date_math_validation` | 73/73 |

All 691 database assertions pass after `npx supabase db reset` (local stack with
the pristine seed). The role-visibility harness is local-only and removes its
`frontend-role-` fixtures.

Reproduce:

```bash
npx supabase db reset
node scripts/frontend-role-visibility-check.mjs
npx tsc --noEmit
npx expo lint
npx jest --silent
# DB suites 0001–0005 and 0007 as postgres; 0006 as supabase_admin
```

## 9. Remaining gaps

1. Live staff authority calls require an AAL2 session, but the app still has no
   TOTP enrollment screen; staff accounts must be provisioned with a verified
   factor. The server refusal is shown honestly if AAL2 is missing.
2. Reversal is offered only for verified original payments in live mode; demo
   mode has no reversal workflow (the session register never verifies rows).
3. Attendance reads remain capped at the newest 2 000 rows; a date-ranged query
   will be needed before the register spans years of history.
4. Demo contact editing and plan-price staging remain session-only; they have no
   client write path and say so.

No blockers remain for Stage 3. Work stops here as instructed.
