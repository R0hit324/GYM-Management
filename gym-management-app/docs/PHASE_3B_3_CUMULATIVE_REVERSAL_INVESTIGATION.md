# Phase 3B.3 — Cumulative Reversal Business-Rule Investigation

**Read-only only.** No files modified, no database objects changed, no migrations applied, no remote operations.

**Scenario:** Original verified payment of ₹1,500. Three successive partial reversals of ₹500 each.

---

## 1. Exact SQL Functions and Line References

| Component | Lines | Purpose |
|---|---|---|
| `create_reversal` (0003) | 487–612 | Inserts reversal row; checks `if p_amount = v_orig.payable` to decide period voiding |
| `payments_reversal_cap_trigger` (0003) | 1330–1366; activated 1368–1372 | Deferred constraint: at commit, `Σ verified reversal.payable ≤ original.payable` (SQLSTATE 23514) |
| `membership_period_voids` (design) | §5.3/§5.5 | Append-only table: `period_id`, `reversal_id`, `voided_by`. Populated only on full reversal. |

---

## 2. Arithmetic for the `₹1,500` Example

| Step | SQL Operation | `p_amount` | `v_orig.payable` | `p_amount = v_orig.payable`? | `v_remaining` after step |
|---|---|---|---|---|---|
| 0 — Original | Payment inserted with `payable = 1500` | — | 1500 | — | — |
| 1 — 1st reversal | `create_reversal(payable_id, 500)` | 500 | 1500 | **No** (`500 ≠ 1500`) | `v_remaining = 1500 − 0 = 1500`; check `500 > 1500`? No → accepted |
| 2 — 2nd reversal | `create_reversal(payable_id, 500)` | 500 | 1500 | **No** (`500 ≠ 1500`) | `v_reversed = sum(payable) = 500`; `v_remaining = 1500 − 500 = 1000`; check `500 > 1000`? No → accepted |
| 3 — 3rd reversal | `create_reversal(payable_id, 500)` | 500 | 1500 | **No** (`500 ≠ 1500`) | `v_reversed = sum(payable) = 1000`; `v_remaining = 1500 − 1000 = 500`; check `500 > 500`? No (≤) → accepted |

After all three steps: **total reversed = ₹1,500 = original payable**, but each individual reversal was treated as partial.

---

## 3. Actual Behavior of the Current Implementation

| Check | Result |
|---|---|
| **Are all three reversals accepted?** | ✅ Yes. Each passes the in-function remaining-amount check (`p_amount ≤ v_remaining`). SQLSTATE 55000 is never raised. |
| **Does cumulative reversal reach ₹1,500?** | ✅ Yes. After three ₹500 reversals, `Σ payable = 1,500` in `public.payments` where `entry_type = 'reversal'` and `reversal_of = <original_id>`. |
| **Does the deferred constraint trigger accept the final transaction?** | ✅ Yes. At commit, `payments_reversal_cap_trigger` computes `v_total = Σ payable = 1,500`. Check `v_total > v_original.payable` → `1500 > 1500` is **False**, so no exception is raised. SQLSTATE 23514 is not triggered. |
| **Is the linked membership period invalidated?** | ❌ No. The `if p_amount = v_orig.payable` block (0003 lines 572–599) is entered **only when the single reversal amount equals the original payable**. Since each reversal is ₹500 and the original is ₹1,500, the condition is never true for any of the three calls. No row is inserted into `membership_period_voids`. The period remains active. |
| **Is `membership_end` reconstructed correctly?** | ❌ No. Since the period is never voided, the `membership_end` recomputation (lines 587–597) never runs. `membership_end` stays as set by the original `verify_payment` (or subsequent operations), unaffected by the three partial reversals. |
| **Can concurrent/repeated operations invalidate the period more than once?** | ❌ No. The period is never voided through this path, so it cannot be voided "more than once." Each reversal is independently treated as partial, and the `membership_period_voids` table remains empty (for this original payment). |

---

## 4. Does This Behavior Match the Approved Business Rule?

**Yes.** The current implementation correctly matches the approved design rules:

| Rule | Source | Current Behavior | Match |
|---|---|---|---|
| **O-23**: "Full reversal immediately invalidates only the membership period linked to that payment" | PHASE_3A_FINAL_DESIGN.md §5.3 | A single reversal with `p_amount = v_orig.payable` (₹1,500 on ₹1,500) voids the period. Three ₹500 reversals do **not** void the period. | ✅ Match |
| **O-24**: "Partial reversals do not invalidate membership" | PHASE_3A_FINAL_DESIGN.md §5.3 | Each ₹500 reversal is treated as partial (condition `p_amount = v_orig.payable` is false). No period voiding. `membership_end` unaffected. | ✅ Match |
| **§5.5 (migration header)**: "Full reversal voids the linked period only when the single reversal amount = original.payable; cumulative-full-via-partials does NOT void." | 0003 migration header (line 27) | The `if p_amount = v_orig.payable` gate is per-reversal, not cumulative. Even after `Σ payable = v_orig.payable` at commit, the void path was never entered. | ✅ Match |
| **Deferred backstop ( §5.3/§7 )**: "Cumulative reversals ≤ original payment" | 0003 lines 1330–1372 | At commit, `v_total = 1500`, `v_original.payable = 1500`. Check `1500 > 1500` is False → trigger passes. Over-refund (total > original) is caught. | ✅ Match |

**Verdict:** The current implementation **correctly implements** the approved business rule. Three partial reversals that cumulatively equal the original payment are **not** promoted to a full reversal. The period is never voided, `membership_end` is never reconstruction from the reversal path, and the deferred constraint backstop prevents over-refund (total > original) without converting partials to full.

---

## 5. Smallest Safe Correction (if required)

**No correction is required.** The current behavior matches the approved design. The smallest safe change would be zero — the implementation is already correct.

If a correction were desired to *promote* cumulative partial reversals to full reversal (which would contradict the approved design), the changes would be:

1. In `create_reversal`: Replace the per-reversal `if p_amount = v_orig.payable` with a cumulative check that tracks `v_reversed` across calls and triggers period voiding when the sum reaches `v_orig.payable`. This would require persistent state across function calls (e.g., a session-level or table-level counter) and would fundamentally change the append-only reversal model.

2. In `payments_reversal_cap_trigger`: Add logic to promote a total-equal-to-original into period voiding. But the trigger is a `AFTER INSERT ... DEFERRABLE INITIALLY DEFERRED` constraint trigger — its purpose is to *cap* over-refund, not to promote partials to full.

Neither correction is appropriate because the approved design explicitly states: **"cumulative-full-via-partials does NOT void"** (migration header, line 27).

---

## 6. Additional Regression Tests Needed

The existing 0003 test suite covers:
- **X11**: Single full reversal (`p_amount = payable`) → period voided, `membership_end = null` ✅
- **X12**: Full reversal void audit + `membership_end is null` ✅
- **X13**: Direct over-refund insert caught by deferred backstop ✅
- **X07**: Partial reversal fields, no period impact, audited ✅ (but scoped to 3b3 data, not cumulative)

**Missing test coverage:** A scenario where three (or more) partial reversals cumulatively equal the original payable, verifying that:
1. All are accepted (no in-function rejection)
2. The deferred constraint trigger passes at commit (total = original, not > original)
3. The period is **not** voided
4. `membership_end` is **not** reconstructed from the reversal path
5. The audit `payment.reversed` entries have `full_reversal = 'false'` for each

**Suggested test pattern** (to be added to the 0003 suite, not implemented here):

```sql
-- Three partial reversals of 500 each on a ₹1,500 original
-- Should all pass, period should NOT be voided, membership_end should NOT change

-- P14: Three partial reversals of 500 each cumulatively equal original
begin;
  -- (Assume original payment 3b3e0010-... for M2, verified, payable=1500)
  select suite_results.check_ok('P14a', '1st reversal 500 accepted',
    $s$select public.create_reversal('3b3e0010-0000-0000-0000-000000000010'::uuid, 500)$s$);
  select suite_results.check_ok('P14b', '2nd reversal 500 accepted',
    $s$select public.create_reversal('3b3e0010-0000-0000-0000-000000000010'::uuid, 500)$s$);
  select suite_results.check_ok('P14c', '3rd reversal 500 accepted',
    $s$select public.create_reversal('3b3e0010-0000-0000-0000-000000000010'::uuid, 500)$s$);
commit;

-- Verify period not voided
select suite_results.check_true('P14d', 'period not voided after 3 partial reversals',
  (select count(*) = 0 from public.membership_period_voids v where v.period_id = '3b3f3333-0000-0000-0000-000000000003'));

-- Verify membership_end unchanged
select suite_results.check_true('P14e', 'membership_end unchanged',
  (select m.membership_end = '2027-01-01' from public.members m where m.id = '3b3b2222-0000-0000-0000-000000000002'));

-- Verify audit entries have full_reversal = 'false'
select suite_results.check_true('P14f', 'all 3 audit entries mark full_reversal=false',
  (select count(*) = 3 from public.audit_log_entries where action = 'payment.reversed'
    and (new_values ->> 'full_reversal') = 'false'
    and (new_values ->> 'reversal_of') = '3b3e0010-0000-0000-0000-000000000010'));

-- Verify deferred trigger passes (total = 1500, not > 1500)
-- (implicit: if commit succeeds, the trigger passed)
```

---

## Conclusion

The current implementation **correctly implements** the approved business rule:

- Three partial reversals of ₹500 each on a ₹1,500 original payment are **accepted** as three independent partial reversals.
- The cumulative total of ₹1,500 is **tracked** and the **deferred constraint backstop** prevents any over-refund (total > original) at commit.
- However, the period is **not voided** and `membership_end` is **not reconstructed** — matching the approved rule that **"partial reversals do not invalidate membership"** and **"cumulative-full-via-partials does NOT void."**
- Only a single reversal with `p_amount = original.payable` triggers period voiding.

**The behavior matches the approved design. No correction is needed.**

*Report prepared as a focused investigation per the Phase 3B.3 audit workflow. STOP — no 3B.4, no frontend integration, no commits.*