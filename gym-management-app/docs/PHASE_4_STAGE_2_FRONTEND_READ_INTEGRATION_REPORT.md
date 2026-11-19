# Phase 4 — Stage 2 Frontend Read Integration Report

Scope: replace demo-only screen data with **read-only** Supabase reads in the
existing Expo app, per role, without changing UI, navigation, business rules or
the demo experience. No payments, freezes, reversals or membership writes were
added; no RPC, policy, grant, trigger or migration was changed; no remote
project was contacted; no Git operation was performed.

Environment: local Supabase stack (`supabase_db_GYM_Management`, PostgreSQL 17,
GoTrue with local TOTP + test-OTP SMS), migrations `0001`–`0005` + `seed.sql`,
Expo SDK 58 app. Live mode remains opt-in via `EXPO_PUBLIC_AUTH_MODE=live`;
the default is still `demo`, so every screen keeps its demo labelling unless a
real session is restored.

---

## 1. What was added or changed

### New files

| File | Purpose |
|------|---------|
| `src/services/data/rows.ts` | Exact PostgREST row shapes for the four verified views and the readable tables. Separate from UI domain types so a missing column can never be silently invented. |
| `src/services/data/queries.ts` | The only SELECT layer. Uses the existing singleton client (`@/services/supabase/client`) with explicit column lists, deterministic ordering and row limits. No insert/update/delete/RPC. |
| `src/services/data/mappers.ts` | Row → domain mappers (`toMemberStatus`, `toInactiveMember`, `toPayment`, `toAttendance`, `toPlan`, `toDailyReport`, `toMonthlyRevenue`, `latestFollowUps`). Honest neutrals where the backend has no value. |
| `src/services/data/demo-fallbacks.ts` | Module-constant demo values derived from the existing demo dataset (no new sample data), so demo mode is byte-for-byte the approved figures. |
| `src/services/data/use-data.ts` | `useMembers`, `useInactiveMembers`, `usePayments`, `useAttendance`, `usePlans`, `useDailyReport`, `useMonthlyRevenue`, `usePendingApplications`, `useMyMembership`, `useMyAttendance`, `useMemberProfile`. Each returns `{ data, status, error, refresh, isLive }`. |
| `src/services/data/index.ts` | Public barrel for the hooks and types. |
| `scripts/frontend-role-visibility-check.mjs` | Local-only role-visibility harness: real Member / Receptionist / Owner sessions, the exact client column lists, local-URL guard, `frontend-role-` fixtures, cleanup unless `--keep`. |

### Changed files (Stage 2)

| File | Change |
|------|--------|
| `src/utils/format.ts` | Added `memberDisplayId()`: keeps `m-1042` → `GB-1042` for demo ids and shows the first eight UUID characters as `GB-XXXXXXXX` for live ids (presentation only; routing keeps the real id). |
| `src/components/ui/feedback.tsx` | Added `DataRefreshControl` (shared pull-to-refresh control). |
| `src/components/workspace/workspace-ui.tsx` | `WorkspaceScreen` accepts an optional `refreshControl`. |
| `src/components/owner/owner-ui.tsx` | `OwnerScreen` accepts an optional `refreshControl`. |
| `src/app/(reception)/home.tsx` | Live daily report / attendance / members / payments, combined error, skeleton, pull-to-refresh, live-aware caption. |
| `src/app/(reception)/members.tsx` | Live member directory, live today's attendance, live plans; search/buckets unchanged. |
| `src/app/(reception)/renewals.tsx` | Live member directory; buckets still computed client-side from the same 7-day rule. |
| `src/app/(reception)/transaction-history.tsx` | Live payments + members + plans; month navigation, search, filters and totals unchanged; live-aware footer. |
| `src/app/(reception)/member-profile.tsx` | One member's live status/payments/attendance/plans; contact edit remains demo-only; honest "Not recorded" labels; loading / error / not-found states. |
| `src/app/(reception)/attendance.tsx` | Live members + attendance events; monthly grid and summaries unchanged; today's register reads live rows. |
| `src/app/(owner)/dashboard.tsx` | Live month revenue, payments, member status, inactivity (with the 30-day/expiry rule applied client-side), real attendance week strip, pending applications; skeleton/error/refresh. |
| `src/app/(owner)/lost.tsx` | Live `v_inactive_members` + plans; same 30-day/expiry filters; null-safe expiry detail; plan names. |
| `src/app/(owner)/members.tsx` | Live `v_member_status` + plans; locked price shown only when recorded. |
| `src/app/(owner)/report.tsx` | Live daily/monthly ledger, period payment split, membership counts, pending applications, discounts/refunds; period charts omitted in live with an explicit note; actor-detail row replaced by a caption. |
| `src/app/(member)/attendance.tsx` | Own live membership and attendance; live-aware status labels; visit-list states come from the hooks; demo review controls hidden in live. |
| `supabase/tests/0007_date_math_validation.sql` | Test-only determinism fix (see §7). No schema, policy, grant, trigger or function changed. |

Screens deliberately **not** integrated in this stage: `(reception)/fees.tsx`,
`(reception)/payment-qr.tsx`, `(reception)/more.tsx` and the auth screens. The
first two are write flows outside a read-only stage; auth was Stage 1.

---

## 2. Read-layer design

- **One client, one service module.** Every query goes through
  `getSupabaseClient()` — the existing singleton. No second client, no second
  auth provider, no duplicated screen or service.
- **Explicit SELECT lists.** The client never uses `select('*')`; the column
  lists in `queries.ts` are the same lists exercised by the role harness, so a
  missing grant or renamed column fails there before it fails on a device.
- **RLS is the only authority.** No role filtering is done client-side to hide
  rows; the UI renders what the signed-in session is allowed to select. Client
  filters that remain (search boxes, buckets, verifications queue) are
  presentation filters over already-authorised rows.
- **Row limits.** Attendance selects the newest 2 000 rows, payments the newest
  rows ordered by `recorded_at`, month revenue the two newest months, daily
  report the newest day. These are read-shaping limits, not permission filters.
- **No writes.** Grep-visible truth: `queries.ts` contains `select` only, and no
  screen calls an insert/update/delete/RPC in live mode.
- **Loading never falls back to demo.** In live mode, while a session restores,
  the hooks report `loading` with empty data. Demo values are returned only when
  the provider itself is `demo`.

### Hook → source mapping

| Hook | Live source | Notes |
|------|-------------|-------|
| `useMembers` | `v_member_status` (18 columns) + `follow_up_events` | Already-computed status/expiry; latest follow-up per member. |
| `useInactiveMembers` | `v_inactive_members` (14 columns) + `follow_up_events` | The view returns **every** member with inactivity metrics; consumers apply the 30-day/expiry rule. |
| `usePayments` | `payments` (18 columns) + `v_member_status` | Member names are joined for display; payment rows stay exactly as stored. |
| `useAttendance` | `attendance_events` (`id, member_id, door, status, checked_in_at`) + `v_member_status` | Verified-only rows, newest 2 000. |
| `usePlans` | `plans` (`id, name, duration, price, currency, is_active`) | Members see active plans; staff see all, per RLS. |
| `useDailyReport` | `v_daily_report` (newest row) | Returns `null` when the session may not see report rows. |
| `useMonthlyRevenue` | `v_month_revenue` (two newest months) | Current + previous month for the MoM comparison. |
| `usePendingApplications` | `join_applications` (`id, state`) | Counts `submitted` + `pendingVerification`. |
| `useMyMembership` | `v_member_status` + `follow_up_events` | The member's own single row. |
| `useMyAttendance` | `attendance_events` + `v_member_status` | The member's own rows only. |
| `useMemberProfile` | `v_member_status` + `payments` + `attendance_events` + `plans` + `follow_up_events` | Selects by the route's member id; a row the role may not read simply does not exist. |

---

## 3. Screen behaviour (live vs demo)

| Screen | Live reads | Loading / empty / error / refresh |
|--------|-----------|-----------------------------------|
| Reception home | Daily report, today's attendance, member status, payments | Skeleton while the first read is in flight; combined error banner with retry; pull-to-refresh; "Today" caption switches wording in live mode. |
| Reception members | `v_member_status`, today's attendance, plans | Skeleton, error/retry, pull-to-refresh; search and the 7-day buckets unchanged. |
| Reception renewals | `v_member_status` | Skeleton, error/retry, refresh; expiring/expired/frozen buckets and contact actions unchanged. |
| Transaction history | `payments`, `v_member_status`, `plans` | Skeleton, error/retry, refresh; month navigation, search, filters and the month total stay independent of filters. |
| Member profile | One member's status, payments, attendance, plans | Loading skeleton, error/retry, "no member matches that link" state; contact editing offered only in demo. |
| Attendance register | `v_member_status` + `attendance_events` | Skeleton, error/retry, refresh; monthly grid, per-date records and monthly summary unchanged. |
| Owner dashboard | `v_month_revenue`, `payments`, `v_member_status`, `v_inactive_members`, `attendance_events`, `v_daily_report`, `join_applications` | Skeleton, error banner with retry, pull-to-refresh; week strip built from distinct recorded attendance days. |
| Owner lost list | `v_inactive_members` + `plans` | Skeleton, error/retry, refresh; same inactivity/expiry filters; null expiry is shown honestly. |
| Owner members | `v_member_status` + `plans` | Skeleton, error/retry, refresh; locked price shown only if recorded. |
| Owner report | `v_daily_report`, `v_month_revenue`, `payments`, `v_member_status`, `join_applications` | Skeleton, error banner, refresh; daily/monthly switch unchanged; per-period verified UPI/cash split. |
| Member attendance | Own `v_member_status`, `attendance_events`, `plans` | Refresh control, error banner, visit-list states from the hooks; demo-only review controls hidden in live. |

Honesty rules kept in live mode:

- The demo badge is rendered only when the provider is demo (`demo={!live}`), so
  real rows are never labelled sample data.
- Figures that have no backend source are omitted or plainly captioned, never
  filled with sample points: the owner period-series charts (live), the
  actor-level "who authorised today" detail row, and overdue-fee alerts.
- `₹0` is shown when the authorised data really is zero; nothing is borrowed
  from the demo ledger.
- Missing fields say "Not recorded" / "no locked price yet" instead of inventing
  values.

Demo mode is unchanged: it still reads `useSessionMembers()` /
`useSessionPayments()`, so desk-recorded payments and staged contact edits behave
exactly as before.

---

## 4. Role-visibility verification

`node scripts/frontend-role-visibility-check.mjs` — **32 of 32 checks passed,
0 failures**, fixtures removed.

The harness creates four real auth users (owner, receptionist, member A,
member B), signs in through GoTrue, takes the staff sessions to **AAL2** with a
TOTP factor, inserts `frontend-role-` fixtures through the local Postgres
container, and then queries PostgREST with each session's access token using the
exact column lists from `queries.ts`.

| Role | Proven |
|------|--------|
| Member | Exactly one `v_member_status` row — their own, with real status/expiry/plan columns; cannot read the other member through the view; `members` exposes only their linked row; only their own payments and attendance rows; the active plan catalogue; **no** `v_daily_report` / `v_month_revenue` rows; no other member through `v_inactive_members`; no follow-up rows; only their own profile. |
| Receptionist | Every member status row; both fixture payments; member attendance; inactivity metrics for both fixtures with `is_inactive` true for the expired one and false for the member who visited today; today's daily report with real `net`, `attendance` and `unique_visitors`; the current month revenue row; follow-up and join-application reads. |
| Owner | Every member status row; payment rows; daily and month revenue views; the audit trail. |
| Negative | Member cannot read the audit trail; member reads no application that is not theirs; anonymous requests are rejected (401) on member status. |

Fixture cleanup ran through the local container and the database was confirmed
pristine afterwards (`members = 0`, `payments = 0`, `attendance_events = 0`,
`profiles = 0`, `auth_users = 0`, `qr_tokens = 0`).

---

## 5. Static checks

| Command | Result |
|---------|--------|
| `npx tsc --noEmit` | clean |
| `npx expo lint` | exit 0, no errors |
| `npx jest --silent` | 9 suites, 79 tests pass |

---

## 6. Database regression suites

Run against the local stack after one `npx supabase db reset`
(migrations `0001`–`0005` + `seed.sql`), in the documented order:

| Suite | Result |
|-------|--------|
| `0001_core_schema_validation.sql` | 56/56 pass |
| `0002_rls_and_triggers_validation.sql` | 123/123 pass |
| `0003_authority_functions_validation.sql` | 139/139 pass |
| `0004_views_validation.sql` (the view suite the screens depend on) | 81/81 pass |
| `0005_security_validation.sql` | 126/126 pass |
| `0007_date_math_validation.sql` | 73/73 pass (after the fix in §7) |
| `0006_concurrency_validation.sql` (as `supabase_admin`) | 93/93 pass |

The database was reset once more afterwards and is at the pristine seeded
state: `plans = 4`, `settings = 1`, and zero members, payments, attendance
events, profiles, auth users, QR tokens and join applications.

---

## 7. Test-only fix: `0007` timezone-boundary determinism

The first run of `0007` at this session's wall-clock (05:00 UTC) reported
71/73: `C25` (Etc/GMT+12 `effective_expiry`) and `C27` (Etc/GMT+12 renewal
start) failed. Root cause is in the **test**, not in the view:

- The fixtures anchor their dates to `public.app_gym_date()` at insert time,
  which is the Asia/Kolkata date (e.g. `G = 2026-11-19`).
- The timezone-boundary checks then switch `app_settings.gym_timezone` to
  `Etc/GMT+12` and compared against `public.app_gym_date() + 28` / `+ 29`,
  re-evaluating "today" under the new zone.
- At UTC times before 12:00 (and at/after 18:30), the Kolkata date and the
  UTC-12 date differ by one day, so the expectation moved while the stored
  fixture dates did not. The suite passed at Stage 1 only because it ran inside
  the 12:00–18:30 UTC window where both dates coincide.

Fix: capture the fixture anchor once (`create temporary table suite_anchor as
select public.app_gym_date()`), and express the Kolkata and UTC-12 expectations
for `C22`, `C24`, `C25` and `C27` against that anchor. Assertion semantics are
unchanged (20:00 UTC is `G-1` in Kolkata and `G-2` in UTC-12; the UTC-12 result
stays exactly one day earlier), the fix only removes the clock dependency.
Result: **73/73** at 05:0x UTC, i.e. in the window where the old form failed.

No schema, policy, grant, trigger, function or view was modified.

---

## 8. How to reproduce

```bash
# local stack + pristine seed
npx supabase db reset

# role read verification (local only, cleans up)
node scripts/frontend-role-visibility-check.mjs
# static checks
npx tsc --noEmit
npx expo lint
npx jest --silent

# DB suites (psql through the local container, in this order)
# 0001–0005, 0007 as postgres; 0006 as supabase_admin
```

Both verification scripts resolve the local URL and keys from
`supabase status -o env` at runtime (`scripts/local-stack.mjs`, with
`SUPABASE_*` environment overrides). No key is stored in the repository.

To see the screens read live data, run the app with
`EXPO_PUBLIC_AUTH_MODE=live` and a complete local Supabase env, and sign in with
a provisioned member session or a staff session that has a verified TOTP factor.
Without that, the app stays in demo mode and renders the approved demo data.

---

## 9. Remaining gaps and blockers

1. **Join-application submission still has no client path.** `join_applications`
   INSERT remains `service_role`-only, so a real applicant cannot submit from the
   app. The secure approach is a `SECURITY DEFINER` submit RPC that inserts only
   the caller's application (`auth.uid()`, own contact data, state forced to
   `submitted`), validates/normalises the payload, rate-limits duplicate pending
   applications, and writes the audit entry with the caller as actor — not a
   client-side INSERT. Not implemented in this stage.
2. **No staff TOTP enrollment UI.** Live staff sign-in requires AAL2, but the app
   has no enrollment screen; staff accounts must be provisioned with a verified
   factor (as the harness does) until that flow exists.
3. **No period-series source.** `v_daily_report` / `v_month_revenue` expose
   single-day/month aggregates, not ranges, so the owner report's trend charts
   are omitted in live mode rather than filled with sample points. A bounded
   range view or aggregate query would be needed.
4. **Actor-level authorisation detail is not exposed** by the current read
   views; the report screen shows a plain caption in live mode.
5. **Member contact editing is demo-only.** The write path (validated update plus
   audit entry attributed to the signed-in receptionist) belongs to a write
   stage; in live mode the action is not offered.
6. **`v_inactive_members` returns every member.** Consumers (owner dashboard,
   lost list) apply the 30-day/expiry rule themselves; any new consumer must do
   the same, or the view should be given an explicit `WHERE is_inactive` variant
   in a later stage.
7. **Attendance reads are capped at the newest 2 000 rows.** Fine for the
   current dataset; a date-ranged query is needed before the register spans
   years of history.
8. **Overdue-fee tracking** has no read source yet, so the owner overview keeps
   its explicit "not part of the current views" caption.
9. **Write screens still use the demo session store.** Fees entry, Payment QR,
   Freeze, Door QR, Plans and More are unchanged and keep their demo badge even
   when the app runs in live mode, because their write paths were out of scope
   for this read-only stage. They must not be used as if they persisted anything
   to the backend.

---

## 10. Confirmations

- No write path, RPC argument or service-role field was added to the app; the
  read layer selects only.
- No RLS policy, grant, trigger, authority function, view or migration was
  changed in this stage (only the `0007` test file, §7).
- No remote Supabase operation was performed: the reset, suites and harness all
  targeted `127.0.0.1` and the harness refuses non-local URLs.
- No Git staging, commit, push or branch operation was performed; all work
  remains uncommitted.

Stage 2 is complete; stopped here as instructed.
