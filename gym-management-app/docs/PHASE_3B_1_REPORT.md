# Phase 3B.1 Report — Migration `0001_core_schema` implemented & validated

**Status: COMPLETE — validated on full local Supabase stack, 56/56 assertions passed**
**Date:** 2026-11-17
**Scope:** `gym-management-app/supabase/migrations/0001_core_schema.sql` + validation suite `supabase/tests/0001_core_schema_validation.sql`
**Boundary:** Phase 3B.1 only. **No 0002 (RLS/grants/triggers), 0003 (functions), 0004 (views), 0005 (seed) work was performed.** No remote Supabase changes, no CLI link, no app integration, nothing committed or pushed.

---

## 1. Result summary

| Item | Result |
|---|---|
| Migration applies cleanly (ON_ERROR_STOP=1) | ✅ on vanilla PG 17 (throwaway container, stub auth) **and** on the genuine Supabase engine image |
| 13 approved tables created | ✅ |
| Validation suite | ✅ **56 of 56 assertions passed**, exit code 0, real per-assertion counting |
| Full local Supabase stack (`npx supabase start`) | ✅ **started and healthy; suite re-run on the stack DB: 56/56 PASS** |
| Remote changes | **None** (`supabase status`: `linked_project: null`) |

---

## 2. Validation environment (important caveat)

The full local stack could not be started: the Docker VM cannot resolve any registry
(`public.ecr.aws`, `ghcr.io`, `registry-1.docker.io`, `auth.docker.io` — "lookup … no such host")
while the **host** resolves the same names fine. Five `npx supabase start` attempts and direct
`docker pull` retries all failed on `ImagePrepullError` (logflare, storage-api, postgres-meta,
studio, edge-runtime could not be fetched).

**Standalone path used instead** (pre-approved as the fallback): a container from the already-local
genuine Supabase engine image `public.ecr.aws/supabase/postgres:17.11.0.018` — the exact Postgres
engine the stack uses. Crucially, this image ships the **genuine GoTrue `auth` schema**
(`auth.users` with real columns, all nullable), so the FK-to-auth-user and auth-cascade assertions
ran against a real GoTrue table, not a stub. This caught a real bug: GoTrue's column is
`confirmed_at`, not `email_confirmed_at` (the suite's setup had used the wrong name).

Port: `127.0.0.1:54330` (host-only). Runs as `postgres` superuser by design — RLS/policies are
0002 scope and are explicitly untested here.

> **UPDATE (same day):** the DNS blocker was diagnosed and resolved — it was a host network
> transition (Wi-Fi roam hotspot → `GLA`), not a Docker defect. After the four remaining images
> pulled successfully, `npx supabase start` brought the stack up, `0001_core_schema.sql` was
> applied through the CLI's own workflow, and the suite was re-run against the stack DB:
> **56/56 PASS** (exit 0). Standalone-run results below are retained for provenance.

> **Original standalone note (superseded):**

---

## 3. What `0001_core_schema` contains

- Extensions: `pgcrypto`, `btree_gist` (created if not exists).
- **13 tables** in `public`:
  `profiles`, `plans`, `members`, `membership_periods`, `membership_period_voids`, `payments`,
  `membership_freezes`, `qr_tokens`, `attendance_events`, `join_applications`,
  `follow_up_events`, `audit_log_entries`, `app_settings`.
- Constraints (per `pg_constraint`, 90 total incl. PK/FK/UNIQUE/CHECK/EXCLUDE) — highlights:
  - `payments`: `payable_rounding` (`payable = round(original_price * (1 - discount_pct/100.0), 0)`),
    `discount_amount_exact`, `reversal_pairing`, `payments_id_entry_uq (id, entry_type)`,
    `reversal_targets_payment` — **composite FK** `(reversal_of, reversal_target_type generated
    always as ('payment')) → payments(id, entry_type)`, making reversal→reversal chains
    structurally impossible (empirically proven on PG 17),
    `payments_utr_key` (unique UTR when present), `undecided_has_no_verifier/_verify_time`,
    `upi_requires_utr` (see §4 correction).
  - `membership_freezes`: generated `active_range` (inclusive of `end_date` = `[start, end+1)`;
    empty for rejected), `freezes_no_overlap` EXCLUDE USING gist `(member_id, active_range &&)`,
    `window_ordering`, `pending_means_undecided`, `decided_pairing`, `approved_has_extension`,
    `ended_has_end_time`, `ended_via_only_when_ended`.
    Per owner instruction #7: **`decide_freeze` does not advance `membership_end`** — pause
    arithmetic is derived from freeze rows in 0004 views (extension applies only once the window
    begins; early end subtracts unused days). Schema comments updated accordingly.
  - `membership_periods`: `one_period_per_payment` (unique `created_by_payment`), `period_ordering`.
  - `membership_period_voids`: `period_id` UNIQUE (a period voids exactly once), `reversal_id` UNIQUE.
  - `attendance_events`: `status` is **verified-only** (`check (status = 'verified')`) — 'failed'/
    'frozen' are demo-display concepts and are never stored (O-35/O-10);
    `attendance_member_token_uq (member_id, token_id)` replay guard.
  - `qr_tokens`: SHA-256-hex `token_hash` check + unique, `purpose = 'attendance'` only,
    `token_expiry_positive`.
  - `app_settings`: singleton via `check (id = 1)`.
  - Members: `pending_plan_pairing` (both-or-neither pending plan columns), `price_locked > 0`.
- Indexes: 42 total (query paths for reports: time-desc member/actor/state indexes,
  `payments_reversal_of_idx`, `freezes_member_idx`, etc.).
- Deferred to later migrations (documented in the migration header): UPDATE/DELETE denial grants
  and RLS (0002), `create_reversal` + cumulative-reversal ≤ original deferred trigger + verified-
  target state check + role immutability + INSERT overrides (0003), views (0004), seed (0005).

---

## 4. Schema correction made during validation (owner attention requested)

**`upi_requires_utr` now exempts `entry_type = 'reversal'`:**

```sql
constraint upi_requires_utr
  check (entry_type = 'reversal' or method <> 'upi' or utr is not null)
```

The suite proved the original form (`method <> 'upi' or utr is not null`) made a **reversal of a
UPI payment structurally impossible**: a reversal cannot reuse the original's UTR (`utr` is
UNIQUE table-wide) and must not invent a fresh one (a reversal is a correction record, not a
transaction). Design §5/O-16 scope UTR to *payments* ("UPI rows carry `utr` (unique when
present)"; reversals are defined as positive-payable rows with `reversal_of`). This is the only
coherent reading; flagged here rather than silently applied.

No other migration changes were needed — all other 10 suite failures were suite defects
(§5), not schema defects.

---

## 5. Validation suite

`supabase/tests/0001_core_schema_validation.sql` — 56 assertions, each recorded individually in a
`pg_temp.t_results` table and reported via NOTICE; pass count **computed from actual executed
assertions** (not hardcoded). Every negative test verifies the expected **SQLSTATE class** and a
**constraint-name fragment** in the message; an unrelated error counts as a FAIL.

Suite corrections made while iterating (all were test defects, except where noted):

1. **Stray `)` inside dollar-quoted statement strings** (assertions 24–30): the closing paren of
   the `check_ok(`/`check_fail(` call sat before the `$s$` terminator, corrupting every
   `INSERT … SELECT` statement (`syntax error at or near ")"`).
2. **Vacuous-pass guard added to `check_ok`**: after `EXECUTE`, `ROW_COUNT = 0` now fails the
   assertion. (Needed after 27 failed and left 29/30 "passing" on zero-row inserts.)
3. **Assertion 02/04 expectations corrected**: for `payable < 0` and `discount_pct > 100`, the
   operative rejection is `payable_rounding` — PostgreSQL evaluates CHECK constraints in reverse
   definition order, so the late-defined master invariant fires before the early column-level
   `payable >= 0` / `discount_pct between 0 and 100` checks. Those column checks are unreachable
   as *first* violator (payable_rounding math makes their violation conditions impossible) and are
   kept as defense-in-depth only. 02's fixture was made self-consistent (`discount_amount = 1501`)
   so it proves the rounding invariant rejects negative payable specifically.
4. **Assertion 35 expectation corrected**: `end_date < start_date` is rejected during generated-
   column evaluation (`daterange` constructor, SQLSTATE 22000) **before** `window_ordering` is
   reachable. Storage-level rejection is real; the named CHECK remains as defense-in-depth.
5. **Assertion 46 expectation corrected**: second `app_settings` row trips `app_settings_id_check`
   (the singleton mechanism), not the PK.
6. **Reversal fixtures corrected** (27, 28): verified-state reversal rows must carry
   `verified_by`/`verified_at` (`undecided_has_no_verifier` fires first, correctly).
7. GoTrue setup: `confirmed_at` (real column), not `email_confirmed_at`.

---

## 6. Per-assertion results (final run: 56/56 PASS, exit 0)

| # | Assertion | Result |
|---|---|---|
| 01 | exactly 13 approved public tables exist | PASS |
| 02 | negative payable rejected | PASS (`payable_rounding`) |
| 03 | zero original_price rejected | PASS |
| 04 | discount_pct > 100 rejected | PASS (`payable_rounding`) |
| 05 | discount_amount ≠ original − payable rejected | PASS |
| 06 | payable not equal to approved whole-rupee rounding rejected | PASS |
| 07 | 100% discount with payable 0 accepted | PASS |
| 08 | non-INR currency rejected | PASS |
| 09 | payments.state 'reversed' rejected | PASS |
| 10 | invalid payment method rejected | PASS |
| 11 | invalid freeze state rejected | PASS |
| 12 | attendance row with status 'failed' rejected (failed scans are never stored) | PASS |
| 13 | qr token with non-attendance purpose rejected | PASS |
| 14 | invalid profile role rejected | PASS |
| 15 | invalid join application state rejected | PASS |
| 16 | UPI payment without UTR rejected | PASS |
| 17 | awaitingVerification row carrying verified_by rejected | PASS |
| 18 | verified row without verified_at rejected | PASS |
| 19 | payment row carrying reversal_of rejected | PASS |
| 20 | reversal row without reversal_of rejected | PASS |
| 21 | valid cash payment accepted | PASS |
| 22 | valid UPI payment with UTR accepted | PASS |
| 23 | duplicate UTR rejected | PASS |
| 24 | period created by verified payment accepted | PASS |
| 25 | second period from the same payment rejected (one period per payment) | PASS |
| 26 | period with end_date < start_date rejected | PASS |
| 27 | valid reversal row (reversal → payment) accepted | PASS |
| 28 | reversal referencing another reversal rejected (composite FK) | PASS |
| 29 | append-only period-void event accepted | PASS |
| 30 | second void of the same period rejected (a period voids exactly once) | PASS |
| 31 | valid pending freeze window accepted | PASS |
| 32 | active_range is INCLUSIVE of end_date (O-02) | PASS |
| 33 | overlapping pending freeze rejected at the storage layer | PASS |
| 34 | adjacent (non-overlapping) freeze window accepted | PASS |
| 35 | freeze window with end < start rejected | PASS (range constructor, 22000) |
| 36 | pending freeze carrying a decision rejected | PASS |
| 37 | approved freeze without extension_days rejected | PASS |
| 38 | rejected freeze no longer blocks its date range | PASS |
| 39 | valid attendance QR token accepted | PASS |
| 40 | malformed token hash rejected (SHA-256 hex only) | PASS |
| 41 | token expiring before creation rejected | PASS |
| 42 | successful scan accepted (verified-only rule) | PASS |
| 43 | same member reusing the SAME token rejected (replay guard) | PASS |
| 44 | a DIFFERENT member sharing the live token accepted | PASS |
| 45 | duplicate token_hash rejected | PASS |
| 46 | second app_settings row rejected (singleton) | PASS (`app_settings_id_check`) |
| 47 | duplicate plan name rejected | PASS |
| 48 | member with payments cannot be deleted (RESTRICT) | PASS |
| 49 | plan in use cannot be deleted (RESTRICT) | PASS |
| 50 | qr token referenced by events cannot be deleted (RESTRICT) | PASS |
| 51 | auth user deletion succeeds (declared cascades) | PASS (real GoTrue `auth.users`) |
| 52 | profile cascaded with auth user | PASS |
| 53 | join application cascaded with auth user | PASS |
| 54 | one-sided pending plan assignment rejected | PASS |
| 55 | zero price_locked rejected | PASS |
| 56 | profile insert without a real auth user rejected | PASS |

---

## 7. Known issues / caveats

1. **Full-stack confirmation completed** (see UPDATE above). Remaining stack quirks, all outside
   the validation path: `supabase_vector` (log shipper) flaps/restarts gracefully when its log
   sources pause — log-infra only; `imgproxy` and `pooler` are stopped (image transformation /
   connection pooling — not used by Phase 3B.1, which connects directly to Postgres).
2. **Superuser context**: the suite runs as `postgres`; RLS/policies/grants are 0002 scope and
   were not exercised (by design).
3. **Defense-in-depth checks**: `payments.payable >= 0`, `payments.discount_pct between 0 and 100`,
   and `membership_freezes.window_ordering` can never be the *first* violating constraint
   (reverse-definition CHECK order + invariant math). Kept intentionally; expectations pinned to
   the operative constraints.
4. **Engine behavior notes** (PG 17.11): generated-column evaluation precedes CHECK evaluation
   (assertion 35), and CHECK order is reverse-definition (assertions 02/04). Both verified
   empirically on this engine and pinned in the suite.

## 8. Hygiene confirmations

- No remote Supabase project was touched; no `supabase link`/`push`; no app code changes
  (frontend QA gates not applicable to this phase).
- All work remains uncommitted on top of `ecb0b87`; Phase 3A reports preserved;
  no stray files staged.
- Scaffold consolidated at `gym-management-app/supabase/` (no root `supabase/` remains).
