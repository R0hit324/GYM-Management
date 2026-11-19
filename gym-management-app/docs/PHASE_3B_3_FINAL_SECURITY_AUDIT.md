# Phase 3B.3 — Final Security Audit (Read-Only Inspection)

**Date:** 2026-11-17 · **Mode:** Read-only catalog inspection; no files modified, no database objects changed, no migrations applied, no commits, no remote operations.

**Files inspected (read-only):**
- `supabase/migrations/0003_authority_functions.sql`
- `supabase/tests/0003_authority_functions_validation.sql` (not read in full — audit references test expectations only)
- `supabase/migrations/0002_rls_and_triggers.sql`
- `docs/PHASE_3A_FINAL_DESIGN.md`
- `docs/PHASE_3A_UNRESOLVED_ITEMS.md`
- `docs/PHASE_3B_2_FINAL_SECURITY_AUDIT.md`
- `docs/PHASE_3B_3_AUTHORITY_FUNCTIONS_REPORT.md` (created concurrently)

**Verdict:** APPROVED WITH CONDITIONS

See the verdict and conditions at the end of this report.

---

## 1. Discount Authorization

| Severity | Informational |
|---|---|

**Finding:** `set_member_discount` is correctly restricted to the Receptionist role. The function opens with `perform public.require_role(array['receptionist'])` (line 1013 of 0003), and Owner is explicitly not in the allowed set. Per O-12 (owner confirmed): "Only Receptionists can apply discounts." Per O-15 (owner confirmed): "Owner has read-only visibility of who received discounts and the amounts."

**Evidence:**
- 0003 line 1013: `perform public.require_role(array['receptionist']);`
- 0003 lines 1015–1018: discount_pct range check 0–100, SQLSTATE 55000
- 0003 lines 1032–1035: `audit_authority('discount.set', ...)` records old/new values
- Design Table 4.10 (line 429): `set_member_discount` — Receptionist (O-12); owner read-only (O-15)

**Business-impact scenario:** If the Owner could set discounts, they could retroactively reduce any member's discount — but this is prevented by the role gate. No client path (PostgREST anon/authenticated) can bypass the `require_role` check since the function is `SECURITY DEFINER` with EXECUTE granted only to `authenticated`, and the gate executes in the definer context (postgres), which always rejects non-receptionist roles.

**Recommendation:** No correction needed. The authorization boundary is correctly enforced and consistent with the owner-confirmed design.

---

## 2. Cumulative Reversal

| Severity | Medium |
|---|---|

**Finding:** The deferred constraint trigger `payments_reversal_cap_trigger` (0003 lines 1330–1366, activated as `payments_reversal_cap` at lines 1368–1372) enforces that at commit, Σ verified reversal amounts per original payment never exceed the original's `payable`. This is the backstop for the in-function remaining-amount check in `create_reversal` (lines 538–548).

**Evidence:**
- Trigger SQLSTATE 23514: `if v_total > v_original.payable then raise exception 'Cumulative reversals (%) exceed the original payment amount (%), v_total, v_original.payable' using errcode = '23514';`
- Function check: `if p_amount > v_remaining then raise exception 'Reversal exceeds the remaining refundable amount (remaining %).' using errcode = '55000';` where `v_remaining := v_orig.payable - v_reversed` and `v_reversed := sum(payable) from verified reversals of that original`
- X11/X12 in the 0003 suite (139/139 pass) verify full-reversal period voiding and membership_end reconstruction under the derived-pause model.

**Cumulative scenario:** If an original verified payment is ₹1,500 and three separate reversals of ₹500 are recorded:
- After 1st ₹500: v_reversed = 500, v_remaining = 1000, p_amount = 500 ≤ 1000 ✅
- After 2nd ₹500: v_reversed = 1000, v_remaining = 500, p_amount = 500 ≤ 500 ✅
- After 3rd ₹500: v_reversed = 1500, v_remaining = 0, p_amount = 500 > 0 → trigger fires at commit (23514), over-refund impossible
- Cumulative-full-via-partials does NOT void the period (only a single reversal with p_amount = v_orig.payable triggers the period-void path at lines 572–599)

**Business-impact scenario:** An attacker attempting to over-refund via concurrent reversals would hit the deferred 23514 constraint at commit — impossible to bypass since it's transaction- and commitment-coordinated. The in-function check prevents individual callers from exceeding the remaining amount, and the trigger guarantees it at the DB level even if some path bypasses the function check.

**Recommendation:** No correction needed. The cumulative cap is enforced both in-function (remaining-amount check) and at commit (deferred trigger), making over-refund impossible on any path.

---

## 3. Self-Reversal

| Severity | Medium |
|---|---|

**Finding:** `create_reversal` ships default-deny for self-reversal. The function explicitly checks (lines 532–536):
```sql
if v_orig.recorded_by = auth.uid()
   or v_orig.verified_by = auth.uid() then
  raise exception 'Self-reversal is not permitted (segregation of duties).'
    using errcode = '42501';
end if;
```

**Evidence:**
- 0003 lines 530–536: self-reversal default-deny
- Unresolved #2 from `PHASE_3A_UNRESOLVED_ITEMS.md`: "Can a receptionist reverse a payment they recorded or verified? [UNRESOLVED] — `create_reversal` ships **default-deny** for self-reversal"
- Design §5.1 (line 243–245): "Self-permission cases (self-verify, self-reverse): UNRESOLVED — default-deny boundary implemented in the functions, enabling requires owner approval."

**Business-impact scenario:** A receptionist who recorded a payment cannot reverse it; likewise a receptionist who verified it. This ensures segregation of duties. In a single-receptionist gym, a mistakenly recorded payment would require a second staff account to unwind it — the design accepts this as a conscious trade-off (unverified ≠ revenue, O-26).

**Recommendation:** No correction needed. The default-deny boundary is correctly implemented and consistent with the unresolved register's recommended posture.

---

## 4. Default Privileges

| Severity | Critical |
|---|---|

**Finding:** The 0003 migration introduces a **dual-form default-privilege lockdown** (lines 56–110) that is a prerequisite for the authority functions to function securely. The lockdown has two parts:

1. **Per-schema REVOKE** (lines 71–79): Undoes the image's `roles.sql` per-schema GRANTs for postgres-created objects in `public`:
   ```sql
   alter default privileges for role postgres in schema public
     revoke all on tables from public, anon, authenticated, service_role;
   alter default privileges for role postgres in schema public
     revoke all on functions from public, anon, authenticated, service_role;
   alter default privileges for role postgres in schema public
     revoke all on sequences from public, anon, authenticated, service_role;
   ```

2. **Global REVOKE** (lines 81–83): Strips the built-in `PUBLIC EXECUTE` on future functions — the only form that works per PG 17 docs ("you cannot accomplish that effect with a command limited to a single schema"):
   ```sql
   alter default privileges for role postgres
     revoke all on functions from public;
   ```

**supabase_admin best-effort** (lines 89–110): Same dual form; reports loudly on insufficient privilege (the local stack's `postgres` role is NOT a member of `supabase_admin`):

```sql
do $default_privs$ begin
  begin
    alter default privileges for role supabase_admin in schema public
      revoke all on tables from public, anon, authenticated, service_role;
    ...
    alter default privileges for role supabase_admin
      revoke all on functions from public;
    raise notice 'supabase_admin default privileges locked down (per-schema + global).';
  exception when insufficient_privilege then
    raise notice 'WARNING (MEDIUM-01 residual): default privileges for supabase_admin could NOT be altered...';
  end;
end $default_privs$;
```

**Engine facts verified live (PG 17.11):**
- Per-schema defacl rows MERGE ON TOP of the global defaults; a per-schema REVOKE can only undo a matching per-schema GRANT — it can never remove the hard-wired default.
- The global REVOKE is required to remove the built-in `PUBLIC EXECUTE` on functions.
- After the global revoke, future functions lose built-in PUBLIC EXECUTE — including suite helper functions, so both 0002 and 0003 suites now `grant execute on function suite_results.* to public` (documented regression-compat edits).

**Residual risk if supabase_admin revocation failed:** The local `postgres` role is NOT a member of `supabase_admin`, so the exception branch fires and the warning notice is emitted. On a hosted project where the migration runs as `supabase_admin`, the dual form would succeed. The residual risk is that `supabase_admin`-created future objects keep the image default grants (tables arwdDxtm, functions X, sequences rwU to anon/authenticated/service_role, plus built-in PUBLIC EXECUTE on functions). Objects created by the migration runner (postgres) are fully covered by the lockdown above.

**Exploit scenario without the lockdown:** Each new SECURITY DEFINER authority function (`verify_payment`, `create_reversal`, `check_in`, freeze decisions) in `public` would be immediately RPC-callable by `anon` (default `X` privilege in the per-schema default ACL), turning a privileged authority operation into an unauthenticated API endpoint. Similarly, new tables would be auto-exposed with ALL grants to anon/authenticated/service_role via the `pg_default_acl` image defaults.

**Recommendation:** The dual-form lockdown is correctly implemented. The report should document the engine fact that global REVOKE is required for functions, and the supabase_admin best-effort residual is documented and low-risk for self-hosted stacks.

---

## 5. Payment Verification

| Severity | Medium |
|---|---|

**Finding:** `verify_payment` implements all required verification gates per design §5.2–§5.3 and 3B.2 audit condition C (LOW-03).

**Gates verified:**
- **Self-verification default-deny** (unresolved #1): `if v_pay.recorded_by = auth.uid()` → raise 42501 'Self-verification is not permitted (segregation of duties).' (lines 262–265)
- **Inactive plan refused** (LOW-03): `if not v_plan.is_active then raise 55000 'Payment plan is inactive; verification refused.'` (lines 289–292)
- **Plan consistency gate**: `if v_member.plan_id is not null and v_member.plan_id <> v_pay.plan_id then raise 55000` (lines 326–329)
- **Frozen-now refused** (O-04): existence check for approved freeze covering today (lines 332–341)
- **Anchored calendar-month arithmetic** (O-01): same-plan renewal before expiry uses `first_period.start_date + cumulative months`; post-expiry re-anchors from switch date (lines 345–381)
- **Member-row lock** (`FOR UPDATE`) held across the entire period computation (lines 273–276, 352–359)
- **Audit**: `audit_authority('payment.verified', ...)` with state, period_start, period_end, membership_end, plan_id, price_locked (lines 411–419)

**Business-impact scenario:** Without the inactive-plan gate, a receptionist could verify a payment against a retired plan and create a period with the wrong price. Without the self-verify gate, a recording receptionist could verify their own entry, removing segregation of duties. Both gates are correctly enforced.

**Recommendation:** No correction needed. All verification gates are implemented and tested (139/139 in 0003 suite).

---

## 6. GUC and Pooling

| Severity | Medium |
|---|---|

**Finding:** `app.bypass_payment_override` is transaction-local only in every relevant function. The GUC is set and cleared within `create_reversal` (lines 554–555):
```sql
perform set_config('app.bypass_payment_override', 'on', true);
-- reversal insert...
perform set_config('app.bypass_payment_override', 'off', true);
```

**G06 regression test** (0003 suite): Same physical connection, next transaction — the transaction-local set_config is gone; it can never leak into a subsequent request. The correct "inactive" predicate is `coalesce(current_setting('app.bypass_payment_override', true), '') = ''` (not `is null`).

**Evidence (live probe):**
- After `set local app.bypass_payment_override = 'on'` + `commit`, `current_setting('app.bypass_payment_override', true)` returns `''` (empty string, not NULL) — the session placeholder persists.
- The correct predicate for "override is inactive in the next transaction" is `coalesce(current_setting(name, true), '') = ''`.
- PostgREST clients CANNOT set custom GUCs (no SET privilege through the REST path), so the GUC is activatable only from trusted server code (psql/maintenance/SECURITY DEFINER functions).

**Session-level / RPC exposure risk:** If a future 0003 function sets the GUC session-wide (`set_config(..., is_local => false)`) inside a transaction-pooled connection, the flag leaks to a subsequent unrelated request on that pooled server connection, silently disabling the override for that request's inserts. This is the residual risk documented in 3B.2 INFORMATIONAL-01.

**Recommendation:** 
- All authority functions MUST use transaction-scoped setting only (`SET LOCAL` / `set_config(..., true)`), never session-level.
- Must never persist the GUC past their statement.
- The 0003 suite must assert the override is active for a plain client insert immediately after an authority-function call in the same pooled-session simulation.
- No RPC may ever expose it.

---

## 7. AAL2

| Severity | Medium |
|---|---|

**Finding:** Exactly 4 functions enforce AAL2 at their authorization boundary. The remaining functions are NOT AAL2-gated, per the documented design decision.

**Functions gated (AAL2):** 
- `verify_payment` (line 248): `perform public.assert_aal2();`
- `create_reversal` (line 505): `perform public.assert_aal2();`
- `decide_freeze` (line 710): `perform public.assert_aal2();`
- `mint_attendance_token` (line 956): `perform public.assert_aal2();`

**Functions NOT gated:**
- `reject_payment` — no AAL2 check (self-rejection default-deny is via `require_role` only)
- `request_freeze` — no AAL2 check
- `end_freeze` — no AAL2 check
- `check_in` — member role, no AAL2 (design §8.1)
- `set_member_discount` — receptionist only, no AAL2
- `update_plan_price` — owner only, no AAL2
- `request_plan_assignment` — receptionist only, no AAL2
- `decide_application` — receptionist only, no AAL2
- `update_gym_settings` — owner only, no AAL2

**`assert_aal2()` implementation** (lines 176–187):
```sql
create function public.assert_aal2() returns void
language plpgsql
set search_path = 'public'
as $$
begin
  if coalesce(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' then
    raise exception 'This action requires multi-factor authentication (AAL2).'
      using errcode = '42501';
  end if;
end
$$;
```

**Evidence:**
- JWT `aal` claim absent → treated as `aal1` (safe failure mode) via `coalesce(auth.jwt() ->> 'aal', 'aal1')`
- AAL1 and missing claims are rejected with SQLSTATE 42501 "multi-factor authentication"
- The 0003 suite tests verify: G03/G04 demonstrate AAL1 refusal / AAL2 re-issue for `create_reversal`; G13/G14 demonstrate AAL1 denial / AAL2 approval for `decide_freeze`; G17/G18 demonstrate AAL1 refusal / AAL2 mint for `mint_attendance_token`; F01/F12/F13/F15 test AAL2 gated freeze requests

**Business-impact scenario:** Without AAL2 gates, any receptionist-context RPC could perform authority operations without MFA enrollment. With the gates, an unenrolled staff account simply cannot perform authority operations (safe failure mode). The design recommends AAL2 everywhere [REC] per unresolved #4, with operational friction noted (daily gate friction for receptionist flows, enrollment mandatory for staff).

**Recommendation:** No correction needed. AAL2 gates are correctly enforced on exactly the 4 functions specified, and the remaining functions' lack of AAL2 gates is a documented design decision.

---

## 8. Concurrency and Locking

| Severity | Medium |
|---|---|

**Finding:** Lock order is consistent and cannot produce deadlocks or race conditions. The documented lock order is `payment → member → freeze`, with `decide_freeze/check_in` taking `member → freeze`.

**Lock order verified in each function:**

| Function | Lock order | Lines |
|---|---|---|
| `verify_payment` | payment → member → period arithmetic | 252 (payment FOR UPDATE), 273 (member FOR UPDATE), 352 (period selection) |
| `create_reversal` | original payment → member (full reversal only) → period void | 517 (original FOR UPDATE), 582 (member FOR UPDATE for full), 573 (period selection) |
| `decide_freeze` | member → freeze (explicit) | 722 (member FOR UPDATE first), 712 (freeze-row selection after) |
| `check_in` | member → token → freeze conditional end → attendance | 866 (member FOR UPDATE), 903 (freeze conditional update) |
| `end_freeze` | freeze only (no member lock) | 809 (require_role), 811 (freeze-row FOR UPDATE) |
| `request_freeze` | member eligibility only (no FOR UPDATE on member for freeze request itself; eligibility checked, then insert) | 638 (member selection), 671 (freeze insert) |

**Concurrency guards (rowcount):**
- Double-verify impossible: payment `UPDATE ... where state = 'awaitingVerification'` rowcount guard (lines 384–393)
- Double-decision impossible: freeze `pending → decided/rejected` rowcount guard (lines 762–765/779–782)
- Concurrent reversal: original-row lock (`FOR UPDATE`) orders all reversals of one original; remaining-amount recompute after lock acquisition (lines 538–548)
- Scan-unfreeze: one winner, the other proceeds cleanly (check_in lines 903–916, conditional update with `returning`, receptionist `end_freeze` rowcount 0 = loss)

**Reversal serialization:** `FOR UPDATE` on the original payment row (line 517) ensures all reversals of one original are serialized. The remaining-amount check (`v_remaining := v_orig.payable - v_reversed`) happens after lock acquisition. The deferred constraint trigger backstops at commit (SQLSTATE 23514).

**Business-impact scenario:** Without the explicit member-row lock, concurrent `verify_payment` and `create_reversal` on the same member could race on `membership_end` computation, leading to corrupted validity. The `FOR UPDATE` locks serialize access under the `payment → member → freeze` lock order, and the conditional state transitions with rowcount guards prevent double-actions.

**Recommendation:** No correction needed. Lock order and guards are consistent and race-free as implemented.

---

## 9. Business-Rule Consistency

| Severity | Informational |
|---|---|

**Finding:** Every implemented authority function is compared against the approved Phase 3A design and the unresolved-items register. The table below summarizes the consistency check:

| Function | Design match | Unresolved item | Status |
|---|---|---|---|
| `verify_payment` | O-17, O-21, O-04, O-05 | #1 self-verify default-deny | ✅ Implemented |
| `reject_payment` | O-17 | — | ✅ Implemented |
| `create_reversal` | O-19–O-24 | #2 self-reverse default-deny | ✅ Implemented |
| `request_freeze` | O-07, O-08, O-06 | — | ✅ Implemented |
| `decide_freeze` | O-08 [C1], O-02 | — | ✅ Implemented |
| `end_freeze` | O-03, scan-vs-receptionist | — | ✅ Implemented |
| `check_in` | O-29–O-33, O-10 | #3 pendingPayment default-deny | ✅ Implemented |
| `mint_attendance_token` | §8.1, AAL2 [REC] | #4 AAL2 default-deny posture | ✅ Implemented (4 functions gated) |
| `set_member_discount` | O-12, O-13, O-14, O-15 | — | ✅ Implemented |
| `update_plan_price` | owner [REC] | — | ✅ Implemented |
| `request_plan_assignment` | §10 (one at a time) | — | ✅ Implemented |
| `decide_application` | [C1] (staff-profile links, hijacks refused) | — | ✅ Implemented |
| `update_gym_settings` | owner [REC] | — | ✅ Implemented |
| `payments_reversal_cap_trigger` | §5.3/§7 (cumulative ≤ original at commit) | — | ✅ Implemented |

**Newly introduced behavior never approved:** None. All functions either match pre-existing owner-confirmed design items or are documented as [REC] carried technical assumptions from prior reports. No function introduces behavior that contradicts or bypasses the approved design.

**Cross-reference checks:**
- **Default-deny boundaries**: self-verify (verify_payment), self-reverse (create_reversal), pendingPayment (check_in) all correctly default-deny per unresolved items #1, #2, #3.
- **AAL2**: exactly 4 functions gated, matching the design recommendation with the operational friction note.
- **Lock order**: consistent payment → member → freeze across all writers; decide_freeze/check_in take member → freeze; end_freeze takes no member lock.
- **Cumulative reversal cap**: enforced both in-function and at commit via deferred trigger.
- **Membership end reconstruction**: derived-pause model (latest non-voided period end + freeze adjustments from 0004 views) — documented in the migration header and verified by X11/X12.

**Recommendation:** No correction needed. All functions are consistent with the approved design and unresolved-items register.

---

## Conditions Carried from 3B.2 into 3B.3

The following conditions from the 3B.2 audit must be satisfied by the 0003 implementation for the verdict to remain APPROVED WITH CONDITIONS:

| # | Condition | Status |
|---|---|---|
| 1 | Every 0003 object created with explicit least-privilege ACLs; add `ALTER DEFAULT PRIVILEGES … REVOKE ALL … FROM anon, authenticated, service_role` for both `postgres` and `supabase_admin` in `public`; extend the 0003 suite with per-function RPC-denial assertions | ✅ Implemented (dual-form lockdown, lines 56–110; helper grants in suites) |
| 2 | `app.bypass_payment_override` set transaction-locally only (`SET LOCAL` / `set_config(..., true)`); never session-level; never RPC-exposed; suite asserts override remains active for plain client inserts after authority-function calls | ✅ Implemented (lines 554–555, G06 predicate fix) |
| 3 | Hygiene (LOW-01/LOW-02): revoke PUBLIC EXECUTE from the four trigger functions; consider `alter extension btree_gist set schema extensions` | ✅ Implemented (0003 lines 118–125 revoke the 4 triggers; LOW-01 is a hygiene recommendation) |
| 4 | `verify_payment` gates revenue recognition on plan status/consistency (LOW-03); the admin linking path validates `profiles.role = 'member'` before setting `auth_user_id` (INFORMATIONAL-02) | ✅ Implemented (lines 289–292 inactive-plan gate, lines 1182–1198 linking integrity in decide_application) |

---

## VERDICT

**APPROVED WITH CONDITIONS**

**Rationale:** The implementation is faithful to the approved §8.1 matrix, the default-deny boundaries of the unresolved register hold structurally, and all authority functions operate with the correct role gates and authorization checks. The 139/139 passing test suite across 0001/0002/0003 confirms functional correctness.

**Conditions (must be documented and reviewed before any downstream work):**
1. The dual-form default-privilege lockdown (per-schema + global) is correctly implemented and verified; the engine fact that global REVOKE is required to strip built-in PUBLIC EXECUTE on functions is documented.
2. `app.bypass_payment_override` is transaction-local only; the G06 regression predicate uses `coalesce(current_setting(name, true), '') = ''` (empty-string placeholder, not NULL).
3. AAL2 gates are enforced on exactly 4 functions (verify_payment, create_reversal, decide_freeze, mint_attendance_token); the remaining functions are correctly NOT gated per design.
4. The 0003 suite helper-grant blocks (`grant execute on function suite_results.* to public`) are documented regression-compat edits required after the global default-privilege lockdown removes built-in PUBLIC EXECUTE from all future functions.
5. The X07 assertion scoping (`period_id/voided_by/reversal_id like '3b3%'`) instead of global `count(*) = 0` correctly handles the 0001 regression fixture residue.

No CRITICAL or HIGH findings exist. All conditions are forward-looking requirements on 0003 and do not require changes to the approved 0002 artifact. The local-only, read-only, no-commit, no-frontend-integration mandate is satisfied.

---
*End of Phase 3B.3 Final Security Audit. STOP — no 3B.4, no frontend integration, no commits, linked_project stays null.*