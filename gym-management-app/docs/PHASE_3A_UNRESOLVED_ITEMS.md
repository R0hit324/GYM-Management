# Phase 3A Unresolved Items

Date: 2026-11-17 · Companion to `PHASE_3A_FINAL_DESIGN.md` · Phase 3B NOT authorized

Only genuinely unresolved business permissions and technical risks. Everything the owner
confirmed on 2026-11-17 is treated as settled and lives in the final design. Nothing here
is silently enabled or disabled without a stated default and the reason.

---

## 1. Can a receptionist verify a payment they recorded themselves? [UNRESOLVED]

- **State**: undecided by the owner. The design ships **default-deny**: `verify_payment`
  (and `reject_payment`) refuse when `recorded_by = actor`, with a coarse error and an
  audit entry. Enabling self-verification later is a one-line policy change, explicitly
  approved.
- **Secure boundary recommended**: keep the deny. Segregation of duties is the cheapest
  fraud control in the system, and every path that would need the exception is
  operationally survivable (below).
- **Deadlock consequence, stated plainly**: only receptionists record payments and only
  receptionists verify (O-17/O-18 — the owner is read-only on payments). If the gym has
  exactly one receptionist, a payment they recorded could never be verified by anyone
  under the deny rule — it would wait until a second staff account exists. This is an
  accepted consequence until the owner rules otherwise; it is safe (unverified ≠ revenue,
  O-26), not a data-loss risk.
- **Related edge**: a receptionist verifying another receptionist's entry is fine and
  needs no decision.

## 2. Can a receptionist reverse a payment they recorded or verified? [UNRESOLVED]

- **State**: undecided. `create_reversal` ships **default-deny** for self-reversal
  (reversal actor = `recorded_by` or `verified_by` of the target).
- **Secure boundary recommended**: keep the deny. A reversal is the highest-value
  authority in the system (money leaves + access can end); combining record-verify-reverse
  in one person removes every check on it.
- **Interaction with item 1**: if the owner later approves self-verification but keeps
  this deny, a single-receptionist gym still cannot unwind its own mistaken entries —
  acceptable under the "unverified ≠ revenue" principle but should be a conscious choice.

## 3. Attendance for `pendingPayment` members [UNRESOLVED]

- **State**: the owner settled active, frozen (auto-unfreeze), and expired (attend,
  silent) — but did not state `pendingPayment`. The live `check_in` ships **default-deny**
  for pending-payment members; nothing silently enabled.
- **Recommended**: allow, recorded as ordinary successful attendance. Rationale: an
  expired member may attend silently (O-32) and `pendingPayment` is a strictly weaker
  lapse than expired; refusing it while admitting expired members would be arbitrary. The
  inactivity rule and the lost-member view work identically either way.

## 4. MFA applicability to receptionist authority operations [UNRESOLVED — posture]

- **State**: the owner moved verification, reversal and freeze decisions to the
  receptionist but did not address MFA. The design keeps the recommended **AAL2 gate** on
  all authority functions [REC], which makes MFA enrollment mandatory for receptionists.
- **Risk, honestly**: daily gate friction (verification happens many times a day; a
  persistent AAL2 session means once per sign-in, not once per action, but enrollment
  itself is a setup hurdle), and no native server-side "recently verified" freshness
  exists (prior clarification §3 — `iat`-based freshness is unworkable; compensating
  controls: short JWT TTL, full audit, optional client-side challenge-before-act).
- **Decision needed**: keep AAL2 for receptionists (recommended), drop to AAL1 for
  receptionist-only ops while keeping AAL2 for the most sensitive (reversal, freeze
  decision), or drop entirely. Default until ruled: AAL2 everywhere (safe failure mode:
  an unenrolled staff account simply cannot perform authority operations).

## 5. Member-submitted UTR (Q10) — deferred, not enabled

- **State**: the owner did not address member-side payment submission. The design grants
  members **read-own on payments only**; no member INSERT grant exists. The prior draft's
  member-INSERT-with-server-overrides design is retained as a drafted option for a later
  phase and stays disabled until the owner asks for the feature. If enabled, submission
  lands `awaitingVerification` and follows the identical verification path.

## 6. Data retention windows [UNRESOLVED — legal confirmation required]

- **State**: nothing auto-purges except QR tokens (> 30 days, unreferenced). Financial
  rows, periods, voids, audit entries and attendance are retained indefinitely by design
  (audit is append-only; attendance underpins the 30-day rule and history).
- **Needs legal confirmation (not invented here)**: DPDP Act PII retention/erasure
  obligations; statutory bookkeeping/tax retention periods. Member erasure requests, when
  they arrive, are handled by anonymization of the member row while financial rows remain
  (the books) — proposed, pending legal confirmation.

## 7. Technical risks carried forward (not decisions, tracked)

1. **Definer functions bypass RLS by design** — safety rests on the role checks; the
   Phase 3B local test suite (role-positive/negative, MFA-negative,
   direct-privilege-negative per function) is the mitigation and an acceptance gate.
2. **Signup hook dependency** — `join_applications` creation needs an `auth.users`
   trigger or Supabase Auth hook; must be verified against actual Auth configuration
   before/within Phase 3B.
3. **Anchor arithmetic after plan switches** — post-switch stacking re-anchors from the
   switch-era period start; long histories with several switches must be fixture-tested
   (planned in 0001–0004 local tests).
4. **`pendingPayment` default-deny at the door** — until item 3 is ruled, a
   pending-payment member scanning is refused; this is visible behavior the gym will
   notice immediately once live, which is the intended pressure to settle item 3.
5. **Clock/timezone** — all calendar rules run on `gym_date()` (configured timezone);
   device-local dates are display-only.
6. **Token shoulder-surfing** — a bystander photographing the door QR inside its validity
   window can check in as themselves (they still need a member account); per-member
   uniqueness and the 60 s expiry bound the damage.
7. **Owner exports (Excel/PDF)** are an application-layer feature scheduled for a later
   phase; the schema guarantees the data (O-28 columns) but no export exists yet — no
   claim of a working export is made.
8. **No emulator/device exists in this environment** — all verification remains
   script/test-level; nothing may be claimed as visually verified.

---

*End of unresolved register. Phase 3B remains unauthorized — awaiting owner review of
`PHASE_3A_FINAL_DESIGN.md` and rulings on items 1–4 above (items 5–6 can proceed on the
documented defaults if the owner permits).*
