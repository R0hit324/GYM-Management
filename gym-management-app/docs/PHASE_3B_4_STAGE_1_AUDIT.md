# Phase 3B.4 — Stage 1 Read-Only Audit

**Date:** 2026-11-17 · **Mode:** Read-only catalog inspection; no files modified, no database objects changed, no migrations applied, no commits, no remote operations, linked_project stays null.

**Stage 1 boundary:** Identification of exact approved view requirements. No SQL migrations or test suites created or modified. Stop after producing this audit report; wait for review before implementing Stage 2.

---

## 1. Authorization

Phase 3B.4 is authorized, LOCAL ONLY, and staged for review. The intended scope is migration `0004_views`: reporting and derived membership/status views, following the approved Phase 3A design.

---

## 2. Authoritative Documents Inspected (read-only)

| File | Role |
|---|---|
| `docs/PHASE_3A_FINAL_DESIGN.md` | Confirmed owner decisions (O-01 through O-36), technical assumptions, RLS matrix (§8, §8.1), table/function responsibility matrix (§10), migration plan (§11) |
| `docs/PHASE_3A_UNRESOLVED_ITEMS.md` | Unresolved boundaries: self-verify, self-reverse, pendingPayment, AAL2 default-deny |
| `docs/PHASE_3B_1_REPORT.md` | 0001 core schema validation: 56/56 PASS; table inventory; known caveats |
| `docs/PHASE_3B_2_RLS_TRIGGERS_REPORT.md` | 0002 RLS/triggers validation: 123/123 PASS; policy matrix; trigger inventory; grant snapshot; override contract |
| `docs/PHASE_3B_2_FINAL_SECURITY_AUDIT.md` | Audit conditions A–D; MEDIUM-01 (default privileges), INFORMATIONAL-01 (GUC), LOW-01/LOW-02 (trigger hygiene); verdict: APPROVED WITH CONDITIONS |
| `docs/PHASE_3B_3_AUTHORITY_FUNCTIONS_REPORT.md` | 0003 authority functions: §10 inventory; dual-form default-privilege lockdown; AAL2 gates (4 functions); G06 GUC predicate; engine facts |
| `docs/PHASE_3B_3_FINAL_SECURITY_AUDIT.md` | 0003 security audit: 9-category findings; conditions carried into 3B.3 |
| `docs/PHASE_3B_3_CUMULATIVE_REVERSAL_INVESTIGATION.md` | Partial ≠ full reversal: three ₹500 reversals on ₹1,500 original — all accepted, period not voided, cumulative cap passes at commit |

---

## 3. Existing Migration Inspection (read-only)

| Migration | Contents |
|---|---|
| `0001_core_schema.sql` | 13 extensions+enums+tables+constraints+indexes (no views) |
| `0002_rls_and_triggers.sql` | RLS+Policies+Grants+19 triggers+immutability (no views) |
| `0003_authority_functions.sql` | §10 authority functions, default-privilege lockdown, no views |

**Current database catalog:** Zero user-defined views in `public` schema — only system views (`pg_stat_statements`, `pg_stat_statements_info`).

**Git state:** Uncommitted work preserved on top of `ecb0b87`; nothing staged; root `package-lock.json` untouched.

---

## 4. Exact Approved View Inventory

From `docs/PHASE_3A_FINAL_DESIGN.md` **§11 Migration implementation plan**:

| View Name | Design Section | Description |
|---|---|---|
| `v_member_status` | §4.4, §4.6 | Pause-aware member status view |
| `v_inactive_members` | §4.6 (O-11, O-36) | Inactivity with frozen-day exclusion formula |
| `v_daily_report` | §5.4 (O-25, O-26, O-28, O-30) | Daily report: gross/reversals/net revenue, attendance |
| `v_month_revenue` | §5.4 (O-25, O-26, O-28, O-30) | Monthly revenue: gross/reversals/net revenue |

These four views are the **explicitly specified** view requirements from the approved design. The migration `0004_views` was documented in the Phase 3B plan as containing these four views.

---

## 5. View Design Details (from authoritative sources)

### 5.1 `v_member_status` (pause-aware)

**Source:** `PHASE_3A_FINAL_DESIGN.md` §4.4 (pause/rollback equivalence proof, O-09 + O-03), §4.3 (freeze eligibility O-07, O-08), §5.5 (membership_end reconstruction invariant)

**Business semantics:** 
- Pauses membership validity during approved freeze windows
- Pure pause: while frozen, `membership_end` untouched; on unfreeze, `end = E0 + f` (frozen days consumed)
- Extend-at-approval (implemented): approval sets `end = E0 + A` (inclusive days); early unfreeze subtracts unused: `end = E0 + A − (A − f) = E0 + f`
- Identical arithmetic whether pause is event-driven or rollback-driven

**Calculations:**
- `frozen_days_between(start, today)` = inclusive days actually frozen across approved windows intersecting `start..min(effective_end, today)`
- `effective_end` = `ended_at IS NULL ? end_date : ended_at::date`
- Member status: `active` if not frozen and not expired; `frozen` if approved freeze covers today; `expired` if `membership_end < gym_date()` and not actively attending

**RLS impact:** View must preserve RLS from underlying tables (`members`, `membership_freezes`, `membership_periods`). Row-level policies (`members_select_own`, `freezes_select_own`, `periods_select_own`) must remain effective.

### 5.2 `v_inactive_members` (O-11, O-36)

**Source:** `PHASE_3A_FINAL_DESIGN.md` §4.6 Inactivity with frozen-day exclusion

**Business semantics:**
- `inactive_days = (gym_date() − last_successful_attendance_date) − frozen_days_between(last_successful_attendance_date, gym_date())`
- `frozen_days_between` sums inclusive days actually frozen across approved windows intersecting that span
- Member is *inactive* when `inactive_days > 30` (30 consecutive non-frozen days without successful attendance)
- Any successful scan resets it by construction (new `last_successful_attendance_date`)
- Expired members who attend never go inactive (O-32)

**Calculations:**
- `last_successful_attendance_date` = MAX(`at`) from `attendance_events` WHERE `status = 'verified'` AND `member_id` = outer member
- `frozen_days_between(a, b)` = sum of inclusive frozen days across approved windows overlapping `[a, b]`
- `gym_date()` = configured timezone (Asia/Kolkata default)

**RLS impact:** View must preserve RLS. Member-own policy (`members_select_own`: `app_profile_role() = 'member' AND auth_user_id = auth.uid()`) must restrict visibility to the authenticated member's rows only. Receptionist/owner rows should show all members.

### 5.3 `v_daily_report` (O-25, O-26, O-28, O-30)

**Source:** `PHASE_3A_FINAL_DESIGN.md` §5.4 Revenue and reports

**Business semantics (recording date semantics, never verification date):**
- `gross = Σ payable | entry_type='payment' AND state='verified'`
- `reversals = Σ payable | entry_type='reversal' AND state='verified'`
- `net = gross − reversals`
- `attendance = COUNT verified attendance events` — total scans, repeats included, never unique-count
- `unique_visitors` = supplementary metric only
- `new_members` = from period starts
- `discounts = Σ discount_amount` over verified payments
- `refunds = reversals`

**Report columns (O-28):** member name, amount, method, payment date, UTR/reference, status, responsible receptionist

**Revenue filtering:**
- Pending and rejected payments are **never** revenue (O-26)
- Only `state = 'verified'` payments count
- Reversals counted only when `state = 'verified'`

**RLS impact:** 
- Owner: SELECT all rows (no row-level restriction)
- Receptionist: SELECT all rows (staff qualifiers via `app_profile_role()`)
- Member: SELECT own rows only (via `members_select_own` RLS pattern)
- Anon: **NO access** (zero grants, C15 in 3B.2 audit)

### 5.4 `v_month_revenue` (O-25, O-26, O-28, O-30)

**Source:** `PHASE_3A_FINAL_DESIGN.md` §5.4 Revenue and reports (same §5.4 as daily report)

**Business semantics:**
- Same calculations as `v_daily_report` but aggregated by month (calendar month or gym month using `gym_date()`)
- Same revenue filtering (verified only, pending/rejected excluded)
- Same attendance aggregation (total scans per month)
- Same discount and refund aggregation

**Temporal grouping:** Calendar months without drift (O-01): `Jan 31 + 1 month = Feb 28; Feb 29 + 1 year = Feb 28/29`. Arithmetic on `date` with gym timezone, never timestamps.

**RLS impact:** Same as `v_daily_report` — owner/receptionist unrestricted, member own-only, anon denied.

---

## 6. Security and Grant Matrix

| View | Invoker | Reader Roles | RLS Effective? | Sensitive Data Exposed | Required Grants/Revokes |
|---|---|---|---|---|---|
| `v_member_status` | **security_invoker** (recommended) | Owner: SELECT ALL; Receptionist: SELECT ALL; Member: SELECT OWN (via `auth_user_id` link); Anon: **DENIED** | ✅ Yes — view inherits RLS from underlying tables via `SECURITY DEFINER` with `set search_path = 'public'` | Member IDs, membership end dates, freeze status, attendance counts | `GRANT SELECT ON v_member_status TO authenticated;` with owner-only policy; `REVOKE SELECT ON v_member_status FROM anon, PUBLIC;` |
| `v_inactive_members` | **security_invoker** (recommended) | Owner: SELECT ALL; Receptionist: SELECT ALL; Member: SELECT OWN (via member link); Anon: **DENIED** | ✅ Yes — same RLS inheritance | Member IDs, attendance dates, frozen-day calculations, inactivity flags | `GRANT SELECT ON v_inactive_members TO authenticated;` with `REVOKE SELECT FROM anon, PUBLIC;` |
| `v_daily_report` | **security_invoker** (recommended) | Owner: SELECT ALL; Receptionist: SELECT ALL; Member: **DENIED** (reporting is staff-level); Anon: **DENIED** | ✅ Yes — view inherits RLS; owner/receptionist policies override member denial | Revenue amounts, payment dates, UTRs, discount amounts, attendance counts, member names | `GRANT SELECT ON v_daily_report TO authenticated WHERE app_profile_role() IN ('owner','receptionist');` — or: grant to owner/receptionist explicitly, no grant to authenticated generally. Better: `GRANT SELECT ON v_daily_report TO owner, receptionist;` (if those are roles) — but they're not separate roles, they're values of `app_profile_role()`. So: grant to authenticated with a check option, or grant to a role. Since there's no separate role, the typical pattern is to grant to `authenticated` and rely on the app layer to enforce, OR use `security_invoker` so the view checks the caller's profile role. |
| `v_month_revenue` | **security_invoker** (recommended) | Owner: SELECT ALL; Receptionist: SELECT ALL; Member: **DENIED** (reporting is staff-level); Anon: **DENIED** | ✅ Yes — same RLS inheritance | Same as daily report but monthly aggregated | Same as daily report — grant to owner/receptionist via profile role check |

**Critical security decision: `security_invoker` vs `security_definer`**

- **`security_invoker`**: The view's behavior depends on the caller's role. This is the correct choice for member-restricted views (`v_member_status`, `v_inactive_members`) where the RLS policies on underlying tables should take effect. The view's `WHERE` clause can reference `current_user` / `session_user` to filter rows.

- **`security_definer`**: The view runs with the definer's rights. If the definer is `postgres`, all rows are visible regardless of caller — this would violate the security model. If the definer is `owner` or a dedicated view owner, it could work but is more complex.

**Recommendation:** Use `security_invoker` for `v_member_status` and `v_inactive_members` (member-restricted views). Use `security_invoker` for `v_daily_report` and `v_month_revenue` but with a `WHERE` clause that checks `app_profile_role()` — since the view runs as the caller, the RLS on underlying tables may or may not apply depending on how the view is defined.

**Actually, re-reading the design:** The RLS matrix says:
- Member can only SELECT own rows on all tables
- Receptionist can SELECT all rows
- Owner can SELECT all rows

For a `SECURITY INVOKER` view:
- Member caller → RLS on underlying tables filters to own rows → view shows own rows ✅
- Receptionist caller → RLS on underlying tables allows all rows → view shows all rows ✅
- Owner caller → RLS on underlying tables allows all rows → view shows all rows ✅

This is the correct pattern. The view simply `SELECT ... FROM underlying_tables WHERE ...` and Postgres evaluates the underlying table's RLS policies because the query runs as the invoker.

**Grant pattern:**
- `GRANT SELECT ON v_member_status TO authenticated;` — authenticated users (member/receptionist/owner) will see rows based on their RLS policies
- `REVOKE SELECT ON v_member_status FROM anon, PUBLIC;` — explicitly deny anon/PUBLIC
- Same for other views

For `v_daily_report` and `v_month_revenue`, the design intends these as **owner/receptionist reporting views**, so:
- Grant to a role or use `security_definer` with owner as definer
- Or: grant to `authenticated` and rely on the app layer to check `app_profile_role()` before showing the report
- The safest: `REVOKE SELECT FROM anon, PUBLIC;` and `GRANT SELECT ON v_daily_report TO authenticated;` with the understanding that the app layer enforces the role check. But if we want the database to enforce it, we could make the view `SECURITY DEFINER` with definer = owner, but that's unusual.

**Simplest correct pattern:** 
- All four views: `GRANT SELECT ON <view> TO authenticated;` `REVOKE SELECT ON <view> FROM anon, PUBLIC;`
- The views use `SECURITY INVOKER`, so RLS on underlying tables naturally filters rows per the caller's role
- The app layer (or a `WHERE` clause in the view checking `app_profile_role()`) can further restrict if needed

But actually, `SECURITY INVOKER` views with `GRANT SELECT TO authenticated` will show rows based on the caller's RLS. A member sees their own rows, a receptionist sees all rows, an owner sees all rows. This matches the RLS matrix exactly.

For the reporting views (`v_daily_report`, `v_month_revenue`), the design says these are for owner/authorized staff. If we grant SELECT to `authenticated`, members could technically run the query but would see 0 rows (since their RLS filters to own member, and the report aggregates all members). This might be acceptable, or we could add a `WHERE` clause.

**Safest approach:** 
- Make all views `SECURITY INVOKER`
- `GRANT SELECT ON v_member_status TO authenticated;` `REVOKE SELECT ON v_member_status FROM anon, PUBLIC;`
- `GRANT SELECT ON v_inactive_members TO authenticated;` `REVOKE SELECT ON v_inactive_members FROM anon, PUBLIC;`
- `GRANT SELECT ON v_daily_report TO authenticated;` `REVOKE SELECT ON v_daily_report FROM anon, PUBLIC;` — members can run the query but will see 0 rows (report aggregates all members, RLS filters to own member which for a report would show nothing unless the member is looking at their own tiny subset)
- Actually, this is problematic. The reports are meant for staff, not members.

**Better approach for reporting views:** 
- Make `v_daily_report` and `v_month_revenue` include `WHERE app_profile_role() IN ('owner','receptionist')` in the view's `SELECT` query
- This way, members running the query see 0 rows (WHERE clause evaluates to false), while owners and receptionists see all rows
- This is the winning pattern because it enforces the restriction at the database level

**Final security matrix:**

| View | Security | WHERE clause | Grants |
|---|---|---|---|
| `v_member_status` | `SECURITY INVOKER` | None (RLS on underlying tables handles it) | `GRANT SELECT TO authenticated`; `REVOKE SELECT FROM anon, PUBLIC` |
| `v_inactive_members` | `SECURITY INVOKER` | None (RLS on underlying tables handles it) | `GRANT SELECT TO authenticated`; `REVOKE SELECT FROM anon, PUBLIC` |
| `v_daily_report` | `SECURITY INVOKER` | `WHERE app_profile_role() IN ('owner', 'receptionist')` | `GRANT SELECT TO authenticated`; `REVOKE SELECT FROM anon, PUBLIC` |
| `v_month_revenue` | `SECURITY INVOKER` | `WHERE app_profile_role() IN ('owner', 'receptionist')` | `GRANT SELECT TO authenticated`; `REVOKE SELECT FROM anon, PUBLIC` |

With this pattern:
- Member running `v_member_status` → sees own rows (underlying RLS `members_select_own` applies)
- Member running `v_inactive_members` → sees own rows (underlying RLS `members_select_own` applies)
- Member running `v_daily_report` → sees 0 rows (WHERE `app_profile_role() IN ('owner','receptionist')` evaluates to false for 'member')
- Member running `v_month_revenue` → sees 0 rows (same)
- Owner running any view → sees all rows (WHERE clause evaluates to true, underlying RLS also permissive for owner)
- Receptionist running any view → sees all rows (WHERE clause evaluates to true, underlying RLS also permissive for receptionist)

This is clean and consistent.

---

## 7. Freeze and Membership-Date Edge Cases

From the design and 0003 investigation:

### Freeze date edge cases in views:

1. **Future-dated approved freezes must not apply prematurely:** The frozen-now predicate is: `state='approved' AND start_date ≤ gym_date() AND (ended_at IS NULL ? end_date ≥ gym_date() : ended_at::date ≥ gym_date())`. Views must use this exact predicate, not a simpler one.

2. **Inclusive freeze days (O-02):** Freeze window `Nov 20–24` = 5 frozen days. The arithmetic `end_date − start_date + 1` gives inclusive count. Views must use inclusive counting.

3. **Early unfreeze rolls back unused days (O-03):** When a freeze is ended early, `membership_end` subtracts unused days. Views must reflect the current state based on active freeze rows, not historical states.

4. **Frozen days excluded from 30-day inactivity (O-11, O-36):** `inactive_days = (gym_date() − last_successful_attendance_date) − frozen_days_between(...)`. Views must subtract frozen days from the inactivity calculation.

5. **Scan ends freeze (O-10):** When a member scans the gym QR while frozen, the freeze is conditionally ended (`ended_at = scan date`, `ended_via = 'scan'`), and the scan counts as successful attendance. Views must reflect this conditional transition.

### Membership end reconstruction:

From `PHASE_3A_FINAL_DESIGN.md` §5.5:
`members.membership_end = (end_date of the latest non-voided period) + Σ paused-day adjustments from approved freezes whose extension is not yet baked into a later period`

Views reading `membership_end` must:
- Read `membership_periods` filtered by `NOT EXISTS (void where period_id = p.id)` — i.e., periods minus voids
- Order by `start_date desc, created_at desc`, limit 1
- Add any pause adjustments from approved freezes not yet baked into later periods

For `v_member_status` and `v_inactive_members`, the membership_end reconstruction is handled by the underlying `members` table, which is maintained by the writer functions under member-row lock. The views just need to read it correctly.

---

## 8. Reporting and Financial Calculation Rules

From `PHASE_3A_FINAL_DESIGN.md` §5.4 Revenue and reports (O-25, O-26, O-28, O-30):

### Revenue formulas (recording date semantics, NOT verification date):

```sql
gross = SELECT SUM(payable) 
  FROM public.payments 
  WHERE entry_type = 'payment' AND state = 'verified';

reversals = SELECT SUM(payable) 
  FROM public.payments 
  WHERE entry_type = 'reversal' AND state = 'verified';

net = gross − reversals;

attendance = SELECT COUNT(*) 
  FROM public.attendance_events 
  WHERE status = 'verified';  -- total scans, repeats included, never unique-count

unique_visitors = supplementary metric only (not in view, computed separately);

discounts = SELECT SUM(discount_amount) 
  FROM public.payments 
  WHERE state = 'verified';

refunds = reversals;  -- same as the reversals total
```

### Monthly aggregation:

- Group by calendar month using `date_trunc('month', recorded_at)` or gym month using `gym_date()` arithmetic
- Same formulas applied per month
- The design says "judged by payment **recording date** (O-25; matches `monthPaymentTotals`), never verification date"

### Pending/rejected exclusion:

```sql
-- These are NEVER revenue:
SELECT COUNT(*), SUM(payable) 
  FROM public.payments 
  WHERE state IN ('pending', 'rejected');
```

### Owner report columns (O-28):

`member name, amount, method, payment date, UTR/reference, status, responsible receptionist`

### Attendance analytics (O-29, O-30):

- `monthly attendance = total successful scans, not unique members` (O-30)
- Every successful scan counts, including repeat scans by the same member (O-29)
- Unique `(member_id, token_id)` guards replay; different members may share a token within validity window

---

## 9. Test Plan with Positive and Negative Cases

### Test categories:

| Category | Description | Expected |
|---|---|---|
| **View existence** | All 4 views exist and are queryable | ✅ |
| **View security** | Anon/PUBLIC get permission denied; authenticated users access based on role | ✅ |
| **Member-restricted views** | `v_member_status`, `v_inactive_members`: members see own rows only | ✅ |
| **Staff views** | `v_daily_report`, `v_month_revenue`: owners/receptionists see all rows, members see 0 rows | ✅ |
| **Revenue accuracy** | `gross` = Σ verified payable; `reversals` = Σ verified reversal payable; `net = gross − reversals` | ✅ |
| **Attendance accuracy** | `attendance` = COUNT verified attendance events (total scans, repeats) | ✅ |
| **Pending/rejected excluded** | Querying with `state IN ('pending','rejected')` returns 0 for revenue columns | ✅ |
| **Date arithmetic** | `v_inactive_members` frozen-day subtraction is correct per O-11 formula | ✅ |
| **Freeze state accuracy** | `v_member_status` freeze predicate matches frozen-now definition | ✅ |
| **Full-reversal period voiding** | After `create_reversal` with `p_amount = payable`, `membership_period_voids` has a row; `membership_end` reconstructed | ✅ (per 3B.3 investigation) |
| **Partial reversal non-voiding** | After 3×₹500 reversals on ₹1,500 original, period not voided, `membership_end` unchanged | ✅ (per 3B.3 investigation) |
| **Over-refund prevention** | Direct insert of reversal with `payable > original` is caught by deferred constraint trigger (SQLSTATE 23514) | ✅ |

### Sample test queries:

```sql
-- Test 1: Views exist
SELECT view_name FROM information_schema.views WHERE table_schema = 'public' AND view_name IN ('v_member_status','v_inactive_members','v_daily_report','v_month_revenue');

-- Test 2: Anon denied
SET ROLE anon;
SELECT COUNT(*) FROM v_member_status;  -- should be 0 or error

-- Test 3: Member sees own rows
SET ROLE authenticated;  -- as member persona
SELECT COUNT(*) FROM v_member_status WHERE member_id = <member's id>;  -- should count own rows

-- Test 4: Revenue accuracy
SELECT gross, reversals, net FROM v_daily_report WHERE report_date = current_date;

-- Test 5: Attendance count
SELECT attendance FROM v_daily_report WHERE report_date = current_date;

-- Test 6: Pending/rejected excluded
SELECT gross FROM v_daily_report WHERE state NOT IN ('pending','rejected');  -- or just verify the view definition excludes them

-- Test 7: Freeze state
SELECT member_id, status FROM v_member_status WHERE state = 'frozen';

-- Test 8: Inactivity calculation
SELECT member_id, inactive_days FROM v_inactive_members WHERE inactive_days > 30;
```

---

## 10. Unresolved Design Gaps and Security Concerns

| Gap | Severity | Description |
|---|---|---|
| **View security implementation pattern** | Medium | The `security_invoker` vs `security_definer` decision and the `WHERE app_profile_role()` pattern needs to be implemented in the actual migration. No SQL has been written yet. |
| **GYM timezone configuration** | Medium | Views use `gym_date()` which reads from `app_settings.gym_timezone`. If the timezone is changed, view results change. This is expected but must be documented. |
| **Report data freshness** | Low | Reports use `recorded_at` from payments. If the app doesn't update `recorded_at` correctly, reports are stale. The design says "judged by recording date" so this is by design. |
| **UTR exposure in reports** | Medium | `v_daily_report` and `v_month_revenue` may expose UTR fields. The RLS on `payments` restricts member access, but the view's `SELECT` list includes `utr`. Must ensure members can't UTR via the view. |
| **Attendance data privacy** | Low | `v_daily_report` includes attendance counts per member. The design says member sees own attendance only; the view's `WHERE app_profile_role()` pattern handles this. |
| **Concurrent view modifications** | Low | If a freeze is ended or a reversal is created while a view is being queried, the view may return stale data. This is expected in READ COMMITTED isolation; the view always reflects the latest committed state at query start. |
| **Report period boundary** | Low | Monthly aggregation uses calendar months or gym months. The boundary condition (Jan 31 + 1 month = Feb 28) must be tested. The design says "drift self-corrects" over time. |

**No newly invented business rules.** All view semantics are extracted from the approved design. Gaps are only in the implementation pattern, not in the business requirements.

---

## 11. Proposed Migration and Test File Names

| File | Purpose |
|---|---|
| `supabase/migrations/0004_views.sql` | **Not created yet** — this is the Phase 3B.4 migration. Contains the 4 defined views with proper `security_invoker`/`security_definer`, `WHERE` clauses, and explicit `GRANT`/`REVOKE` statements. |
| `supabase/tests/0004_views_validation.sql` | **Not created yet** — validation suite for the 4 views. Positive cases (security, accuracy, freeze states) and negative cases (anon denied, member-restricted, pending/rejected excluded). |
| `docs/PHASE_3B_4_STAGE_1_AUDIT.md` | **This file** — the read-only audit and implementation plan. |

**Migration naming convention:** Following the existing `0001_core_schema`, `0002_rls_and_triggers`, `0003_authority_functions` pattern. `0004_views` is the documented next migration in the Phase 3B plan (§11, migration plan).

**Important:** The mandate states "Do NOT create `0004_views.sql` yet" and "Do NOT create or modify SQL migrations or test suites." This audit file is the **Stage 1 deliverable** — the implementation (Stage 2) awaits explicit approval after this audit is reviewed.

---

## 12. Stage 2 — Pre-Implementation Decisions (rev. 4 — all owner decisions recorded; B1, B2 and the renewal rule resolved by owner, 2026-11-18)

**Revision note.** Rev. 1 of this section contained factual errors against the actual artifacts and has been fully rewritten. Corrections of record:

1. Rev. 1 asserted freeze states `'completed'` and `'cancelled'`. The actual `membership_freezes.state` CHECK (0001_core_schema.sql, line 316) allows only `pending / approved / rejected / ended`. There is no completed or cancelled state anywhere in the schema, design (§3 row 8), or 0003 code.
2. Rev. 1 counted consumed frozen days as `ended_at − start_date + 1`. The approved §4.4 definition is `f = clamp(u − start_date, 0, A)` — **the unfreeze day itself is an active day** (worked example: freeze Feb 1–15, scan Feb 10 → 9 frozen days, not 10).
3. Rev. 1 converted `ended_at::date` without a timezone. `membership_freezes.ended_at` is `timestamptz` (0001, line 322) and must be converted to the **configured gym timezone** before date extraction.
4. Rev. 1 retained arbitrary `LIMIT 1` transaction-detail columns in the aggregate views. These are **removed** (see §12.3).
5. Rev. 1 proposed tests via a hypothetical `SET app.current_role`. The actual supported mechanism is `SET LOCAL ROLE authenticated` + the `request.jwt.claim.sub` / `request.jwt.claims` GUCs (see §12.4).
6. Rev. 1 hardcoded `'Asia/Kolkata'` and left the `recorded_at`/`at` column types unverified. Both are verified `timestamptz`; conversion uses the configurable `app_settings.gym_timezone` (see §12.5).
7. Rev. 1 claimed O-25 settles rolling elapsed-month reporting. It does not; the exact approved wording plus the `monthPaymentTotals` cross-reference resolves this to **gym-local calendar month** (see §12.5).
8. Rev. 2 marked the freeze-adjustment incorporation rule (B1) BLOCKED with candidate rules A/B. Rev. 3 recorded the **owner's 2026-11-18 ruling** resolving B1 as the pure-pause model (§12.1). Rev. 4 records the remaining owner decisions of 2026-11-18: the renewal-before-derived-expiry rule (ruling `after_expiry`, §12.6 — documentation only, `verify_payment()` not modified) and the never-attended inactivity anchor (ruling `joined_on`, §12.2). **No documentation decision remains blocked.**

Where Sections 5–9 above conflict with this revision (e.g., §5.3's "member sees own rows" RLS bullet for staff views, the rev. 1 `LIMIT 1` SQL sketch), **this revision supersedes them.**

---

### 12.1 Freeze Arithmetic (v_member_status and freeze-derived validity)

**Actual state machine (authoritative).** `membership_freezes.state ∈ {pending, approved, rejected, ended}` (0001 line 316 CHECK; design §3 row 8). Transitions implemented in 0003: `pending → approved|rejected` (decide_freeze, conditional rowcount guard), `approved → ended` (end_freeze via receptionist, lines 797–840; check_in scan path, lines 895–915, `ended_via = 'scan'`). `ended_at` is set **only** at the `approved → ended` transition; `ended_via` is null unless `state = 'ended'` (0001 line 332).

**Effective freeze end (decision).** Per the approved frozen-now predicate (design §4.4):

```
state = 'approved'
AND start_date ≤ gym_date()
AND (ended_at IS NULL ? end_date ≥ gym_date() : (ended_at AT TIME ZONE gym_tz)::date ≥ gym_date())
```

That is: **effective freeze end = gym-local date of `ended_at` when `ended_at` is present, otherwise `end_date`.** `ended_at` is `timestamptz`, so the conversion is `(ended_at AT TIME ZONE tz)::date` with `tz` = the configured `app_settings.gym_timezone` (same expression `app_gym_date()` uses, 0003 lines 134–139) — never a bare `::date` cast, which would use the server timezone.

**The five freeze categories (corrected).** `state = 'approved'` alone is **not** sufficient to classify a freeze; the views must branch on window-begun state and `ended_at` presence:

| Category | Predicate | Frozen-day contribution |
|---|---|---|
| Pending / rejected | `state IN ('pending','rejected')` | none (undecided / refused) |
| Approved, future-dated | `state='approved' AND start_date > gym_date()` | none yet; will pause once begun |
| Approved, begun, not ended (active) | `state='approved' AND start_date ≤ gym_date() AND ended_at IS NULL` | frozen now iff `end_date ≥ gym_date()`; frozen days so far = `[start_date, min(end_date, gym_date())]` inclusive |
| Ended early (via receptionist or scan) | `state='ended' AND ended_at IS NOT NULL` | consumed `f = clamp(gym_local(ended_at) − start_date, 0, A)`; frozen days = `[start_date, gym_local(ended_at) − 1]`; **the unfreeze day is an active day** (§4.4 worked example) |
| Approved, window elapsed, no end event | `state='approved' AND start_date ≤ gym_date() AND end_date < gym_date() AND ended_at IS NULL` | full planned window consumed: `A = extension_days = end_date − start_date + 1` (O-02 inclusive); no natural-completion event exists in 0003 — `end_freeze`/scan are the only `→ ended` paths |

`A = extension_days` is written once at approval by `decide_freeze` (0003 line 759: `extension_days = (end_date − start_date) + 1`, O-02 inclusive; CHECK `extension_days ≥ 1`, 0001 line 330).

**Equality boundary: freeze end vs later period start (resolved).** Evidence chain:

- Renewal while frozen is **refused**: `verify_payment` raises `'Member is currently frozen; end the freeze before verifying a renewal.'` when an approved window covers today (0003 lines 335–343, O-04) — the identical inclusive predicate used by `check_in`'s scan-end (0003 lines 908–910). No `membership_periods` row can therefore be created with `start_date` inside an active approved freeze window.
- A post-freeze renewal's `start_date` = stored `members.membership_end + 1` (before-expiry branch, 0003 line 372) or the verification date (post-expiry branch, O-05). `membership_end` is **purely payment-derived and never contains freeze adjustments** (0001 comment on `members.membership_end`: "freeze pause adjustments are derived from membership_freezes in the 0004 views, never stored here"; 0003 header line 29; `decide_freeze`/`end_freeze`/`check_in` write only freeze columns).
- Therefore the equality case `period.start_date = freeze effective end + 1` is the ordinary post-freeze renewal case, and `period.start_date` inside an active window is impossible. A frozen day can never equal a later period's `start_date` (the unfreeze day is active; renewals while frozen are refused).

**RESOLVED — adjustment-incorporation rule (owner ruling, 2026-11-18).** The approved §5.5 invariant reads: *"membership_end = (end_date of the latest non-voided period) + Σ paused-day adjustments from approved freezes whose extension is not yet baked into a later period"*, with the concretization *"period end_date is computed at creation from the then-current membership_end, so freeze extensions inside an era are baked into the next renewal's stacked end."* That wording presupposes the design's **extend-at-approval** model (§4.3: *"membership_end += extension_days"* at decision). The implemented model is deliberately different — **derived pause** ("per owner instruction at 3B.1", 0001 `membership_freezes` table comment): `membership_end` is never advanced, and `verify_payment`'s renewal arithmetic (`start = membership_end + 1`, `end =` era-anchor arithmetic from the latest period's `start_date`, 0003 lines 367–374) consequently **never bakes any freeze extension into any period**. Under the implemented model the §5.5 "baked into a later period" test never fires as literally written. The owner has now ruled on exactly this gap.

**Owner ruling (recorded verbatim as the authoritative resolution for B1):**

> "Membership duration must remain the full purchased duration, regardless of how many days the member freezes. Frozen days do not consume membership validity. Once the freeze ends, the remaining membership duration resumes. Expiry is extended by the actual number of frozen calendar days, not the requested/planned freeze duration."

This is the **pure-pause model**: the purchased duration is never shortened by freezing, and expiry is pushed later by exactly the frozen calendar days actually served — re-anchored on top of the latest membership period at every point in time.

**Operative view rule (derived from the ruling + implemented arithmetic).** The pause-aware expiry reported by `v_member_status` is:

```
effective_expiry = end_date of the latest non-voided membership period
                 + | ⋃ frozen calendar days of every freeze with state ∈ {approved, ended}
                     whose window has begun (start_date ≤ gym_date()),
                     limited to days ≤ gym_date(),
                     union-deduplicated across windows |
```

Per-window frozen-day set (effective-end semantics per §12.1's table):

| Window state | Frozen-day set counted |
|---|---|
| Approved, begun, not ended | `[start_date, min(end_date, gym_date())]` inclusive — today is frozen while an active window covers it; the set grows by one day per elapsed frozen day |
| Ended (receptionist or scan) | `[start_date, gym_local(ended_at) − 1]` — the unfreeze/scan day is an active day (§4.4); **scan-ended freezes stop accumulating on the scan date** per the approved inclusive convention |
| Approved, window elapsed, no end event | `[start_date, end_date]` — the full planned window (no natural-completion event exists in 0003) |
| Future-dated, pending, or rejected | empty — **future-dated freezes pause nothing before their start date** |

Ruling implications, mapped:

- **Full purchased duration preserved.** Period `end_date`s are untouched (0003 writer functions unchanged); the pause lives entirely in the view-derived adjustment.
- **Early unfreeze credits only actual frozen days.** `f = clamp(gym_local(ended_at) − start_date, 0, A)` — the unused planned days credit nothing. `extension_days` (planned `A`) is used **only** as the clamp bound, never as the extension magnitude (ruling: "not the requested/planned freeze duration").
- **Adjustments preserved across renewals; no earned day lost.** Because `verify_payment` never bakes frozen days into any period (start and end are both freeze-free), the §5.5 "not yet baked into a later period" qualifier never suppresses anything under the implemented model: the Σ is **lifetime-cumulative** over all begun freezes, always carried on top of the latest non-voided period. A later period's creation can neither absorb nor erase previously earned frozen days.
- **Each frozen day compensates exactly once.** Union-deduplication across windows (live windows cannot overlap per `freezes_no_overlap`; ended rows can — the union handles the edge). The compensation re-anchors at the end of the latest period at each renewal — never lost, never doubled.
- **Monotonicity.** Every renewal's new period `end_date` exceeds the previous stored end, so the derived expiry never decreases across a renewal.
- **Voided periods / reversals.** The base is the latest period **excluding `membership_period_voids`** (O-23; `create_reversal` recomputes the same basis, 0003 lines 587–600). Partial reversals never touch periods (O-24). The cumulative frozen-day total is unaffected by voids.

**Consistency with stored `membership_end` and later renewal periods (required documentation).** `members.membership_end` equals the latest non-voided period's `end_date` by construction — `verify_payment` writes both together (0003 lines 395–407) and `create_reversal` recomputes both on a full-reversal void (O-23). The views therefore derive the base from `membership_periods ∖ membership_period_voids` (per §5.5, not from the stored column), and in the normal case `effective_expiry = stored membership_end + cumulative frozen days`. Three deliberate divergences between the stored column and the derived expiry are documented, none requiring 0003 changes:

1. **While frozen (active window):** stored end is static; derived expiry grows one day per elapsed frozen day ("frozen days do not consume membership validity").
2. **After early unfreeze, before renewal:** stored end unchanged; derived expiry = stored end + `f` — "once the freeze ends, the remaining membership duration resumes" from the unfreeze day.
3. **After a renewal:** stored end moves to the new period's end; the cumulative frozen-day total rides on top ("preserve consumed freeze-day adjustments across renewals"). Where the new period starts is governed by the owner's **renewal-behavior ruling (`after_expiry`, 2026-11-18, §12.6)**: a renewal made before the member's freeze-adjusted derived expiry must start on the **calendar day after that derived expiry**, preserving all remaining entitlement and never starting from the payment date while derived expiry is still future. The current `verify_payment()` implementation (before-expiry branch `start = stored membership_end + 1`; post-expiry branch `start = ` verification date, 0003 lines 367–374) does not implement this rule and must be checked against it in a **separately authorized future implementation scope**; it is not modified in this task. Under the ruling the earned frozen-day total still carries forward on top of the new period, and O-05's "gap days uncovered" concern does not arise because the compensation is carried, not consumed.
4. **`check_in` coherence:** `check_in` gates only on `membership_end IS NULL` (pendingPayment) and admits expired members silently (O-32); a frozen member whose stored end has passed can still scan, which ends the freeze — consistent with the derived expiry, no writer change.

**Superseded design text (recorded, no conflict action needed).** §4.3's "membership_end += extension_days" at approval and §4.4's display note ("between approval and window start the member shows the extended end") describe the stored-extend model. Under the ruling, a future-dated freeze shows **no** extension until its window begins. The ruling is authoritative; the derived-pause implementation (owner instruction at 3B.1) is confirmed as the model of record. 0003 behavior and all membership writer functions remain untouched.

**Tests (now unblocked by the ruling).**
Positive: active approved freeze covering today → status `frozen`, derived expiry = latest period end + frozen days so far, growing one day per elapsed frozen day; scan-ended freeze → `f = gym_local(ended_at) − start_date`, scan day active and counted as verified attendance (O-10), accumulation stops at the scan date; receptionist-ended freeze → identical arithmetic; window elapsed with no end event → full planned window counted; future-dated approved freeze → contributes nothing until `start_date ≤ gym_date()`; early unfreeze → expiry extended by `f < A` only; renewal after freeze → derived expiry = new period end + cumulative frozen days (earned days preserved, not absorbed); two freezes with overlapping consumed ranges (ended-row edge) → union counts the overlap once; voided latest period → base becomes the previous non-voided period's end, frozen total unchanged (O-23).
Negative/security: rejected/pending freezes contribute nothing; when `f < A` the expiry must reflect `f`, proving `extension_days` is never used as the magnitude; a bare `ended_at::date` (server timezone) shifts rows when server tz ≠ gym tz — documenting why the conversion is mandatory; no period start falls inside an active window (O-04 refusal); the 0003 validation suite passes unchanged (no writer-function behavior change).

---

### 12.2 Inactivity (v_inactive_members) — interval intersection

**Approved formula (§4.6, O-11, O-36).** `inactive_days = (gym_date() − last_successful_attendance_date) − frozen_days_between(last_successful_attendance_date, gym_date())`, where `frozen_days_between` *"sums inclusive days actually frozen across approved windows intersecting that span (start..min(effective_end, today), effective_end honoring ended_at)"*. Member is inactive when `inactive_days > 30` (O-36: "Inactive = 30 consecutive non-frozen days without successful attendance; successful attendance resets it"). O-11: "Frozen days are excluded from the 30-day inactivity calculation."

**Interval-intersection calculation (replaces rev. 1's window-presence predicate).** Rev. 1 summed whole windows that merely touched the span and could not dedupe overlaps. Corrected approach — clip each freeze's frozen interval to the inactivity span, then count the **union**:

```
per freeze f with state IN ('approved','ended')        -- pending/rejected excluded
  frozen_end(f) = (f.ended_at IS NOT NULL
                    ? gym_local(f.ended_at) − 1        -- unfreeze day is an active day (§4.4)
                    : LEAST(f.end_date, gym_date()))   -- today is frozen while an active window covers it
  frozen_interval(f) = [f.start_date, frozen_end(f)] ∩ [L + 1, gym_date()]   -- L = last successful attendance date
frozen_days = | union of frozen_interval(f) over all qualifying f |     -- each day counted once
inactive_days = (gym_date() − L) − frozen_days
is_inactive = (inactive_days > 30)
```

- `L + 1` as the span's lower clip: the attendance day `L` is an active day by definition. A freeze whose window started on `L` is automatically empty here — a scan on `L` would have ended it via `ended_via='scan'` with `f = 0` (O-10; 0003 lines 895–915).
- **Double-counting:** overlapping windows are impossible for two *live* (pending/approved) windows — storage-level exclusion `freezes_no_overlap` on the generated `active_range` (0001 lines 334–344; §4.3). But `ended` rows carry an *empty* `active_range` and may overlap other windows' consumed days (e.g., an early-ended window whose planned range a later window re-uses). The union (e.g., `range_agg` over the clipped intervals, or a merge of sorted intervals) counts each day once, implementing §4.6's "days **actually frozen**".
- `ended_at` respected: the consumed portion of an ended window stops at `gym_local(ended_at) − 1`, not at the planned `end_date` (early end) and not beyond `min(end_date, …)` semantics of the planned window.
- Rejected (and pending) freezes excluded entirely — there is no `cancelled` state in the schema.
- Retroactive windows: `request_freeze` checks only `end ≥ start` (0003 lines 665–667), so a window may be approved after its `start_date`. The approved frozen-now predicate (§4.4) is **state-based and ignores `decided_at`**; the frozen-day accounting therefore follows the state-based predicate (days from `start_date` count as frozen once the window is approved/ended). Documented as the approved behavior, not an implementation choice.
- Successful attendance resets by construction: `L = MAX(at) over verified attendance_events` (only verified rows are ever stored, O-35), so any new scan moves `L` forward and collapses `inactive_days` toward 0.

**Threshold (preserved exactly).** Exactly 30 non-frozen days since the last successful scan → `is_inactive = FALSE`; 31 → `TRUE` (O-36's "30 consecutive non-frozen days" is completed, not exceeded, at 30).

**Positive tests (required by owner review).**
- Freeze entirely inside the span: L = day 0, freeze days 10–14 → 5 frozen days subtracted.
- Freeze partially overlapping: freeze starts before `L+1` and ends inside the span → only the intersection is subtracted (clip test).
- Freeze fully containing the span → entire span frozen → `inactive_days = 0`, never inactive while frozen.
- Freeze ending after `gym_date()` (active window): frozen through today; nothing counted.
- Early-ended freeze (receptionist and scan variants): contribution stops at `gym_local(ended_at) − 1`.
- Two windows whose consumed ranges overlap via the ended-row edge → union counts the overlap once.
- Boundary: last scan exactly 30 non-frozen days ago → FALSE; 31 → TRUE; scan on the boundary date → counter collapses to 0.
- Expired member attends (O-32): `inactive_days` still computed; no check-in warning (0003 `check_in` has no warning path).
- Never-attended member (owner ruling `joined_on`): member with zero verified attendance events and `joined_on` 40 days ago, no frozen days → `inactive_days = 40`, `is_inactive = TRUE`; same member with 10 frozen days since `joined_on` → `inactive_days = 30`, `is_inactive = FALSE` (threshold preserved).

**RESOLVED BY OWNER — never-attended member (former B2; owner ruling, 2026-11-18).** The approved §4.6 formula references `last_successful_attendance_date` and defines reset behavior, but no approved artifact defined the case where a member has never had a successful attendance event. The owner has now ruled:

- **Owner ruling: `joined_on`.** When a member has never had a successful attendance event, use `members.joined_on` as the inactivity anchor (`L`) (0001 line 109, `date not null default current_date`).
- The already documented inactivity formula applies unchanged, including subtraction of frozen days: `inactive_days = (gym_date() − L) − frozen_days_between(L, gym_date())`, with `L = joined_on` for never-attended members.
- The existing threshold is preserved exactly: inactive only when `inactive_days > 30`; exactly 30 days is **not** inactive.

**Status: RESOLVED BY OWNER (2026-11-18).** This is a documentation resolution for the view definition; the confirming test above is specified for Stage 2 execution and its outcome is not asserted here.

---

### 12.3 Reporting Grain (v_daily_report, v_month_revenue) — LIMIT 1 detail columns removed

**The conflict, identified.** O-28 defines *transaction-level* columns: "member name, amount, method, payment date, UTR/reference, status, responsible receptionist." The two reporting views are *period-grain aggregates*: the §11 view inventory lists them as "`v_daily_report`, `v_month_revenue` **(gross/reversals/net)**" (design line 447), and §5.4's report metrics (`attendance` total scans O-30, `new_members`, `discounts`, `refunds`) are all aggregates. A one-row-per-period aggregate cannot carry per-transaction columns without either fanout (JOIN) or an **arbitrary representative row** (`LIMIT 1`) — and an arbitrary representative amount/UTR/member presented next to an aggregate total is misleading data, not a compromise.

**Resolution (authorized by the design).** The design itself assigns O-28 elsewhere: §5.4, final bullet — *"Owner exports (Excel/PDF, monthly + custom range, **O-28 columns**) are an **application feature for a later phase** — the design guarantees the data (receptionist attribution visible to owner via `recorded_by`/`verified_by` joins to `profiles`)."*

Decision:
1. `v_daily_report` and `v_month_revenue` contain **only aggregate columns** per §5.4: `gross`, `reversals`, `net`, `attendance`, `discounts`, `refunds`, `new_members` (from period starts). **No member name, amount, method, payment date, UTR, status, or receptionist columns; no `LIMIT 1` subqueries anywhere.**
2. Each aggregate is an independent scalar subquery against its base table (no cross-table JOINs, no fanout); the view returns exactly one row per period grain.
3. The four-view inventory is preserved; **no fifth view** is created for O-28 detail rows. O-28 is satisfied in the later-phase export feature at the application layer, where the underlying table grants already guarantee the data (§8: owner SELECT-all on `payments` and `profiles`).
4. Rev. 1's `LIMIT 1` SQL sketch and its "pragmatic compromise" framing are **withdrawn**.

**Genuine conflict / missing authority:** none remaining — the design explicitly scopes O-28 to the export feature. If the owner *intends* O-28 columns to live inside the views, that is a new decision superseding §11's aggregate-only inventory and must be given explicitly.

**Tests.**
Positive: one row per grain regardless of row counts in `payments`/`attendance_events`; `gross`/`reversals`/`net` reconcile against direct `SUM` queries; pending/rejected contribute 0 (O-26); attendance counts repeats (O-29/O-30).
Negative/security: no column of the view exposes a UTR, member name, or receptionist attribution (schema assertion: column list contains only aggregate columns); a member session receives 0 rows from both views (§12.4 mechanism); no JOIN-produced row multiplication with 5 payments + 3 events on one date.

---

### 12.4 `app_profile_role()` — actual definition verified

**Correction of scope.** The function is defined in **0002_rls_and_triggers.sql (lines 84–92)**, not in 0003 — both rev. 1 and the review premise located it incorrectly. There is no `app_profile_role` definition in 0003 (verified: zero occurrences in the file).

**Actual definition (0002 lines 84–92):**

```sql
create function public.app_profile_role() returns text
language sql
stable
security definer
set search_path = 'public'
as $$
  select p.role from public.profiles p where p.id = auth.uid()
$$;
```

- **Mode:** `SECURITY DEFINER` with pinned `search_path = 'public'`.
- **Role source:** the authoritative `profiles.role` row for `auth.uid()` — never JWT role claims (function comment, 0002 lines 93–94: "Returns the authoritative profiles.role for the caller (auth.uid()), or NULL when no profile exists (default deny)… cannot be used for privilege escalation").
- **Grants (0002 lines 433–436):** `EXECUTE` revoked from `public`, `anon`, and `service_role`; granted to `authenticated` only.
- **Caller identity under DEFINER:** the DEFINER context elevates only the function body's read of `profiles` (by design, to bypass caller RLS — 3B.2 audit INFORMATIONAL-04: "definer reads bypass caller RLS by design; policy graph acyclic; no escalation surface"). `auth.uid()` resolves from the **caller's** JWT (`request.jwt.claim.sub`), which is unaffected by the function's definer context. Therefore inside a `SECURITY INVOKER` view the function returns the **caller's** role, and the `WHERE app_profile_role() IN ('owner','receptionist')` pattern in the two staff views behaves correctly: member → `'member'` → 0 rows; owner/receptionist → full rows. Rev. 1's fear that "if SECURITY DEFINER, the pattern breaks" was unfounded: definer context changes the body's privileges, not the caller's identity inputs. This caller-resolution is the same mechanism every RLS policy in 0002 already relies on (e.g., line 271) and is cross-role-validated by the 0002 suite.

**Tests (real Supabase authenticated contexts — the established suite convention).** Per the 0002 validation suite (lines 22–24): *"authenticated — member/receptionist/owner personas, via `SET LOCAL ROLE` + the `request.jwt.claim.sub` / `request.jwt.claims` GUCs (exactly how `auth.uid()` resolves identity)"*. No hypothetical `SET app.current_role` is used anywhere:

```sql
BEGIN;
  SET LOCAL ROLE authenticated;
  SET LOCAL request.jwt.claim.sub = '<member-auth-user-uuid>';
  SELECT count(*) FROM public.v_daily_report;    -- expect 0
  SELECT count(*) FROM public.v_month_revenue;   -- expect 0
  SELECT count(*) FROM public.v_member_status;   -- expect own row only
  SET LOCAL request.jwt.claim.sub = '<receptionist-uuid>';
  SELECT count(*) FROM public.v_daily_report;    -- expect full
  SET LOCAL request.jwt.claim.sub = '<owner-uuid>';
  SELECT count(*) FROM public.v_daily_report;    -- expect full
ROLLBACK;
```

Plus: `anon` → permission denied on all four views (grants model); `service_role`/`public` cannot execute `app_profile_role()` at all (0002 lines 433–436). **Status: RESOLVED** — actual definition, grants, and mechanism are inspected and documented; the tests above are specified for Stage 2 execution (a proposed test is not evidence; the resolution here rests on the inspected definition, not on test outcomes).

---

### 12.5 Gym-Timezone Conversion and Month Semantics

**Column types verified (correction of rev. 1's open question).** `payments.recorded_at` is `timestamptz not null default now()` (0001 line 151). `attendance_events.at` is `timestamptz not null default now()` (0001 line 410). Both carry absolute instants; a bare `::date` cast would depend on the server timezone and is prohibited.

**Conversion rule.** Gym-local date of any timestamp = `(ts AT TIME ZONE tz)::date` where `tz` is the **configured** timezone, using exactly the expression the approved `app_gym_date()` uses (0003 lines 134–139):

```sql
coalesce((select s.gym_timezone from public.app_settings s where s.id = 1), 'Asia/Kolkata')
```

The `'Asia/Kolkata'` literal appears **only** as the fallback inside this coalesce — it is part of the approved function definition being reused, not a hardcode. The views inline this expression (a per-query scalar subquery) rather than creating a new helper function, staying within §11's scope for `0004_views` (the four views). IANA zone names are handled correctly by `AT TIME ZONE`, including DST zones, matching `app_gym_date()`'s mechanism exactly.

**Month semantics — resolved to gym-local calendar month (correction of rev. 1).** Rev. 1 claimed O-25 endorses a "sliding elapsed-month window"; it does not. Evidence chain:

- O-25's exact approved wording: *"Reports show gross collections, reversals, net revenue, judged by the payment **recording date**."* This fixes **which timestamp** is authoritative (recording, never verification) and says nothing about month boundaries.
- §5.4 adds: *"All judged by recording date (O-25; **matches `monthPaymentTotals`**), never verification date."* The design explicitly ties the reports' semantics to the existing app function.
- The actual `monthPaymentTotals` (`src/utils/payment.ts` lines 74–102) buckets by **calendar month**: `const d = new Date(p.createdAt); if (d.getFullYear() !== year || d.getMonth() !== month) continue;` — fixed year/month buckets, not a rolling window.
- O-01 mandates *"all arithmetic on `date` with the gym timezone (`gym_date()`), never timestamps"* — which corrects the app function's client-device-local parsing to the gym-local calendar.

Decision: `v_month_revenue` aggregates verified payments whose **gym-local calendar month of `recorded_at`** equals the current gym-local calendar month of `gym_date()`; `v_daily_report` aggregates the gym-local date equal to `gym_date()`. Reporting periods (month/day buckets of *recordings*) are distinct from membership validity arithmetic (§4.1's anchored period `end_date` + the freeze adjustments of §12.1) — the two share only the gym-timezone date convention.

**Historical / custom report ranges.** §5.4 assigns monthly + custom-range exports (with O-28 columns) to the **application layer, later phase**; the design "guarantees the data" via table grants (§8: owner SELECT-all on `payments`, `profiles`, `attendance_events`). The four-view inventory contains no parameterized-period view, and none is invented. **Status: RESOLVED as out of view scope** — not BLOCKED, because the design explicitly assigns this responsibility elsewhere; any in-database custom-range reporting would be a new owner decision.

**Tests.**
Positive: payment recorded `2026-11-17 23:59 IST` → daily bucket 2026-11-17; `2026-11-18 00:01 IST` → 2026-11-18; a `gym_timezone` change to a DST zone (e.g., `America/New_York`) shifts both the daily bucket and the month boundary on the next query with no caching; Jan-31-style clamping affects only §4.1 period arithmetic, not report buckets.
Negative: a bare `recorded_at::date` (server timezone) must produce different buckets when server tz ≠ gym tz — demonstrating why the configured conversion is mandatory; month-end payment at 23:59 gym-local on the last day of the month belongs to that month, not the next.

---

### 12.6 Renewal-Behavior Rule (owner decision, documentation only)

**Owner ruling (recorded verbatim as authoritative, 2026-11-18).**

> **Decision 1 — Renewal before derived expiry.** Owner ruling: `after_expiry`. If a member renews before their freeze-adjusted derived expiry, the new membership period must start on the calendar day after that derived expiry. Preserve all remaining entitlement from the existing membership period. Do not start the new period from the payment date when the existing derived expiry is still in the future.

**Rule statement.** For a renewal whose payment is verified while `derived expiry ≥ verification date` (derived expiry per §12.1: latest non-voided period end + cumulative actual frozen days, B1 pure-pause ruling):

```
new_period.start_date = derived_expiry + 1 day
new_period.end        = per the approved anchoring arithmetic (§4.1/§4.2)
```

- All remaining entitlement from the existing membership period is preserved: the member's remaining derived validity is not truncated by the renewal; the new coverage begins the day after it ends.
- The new period must **not** start from the payment/verification date while the derived expiry is still in the future (this is exactly the O-05 post-expiry re-anchor behavior, which applies only when the renewal happens **after** the derived expiry has passed).
- This rule composes with the B1 pure-pause ruling without altering it: the cumulative frozen-day total rides on top of the new period's end exactly as documented in §12.1.

**Documentation resolution ≠ implementation authorization.** This is a **required renewal-behavior rule** for the membership model. The current `verify_payment()` implementation does **not** conform: its before-expiry branch starts the new period at `stored membership_end + 1` (0003 line 372) and its post-expiry branch at the verification date — neither is "derived expiry + 1". `verify_payment()` **must be checked against this rule and, if adopted, changed in a separately authorized future implementation scope.** That change is **NOT authorized in this task**; no code, migration, or 0003 behavior is modified here. Until such authorization, the divergence between the implemented renewal anchoring and this documented rule stands as an implementation-vs-ruling gap to be resolved later — the 0004 views must be written against the **ruling** (derived expiry), which is computable from existing tables without any writer change.

**Status: RESOLVED BY OWNER (2026-11-18), documentation only.** Implementation of the renewal rule itself is deferred to a future authorized scope.

---

## 13. Summary of Resolved and Blocked Decisions

A decision is marked **Resolved** only where inspected evidence and reasoning are both present. A *proposed* test is not evidence that anything passes; where a resolution rests on specification alone, the specifying artifact is cited and the confirming tests are deferred to Stage 2 execution.

### Resolved

| # | Decision | Basis (inspected evidence) |
|---|---|---|
| R1 | Freeze state machine and category predicates: `pending/approved/rejected/ended` only; effective freeze end = gym-local(`ended_at`) when present, else `end_date`; five categories branched on window-begun state and `ended_at`; `state='approved'` alone is insufficient | 0001 lines 316, 322, 330–332; design §3 row 8, §4.4; 0003 lines 696–771, 797–840, 895–915 |
| R2 | Consumed frozen days `f = clamp(gym_local(ended_at) − start_date, 0, A)`; the unfreeze day is an active day; `A = extension_days = end_date − start_date + 1` (O-02) | Design §4.4 worked example; 0003 line 759; 0001 line 330 |
| R3 | Frozen-now predicate (status `frozen`) is state-based per §4.4, ignoring `decided_at` (retroactive windows noted) | Design §4.4; 0003 lines 335–343, 908–910 |
| R4 | Equality boundary: renewals while frozen are refused (O-04); no period `start_date` inside an active window; post-freeze renewal start = stored `membership_end + 1` or verification date; frozen day ≠ later period start (unfreeze day is active) | 0003 lines 335–343, 372; 0001 `members.membership_end` comment; design §4.2, O-05 |
| R5 | Inactivity: interval-intersection with per-freeze clipping to `[L+1, gym_date()]`, `ended_at` respected, pending/rejected excluded, union dedupe of overlapping windows (live windows cannot overlap per `freezes_no_overlap`; ended rows can — union handles the edge); threshold `> 30` (30 = not inactive, 31 = inactive) | Design §4.6, O-11, O-36; 0001 lines 334–344; 0001 line 282 (verified-only storage, O-35) |
| R6 | Aggregate views contain **no** transaction-detail columns; all `LIMIT 1` representative values removed; O-28 belongs to the later-phase export feature (application layer); four-view inventory preserved, no fifth view | Design line 447 (§11 inventory: "gross/reversals/net"), §5.4 export bullet, O-28; owner may override with an explicit new decision |
| R7 | `app_profile_role()`: `SECURITY DEFINER`, `search_path='public'`, reads authoritative `profiles.role` via caller `auth.uid()`; EXECUTE to `authenticated` only (revoked from public/anon/service_role); returns the **caller's** role inside `SECURITY INVOKER` views; staff-view WHERE pattern is sound | 0002 lines 84–94, 433–436; 3B.2 audit INFORMATIONAL-04; 0002 RLS policies (e.g., line 271) |
| R8 | Role-context tests use `SET LOCAL ROLE authenticated` + `request.jwt.claim.sub`/`request.jwt.claims` GUCs (the actual supported mechanism); no hypothetical GUCs | 0002 validation suite lines 22–24 (established convention) |
| R9 | `recorded_at` and `attendance_events.at` are `timestamptz`; conversion `(ts AT TIME ZONE configured_tz)::date` with the `app_gym_date()` coalesce expression; no bare `::date` casts; no hardcoded zone outside the approved fallback | 0001 lines 151, 410; 0003 lines 134–139 |
| R10 | Month semantics: **gym-local calendar month** (fixed year/month bucket), not rolling elapsed-month; O-25 alone does not settle it — the §5.4 "matches `monthPaymentTotals`" cross-reference plus the actual calendar-month implementation of `monthPaymentTotals` (`src/utils/payment.ts` lines 74–102) and O-01's gym-local date rule do | Design O-25, O-01, §5.4; app source inspected |
| R11 | Historical/custom report ranges are out of view scope — application-layer export feature per §5.4; no parameterized view invented | Design §5.4, §11 |
| R12 | **Freeze-adjustment incorporation rule (former B1) — RESOLVED by owner ruling (2026-11-18), pure-pause model:** expiry is extended by the **actual** frozen calendar days (never the planned `extension_days`), carried **lifetime-cumulatively** on top of the latest non-voided period across all renewals — earned frozen days are never absorbed or erased by a later period; per-window frozen-day sets per R1/R2, union-deduplicated; future-dated freezes contribute nothing before their start; scan-ended freezes stop accumulating on the scan date; base = `membership_periods ∖ membership_period_voids` (O-23); stored `membership_end` untouched, 0003 writer functions unchanged | Owner ruling recorded verbatim in §12.1; consistent with §5.5 under the derived-pause implementation (0001 table comment; 0003 lines 367–374, 395–407, 587–600) |
| R13 | **Never-attended inactivity anchor (former B2) — RESOLVED BY OWNER (2026-11-18):** when a member has never had a successful attendance event, the anchor is `members.joined_on`; the documented inactivity formula applies unchanged (`inactive_days = (gym_date() − L) − frozen_days_between(L, gym_date())`), threshold preserved: inactive only when `inactive_days > 30`, exactly 30 is not inactive | Owner ruling recorded in §12.2; formula per design §4.6, O-11, O-36; `joined_on` column 0001 line 109 |
| R14 | **Renewal before derived expiry — RESOLVED BY OWNER (2026-11-18):** ruling `after_expiry` — a renewal made before the member's freeze-adjusted derived expiry starts the new period on the **calendar day after that derived expiry**, preserving all remaining entitlement; never from the payment date while derived expiry is still future. **Documentation resolution only** — the current `verify_payment()` does not conform and must be checked against this rule in a separately authorized future implementation scope; no code is modified in this task | Owner ruling recorded verbatim in §12.6; composes with R12 without altering it |

### Blocked (owner decision required before Stage 2)

**None.** All previously blocked decisions are now resolved by owner ruling: B1 (pure-pause freeze model, R12), B2 (joined_on inactivity anchor, R13), and the renewal-before-derived-expiry rule (`after_expiry`, R14).

**Stage 2 gate.** No documentation decision blocks `0004_views.sql`. However, **Stage 2 remains unauthorized**: these decisions are documentation resolutions only, not permission to begin implementation. Stage 2 (`0004_views.sql` + validation suite) may begin only upon the owner's explicit implementation authorization. Separately, the `verify_payment()` conformance check/change required by R14 belongs to a future, separately authorized implementation scope.

**Stop conditions (all verified):**
- [✅] Do NOT create `0004_views.sql` yet
- [✅] Do NOT create or modify SQL migrations or test suites
- [✅] Do NOT apply migrations or change the local database
- [✅] Do NOT modify frontend, backend application code, or authentication
- [✅] Do NOT link Supabase or perform any remote Supabase operation
- [✅] Do NOT commit, push, publish, or deploy
- [✅] Do NOT modify existing Phase 3B.1, 3B.2 or 3B.3 artifacts

*Stop — B1 (pure-pause freeze model, §12.1), B2 (joined_on inactivity anchor, §12.2), and the renewal-before-derived-expiry rule (`after_expiry`, §12.6) are all resolved by owner ruling as documentation decisions. Stage 2 (`0004_views.sql` + validation suite) and the `verify_payment()` conformance change required by §12.6 remain unauthorized and must not begin until explicitly authorized.*

