# Phase 3B.2 — Final Security Audit

**Date:** 2026-11-17 · **Mode:** READ-ONLY (no migrations, tests, docs, app files or database modified)
**Reviewed:** `supabase/migrations/0002_rls_and_triggers.sql`, `supabase/tests/0002_rls_and_triggers_validation.sql`, `docs/PHASE_3B_2_RLS_TRIGGERS_REPORT.md`, `docs/PHASE_3A_FINAL_DESIGN.md`, `docs/PHASE_3A_UNRESOLVED_ITEMS.md`, plus live local-stack probes (catalog queries, role attributes, ACLs, membership graph, pg_hba, config.toml) executed in read-only transactions.

**Method:** static line-level review cross-checked against the authoritative design (§5.1–5.3, §8, §8.1) and the unresolved-items register, then live verification on the local stack (`supabase_db_GYM_Management`): helper function ownership/security, `pg_default_acl`, PUBLIC grants, RPC-reachable function inventory per role, `pg_auth_members` graph, role attributes, RLS flags re-verification, `session_user` set-ability probe, custom-GUC set-ability probe. No data was modified.

---

## Verdict summary

**No CRITICAL or HIGH findings.** One MEDIUM finding is forward-looking (default-privilege inheritance affects future migrations, not 0002's own objects — verified locked down). The implementation is faithful to the approved §8.1 matrix, the default-deny boundaries of the unresolved register hold structurally, and the payments override is spoof-proof end-to-end (proven in the genuine PostgREST context by T01–T13).

---

## Findings

### MEDIUM-01 — Supabase image default privileges will auto-grant client access to every future object in `public`

- **File/line:** environment finding; `pg_default_acl` (live probe). `0002_rls_and_triggers.sql` §2 (lines 226–230) compensates for it at 0002 time only.
- **Evidence:** default ACLs scoped to schema `public`, from BOTH `postgres` and `supabase_admin`:
  - tables `r`: `arwdDxtm` (ALL incl. TRUNCATE/REFERENCES/TRIGGER) → `anon`, `authenticated`, `service_role`
  - functions `f`: `X` (EXECUTE) → `anon`, `authenticated`, `service_role`
  - sequences `S`: `rwU` → same three roles
  Additionally `config.toml [api] auto_expose_new_tables` is unset ("a fresh project falls back to `true`"), and `[api] schemas = ["public","graphql_public"]` puts everything in `public` on the API surface.
- **Exploit scenario:** Phase 3B.3 creates SECURITY DEFINER authority functions (`verify_payment`, `create_reversal`, `check_in`, freeze decisions…) in `public`. Without explicit ACL management, each new function is **immediately RPC-callable by `anon`** (default `X`), and any table 0003/0004 creates is auto-exposed with ALL grants — a single forgotten `revoke` in 0003 turns a privileged authority operation into an unauthenticated API endpoint. 0002 protected *its own* objects only (revoke-then-grant, verified: `anon` has 0 table grants, `app_profile_role` proacl is `{postgres,authenticated}` only).
- **Recommended correction (condition for 3B.3):** every 0003 object MUST be created with explicit least-privilege ACLs (revoke `public`, `anon`, `service_role` first; grant per design), and — the durable fix — 0003 should add `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES/FUNCTIONS/SEQUENCES FROM anon, authenticated, service_role;` (and the same for `supabase_admin`). The 0003 suite must add per-function RPC-denial assertions (anon → `permission denied`/404) as an acceptance gate, matching unresolved-item #7(1).

### LOW-01 — Four trigger functions carry PUBLIC EXECUTE and appear in the API RPC surface

- **File/line:** `0002_rls_and_triggers.sql` lines 97, 111, 131, 172; live probe `proacl`: `{=X/postgres, postgres=X/postgres, anon=X/postgres, authenticated=X/postgres, service_role=X/postgres}` for `set_updated_at`, `assert_no_client_mutation`, `profiles_role_guard`, `payments_insert_override`.
- **Evidence:** only `app_profile_role()` had EXECUTE explicitly revoked from PUBLIC (line 433). The four trigger-returning functions retain the CREATE FUNCTION default (EXECUTE to PUBLIC).
- **Exploit scenario:** none demonstrated. PostgREST RPC rejects `trigger`-returning functions (unsupported return type). Direct SQL invocation is a harmless self-error: `assert_no_client_mutation()` raises 42501 when called as a client role (self-denial only); `set_updated_at()`/`profiles_role_guard()`/`payments_insert_override()` reference the unassigned `NEW` record and error out. `payments_insert_override()` is additionally SECURITY DEFINER — but a direct call still fails at the unassigned-record stage before any data access; the skip/GUC logic itself performs no writes.
- **Recommended correction:** hygiene revoke in 0003 (`revoke execute on function public.set_updated_at() … from public;` ×4) — zero-risk, removes them from the RPC inventory.

### LOW-02 — `btree_gist` extension installed into the API-exposed `public` schema

- **File/line:** `0001_core_schema.sql` line 53 (`create extension if not exists btree_gist;` with no `with schema` clause); live probe: 188 `gbt_*`/`*_dist` functions in `public`, all PUBLIC-executable.
- **Evidence:** project convention keeps `pgcrypto`, `uuid-ossp` in `extensions` (correct), but `btree_gist` landed in `public` — the single schema exposed via `[api] schemas`.
- **Exploit scenario:** effectively none — the functions are pure comparators/distance calculators with no data access, and most take `internal` parameters PostgREST cannot marshal; JSON-marshalable ones (e.g. `date_dist(date,date)`) are harmless math. This is exposure-surface hygiene, not a privilege path.
- **Recommended correction:** in a future migration, `alter extension btree_gist set schema extensions;` (re-run the freeze-exclusion overlap tests afterwards), or accept and document.

### LOW-03 — Payments override does not validate `plans.is_active` for fallback pricing

- **File/line:** `0002_rls_and_triggers.sql` lines 196–207 (fallback: `select pl.price from public.plans pl where pl.id = new.plan_id` — no `is_active` check, no cross-check against `members.plan_id`).
- **Evidence:** member rows with `price_locked = null` fall back to the price of **whatever `plan_id` the caller submits** — including an inactive/retired plan (fixture: retired plan at 999 vs current 1500; T08/T09 prove the fallback mechanics).
- **Exploit scenario:** a receptionist records a member's renewal priced from a cheaper inactive plan (recording 999 as the payable for a 1500 plan). Inputs are staff-only, fully bounded by 0001 constraints (`discount_pct ∈ [0,100]`, exact-rounding checks), and fully audited (`payment.created` row) — this is a staff-input integrity gap, not a client privilege path. Design §5.2 is satisfied literally ("plan price"), but plan-status consistency is unenforced at insert time.
- **Recommended correction:** 0003's `verify_payment` should refuse to grant a period from a payment whose plan is inactive or inconsistent with the member's plan (revenue-recognition gate), or a later 0002 revision adds `and pl.is_active` to the fallback. Not blocking: the money remains server-computed and audited either way.

### INFORMATIONAL-01 — `app.bypass_payment_override`: protection boundary and 0003 conditions

- **File/line:** `0002_rls_and_triggers.sql` lines 156–166 (contract comment), 182–184 (skip condition).
- **Evidence (live probes, read-only):**
  - `SET LOCAL session_user = …` → `ERROR 42601` — `session_user` is not client-settable on any path; the maintenance skip is out of client reach.
  - An invoker-context (`SET ROLE authenticated`) transaction CAN execute `set local app.bypass_payment_override = 'on'` — **but no client path reaches SQL execution**: PostgREST exposes no SET, no header→GUC injection, no RPC that writes the GUC, and the only EXECUTE-granted application function (`app_profile_role`) is a read-only SQL SELECT. The GUC is activatable only from trusted server code (psql/maintenance/SECURITY DEFINER functions).
  - Local pooler is disabled (`[db.pooler] enabled = false`); hosted projects use transaction-mode pooling.
- **Exploit scenario (residual):** if a future 0003 function sets the GUC **session-wide** (`set_config(..., is_local => false)`) inside a transaction-pooled connection, the flag leaks to a subsequent unrelated request on that pooled server connection, silently disabling the override for that request's inserts (a client could then land `verified`/reversal-shaped rows if they hit the leaked connection).
- **Recommended correction (conditions for 3B.3):** authority functions MUST use transaction-scoped setting only (`SET LOCAL` / `set_config(..., true)`), never session-level; must never persist the GUC past their statement; no RPC may ever expose it; the 0003 suite must assert the override is active for a plain client insert immediately after an authority-function call in the same pooled-session simulation.

### INFORMATIONAL-02 — `members.auth_user_id` protections (audit question 1)

- **File/line:** `0002_rls_and_triggers.sql` lines 65–74; grants §6 (lines 404–414, 422–428); FK verified live: `members_auth_user_id_fkey … ON DELETE SET NULL`, `members_auth_user_id_key UNIQUE`, index `members_auth_user_idx`.
- **Evidence:**
  - **Ownership/linking:** no client role holds INSERT or UPDATE on `members` (`authenticated`: SELECT only; `service_role`: SELECT only — no UPDATE grant exists for members for ANY role). Linking is exclusively server-side (0003/admin paths), matching §8.1 ("members … writes via functions").
  - **Anti-hijack:** `UNIQUE(auth_user_id)` guarantees one auth user maps to at most one member row; a member JWT resolves to exactly one member row through `members_select_own`. A member cannot re-link their row to another user (no UPDATE grant, no UPDATE policy, guard trigger). Linking a member to *someone else's* account requires server/definer access.
  - **Deletion:** auth-user deletion NULLs the link and retains the member row and all financial history (suite X01 verified) — consistent with the approved retention posture (unresolved #6: financial rows retained).
  - **NULL is inert:** an unlinked member row is invisible to every client role (the member-own policy requires `auth_user_id = auth.uid()`; staff policies are read-only).
- **Exploit scenario:** none at client level. Server-side note: when the 0003/admin linking path is built, it should validate that the target profile's `role = 'member'` before linking (a staff profile linked to a member row is a data-consistency smell, not an escalation — staff quals are already wider than member quals).
- **Recommended correction:** fold the profile-role validation into the 0003 linking/admin function.

### INFORMATIONAL-03 — `payments_insert_override` (audit question 2)

- **File/line:** `0002_rls_and_triggers.sql` lines 145–233 (function), 485 (trigger).
- **Evidence:**
  - **SECURITY DEFINER ownership:** owner `postgres` (live probe A), `set search_path = 'public'` pinned; body references are schema-qualified (`public.profiles`, `public.members`, `public.plans`, `public.audit_log_entries`, `auth.uid()`); pg_catalog (`round`) is implicitly first — search-path hijack is not reachable.
  - **session_user behavior:** skip applies only to login roles `postgres`/`supabase_admin` (both verified BYPASSRLS-capable server roles; live probe F). PostgREST's login role is always `authenticator` (pg_hba + Supabase topology), so **every real client insert is overridden**. `supabase_admin` is superuser — by definition a trusted maintenance identity.
  - **Forcing completeness:** state, entry_type, reversal_of, currency, verifier, attribution, receipt fields are all force-assigned before the row is returned (lines 205–214); money is server-computed from `price_locked`/plan price and constrained by 0001 (`payable_rounding`, `discount_amount_exact`, `undecided_has_no_verifier` — all verified by T01–T03 in the authenticator context).
  - **Audit:** one `payment.created` row per accepted insert (T11: exactly the two override inserts, actor/role from the authoritative profile; T04 proved a failed insert leaves NO phantom audit row — the audit insert shares the statement's subtransaction and rolls back with it).
- **Exploit scenario:** none found. Spoofed JWT role claims (up/down) are ignored (profile is authoritative — M11, T06, T08); spoofed money/type/attribution fields are discarded (T01–T03, T08–T09); non-receptionists are rejected by the trigger itself in the real client context (T05–T07).
- **Recommended correction:** none for 0002. For 0003, see INFORMATIONAL-01 conditions.

### INFORMATIONAL-04 — `app_profile_role` (audit question 3)

- **File/line:** `0002_rls_and_triggers.sql` lines 84–94 (definition), 433–435 (lockdown); live probes A/I.
- **Evidence:**
  - SECURITY DEFINER, owner `postgres`, `stable`, `search_path = public`, body `select p.role from public.profiles p where p.id = auth.uid()` — fully qualified.
  - proacl is **explicit** `{postgres=X/postgres, authenticated=X/postgres}` — anon, service_role and PUBLIC have no EXECUTE (C18 + probe I).
  - **RLS recursion:** policies on `profiles` call this definer function, which reads `profiles` as `postgres` — it does NOT re-enter caller-visible policy evaluation, so `profiles_select_own`/`_staff` cannot recurse (recursion would otherwise be an infinite loop; Postgres would raise, DoS-style — structurally prevented here). The `payments/periods/voids/freezes/attendance_select_own` policies use member-link subqueries on `members` whose policies reference only `auth.uid()` and `app_profile_role()` — the subquery graph is acyclic (no policy on `members` references `payments`, etc.).
  - **Privilege escalation:** the function takes no arguments, returns one text value from one row, and ignores all caller input; its definer context cannot be steered (no dynamic SQL, no search_path gap).
- **Exploit scenario:** none found. Definer-function RLS bypass is by design (unresolved #7(1)) and is exactly what the 0002 suite pins down behaviorally.
- **Recommended correction:** none.

### INFORMATIONAL-05 — Payment insertion paths (audit question 4)

- **File/line:** `0002_rls_and_triggers.sql` line 414 (the only client INSERT grant on payments), line 334 (sole INSERT policy), UNRESOLVED #5 (lines 65–71).
- **Evidence:** member UTR submission is **confirmed intentional default-deny**: the unresolved register explicitly says the design "grants members read-own on payments only; no member INSERT grant exists" and member-side submission "stays disabled until the owner asks for the feature." Structurally: `authenticated` INSERT on payments exists only so the receptionist path is reachable through the shared role; the override trigger (real client context) raises `Only receptionists can record payments.` for member/owner/profileless actors (T05–T07), and the WITH CHECK policy (`app_profile_role() = 'receptionist'`) is the second layer (M14/N04/O05 in maintenance context).
- **No path to `verified` or reversal rows:** the override forces `state='awaitingVerification'`, `entry_type='payment'`, `reversal_of=null` on every accepted client insert; `service_role` has NO INSERT grant on payments (S09: `permission denied`); there are no UPDATE/DELETE grants anywhere and no UPDATE/DELETE/ALL policies on any table (live probe O: 0 rows) — and `INSERT … ON CONFLICT DO UPDATE` requires UPDATE privilege, so even upsert cannot mutate an existing row. `verified`/reversal rows can originate only from (a) direct server maintenance (`session_user='postgres'`, BYPASSRLS — the operator is trusted by definition) or (b) the documented GUC contract reserved for 0003 authority functions (INFORMATIONAL-01). Verified-target/chain-sum rules arrive with `create_reversal` in 0003 per design §5.3 (0001 stores the structural FKs).
- **Recommended correction:** none for 0002.

### INFORMATIONAL-06 — Policy set: permissive-OR, isolation, staff boundaries (audit question 5)

- **File/line:** `0002_rls_and_triggers.sql` lines 269–395; live catalog (23 policies, all `PERMISSIVE`, cmd ∈ {SELECT, INSERT} only — no UPDATE/DELETE/ALL policies exist anywhere).
- **Evidence:**
  - **OR-widening analysis:** every table's policies combine a member-own qual and a staff qual permissively. Widening would require one caller satisfying both — impossible: `app_profile_role()` returns ONE authoritative value per caller (single `profiles` row keyed by `auth.uid()`), and `UNIQUE(members.auth_user_id)` limits member-own to one row. A member satisfies only own-quals; receptionist/owner satisfy only staff-quals; a profileless user satisfies neither. Cross-role count assertions (M02/M03/M04, W01/W02, R01–R03, O01, N01–N03) verify the effective visibility empirically, including spoofed-claim no-ops (M11).
  - **Cross-member isolation:** member visibility is fully key-chained through `auth_user_id` → member id → member_id on payments/periods/voids/freezes/attendance; suite proves pay2 invisible to member1 (M04), member1's rows invisible to member2 (W02), profileless sees zero everywhere (N01–N03).
  - **Owner/Receptionist boundary:** owner is SELECT-only on payments and freezes (no write grant + no INSERT policy + guard on UPDATE/DELETE — O03–O07); both staff roles may INSERT follow_up_events strictly with `actor = auth.uid()` (R10 proves cross-attribution rejected); audit is owner-only readable and non-writable by clients (M22/R17/O10–O12); `qr_tokens` has zero policies and no client grants of any kind (C05, M17/R15/O15–O16).
  - **Grant-level differences** (grants are table-level; RLS narrows): `authenticated` holds SELECT on `audit_log_entries` and `follow_up_events` although the matrix marks member as "—" — the row-level policies enforce the "—" (member sees 0 rows: M16/M22). Effective matrix = §8.1 exactly.
- **Recommended correction:** none.

### INFORMATIONAL-07 — Triggers: identity, exceptions, immutability (audit question 6)

- **File/line:** `0002_rls_and_triggers.sql` lines 97–143 (guard functions), 172–233 (override), 442–485 (trigger creation); live probes A/P; dump: 19 triggers.
- **Evidence:**
  - **Execution identity:** the three guard functions are SECURITY **INVOKER** (prosecdef = f, live) and test `current_user` — correct in invoker context: PostgREST presents `current_user = 'authenticated'/'anon'` (PostgREST issues `SET ROLE`), while the SECURITY DEFINER override correctly uses `session_user` because `current_user` inside a definer function is always the definer (this exact defect was root-caused and fixed in 0002 — see the 3B.2 report §2.1).
  - **service_role exception is intentional:** §8.1 grants service explicit paths (profiles role management, hook-path application inserts, audit append, QR mint/purge) — the guard lets service_role/postgres pass and relies on grants, exactly as the design's "direct client UPDATE/DELETE revoked … state changes flow through security-definer functions" posture requires. Suite S01–S12 pins the service surface positively and negatively.
  - **Immutability/append-only:** no client UPDATE/DELETE grant on any of the 13 tables + `trg_client_guard` on all 13 + zero UPDATE/DELETE/ALL policies ⇒ payments, voids, attendance, audit and periods are append-only against every client role. Even a deliberately leaked UPDATE/DELETE grant cannot mutate (G01–G04: guard/filter yields 0 rows, catalog re-verified clean). `profiles.role` is additionally guard-protected even if an UPDATE grant leaked (profiles_role_guard). Design §8's "BEFORE triggers block mutation of protected columns" is implemented in its stronger form (full client write block) — a compliant superset.
  - **TRUNCATE:** no TRUNCATE grants for any client role (default-ACL notwithstanding — see MEDIUM-01 for future tables; 0002's own tables verified clean).
- **Exploit scenario:** none found at client level. Future definer functions will legitimately bypass the guard (definer context) — that is the designed authority mechanism and lands in 0003 with its own role checks.
- **Recommended correction:** none for 0002 (see LOW-01 for the hygiene revoke).

### INFORMATIONAL-08 — Environment/stack observations (local-only)

- **Evidence:** pg_hba in the local container: `trust` for loopback (passwordless TCP as any role) and private ranges; `supabase_admin` is superuser; `[auth.mfa] totp enroll/verify disabled` locally; `graphql_public` listed in `[api] schemas` but `pg_graphql` is not installed (endpoint inert); realtime is enabled — postgres_changes consumers are subject to the same RLS policies evaluated as the subscribing role; `max_rows = 1000` caps accidental bulk reads.
- **Exploit scenario:** none within the delivered artifact's scope. These are local development stack facts; the hosted project uses managed hba/auth. The passwordless local TCP is why the suite's mid-file `\connect` works; it is not a property of any committed code.
- **Recommended correction:** none (documented for reproducibility). Note for 3B.3: AAL2 gating must be implemented in the functions (per unresolved #4) and cannot be exercised locally until `[auth.mfa]` is enabled in a later config change.

### INFORMATIONAL-09 — Suite as an acceptance gate

- **Evidence:** `0002_rls_and_triggers_validation.sql` — 123/123 passed on the validated run (fresh `db reset`, 0001 gate first at 56/56). Contexts exercised: postgres (catalog/fixtures), authenticated personas ×5 (member1/member2/member3-profileless/receptionist/owner), anon, service_role, and the **genuine PostgREST login context** (`session_user='authenticator'` via mid-file `\connect`) where the override is proven end-to-end (T01–T13). Every negative test pins SQLSTATE class AND message fragment or an effective row count; the GUC contract and its inertness for plain clients are covered (T05–T07 vs T12/T13). Cleanup verified post-run (suite fixtures removed; 0001 leftovers intact; `suite_results` dropped).
- **Recommended correction:** none; carry the same assertion discipline into the 0003 suite (including per-function anon/authenticated RPC denials — see MEDIUM-01).

---

## Audit-question conclusions (mapping)

1. **members.auth_user_id** — Server-side-only linking; UNIQUE prevents multi-linking; no client write path of any kind; deletion SET NULLs and retains history; NULL is inert. → INFORMATIONAL-02.
2. **payments_insert_override** — Owner `postgres`, pinned search_path, qualified references; `session_user` skip is client-unreachable (and `session_user` itself is provably non-SET-able); GUC activatable only from trusted server code; transaction-scoped behavior safe locally, with explicit pool-leakage conditions imposed on 0003. → INFORMATIONAL-01/03.
3. **app_profile_role** — Definer/owner/search_path/grants verified; no recursion (definer reads bypass caller RLS by design; policy graph acyclic); no escalation surface. → INFORMATIONAL-04.
4. **Payment insertion** — Receptionist-only INSERT is the documented intentional default-deny (unresolved #5); no client path can create verified or reversal rows (forcing + grant absence + no UPDATE policy + upsert privilege barrier). → INFORMATIONAL-05.
5. **RLS policies** — Permissive-OR cannot widen (single authoritative role value + UNIQUE link); cross-member isolation proven by effective row counts; owner/receptionist boundaries enforced by grants + policies + triggers. → INFORMATIONAL-06.
6. **Triggers** — Guards are invoker-context and correctly identity-bound; service_role/postgres exceptions are intentional per §8.1; definer override identity root-caused and fixed; append-only holds for every client role even under leaked grants. → INFORMATIONAL-07.

---

## Conditions carried into Phase 3B.3 (from MEDIUM-01 + INFORMATIONAL-01)

1. Every 0003 object created with explicit least-privilege ACLs; add `ALTER DEFAULT PRIVILEGES … REVOKE ALL … FROM anon, authenticated, service_role` for both `postgres` and `supabase_admin` in `public`; extend the 0003 suite with per-function RPC-denial assertions.
2. `app.bypass_payment_override` set transaction-locally only (`SET LOCAL` / `set_config(..., true)`); never session-level; never RPC-exposed; suite asserts override remains active for plain client inserts after authority-function calls.
3. Hygiene (LOW-01/LOW-02): revoke PUBLIC EXECUTE from the four trigger functions; consider `alter extension btree_gist set schema extensions`.
4. `verify_payment` gates revenue recognition on plan status/consistency (LOW-03); the admin linking path validates `profiles.role = 'member'` before setting `auth_user_id` (INFORMATIONAL-02).

---

## VERDICT

**APPROVED WITH CONDITIONS**

(No CRITICAL or HIGH findings; MEDIUM-01 and the GUC conditions are forward-looking requirements on 0003 and do not require changes to the approved 0002 artifact.)
