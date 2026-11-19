# Phase 3B.5 — Security, Concurrency & Date-Math Verification

Status: **complete** (verification only; no commit, no frontend work, no Phase 4).

Environment: local Supabase stack (`supabase_db_GYM_Management`), PostgreSQL 17,
migrations `0001`–`0004` applied by `npx supabase db reset`.

## 1. Test runs

One fresh reset, then the suites executed in order. All counts are literal
assertion counts emitted by each suite's verdict block.

| # | Suite | Assertions | Result |
|---|-------|-----------:|--------|
| 1 | `0001_core_schema_validation.sql` | 56 | 56/56 pass |
| 2 | `0002_rls_and_triggers_validation.sql` | 123 | 123/123 pass |
| 3 | `0003_authority_functions_validation.sql` | 139 | 139/139 pass |
| 4 | `0004_views_validation.sql` | 81 | 81/81 pass |
| 5 | `0005_security_validation.sql` (new) | 126 | 126/126 pass |
| 6 | `0006_concurrency_validation.sql` (new) | 93 | 93/93 pass |
| 7 | `0007_date_math_validation.sql` (new) | 73 | 73/73 pass |
| | **Total** | **691** | **691/691 pass** |

Reproduction (from `gym-management-app/`):

```bash
npx supabase db reset
for f in 0001_core_schema_validation 0002_rls_and_triggers_validation \
         0003_authority_functions_validation 0004_views_validation \
         0005_security_validation 0007_date_math_validation; do
  docker cp "supabase/tests/$f.sql" "supabase_db_GYM_Management:/tmp/$f.sql"
  docker exec supabase_db_GYM_Management psql -U postgres -d postgres -f "/tmp/$f.sql"
done
# 0006 needs the local superuser because it opens real dblink backends:
docker cp supabase/tests/0006_concurrency_validation.sql \
  supabase_db_GYM_Management:/tmp/0006_concurrency_validation.sql
docker exec supabase_db_GYM_Management psql -U supabase_admin -d postgres \
  -f /tmp/0006_concurrency_validation.sql
```

(`psql` prints its verdict as a `NOTICE` on stderr, so PowerShell reports
exit code 1 even on success; the logs contain no `ERROR:` line.)

## 2. Defect fixed (production code)

**Late unfreeze over-credited days.** For an `ended` freeze whose `ended_at`
falls *after* its scheduled `end_date`, both `verify_payment()` and the views
credited every day up to `ended_at - 1`, past the approved window.

Reproduction before the fix: window `2026-11-08 .. 2026-11-12` (5 approved
days) ended on `2026-11-16` produced `effective_expiry = 2026-12-16` (+8 days)
instead of `2026-12-13` (+5).

Approved rule (`docs/PHASE_3B_4_STAGE_1_AUDIT.md` §4.4):

```
f = clamp(gym_local(ended_at) - start_date, 0, extension_days)
```

Implementation fix — cap the consumed range at `end_date`:

- `supabase/migrations/0003_authority_functions.sql`
  `verify_payment()` frozen-day `generate_series` upper bound becomes
  `least(f.end_date, gym_local(ended_at) - 1)`.
- `supabase/migrations/0004_views.sql`
  `frozen_union` and both `v_inactive_members.frozen_between` expressions
  (`generate_series` bound and the `g.d <= ...` guard) add `least(f.end_date, ...)`.

Regression coverage: `0007` C19/C21 (view and RPC agree on 5 days for a
`G-10 .. G-6` window ended `G-2`), plus `0004` C03/I06 unchanged.

Business rules were **not** altered; the code was brought back to the
documented rule.

## 3. Test-harness defects found and fixed

| Where | Problem | Fix |
|-------|---------|-----|
| `0004` fixture `00000066` (I05) | Fixture `end_date = G-14` but `ended_at = G-10`, and the expectation (8 credited days) only held under the pre-fix over-credit. | Window widened to `G-18 .. G-11` with `extension_days = 8`, so the fixture is internally consistent and still proves union-merge (4 + 8 − 2 overlap = 10 distinct days). |
| `0005` B08 | `count(*) = 2` on `plans` only true on a pristine DB (0001 baseline plans exist). | Assertion now: no inactive plan is visible, the inactive fixture is hidden, both active fixtures are visible. |
| `0005` B18 | Exact global counts (4/7/3) break in a chained run. | Counts scoped to `3b5%` fixtures; policy-widening is still proven because the receptionist is not a member row. |
| `0004` cleanup | Deleted fixture members but never their `000000*` plans. | Added `delete ... from plans where id::text like '000000%'` and Z02 coverage. |
| `0005` / `0006` cleanup | Left their own plans behind (`3b5c*`, `3b6c*`). | Added plan deletes; Z01 now asserts zero plan residue. |
| `0002` cleanup | Generated dependent rows (payments/periods/freezes/attendance on `bbbbbbbb-*`) survived, so later global counts were order-dependent. | Targeted cleanup at the end of 0002; the 0001 baseline (2 plans, 2 members, 2 profiles) is preserved because 0003 relies on it. |
| `0005`/`0006`/`0007` `check_true` | A `NULL` boolean (e.g. scalar subquery over a missing fixture row) counted as neither pass nor fail, i.e. a silent pass. | `coalesce(p_ok, false)` + explicit "NULL condition" detail. Confirmed no assertion relied on that hole. |

After the chain the database contains only the intended 0001 baseline:
`plans = 2`, `members = 2`, `profiles = 2`, and zero
payments/periods/freezes/attendance/audit rows.

## 4. Coverage summary

**Security (`0005`, 126)** — 13-RPC EXECUTE surface; role matrix for
member/receptionist/owner/anon/profileless; RLS isolation on every table and
on `security_invoker` views; AAL2 gates; Owner denied restricted writes;
no JWT-claim trust in policies; audit attribution. No escalation path found.

**Concurrency (`0006`, 93)** — real second backends via `dblink`; each race
proves the lock with `lock_timeout` → `55P03`, then retries after commit to
hit the business guard:

- same member + same token scan (winner only, replay `55000`, fresh token ok)
- one gym token, two members (no cross-member serialization, one row each)
- same payment verified twice (one period, one audit row)
- two payments for one member (member-row lock, contiguous stack)
- freeze approve/approve, approve/reject (both orders), one decision only
- receptionist end vs QR scan termination (both orders, correct attribution,
  no contradictory audit rows)
- partial reversals (600 then exactly 400 of 1000), full reversal + void,
  `membership_end` reconstructed, deferred cap backstop (`23514` on commit)
- overlapping freeze requests → GiST `23P01` after the lock releases
- cross-cutting invariants T01–T05 (no duplicate attendance, disjoint periods,
  no orphaned verified payment, cap holds, freeze state coherence)

**Date math (`0007`, 73)** — calendar source (configured tz honoured, session
`TimeZone` cannot override, `Asia/Kolkata` fallback); month-end/leap-year
anchoring (`2036-02-29` → `2036-03-01 .. 2036-03-31`; `2037-02-28` →
`2038-02-28`); post-expiry re-anchor; first payment; active/future/pending/
early-ended/overlapping/late-ended freezes; timezone-boundary pair (same
`20:00Z` instant = 9 days in `Asia/Kolkata`, 8 in `Etc/GMT+12`); scan-ended
freezes incl. scan on the start day (0 days); earned days preserved across
two renewals; 30-day inactivity boundary, B2 `joined_on` anchor, frozen-day
exclusion and dedupe.

## 5. Residual risks

1. `0006` must run as `supabase_admin`; the stack's `postgres` role cannot
   `dblink_connect`. Any CI runner with a different superuser needs the flag
   changed (documented in the suite header).
2. The concurrency suite proves mutual exclusion with `lock_timeout`, not
   sustained multi-actor load; deadlock probability above two actors is not
   measured (lock order is consistently member → payment → freeze/original).
3. A freeze unfrozen after its `end_date` now silently stops accruing at
   `end_date`. That is correct per the rule, but the UI must surface an
   overdue freeze decision, otherwise the receptionist may believe the member
   gained days they did not.
4. `0007` uses fixed 2036 fixtures for the anchored-renewal branch; assertion
   A00 fails loudly once `2036-02-29` is no longer in the future, so the suite
   cannot rot silently.
5. Suites create real rows and delete them; an interrupted run leaves
   `3b5*/3b6*/3b7*/000000*` residue and requires `supabase db reset`.
6. `v_member_status.effective_expiry` is a timestamp; consumers must compare
   `::date` (documented, asserted in F01/F02).

## 6. Files changed

Production:

- `supabase/migrations/0003_authority_functions.sql` — freeze-day clamp in
  `verify_payment()`.
- `supabase/migrations/0004_views.sql` — freeze-day clamp in `frozen_union`
  and `v_inactive_members`.

Tests:

- `supabase/tests/0005_security_validation.sql` (new)
- `supabase/tests/0006_concurrency_validation.sql` (new)
- `supabase/tests/0007_date_math_validation.sql` (new)
- `supabase/tests/0002_rls_and_triggers_validation.sql` — cleanup completeness
- `supabase/tests/0004_views_validation.sql` — I05 fixture consistency,
  plan cleanup, Z02 coverage

Docs:

- `docs/PHASE_3B_5_VERIFICATION_REPORT.md` (this file)

All changes remain uncommitted; nothing was staged.
