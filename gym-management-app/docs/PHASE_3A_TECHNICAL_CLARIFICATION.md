# Phase 3A Technical Clarification Report

Date: 2026-11-17 · Status: DESIGN ONLY (read-only) · Phase 3B NOT authorized

Companion to `PHASE_3A_REVIEW.md` (preserved unchanged). This document clarifies the six
technical areas requested before Phase 3B: freeze mechanics, calendar-month duration, MFA
freshness, concurrency protection, full-reversal membership effects, and RLS ↔ function
permission consistency. It contains no SQL, no source or documentation edits, no CLI or
database operations. All new proposals below are **recommendations pending your approval**;
only C1 (receptionist freeze approval) is confirmed.

Evidence base: `src/utils/membership.ts` (7-day date rule, derived status),
`src/app/(reception)/freeze.tsx` (eligibility, overlap check, state honesty),
`src/utils/payment.ts` (`computePayable`, verified-only revenue), plus the Phase 3A
review report.

---

## 1. Freeze mechanics — future-dated requests, early unfreezing, overlap, end calculations

### 1.1 Request lifecycle (clarified)

`pending → approved | rejected` (receptionist decision, C1), and `approved → ended` on
early unfreeze or window completion. `ended` and window-expiry are records of history, not
active states. Rejected requests can be re-submitted; the overlap rule (1.4) never counts
`rejected` or `ended` rows.

### 1.2 Eligibility is checked TWICE — at submission AND at decision

`freeze.tsx` enforces eligibility when a request is recorded: membership must be
**active or expiring**; expired, `pendingPayment` and already-frozen members are refused
with explicit reasons. But a pending request can sit for days while the member's status
drifts. Therefore `decide_freeze()` re-checks eligibility **at decision time** against the
member's status on that date:

- Member expired between request and decision → the receptionist may only **reject**
  (approving is refused server-side, consistent with the demo's rule that frozen
  memberships require an active/expiring membership).
- Member went `pendingPayment` (e.g. a payment was rejected meanwhile) → same refusal.
- Member is already frozen by another approved freeze → refused (overlap, 1.4).

The request row keeps the eligibility snapshot at submission (for the audit trail); the
decision is judged on the live state. Both checks are server-side.

### 1.3 Future-dated freeze starts — and why `is_frozen` should become DERIVED (Refinement R3)

A request may legitimately have `start_date` in the future (the demo seeds one: Rahul
Desai, start +2 days). The previously proposed design set `members.is_frozen = true` at
approval — which would freeze the member **before** their window even starts, and would
require a scheduled job (or drift) to unfreeze at `end_date`. Clarification proposes
replacing the stored flag with **derivation**:

> **A member is frozen now ⇔ there exists a freeze row with
> `state = 'approved'`, `start_date ≤ gym_date()`, and
> (`ended_at IS NULL AND end_date ≥ gym_date()`) OR `ended_at::date ≥ gym_date()`.**

`v_member_status` evaluates exactly this predicate — no cron, no scheduled function, no
flag drift, and future windows activate themselves on their start date. This matches the
demo's philosophy (`membership.ts`: "rather than a stored status flag"). The C1 decision is
unaffected: the receptionist still makes the approve/reject decision; only the *ongoing
frozen/not-frozen state* becomes derived. The persisted columns remain
`state, decided_by, decided_at, ended_at, ended_by` for the Owner's view-only history.

### 1.4 Overlapping requests — server-side enforcement

The demo defines overlap as interval intersection:
`new.start ≤ other.end AND new.end ≥ other.start`, checked against the member's
**pending and approved** requests. The database must reproduce this exactly, not just in
`request_freeze()`:

- **Constraint proposal**: a generated `active_range daterange` column that is
  `[start_date, end_date]` while `state IN ('pending','approved')` and **empty** for
  `rejected`/`ended` rows, plus a GiST exclusion constraint
  (`member_id =` AND `active_range &&`) — overlap becomes impossible at the storage layer,
  including two receptionists submitting competing requests concurrently.
- **Re-check at approval**: two *pending* overlapping requests can both exist (both were
  valid when submitted). `decide_freeze()` must therefore re-run the overlap test at
  decision time: approving request B while A is already approved must refuse B with a
  distinct error ("overlaps an approved freeze"), and the refusal is audit-logged.
- Early-unfrozen windows free their date range for re-request (a member who returns and
  later needs another freeze is a normal case).

### 1.5 Early unfreezing (Q4b) — both options made concrete

`end_freeze()` (receptionist, per C1) sets `ended_at = now` and `ended_by`. The effect on
`membership_end` is the still-pending Q4b choice:

- **Option (i) — extension stands (time banked):** `membership_end` is untouched; the
  member keeps the days the approved freeze bought. Example: end was Mar 31, a 15-day
  freeze approved, member returns after 5 days → end **stays Mar 31 + 15** (Apr 15).
- **Option (ii) — proportional rollback:** `membership_end -= (frozen_days_actual)`
  recomputed from `ended_at` minus `start_date` (capped at the approved window).
  Same example → end stays **Mar 31**.

Under derivation (1.3) both options are implementable without touching the frozen-state
logic — only the `membership_end` arithmetic differs. **Still pending; nothing assumed.**

### 1.6 Membership-end calculation on approval — exact rule

On `decide_freeze(approve)`, in one transaction:

1. Lock the member row (see §4 — prevents lost updates against concurrent renewals).
2. Re-check eligibility (1.2) and overlap (1.4).
3. Compute `extension_days` from the requested window — **inclusive counting**
   (`end − start + 1`) or **exclusive** (`end − start`) is the pending Q4 sub-choice. The
   chosen formula is stored on the freeze row (`extension_days`) so every extension is
   auditable and reproducible.
4. Advance `membership_end` by `extension_days` **only if the member was active/expiring**
   at decision time; frozen-vs-not needs no separate branch (derivation handles it).
5. Write `state='approved'`, `decided_by`, `decided_at`; emit audit entry.

Renewal interplay: a verified renewal during/after a freeze extends from the (already
extended) `membership_end` — stacking is the natural composition, and the reconstruction
rule in §5 stays consistent because freeze extensions are recorded per-freeze-row.

### 1.7 Renewal while frozen (new sub-question Q4d — PENDING)

The demo never faces this (nothing approves). Live design must answer: may a frozen member
renew? Recommended: **yes** (payment authority is separate from attendance), the renewal
extends from current `membership_end` per Q4's timing rule; frozen access remains blocked
until the window ends. Flagged for your decision, not assumed.

### 1.8 Freeze limits — still undefined, input needed

Maximum freeze duration and freezes-per-period are Owner-set numbers that the demo
explicitly refuses to invent ("arrive with the backend"). They belong in `app_settings`
enforced by `request_freeze()`. **They need your numbers** (or an explicit "unlimited for
now"); added to the pending list.

---

## 2. Calendar-month duration — month-end and leap-year behavior

### 2.1 Postgres semantics (deterministic, testable)

With calendar-month validity (Option A, still pending your confirmation), Postgres
`date + interval 'N months'` clamps overflow days to the month's last day:

| Start | Add | Result | Note |
|---|---|---|---|
| 2026-01-31 | +1 month | 2026-02-28 | clamped (not Mar 2/3) |
| 2024-02-29 | +1 year | 2025-02-28 | leap-year source, non-leap target |
| 2026-01-31 | +2 months | 2026-03-31 | clamping is per-computation |
| 2026-02-28 | +1 month | 2026-03-28 | **day drift** — see 2.2 |

No ambiguity, no timezone dependence (plain `date` math), and identical results on every
recomputation — which is what makes it safe to store only `start`/`end` and re-derive.

### 2.2 The drift trap — renewals must be ANCHORED (Refinement R4)

The naive chain "extend from current `membership_end` each renewal" drifts: Jan 31 →
Feb 28 → Mar 28 → Apr 28… The member's renewal day walks backwards a month-end at a time.
Proposal: each member carries an anchor — the **first period's `start_date`** (already
stored as the row's `start_date`); a renewal's end is computed as
`anchor + (cumulative purchased months) interval`, never as a repeated +1 from the last
clamped end. Jan 31 monthly → Feb 28 → **Mar 31 → Apr 30 → May 31** … the drift self-
corrects at every 31-day month. Fixed-day validity (Option B) has no such issue (pure
`+ N days`), which is a genuine argument for B if you prefer uniform day counts over
stable renewal dates. **Q4 remains pending; R4 applies only if Option A is chosen.**

### 2.3 Leap-year renewal rule (if Option A)

A yearly member starting Feb 29 gets `+12 months` → Feb 28 in non-leap years, Feb 29 in
leap years. The 7-day expiring rule (`membership.ts`: judged on calendar dates, immune to
23:59/00:01 and DST) is unaffected — it reads the computed end date, whatever it is.

---

## 3. MFA freshness beyond the AAL2 check — what is actually possible

### 3.1 What AAL2 proves — and what it does not

The AAL2 gate (`auth.jwt() ->> 'aal' = 'aal2'`, checked inside every authority function)
proves: **this session completed MFA at least once** (possession + knowledge factors).
It does **not** prove the MFA happened *recently*: Supabase access tokens are long-lived
JWTs (default ~1 hour, silently refreshed), so a session that passed MFA in the morning
keeps presenting `aal2` all day, refreshed tokens inherit the elevated AAL.

### 3.2 Why the obvious "freshness" check fails

Checking `auth.jwt() ->> 'iat'` within a window does **not** work: background token
refresh mints fresh `iat` values that still carry `aal2` — a refreshed token looks exactly
like a just-step-up token. There is currently **no native Supabase claim or API for
"verified within N minutes"**. This report does not invent one.

### 3.3 Honest available mitigations (proposed stack)

1. **Mandatory AAL2 enrollment for staff** — enforced operationally (staff accounts are
   Owner-created; enrollment required before authority is exercised). A staff account
   without a factor fails every gated operation — a safe, visible failure.
2. **AAL2 gate in every authority function** (as designed) — the floor, not the ceiling.
3. **Shorter access-token lifetime** for the deployment (configurable JWT expiry) —
   bounds how long an abducted token stays useful; does not distinguish fresh MFA.
4. **Audit everything gated** (already designed) — anomalies (time, actor, operation) are
   detectable retroactively, which is the practical compensating control.
5. **Challenge-before-act UX in the app (later phase)**: for the most sensitive flows the
   app can deliberately run `mfa.challenge` + `mfa.verify` immediately before submitting
   the operation, so the operator is genuinely re-verified at that moment — even though
   the server cannot cryptographically distinguish that from a refreshed token, the
   *human* factor is re-established. Documented as a client-side mitigation, not a
   server guarantee.

**Residual risk (recorded honestly):** server-enforced per-operation freshness is not
achievable with current Supabase primitives; the design relies on AAL2 + short TTL +
audit + client-side step-up UX. If a hard requirement for server-side freshness emerges,
it would need a custom `sessions`-table tracking last-verification timestamps written by
an auth hook — a design of its own, deferred unless you ask for it.

Operational note: `mint_attendance_token` sits behind the MFA gate by design; with a
persistent AAL2 session this is once per session, not once per mint — acceptable, flagged
so the door workflow's friction is known.

---

## 4. Concurrency — verification races and over-refund protection

Default isolation is READ COMMITTED; the design adds **explicit row locks** rather than
escalating isolation levels.

### 4.1 Double-verification race

Two staff verifying the same payment concurrently must not produce two periods and two
extensions. Mechanism: `verify_payment()` first performs a **conditional state
transition** — update the row `state: awaitingVerification → verified` and require the
affected-row count to be exactly 1; if 0, someone else won the race and the function
refuses with "already processed". Only the single winner proceeds to period creation and
`membership_end` advancement. (Equivalent alternative: `SELECT … FOR UPDATE` then
re-check state; the conditional update is the tighter form because it cannot deadlock
with itself.)

### 4.2 Two different payments verified concurrently for the same member

Both verifications individually pass 4.1, but both compute a new `membership_end` from
the member row — a classic lost update. Mechanism: before any end-date arithmetic,
`verify_payment()` takes **`SELECT … FOR UPDATE` on the member row** (per §1.6 step 1).
The second transaction blocks, then reads the first's committed `membership_end` and
extends from it. Renewal stacking stays exact under any interleaving. The same member-row
lock order is used by `decide_freeze`, `create_reversal(full)` and
`request_plan_assignment` application, so all member-row writers serialize consistently
(one lock, taken late but held to commit — lock-order consistency avoids deadlock).

### 4.3 Over-refund protection — the worked interleaving

Naive "compute remaining, then insert" has a race: original P1 = 3000 verified; reversals
A (2000) and B (2000) start concurrently; both read remaining = 3000; both insert;
total 4000 > 3000. Mechanism:

1. `create_reversal()` takes **`SELECT … FOR UPDATE` on the original payment row**.
2. Transaction B blocks on A's lock. After A commits, B (READ COMMITTED, next statement)
   sees A's committed reversal row in the SUM.
3. Remaining recompute: 3000 − 2000 = 1000. B's request of 2000 > 1000 → **refused**,
   audit-logged. The lock is on the *original* row, so all reversals of one original
   serialize against each other while different originals refund fully in parallel.

4. **Defense in depth:** a deferred constraint trigger validates, at commit time,
   `SUM(payable of verified reversal rows for X) ≤ payable(X)` for the touched original.
   Even a future code path that skips the explicit lock cannot over-refund — the commit
   itself is refused.

Reversals are created **verified** (owner + MFA, per the review); they never pass through
the awaiting queue, so no verification-race exists on reversal rows themselves.

### 4.4 Verify racing reversal

`create_reversal` requires the original `state = 'verified'` and locks the row; a
concurrent `verify_payment` either committed first (reversal sees `verified` and
proceeds) or is still awaiting (reversal refuses "not verified"). No interleaving lets a
reversal attach to an unverified or later-rejected payment.

### 4.5 Concurrent freeze decisions

`decide_freeze` guards with the same conditional-transition pattern
(`pending → approved|rejected`, rowcount = 1) plus the member-row lock from 4.1/4.2, so
two receptionists (or a receptionist and a stale UI double-tap) cannot approve the same
request twice and double-extend `membership_end`. Overlap re-check (1.4) runs inside the
lock window.

---

## 5. Full reversal — effects on membership periods and access

### 5.1 The three possible postures (analyzed)

- **(a) Do nothing:** the period stands, the member keeps paid-for access until its end.
  Correct for goodwill refunds, wrong for refunded-for-error/fraud payments (access the
  gym never kept money for). Fails the "books and access agree" principle.
- **(b) Mutate the original row/period** — rejected outright: violates append-only
  payments and immutability.
- **(c) Void the period explicitly (recommended):** the period created by the reversed
  payment gains `voided_at` / `voided_by_payment` (nullable FK to the reversal row) — a
  **new record**, never an edit. `membership_periods` rows themselves stay append-only.

### 5.2 Access recomputation — the reconstruction rule (Refinement R5)

The live design stores `membership_end` on `members` (advanced by every verified payment
and freeze extension). A voided period must roll that back without losing freeze
extensions. Proposed invariant, maintained by every writer:

> `members.membership_end = (end of the member's latest non-voided
> membership_period) + Σ effective approved freeze extensions within that period`
> (a freeze extension is *effective* unless the freeze itself is fully reversed/unwound —
> an edge that only arises if freezes become refundable, currently out of scope).

On a **full** reversal, `create_reversal()` recomputes `membership_end` from this rule
inside the member-row lock (§4.2) and voids the period. Because `v_member_status` reads
`membership_end`, **access ends immediately and automatically**: `check_in` fails the
membership gate (`expired`), the door QR still mints but every scan is refused, and the
member calendar shows no live validity. No separate "kill access" step exists — access is
derived, which is exactly why voiding works.

### 5.3 Which periods may be voided (new sub-question Q13b — PENDING)

If the reversed payment was the member's **latest** period (the normal refund case),
rollback lands on the previous period's end (or `NULL`/expired if it was the first) —
clean. If **later periods exist** (member renewed since), voiding the older period would
entangle subsequent extensions. Proposed rule: **a full reversal may void only the
member's latest non-voided period; otherwise it is refused** (the Owner can reverse the
money without voiding access in that case — money and membership deliberately decouple
when history has moved on). Flagged as **Q13b** for your decision.

### 5.4 Partial reversals never touch access

A partial reversal reduces revenue only; the period and `membership_end` are untouched
under every option. (Whether partial refunds are wanted at all remains part of Q13.)

### 5.5 Frozen-member void interplay

If the member is currently frozen (derived from an approved window, §1.3) and their only
period is voided: `membership_end` becomes `NULL`/past → status derives as
`expired`/`pendingPayment`; the frozen predicate still matches (the freeze row is
independent), and `v_member_status` precedence (`frozen` first, per
`displayMembershipStatus`) would surface `frozen`. Clarified recommendation: status
precedence becomes **payment-pending > frozen > date rule** when the underlying validity
is gone — i.e. a voided-out member surfaces as *expired/pending*, not misleadingly
"frozen", and the freeze row remains in history. Exact precedence ordering is a one-line
rule in `v_member_status`; noted here so it is a decision, not an accident. (Subsumed
under Q13 pending confirmation.)

### 5.6 Worked example (extends the review's example)

P1 3000 verified Jan 10 → period P (Jan 10→Apr 10), end = Apr 10. R1 1000 partial Jan 15
→ net 2000, access unchanged. R2 2000 full-remaining Jan 16 → P voided,
`membership_end` recomputed to previous period's end (none → `NULL` → expired) → member
loses access that day; door scans refused; reports show collections 3000, refunds 3000,
net 0 for January. The void is recorded on P (`voided_by_payment = R2`) — P itself is
never edited.

---

## 6. RLS ↔ security-definer function consistency (receptionist / owner)

### 6.1 The invariant, restated precisely

RLS governs **direct client** access; security-definer functions owned by the table owner
**bypass RLS for their own statements**. Therefore every authority check must live inside
the function (role, MFA, self/recorder rules) — the policies exist to block the bypass
path, not to enforce business rules. Consistency means: for each function, the role gate
matches the RLS matrix exactly; for each table, the direct privileges are narrow enough
that no client path reaches a state the functions are supposed to gate.

### 6.2 Post-C1 role map (delta only; full matrix in the review report)

| Function | Gate | Direct client rights on affected table |
|---|---|---|
| `decide_freeze` | **receptionist only; Owner explicitly refused (C1)** | `membership_freezes`: UPDATE/DELETE revoked for everyone |
| `end_freeze` (early unfreeze, §1.5) | **receptionist (C1 extension — an unfreeze is a freeze decision)** | same |
| `request_freeze` | receptionist (submission is a receptionist act) | INSERT via function only |
| `verify_payment` / `reject_payment` | staff + MFA + not-`recorded_by` (Q8 pending) | UPDATE revoked on `payments` |
| `create_reversal` | owner + MFA | INSERT via function only |
| `decide_application` | receptionist | UPDATE revoked on `join_applications` |
| owner-side: `update_plan_price`, `update_gym_settings`, `set_member_discount` owner-ceiling path | owner + MFA | direct writes revoked on `plans`, `app_settings` |

### 6.3 Consistency traps checked (each must hold in Phase 3B tests)

1. **No self-bypass via direct INSERT on `payments`:** staff/member direct INSERT is
   allowed by design (desk entry, member UTR), so the BEFORE INSERT trigger must
   server-override: force `state = 'awaitingVerification'`, force `entry_type='payment'`,
   overwrite money fields for member submissions, and ignore any client-supplied
   `verified_by`. A client can never mint a verified row directly.
2. **`EXECUTE` grants:** every authority function granted to `authenticated` only —
   never `anon`, never `public`; `set search_path = ''` (or a pinned schema) on all of
   them; `security_invoker` explicitly off where definer semantics are required.
3. **Function SELECT scope:** inside a definer function, reads see all rows (e.g. the
   reversal SUM in §4.3 must see other members' rows) — intended, and harmless only
   because nothing read inside functions is returned to lower-privilege callers except
   computed results.
4. **Role immutability:** the `profiles.role` trigger (client roles refused; only
   `service_role` changes roles) remains the single authority path — no function in the
   map above changes roles, so no definer side-door for privilege escalation exists.
5. **`members` writers all take the same member-row lock** (§4.2) so RLS-consistent
   functions still serialize with each other.

### 6.4 Phase 3B verification method (design-level commitment)

Consistency will be *tested*, not asserted: the local migration test suite (when Phase 3B
is authorized) must include, per function: role-positive, role-negative (Owner hitting
`decide_freeze` must be refused), MFA-negative (AAL1 token), and direct-privilege-negative
(attempted direct UPDATE/DELETE on revoked tables as both staff roles). These map 1:1 to
§6.2/§6.3 and become the acceptance criteria for the migration phase.

---

## 7. Pending-question delta (adds to, does not replace, Q2–Q13)

All PENDING — nothing here is assumed:

- **Q4d** — renewals while frozen: allowed (recommended) or blocked?
- **Q13b** — full reversal voids only the member's latest non-voided period (recommended);
  what happens when later periods exist?
- **Freeze limits** — max duration and freezes-per-period (Owner-set numbers needed, or
  explicit "unlimited for now").
- **Status precedence when validity is voided** (§5.5) — payment-pending > frozen > date
  rule, recommended.
- Refinements **R3** (derived frozen state), **R4** (anchored calendar-month renewal),
  **R5** (period-void + reconstruction rule) — each only if you approve them; R4 applies
  only under calendar-month validity (Q4 Option A).

## 8. Restrictions compliance

No migration SQL, no source or documentation edits, `PHASE_3A_REVIEW.md` preserved
untouched, no CLI link, no local or remote database operations, nothing committed or
deployed. This file is the only artifact created.

**Stopping here. Phase 3B remains unauthorized — awaiting your decisions on Q2–Q13 (plus
the delta items above) and your explicit approval.**
