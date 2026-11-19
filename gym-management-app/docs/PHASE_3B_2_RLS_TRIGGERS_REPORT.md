# Phase 3B.2 — RLS, Privilege Lockdown & Immutability Triggers — Report

**Date:** 2026-11-17
**Scope:** Local Supabase stack ONLY (`127.0.0.1:54322`, container `supabase_db_GYM_Management`)
**Status:** COMPLETE — validated. STOP point before 0003; awaiting owner review.

| Deliverable | Result |
|---|---|
| `supabase/migrations/0002_rls_and_triggers.sql` | Applied cleanly (0001 → 0002 in `schema_migrations`) |
| `supabase/tests/0002_rls_and_triggers_validation.sql` | **123 / 123 assertions PASSED** (exit 0) |
| `supabase/tests/0001_core_schema_validation.sql` (regression gate) | **56 / 56 PASSED** on the 0002-hardened database |

**Remote/GitHub boundary:** no remote Supabase operations, no `supabase link`/`db push`, no commits, no pushes, no app/frontend integration. `linked_project` remains `null`. All work is uncommitted on top of `ecb0b87`; nothing staged. The stray root-level `package-lock.json` is untracked and was not staged or touched.

---

## 1. ⚠️ Reported schema addition: `members.auth_user_id`

Migration **0001 was NOT modified**. Migration 0002 adds one column the approved design requires:

```
members.auth_user_id  uuid null
  REFERENCES auth.users(id)  ON DELETE SET NULL
  UNIQUE (members_auth_user_id_key)
  INDEX  members_auth_user_idx
```

- **Why:** the Phase 3A final-design ER diagram declares `profiles ||--o| members : "auth_user_id nullable"`. 0001 omitted it, and **Member-own-row SELECT is unimplementable without the link** (the member's RLS policy `members_select_own` is `app_profile_role() = 'member' AND auth_user_id = auth.uid()`).
- **Why it is prominently reported:** it is a storage-layer change belonging to 0001's table definition, made in a later migration by explicit decision (the 0001 baseline was already validated and frozen).
- **Deletion semantics:** `ON DELETE SET NULL` — deleting an auth account does NOT delete (or orphan-cascade) financial history; the member row survives with the link cleared. Validated by suite assertion X01.

## 2. Defects found and fixed during this phase

### 2.1 Payments-override skip condition was a permanent no-op (root-caused, fixed)

**Defect:** the draft override function guarded maintenance contexts with `current_user = 'postgres'`. Inside a **SECURITY DEFINER** function, `current_user` is **always the definer** (`postgres`), so the override skipped for **every** insert — client-spoofed fields would land unmodified. Suite evidence: the receptionist spoofed-field insert failed with `payable_rounding`, i.e. the submitted (spoofed) row reached CHECK constraints unmodified.

**Fix (0002):** the discriminator is now `session_user` — the **login** role, unaffected by SECURITY DEFINER:

```sql
if session_user in ('postgres', 'supabase_admin')
   or coalesce(current_setting('app.bypass_payment_override', true), 'off') = 'on' then
  return new;
end if;
```

- PostgREST clients always connect as login role `authenticator` → the override **always fires** for them.
- Direct maintenance connections (`postgres` / `supabase_admin`) skip it — which is why the Phase 3B.1 suite (running as `postgres`) stays 56/56-compatible.

**Engine fact established by micro-test:** on this engine a BEFORE INSERT trigger runs **before** RLS WITH CHECK evaluation. Consequences, both now encoded in the suite:

- In the `postgres` (maintenance) context the trigger skips, so a member/owner INSERT denial surfaces as the **RLS WITH CHECK** error (`new row violates row-level security policy`, SQLSTATE 42501) — assertions M14/N04/O05 pin exactly that.
- In a real PostgREST context the trigger fires first and raises its own guard error (`Only receptionists can record payments.`) — assertions T05/T06/T07 pin exactly that. Same security outcome, different mechanism per context; **no test was weakened** — the enforced denial is pinned precisely in both contexts.

### 2.2 Audit-log readability defect (fixed before application)

The §8.1 matrix requires Owner-readable `audit_log_entries`, but the draft grant list omitted `SELECT` for `authenticated` — the owner (an authenticated JWT) would have gotten `permission denied`. Fixed: table-level `SELECT` granted to `authenticated`, with the **owner-only policy (`app_profile_role() = 'owner'`) as the sole row gate** (receptionist/member get the grant but see 0 rows — assertions R17/M22).

## 3. Forward contract for 0003: `app.bypass_payment_override`

The override's skip condition accepts the custom GUC `app.bypass_payment_override = 'on'`. This exists for the Phase 3B.3 SECURITY DEFINER authority functions:

- `create_reversal` must insert a **reversal-shaped** row (`entry_type='reversal'`, verified state) without the override forcing it back to `entry_type='payment' / awaitingVerification`.
- The authority function will `SET LOCAL app.bypass_payment_override = 'on'` around its own inserts, then insert rows exactly as computed.
- **Not a client door:** PostgREST clients cannot issue `SET` for custom GUCs; the marker is reachable only from trusted server code. The suite proves the contract end-to-end: with the GUC set in the authenticator session, a reversal-shaped `verified` row lands **unmodified** (T12/T13); without it, identical spoofed input is forced to an awaiting-verification payment (T01/T02).
- 0003 must set this GUC locally and never persist it; treat it as an internal authority-function marker, not an API surface.

## 4. What migration 0002 contains

1. **`members.auth_user_id`** (§1).
2. **Role resolution helper** `public.app_profile_role()` — SECURITY DEFINER, `search_path = public`, reads the **authoritative** `profiles.role`, never JWT claims. EXECUTE: `authenticated` only (anon / service_role / PUBLIC revoked).
3. **Privilege cleanup:** `REVOKE ALL ... ON ALL TABLES` from `anon, authenticated, service_role` first (the stack image grants ALL by default), then least-privilege re-grants.
4. **RLS ENABLE + FORCE on all 13 tables.** FORCE matters because `postgres` is a **non-superuser WITH BYPASSRLS** in this stack (C10) — maintenance stays safe, and no table-owner row-access hole exists.
5. **23 policies** (§5 matrix below), all PERMISSIVE but every qual is role-bound via `app_profile_role()`, so permissive-OR cannot widen any single role's view (validated by cross-role row counts).
6. **Grants** (§6 below): `authenticated` = SELECT 12 tables + audit, INSERT payments + follow_up_events; `service_role` = SELECT 13, INSERT profiles/join_applications/audit/qr_tokens, UPDATE profiles/qr_tokens, DELETE qr_tokens; **`anon` = nothing**.
7. **19 triggers** (§7 below): client-mutation guard ×13, `updated_at` ×4, `profiles.role` guard ×1, payments INSERT override ×1.
8. **Money-forcing override** `public.payments_insert_override()` (SECURITY DEFINER): server-computed money from `members.price_locked` (fallback: plan price), approved whole-rupee rounding, forced `state='awaitingVerification'`, `entry_type='payment'`, `currency='INR'`, null verifier, self-attribution to the actual signed-in actor, `receipt_issued=false`, plus a `payment.created` audit row per insert.

## 5. Policy matrix (23 policies, from live catalog)

| Table | Policy | Cmd | Roles | Rule (qual / with_check) |
|---|---|---|---|---|
| profiles | profiles_select_own | SELECT | authenticated | role='member' AND id = auth.uid() |
| profiles | profiles_select_staff | SELECT | authenticated | role ∈ ('receptionist','owner') |
| plans | plans_select_member | SELECT | authenticated | role='member' AND is_active |
| plans | plans_select_staff | SELECT | authenticated | staff |
| members | members_select_own | SELECT | authenticated | role='member' AND auth_user_id = auth.uid() |
| members | members_select_staff | SELECT | authenticated | staff |
| membership_periods | periods_select_own | SELECT | authenticated | role='member' AND member_id ∈ own members |
| membership_periods | periods_select_staff | SELECT | authenticated | staff |
| membership_period_voids | voids_select_own | SELECT | authenticated | role='member' AND period ∈ own periods |
| membership_period_voids | voids_select_staff | SELECT | authenticated | staff |
| payments | payments_select_own | SELECT | authenticated | role='member' AND member_id ∈ own members |
| payments | payments_select_staff | SELECT | authenticated | staff |
| payments | payments_insert_receptionist | INSERT | authenticated | role='receptionist' (WITH CHECK) |
| attendance_events | attendance_select_own | SELECT | authenticated | member-own via member link |
| attendance_events | attendance_select_staff | SELECT | authenticated | staff |
| membership_freezes | freezes_select_own | SELECT | authenticated | member-own via member link |
| membership_freezes | freezes_select_staff | SELECT | authenticated | staff |
| join_applications | applications_select_own | SELECT | authenticated | role='member' AND auth_user_id = auth.uid() |
| join_applications | applications_select_staff | SELECT | authenticated | staff |
| follow_up_events | followups_select_staff | SELECT | authenticated | staff |
| follow_up_events | followups_insert_staff | INSERT | authenticated | staff AND actor = auth.uid() |
| audit_log_entries | audit_select_owner | SELECT | authenticated | role='owner' (sole row gate) |
| app_settings | settings_select_authenticated | SELECT | authenticated | role IS NOT NULL |

- **`qr_tokens`: zero policies** — no direct client access of any kind (§8.1 "—"); service-only via BYPASSRLS + grants.
- **No policy reads JWT role/AAL claims** (C07 regex: `request.jwt.claims | jwt.claim.role | auth.jwt() | auth.role() | aal | amr` — zero matches). Roles resolve exclusively through the authoritative profile; JWT claims cannot escalate.
- **No policy is granted to `anon`** (C04).

## 6. Grant snapshot (live catalog)

| Role | SELECT | INSERT | UPDATE | DELETE | Others |
|---|---|---|---|---|---|
| `authenticated` | 12 tables + audit_log_entries | payments, follow_up_events | — | — | none |
| `service_role` | all 13 | profiles, join_applications, audit_log_entries, qr_tokens | profiles, qr_tokens | qr_tokens | none |
| `anon` | — | — | — | — | — (0 grants, C15) |

`authenticated` has **no UPDATE / DELETE / TRUNCATE / REFERENCES / TRIGGER** anywhere (C14) — writes flow through 0003 authority paths only.

## 7. Trigger inventory (19, live catalog)

| Trigger | Tables | Fires | Effect |
|---|---|---|---|
| `trg_client_guard` → `assert_no_client_mutation()` | all 13 | BEFORE UPDATE/DELETE | raises 42501 for `current_user ∈ ('anon','authenticated')`; service/postgres pass (grant-governed) |
| `trg_updated_at` → `set_updated_at()` | profiles, plans, members, app_settings | BEFORE UPDATE | maintains `updated_at` (U01) |
| `trg_role_guard` → `profiles_role_guard()` | profiles | BEFORE UPDATE | `profiles.role` changes service-only, even if a grant leaks |
| `trg_payments_insert_override` → `payments_insert_override()` | payments | BEFORE INSERT | §2.1/§4.8: receptionist-only + server-forced money & state + audit |

Guard-backstop proofs (G01–G04): even with a *deliberately temporary* UPDATE/DELETE grant to `authenticated`, no mutation lands (guard or RLS filter to 0 rows); grants fully revoked and re-verified in catalog afterwards.

## 8. Validation

### 8.1 Runbook (exact commands used)

```
npx supabase db reset                                   # applies 0001 → 0002, cwd gym-management-app
docker cp <suite> supabase_db_GYM_Management:/tmp/*.sql
docker exec supabase_db_GYM_Management psql -U postgres -v ON_ERROR_STOP=1 -f /tmp/<suite>.sql
```

Every reset was followed by the **0001 regression gate first** (56/56 on every run), then the 0002 suite.

### 8.2 Result

| Suite | Assertions | Result |
|---|---|---|
| 0001_core_schema_validation.sql (regression on 0002-hardened DB) | 56 | **56/56 PASS** |
| 0002_rls_and_triggers_validation.sql | 123 | **123/123 PASS** (exit 0) |

### 8.3 0002 assertion breakdown by context

| Section | Context | Count | Covers |
|---|---|---|---|
| C01–C18 | postgres | 18 | catalog: RLS enabled+FORCED ×13, 23 policies, policy shape, no JWT-claim policies, definer helpers + search_path, engine facts, auth_user_id, grants exactness, trigger inventory ×19, helper EXECUTE lockdown |
| M01–M24 | authenticated (member1) | 24 | own-row visibility exactness, cross-member invisibility, active-plan-only, spoofed-claims no-op, INSERT/UPDATE/DELETE denials, silent RLS filters |
| N01–N04 | authenticated (user w/o profile) | 4 | default-deny persona: zero rows everywhere, payment recording denied |
| R01–R04, R08–R22 | authenticated (receptionist) | 19 | staff-wide visibility (incl. inactive plans), UPI-without-UTR 23514, follow-up self-attribution WITH CHECK, all UPDATE/DELETE/INSERT denials on non-writable tables, audit invisibility |
| W01–W02 | authenticated (member2) | 2 | cross-member payment isolation |
| S01–S12 | service_role | 12 | QR mint/purge, service-only role management, audit append, hook-path inserts; denials on payments DELETE/UPDATE and plans |
| O01–O19 | authenticated (owner) | 19 | staff-wide visibility incl. freezes, read-only payments, no direct freeze approval (C1 → 0003), audit readable, audit immutable, app_settings read-only |
| A01–A06 | anon | 6 | zero access of any kind |
| G01–G04 | authenticated (temp-grant backstop) | 4 | guard/RLS backstop under a deliberately leaked grant, catalog re-verified after revoke |
| X01 | postgres | 1 | auth-user deletion NULLs `members.auth_user_id`, member row retained |
| U01 | postgres | 1 | `set_updated_at` maintains `updated_at` |
| T01–T13 | **authenticator session** (`session_user='authenticator'`) | 13 | override fired for real: spoofed-field forcing, server money from price_locked, fallback pricing 1500→1350 @10%, receptionist-only raise for member/owner/profileless, UPI constraint on final row, audit emission with authoritative actor/role, member2 sees own new row, **GUC bypass contract (T12/T13)** |

**123 total** — pass count computed from actually executed assertions; any unrelated SQLSTATE is a failure, not a pass. Every negative test pins the expected SQLSTATE class **and** a message fragment, or an effective row count (RLS SELECT denials are silent by engine semantics).

### 8.4 Suite design notes (for reproducibility)

- The suite connects **mid-file** to the stack's real client login role via `\connect "host=127.0.0.1 port=5432 dbname=postgres user=authenticator"` — genuine PostgREST context (`session_user='authenticator'`) so the override is exercised end-to-end, then reconnects to `postgres` for cleanup/verdict.
- Because temp objects die at `\connect`, results and helpers live in a persistent `suite_results` schema (dropped again at the end; confirmed dropped post-run).
- Cleanup runs **after** the authenticator section (fixture dependency) and deletes only this suite's disjoint UUIDs; 0001-suite leftovers and `app_settings` id=1 remain — verified post-run: `payments`=3, `members`=2 (both 0001 leftovers), `audit`=0.
- Each fix-verify iteration ran on a **fresh `npx supabase db reset`** (abort skips cleanup; fixtures are disposable).

## 9. Unresolved items — default-deny status (unchanged)

| Item | Status in 0002 |
|---|---|
| Payment self-verify / self-reverse by receptionist | Default-deny: no UPDATE/DELETE grant + guard trigger; verify/reject/reverse arrive in 0003 |
| Attendance while `pendingPayment` | Default-deny: no INSERT path for clients; check-in authority function arrives in 0003 |
| Staff MFA (AAL2) enforcement | Deferred to 0003 (per plan); no policy reads AAL/AMR claims (C07) so no false sense of enforcement |
| Retention / PII deletion | Not implemented; `ON DELETE SET NULL` retains financial history by design (X01) |
| Freeze approval `[C1]` | Direct UPDATE denied for owner/receptionist (O06/R-tests); approval path arrives in 0003 |

## 10. Not done (out of scope by instruction)

- Migration **0003** (authority functions) — not started.
- App/frontend integration — not started.
- Any remote Supabase operation, GitHub commit/push/deploy — none performed.
- No Docker cleanup; all containers/volumes preserved.

## 11. Files changed in this phase

| File | Change |
|---|---|
| `gym-management-app/supabase/migrations/0002_rls_and_triggers.sql` | NEW: full RLS/grants/triggers migration (§4) incl. the §2 fixes |
| `gym-management-app/supabase/tests/0002_rls_and_triggers_validation.sql` | NEW: 123-assertion behavioral suite (§8) |
| `gym-management-app/docs/PHASE_3B_2_RLS_TRIGGERS_REPORT.md` | NEW: this report |
| `gym-management-app/supabase/migrations/0001_core_schema.sql` | **unmodified** |

**Next step:** await owner review of this report. On approval, Phase 3B.3 (`0003_functions`) implements the authority functions — including the `create_reversal` flow that consumes the `app.bypass_payment_override` contract (§3).
