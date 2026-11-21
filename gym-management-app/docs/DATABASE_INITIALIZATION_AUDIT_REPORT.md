# Database Initialization Audit Report

**Project:** Pulse Gym — `gym-management-app`
**Audit date:** 20 November 2026
**Audit type:** Read-only audit and initialization preparation
**Scope:** Supabase schema, migrations `0001`–`0012`, security model, tests, and first-initialization plan
**Remote operations performed:** **NONE** (no link, no query, no push, no bucket, no function deploy)

> **REMOTE DATABASE STATUS: NOT VERIFIED — OWNER REPORTED EMPTY DATABASE**
>
> This audit did not connect to, query, or inspect the hosted Supabase project. Every statement
> about the remote database below is either (a) derived from local configuration and documentation,
> or (b) explicitly labelled as an owner report. No remote claim in this document is first-hand
> verification.

---

## 1. Executive summary

The migration set is internally coherent, correctly ordered, and implements a strong
default-deny security model. There is **no missing migration dependency** and **no SQL syntax or
ordering defect** that would obviously prevent a clean Supabase project from being initialized.

However, the schema is **not yet proven end-to-end**:

- The hosted project has never been linked or pushed. Every prior report describes a **local-only**
  workflow (`supabase start` / `db reset`), and the local CLI currently reports
  `"linked_project": null`.
- The application still defaults to **demo authentication**; `EXPO_PUBLIC_AUTH_MODE` is not set.
  Even a fully migrated database would receive no live auth or writes from the current app build.
- Migrations `0001`–`0009` were executed on a local Docker stack in earlier workstreams
  (**agent-reported**, 732/732 assertions). Migrations `0010`, `0011`, and `0012` have **never been
  executed anywhere**, and their SQL suites are explicitly committed unexecuted.
- Several runtime assumptions are local-stack-specific and cannot be confirmed without a target
  project check: the migration/definer role bypassing `FORCE ROW LEVEL SECURITY`, the definer's read
  access to `auth.users`, ownership/permission on `storage.objects`, and `btree_gist` resolution.
- Two operational prerequisites are not automated by the migrations: seeding `app_settings` +
  plans (a `db push` does not run `seed.sql`) and creating the **first Owner** account/profile
  (all owner RPCs are owner-gated, creating a bootstrap chicken-and-egg).

**Verdict: READY WITH CONDITIONS.** Do not initialize the remote project until the six conditions
in §14 are closed. The correct next action is a local replay of the untested tail, not a remote push.

---

## 2. Current database status

| Item | Finding | Evidence |
|---|---|---|
| Hosted project linked to this repository | **No** | `supabase status` returns `"linked_project":null`; `supabase/.temp/project-ref` does not exist |
| Remote migration history inspected | **No** | Remote access prohibited in this audit |
| Remote tables inspected | **No** | Remote access prohibited in this audit |
| Owner-reported remote state | **Empty database / no tables** | Owner report; not independently verified |
| Local migration files present | **10** | `supabase/migrations/0001…0012` minus `0006`/`0007` |
| Local migration tracking metadata | **No remote tracking file** | `.temp/` contains only `cli-latest` and local `start-secrets` |
| Local Supabase stack running | **No** | Docker daemon unreachable (`dockerDesktopLinuxEngine` pipe missing) |
| Local PostgreSQL client (`psql`) | **Not on PATH** | Tool check |
| Supabase CLI | **3.1.0 local**, 3.2.0 cached | `node_modules/.bin/supabase --version`; `.temp/cli-latest` |
| Application auth mode | **demo (default)** | `EXPO_PUBLIC_AUTH_MODE` absent from `.env`; `provider.ts` defaults to `demo` |
| Application live data mode | **demo fallback** | `use-data.ts` returns demo records unless live mode is active |
| Backup configuration | **None in repository; remote status unknown** | WS-6 report |

**Status statement:** the repository contains a complete, ordered migration source, but there is no
local or remote artifact proving that the hosted project ever received it.

---

## 3. Root cause analysis of the apparently empty database

The empty database is the expected result of the project's development model, not evidence of a
failed migration run. Four independent causes combine:

### 3.1 Migrations were designed as local-only and were never pushed

`docs/PHASE_3A_FINAL_DESIGN.md` states the original boundary explicitly:

> “Local-first under `supabase/migrations/`; **no `supabase link`, nothing remote**.”

Later reports repeat the same boundary:

- `docs/PHASE_3B_2_RLS_TRIGGERS_REPORT.md`: “no remote Supabase operations, no `supabase link` /
  `db push` … `linked_project` remains `null`.”
- `docs/PHASE_4_FINAL_VERIFICATION_REPORT.md`: “No remote Supabase operations performed (no
  `supabase link`, no `db push`, no remote …).”
- `docs/PHASE_3B_3_AUTHORITY_FUNCTIONS_REPORT.md`: “All operations LOCAL only; no `db push` …”

The current CLI confirms the condition rather than merely repeating documentation:

```
$ node_modules/.bin/supabase status
{"linked_project":null, ... "StatusDbInspectError"}
```

`supabase status` failed only because Docker is not running; the `"linked_project":null` field is
independent of Docker and proves no project ref is linked in this working copy.

### 3.2 There is no remote migration-tracking artifact in the repository

A linked/pushed project normally leaves `supabase/.temp/project-ref`. The `.temp` directory contains
only:

- `cli-latest`
- `start-secrets/supabase_edge_runtime_GYM_Management/...` (local stack secret material)

There is no `project-ref`, no remote branch metadata beyond the local `main`, and no recorded
migration-history snapshot. The remote `supabase_migrations.schema_migrations` table cannot be
inspected under this audit's restrictions, but nothing local suggests it was ever populated.

### 3.3 The app has never been switched to live mode

`src/services/auth/provider.ts` resolves the provider as:

```ts
const requested = (process.env.EXPO_PUBLIC_AUTH_MODE ?? 'demo').trim().toLowerCase();
cached = requested === 'live' && isSupabaseConfigured() ? liveAuthProvider : demoAuthProvider;
```

`.env` contains `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, but **not**
`EXPO_PUBLIC_AUTH_MODE`. Therefore the app runs the in-memory demo provider. `src/services/data/use-data.ts`
returns demo records in demo mode. An empty database is therefore doubly expected: no schema was
pushed, and no client traffic would create rows even if it had been.

`src/services/supabase/client.ts` says the same in its header: “The app is NOT yet connected to
Supabase: authentication still runs on `DemoAuthProvider` and no screen reads from here.”

### 3.4 The hosted project is identifiable, but its initialization was never scheduled

`.env` points at a hosted project URL with a standard 20-character project ref, and
`docs/PRODUCTION_READINESS_STAGE_2B_WS6_REPORT.md` records the same project. `supabase/config.toml`
`project_id = "GYM_Management"` is **only the local Docker stack name**; it is not the hosted project
ref. The ref is therefore identifiable without exposing credentials, but no initialization step was
ever recorded as executed against it.

### 3.5 What this does *not* prove

This audit cannot rule out a remote schema created manually, a schema created by a different working
copy, or a project reset by the provider. It can only state that **this repository contains no
evidence of a push**, and that the owner reports an empty database.

---

## 4. Migration inventory (`0001`–`0012`)

### 4.1 Inventory summary

| # | File | Primary purpose | New tables | Altered tables | New routines | Clean-DB risk |
|---|---|---|---|---|---|---|
| 0001 | `0001_core_schema.sql` | Core 13-table schema, constraints, indexes | 13 | — | — | Low; needs `auth` schema + extensions |
| 0002 | `0002_rls_and_triggers.sql` | RLS, policies, grants, immutability triggers | — | `members` (+`auth_user_id`) | 5 | Low; depends on definer bypassing RLS |
| 0003 | `0003_authority_functions.sql` | Authority RPCs, audit, reversal cap, ACL lockdown | — | — | 18 | Low; needs `auth.uid()`/`auth.jwt()` |
| 0004 | `0004_views.sql` | 4 reporting/status views | — | — | — (4 views) | Low |
| 0005 | `0005_profile_provisioning.sql` | Self-service member profile creation | — | — | 1 | Low |
| 0008 | `0008_stage5_write_paths.sql` | Contact edit, plan lifecycle, join submit | — | — | 4 | Low |
| 0009 | `0009_receipt_issuance.sql` | One-way receipt issuance | — | — | 1 | Low |
| 0010 | `0010_receipt_storage.sql` | Private receipts bucket, storage policies, path attach | — | — (replaces `issue_receipt`) | 1 new + 1 replaced | **Conditional**: storage schema/ownership |
| 0011 | `0011_staff_administration.sql` | `profiles.is_active`, staff admin RPCs | — | `profiles` (+`is_active`) | 5 new + 2 replaced | **Conditional**: `auth.users` read |
| 0012 | `0012_privacy_consent.sql` | Consent + privacy request tables/RPCs | 2 | — | 3 | **Unverified**: never executed |

**Numeric gap:** there are no `0006_*` or `0007_*` migration files. Those numbers exist only as test
suite names (`0006_concurrency_validation.sql`, `0007_date_math_validation.sql`) that exercise logic
embedded in earlier migrations. This is documented in `PHASE_4_FINAL_VERIFICATION_REPORT.md`,
`PHASE_5_PROGRESS_REPORT.md`, and the WS-6 report. It is **not** a missing migration.

### 4.2 Per-migration detail

#### 0001 — `0001_core_schema.sql`

- **Purpose:** establish the 13-table core schema, extensions, keys, constraints, and indexes.
- **Extensions:** `pgcrypto` (UUID generation, hashing), `btree_gist` (UUID equality in the GiST
  exclusion constraint).
- **Tables created (13):**
  1. `profiles` — PK `id` → `auth.users(id)` cascade; `display_name`, `role`
     (`owner|receptionist|member`), `phone`, timestamps; `profiles_role_idx`.
  2. `plans` — PK `id`; unique `name`; `duration` enum-check; `price > 0`; INR-only; `is_active`.
  3. `members` — PK `id`; `full_name`, `phone`, `email`; `plan_id` → `plans` restrict;
     `price_locked`; `discount_pct` 0–100; `membership_end`; `joined_on`; pending-plan pair;
     `archived_at`; indexes on `plan_id` and `membership_end`.
  4. `payments` — PK `id`; `member_id`/`plan_id` restrict; `entry_type` (`payment|reversal`);
     money columns; `method` (`upi|cash`); unique `utr`; `state`
     (`awaitingVerification|verified|rejected`); `recorded_by`/`verified_by` restrict;
     `reversal_of` + generated `reversal_target_type` + composite self-FK; `receipt_issued`,
     `receipt_path`; four indexes.
  5. `membership_periods` — PK `id`; member/plan/payment FKs restrict; `start_date`/`end_date`;
     `price_applied`; unique `created_by_payment`.
  6. `membership_period_voids` — PK `id`; unique `period_id`; unique `reversal_id`; `voided_by`.
  7. `qr_tokens` — PK `id`; unique 64-hex `token_hash`; expiry; `minted_by`; expiry index.
  8. `attendance_events` — PK `id`; member/token FKs; `door`; `status='verified'`;
     unique `(member_id, token_id)`; two time indexes.
  9. `membership_freezes` — PK `id`; member FK; inclusive window; `reason`; state machine;
     requester/decider/ender FKs; generated `active_range`; GiST exclusion
     `freezes_no_overlap`; two indexes.
  10. `join_applications` — PK `id`; unique `auth_user_id` → `auth.users` cascade; application
      fields; state machine; `decided_by`; state index.
  11. `follow_up_events` — PK `id`; member/actor FKs; channel/outcome checks; member-time index.
  12. `audit_log_entries` — PK `id`; nullable `actor` → `profiles` **restrict**; action/table/row;
      JSONB before/after; three indexes.
  13. `app_settings` — singleton PK `id = 1`; timezone; UPI fields; token validity 5–600 s.
- **Indexes:** 20 explicit secondary indexes, plus constraint-created PK/unique/exclusion indexes.
- **RLS/policies/triggers/functions:** none in this migration.
- **Dependencies:** `auth.users`; `pgcrypto`; `btree_gist`; Supabase roles created by the platform.
- **Risks:** on a bare PostgreSQL instance (no `auth` schema, no `anon/authenticated/service_role`)
  this file fails immediately. It is a Supabase migration, not a portable PostgreSQL schema.
- **Clean-DB safety:** **safe** in a Supabase project with the extensions available.

#### 0002 — `0002_rls_and_triggers.sql`

- **Purpose:** enable/force RLS, define policies, revoke default grants, add immutability guards.
- **Schema addition:** `members.auth_user_id uuid` → `auth.users(id)` **on delete set null**;
  unique constraint `members_auth_user_id_key`; `members_auth_user_idx`.
- **Routines (5):**
  - `app_profile_role()` — SECURITY DEFINER, reads the caller's authoritative `profiles.role`.
  - `set_updated_at()` — trigger helper.
  - `assert_no_client_mutation()` — blocks direct INSERT/UPDATE/DELETE from `anon`/`authenticated`.
  - `profiles_role_guard()` — blocks client role changes.
  - `payments_insert_override()` — server-authoritative payment insertion.
- **RLS:** `enable` + `force` on all 13 tables.
- **Policies (23):**
  - `profiles`: own (member), staff read.
  - `plans`: active (member), staff read.
  - `members`, `membership_periods`, `membership_period_voids`, `payments`,
    `attendance_events`, `membership_freezes`: own (member) + staff read.
  - `payments`: receptionist INSERT.
  - `join_applications`: own (member) + staff read.
  - `follow_up_events`: staff read + staff INSERT with `actor = auth.uid()`.
  - `audit_log_entries`: owner read only.
  - `app_settings`: any active profile read.
  - `qr_tokens`: **no policies** (service-only by design).
- **Grants:** `SELECT` on 12 tables to `authenticated`; `INSERT` on `payments` and
  `follow_up_events`; `service_role` select-all plus narrow writes; `anon` nothing.
- **Triggers (19):** 4 `trg_updated_at`; 13 `trg_client_guard` (UPDATE/DELETE); 1 `trg_role_guard`;
  1 `trg_payments_insert_override`.
- **Dependencies:** 0001; `auth.uid()`; `auth.users`.
- **Risks:** `app_profile_role()` is SECURITY DEFINER and reads a `FORCE RLS` table. If the definer
  role does not bypass RLS, the policy recurses or returns no rows. See §6/§9.
- **Clean-DB safety:** **safe**, conditional on the definer-role privilege check.

#### 0003 — `0003_authority_functions.sql`

- **Purpose:** all authority-bearing writes as SECURITY DEFINER RPCs, plus audit and a deferred
  reversal cap; lock down future default privileges.
- **Default privileges:** revokes default table/function/sequence grants for `postgres` (per-schema
  and global PUBLIC EXECUTE); attempts the same for `supabase_admin` inside an exception block.
- **Helpers (4):** `app_gym_date()`, `require_role(text[])`, `assert_aal2()`,
  `audit_authority(...)`.
- **Authority routines (13):** `verify_payment`, `reject_payment`, `create_reversal`,
  `request_freeze`, `decide_freeze`, `end_freeze`, `check_in`, `mint_attendance_token`,
  `set_member_discount`, `request_plan_assignment`, `update_plan_price`, `decide_application`,
  `update_gym_settings`.
- **Trigger routine (1):** `payments_reversal_cap_trigger()`.
- **Constraint trigger:** `payments_reversal_cap` — deferred, prevents cumulative reversals
  exceeding the original payment.
- **ACLs:** 13 client RPCs → `authenticated`; helpers/trigger → no client EXECUTE.
- **Dependencies:** 0001, 0002; `auth.uid()`, `auth.jwt()`; `app_settings` row is optional for
  date fallback but required by token minting.
- **Risks:** `auth.jwt() ->> 'aal'` must be present and equal `aal2` for gated actions; AAL2 requires
  a paid Supabase plan and an enrolled TOTP factor.
- **Clean-DB safety:** **safe**.

#### 0004 — `0004_views.sql`

- **Purpose:** four `security_invoker = true` views:
  - `v_member_status` — pause-aware membership status.
  - `v_inactive_members` — 30-day inactivity.
  - `v_daily_report` — daily operational numbers.
  - `v_month_revenue` — monthly revenue totals.
- **Security:** `SELECT` to `authenticated`; `REVOKE` from `anon`/`PUBLIC`; staff-only views filter
  on `app_profile_role() in ('owner','receptionist')`.
- **Dependencies:** 0001 tables, 0002 helper, `app_settings`.
- **Risks:** correctness relies on `security_invoker` + underlying RLS; PostgreSQL 15+ required
  (project targets 17).
- **Clean-DB safety:** **safe**.

#### 0005 — `0005_profile_provisioning.sql`

- **Purpose:** `provision_member_profile(display_name, phone)` — caller-only, hard-coded `member`,
  idempotent, never elevates.
- **Dependencies:** 0001, 0002, 0003 (`audit_authority`), `auth.uid()`.
- **Risks:** concurrent first calls can both attempt the insert; `on conflict do nothing` makes it
  safe, but the audit row is written even when the insert was a no-op. Low impact.
- **Clean-DB safety:** **safe**.

#### 0008 — `0008_stage5_write_paths.sql`

- **Purpose:** four additive RPCs:
  - `update_member_contact` — receptionist + AAL2.
  - `create_plan` — owner.
  - `deactivate_plan` — owner.
  - `submit_join_application` — member; binds `auth_user_id`, forces `submitted`.
- **Dependencies:** 0001–0003 (`require_role`, `assert_aal2`, `audit_authority`), `auth.uid()`.
- **Risks:** `create_plan`/`deactivate_plan` have **no AAL2** (see §7). `join_applications.auth_user_id`
  is unique, so a rejected applicant cannot submit a second application (see §6).
- **Clean-DB safety:** **safe**.

#### 0009 — `0009_receipt_issuance.sql`

- **Purpose:** `issue_receipt(payment_id)` — receptionist + AAL2; verified payments only; one-way
  `receipt_issued false → true`; no financial column changes; no receipt path claimed.
- **Dependencies:** 0001 `payments`, 0003 helpers.
- **Risks:** none structural; superseded by 0010's hardened body.
- **Clean-DB safety:** **safe**.

#### 0010 — `0010_receipt_storage.sql`

- **Purpose:**
  - Creates private bucket `receipts` (`public=false`, PDF-only, 5 MiB).
  - Adds three `storage.objects` policies: member SELECT own folder; staff SELECT all;
    receptionist INSERT only. No UPDATE/DELETE policy.
  - Adds `attach_receipt_path(payment_id, path)` — receptionist + AAL2; verified payment only;
    server-recomputed `{member_id}/{payment_id}.pdf`; one-way/idempotent.
  - Replaces `issue_receipt` to refuse reversal rows and fully reversed payments.
- **Dependencies:** 0001, 0002 (`app_profile_role`), 0003 helpers, 0009 (`issue_receipt`), Supabase
  Storage schema (`storage.buckets`, `storage.objects`, `storage.foldername`).
- **Risks:** see §6 (storage ownership, path-shape policy gap, immutability/operational deletion).
- **Clean-DB safety:** **conditionally safe**; requires the storage schema and sufficient
  privileges. Suite never executed.

#### 0011 — `0011_staff_administration.sql`

- **Purpose:**
  - Adds `profiles.is_active` (default true) + `profiles_active_role_idx`.
  - Replaces `app_profile_role()` and `require_role()` to honour `is_active`.
  - Adds `admin_staff_assert()` (owner + AAL2 internal guard),
    `admin_staff_directory()` (owner + AAL2, reads `auth.users` email/last sign-in),
    `admin_register_staff()` (owner + AAL2, hard-coded `receptionist`),
    `admin_set_staff_active()` (owner + AAL2, refuses self/owner/member),
    `admin_record_staff_sessions_blocked()` (owner + AAL2 audit acknowledgement).
- **Dependencies:** 0001–0003; `auth.users`; `auth.uid()`.
- **Risks:** definer must be able to read `auth.users`; the Edge Function must perform the GoTrue
  ban; an already-issued token is denied by `is_active` on the next DB read but is not instantly
  revoked at the auth layer.
- **Clean-DB safety:** **conditionally safe**; suite never executed.

#### 0012 — `0012_privacy_consent.sql`

- **Purpose:**
  - `consent_records` — append-only evidence; caller-bound to `auth.uid()`; no IP/fingerprint/secret.
  - `privacy_requests` — member-initiated queue; owner-reviewed; no automatic erasure.
  - `record_consent`, `request_privacy_action`, `resolve_privacy_request`.
- **Objects:** 2 tables; 4 indexes; RLS enable + force; 4 policies (own + owner for each table);
  2 `trg_client_guard` (including INSERT) + 1 `trg_updated_at`.
- **Dependencies:** 0001–0003 (`require_role`, `assert_aal2`, `audit_authority`,
  `assert_no_client_mutation`); `auth.users`; `auth.uid()`.
- **Risks:** cascade deletion of consent evidence; `RESTRICT` audit FK blocks auth-user deletion;
  suite never executed; no rate limit on requests.
- **Clean-DB safety:** **conditionally safe**, but unproven.

### 4.3 Object totals created by the sequence

| Object type | Count | Notes |
|---|---|---|
| Public tables (new) | **15** | 13 in 0001 + `consent_records`, `privacy_requests` in 0012 |
| Existing public tables altered | **2** | `members` (+`auth_user_id`), `profiles` (+`is_active`) |
| Views | **4** | All `security_invoker` |
| Distinct functions/routines | **38** | Includes trigger functions; 3 replaced later (`issue_receipt`, `app_profile_role`, `require_role`) |
| Triggers | **23** | 19 in 0002, 1 in 0003, 3 in 0012 |
| RLS policies | **30** | 23 in 0002, 3 storage in 0010, 4 in 0012 |
| Explicit secondary indexes | **26** | 20 + 1 + 1 + 4 |
| Storage buckets | **1** | `receipts` (private, PDF-only, 5 MiB) |
| Storage policies | **3** | On `storage.objects` |
| Managed/platform tables depended on | **3** | `auth.users`, `storage.buckets`, `storage.objects` — **not created or confirmable by this audit** |

**Table-count answer:** **15 new public tables**. Two existing public tables are altered. Zero
public tables are “unconfirmed” in the migration source. Three platform-managed tables are
prerequisites that cannot be confirmed without inspecting the remote project.

### 4.4 Note on `0006` / `0007`

The sequence is `0001, 0002, 0003, 0004, 0005, 0008, 0009, 0010, 0011, 0012`. Supabase CLI applies
files in filename order, so the gap is harmless. The suites `0006_concurrency_validation.sql` and
`0007_date_math_validation.sql` test behavior implemented in `0001`–`0005`; they are not migrations.
Future operators must not “fill the gap” with new migrations, because that would create
out-of-order migration versions on an already-pushed project.

---

## 5. Migration dependency map

### 5.1 Dependency graph

```text
0001  core tables ──────────────┐  (requires: auth.users, pgcrypto, btree_gist)
  │                              │
  ├─ 0002  RLS + helpers ────────┤  (requires: 0001, auth.uid)
  │    │                         │
  │    ├─ 0003  authority RPCs ──┤  (requires: 0002, auth.jwt)
  │    │    │                    │
  │    │    ├─ 0004  views ──────┤  (requires: 0001–0003, app_settings)
  │    │    ├─ 0005  profile ────┤  (requires: 0001–0003)
  │    │    ├─ 0008  write paths ┤  (requires: 0001–0003)
  │    │    ├─ 0009  receipts ───┤  (requires: 0001–0003)
  │    │    │    └─ 0010  storage ┤ (requires: 0009 + storage schema)
  │    │    ├─ 0011  staff admin ┤  (requires: 0001–0003 + auth.users)
  │    │    └─ 0012  privacy ────┘  (requires: 0001–0003 + auth.users)
```

### 5.2 Cross-migration object dependencies

| Object | Created | Consumed by | Missing? |
|---|---|---|---|
| `public.app_profile_role()` | 0002 (replaced 0011) | 0004, 0010 storage policies, all RLS policies | No |
| `public.require_role(text[])` | 0003 (replaced 0011) | 0008, 0009, 0011, 0012 | No |
| `public.assert_aal2()` | 0003 | 0008, 0009, 0010, 0011, 0012 | No |
| `public.audit_authority(...)` | 0003 | 0005, 0008, 0009, 0010, 0011, 0012 | No |
| `public.assert_no_client_mutation()` | 0002 | 0012 triggers | No |
| `public.issue_receipt(uuid)` | 0009 (replaced 0010) | 0010 replacement body | No |
| `public.payments.receipt_issued/receipt_path` | 0001 | 0009, 0010 | No |
| `public.members.auth_user_id` | 0002 | 0004 views, 0010 storage policy, 0011 checks | No |
| `public.profiles.is_active` | 0011 | replaced `app_profile_role`/`require_role` | No |
| `storage.foldername`, `storage.objects`, `storage.buckets` | Platform | 0010 | **Platform prerequisite** |
| `auth.users`, `auth.uid()`, `auth.jwt()` | Platform | 0001–0012 | **Platform prerequisite** |

### 5.3 Verification result

- `0010` depends on `0009` for the pre-existing `issue_receipt` signature/ACL, and on 0002/0003 for
  the policy helper and AAL2 gate. All are present earlier in the order.
- `0011` depends on `0001`–`0003` and on `auth.users`. Present.
- `0012` depends on `0001`–`0003` (including `assert_no_client_mutation`). Present.
- **No missing migration-level dependency was found.**

---

## 6. Migration risks

### 6.1 Per-migration risk table

| Migration | Risk | Severity | Why it matters | Mitigation before push |
|---|---|---|---|---|
| 0001 | Requires `auth` schema and Supabase roles | High if run outside Supabase | Bare PostgreSQL fails at the first `references auth.users` | Confirm this is a Supabase project, not a generic PG instance |
| 0001 | `btree_gist` must resolve for `freezes_no_overlap` | Medium | Extension may live in `extensions`, not `public` | Verify `gist_uuid_ops` resolves in the migration session |
| 0001 | 20+ indexes / exclusion constraint | Low | Slower initial creation only | None |
| 0002 | `FORCE RLS` + SECURITY DEFINER helper | **High** | If the definer role does not bypass RLS, policy evaluation can recurse/fail | Verify `rolbypassrls`/superuser for the migration/definer role |
| 0002 | `REVOKE ALL ON ALL TABLES IN SCHEMA public` | Medium | On a non-empty project it strips grants from unrelated objects | Initialize only a genuinely empty/clean project |
| 0002 | 23 permissive policies | Low | Correct role quals prevent widening; reviewed | Re-run RLS negative tests |
| 0003 | `auth.jwt()` AAL claim assumption | High for live use | Without AAL2, every gated action fails | Confirm plan supports MFA and owner enrols TOTP |
| 0003 | Broad default-privilege lockdown | Medium | Future objects created by `supabase_admin` may retain defaults if the block lacks privilege | Inspect the `WARNING (MEDIUM-01 residual)` notice during push |
| 0004 | `security_invoker` correctness | Low | Wrong semantics could expose rows | Run member/staff view tests |
| 0005 | Audit written on idempotent no-op | Low | Extra audit rows | Accept or document |
| 0008 | Owner plan RPCs lack AAL2 | Medium | Pricing changes at AAL1 | Security finding M1; do not “fix” in this audit |
| 0008 | Unique `join_applications.auth_user_id` | Medium | Rejected applicant cannot reapply | Product decision / future migration |
| 0009 | None structural | Low | — | — |
| 0010 | `storage.objects` policy creation privilege | **High** | Hosted ownership differs from local Docker | Verify `postgres` can create policies on `storage.objects` |
| 0010 | `storage.buckets` insert/update privilege | High | Bucket creation may fail | Verify `postgres` has INSERT/UPDATE on `storage.buckets` |
| 0010 | Receptionist INSERT has no path-shape check | Medium | A receptionist can upload a PDF into any member folder | Accept as trusted-staff risk or add a path constraint later |
| 0010 | No UPDATE/DELETE policy | Low (operational) | An erroneous upload cannot be removed via the API | Use service role for correction |
| 0011 | `auth.users` read by definer | High | Directory/registration fail if definer lacks SELECT | Verify `postgres` can select `auth.users` |
| 0011 | Deactivation is not instant token revocation | Medium | Existing tokens remain cryptographically valid | GoTrue ban + DB `is_active`; documented honestly |
| 0012 | Never executed | **High** | Syntax/privilege errors unknown | Run suite on a fresh local reset |
| 0012 | Cascade vs. restrict deletion conflict | High (privacy/legal) | Erasure cannot complete while audit/payment rows reference the profile | Design an anonymization/retention path; do not promise automatic erasure |
| 0012 | Consent evidence cascades on auth deletion | High (legal evidence) | Evidence disappears with the account | Decide retention policy before launch |
| All | Non-idempotent DDL | Medium | Re-running a partially applied file fails on duplicate objects | Treat partial application as a repair event; never blind re-run |
| All | Forward-only, no down migrations | Medium | Rollback is restore/reset, not `migrate down` | Take an export before the first push |

### 6.2 Cross-cutting execution risks

1. **Partial application.** Every file uses `CREATE` (not `IF NOT EXISTS`) for tables, policies,
   triggers, and most functions. A failure halfway through a file leaves the transaction aborted if
   the file is executed atomically, but a manually applied partial file requires surgical cleanup.
2. **Transaction boundaries.** `0001`, `0002`, `0005`, `0009`, `0010`, `0012` explicitly wrap in
   `BEGIN/COMMIT`; `0003`, `0008`, `0011` only have a trailing `COMMIT`. The CLI's per-file execution
   makes this safe in practice, but manual `psql` execution must use `ON_ERROR_STOP=1` and a single
   transaction per file.
3. **Role-dependent behavior.** Local Docker's `postgres` is a superuser. Hosted `postgres` may not
   be. The entire RLS helper design assumes the definer bypasses RLS. This is the single most
   important hosted-vs-local difference.
4. **Extension schema.** `btree_gist` is commonly installed in `extensions` on hosted projects. The
   migration does not set `search_path` to include it; it relies on the session default.
5. **Seed is not part of `db push`.** `seed.sql` runs on local `db reset`; a remote push applies
   migrations only. `app_settings` and plans must be seeded deliberately.
6. **No rollback scripts.** Recovery from a bad remote push means restoring the project or manually
   dropping the created objects and repairing `supabase_migrations.schema_migrations`.

### 6.3 Destructive operations

None of the ten migrations contains `DROP TABLE`, `TRUNCATE`, or `DELETE`. The only destructive-looking
statements are grant revocations (`REVOKE ALL ...`) and `CREATE OR REPLACE FUNCTION`, both scoped to
the objects the sequence owns. This is safe **only** on a clean project.

---

## 7. Security audit

### 7.1 Expected role model

| Role | Intended access |
|---|---|
| Member | Own profile, own membership, own payments/periods/attendance/freezes/applications, own consent/privacy requests; self check-in; no staff data |
| Receptionist | All member/payment/attendance/freeze/application read; record payments; follow-ups; freezes; receipts; staff AAL2 actions; no owner audit/settings/staff admin |
| Owner | All staff reads + audit log; plans/pricing/settings; staff administration; privacy resolution; no payment recording or freeze decision (by design) |

### 7.2 RLS and policy verification

| Requirement | Result | Evidence / gap |
|---|---|---|
| RLS enabled on all public tables | **Pass** | 13 tables in 0002, 2 in 0012 |
| RLS forced (owner included) | **Pass** | `FORCE ROW LEVEL SECURITY` on all 15 |
| Member row isolation | **Pass (static)** | Policies key on `auth_user_id = auth.uid()` or member subquery |
| Receptionist cannot read owner-only audit | **Pass** | `audit_select_owner` only |
| Receptionist cannot write plans/settings/profiles | **Pass** | No UPDATE/DELETE grants or policies; RPC role gates |
| Owner cannot record payments | **Pass, by design** | `payments_insert_receptionist` requires receptionist |
| Owner cannot decide freezes | **Pass, by design** | `decide_freeze` requires receptionist |
| Direct client UPDATE/DELETE denied | **Pass** | No UPDATE/DELETE policies; `trg_client_guard` backstop |
| `qr_tokens` hidden from clients | **Pass** | No policies; no table grant |
| Anonymous access | **Pass** | `anon` has no table grants; RPC EXECUTE revoked |
| Service role boundary | **Pass** | Narrow grants; service key never in app |
| Views do not bypass RLS | **Pass (static)** | `security_invoker = true` |
| Storage receipt isolation | **Partial** | Member SELECT is folder-scoped; receptionist INSERT is not path-shape-scoped |
| Consent cannot be forged for another user | **Pass** | No target-user parameter; always `auth.uid()` |
| Privacy requests owner-only resolution | **Pass** | `require_role(['owner'])` + AAL2 |
| Staff deactivation revokes DB authority | **Pass** | `is_active` → `app_profile_role()` NULL → all policies/RPCs deny |

### 7.3 AAL2 coverage matrix

| Routine | Role gate | AAL2 | Assessment |
|---|---|---|---|
| `verify_payment` | receptionist | **Yes** | Correct |
| `reject_payment` | receptionist | **No** | **Medium gap** — financial state change at AAL1 |
| `create_reversal` | receptionist | **Yes** | Correct |
| `request_freeze` | receptionist | No | Low (request only) |
| `decide_freeze` | receptionist | **Yes** | Correct |
| `end_freeze` | receptionist | No | Low |
| `check_in` | member | N/A | Member action; no MFA expected |
| `mint_attendance_token` | receptionist | **Yes** | Correct |
| `set_member_discount` | receptionist | **No** | **Medium gap** — discount suggestion at AAL1 |
| `request_plan_assignment` | receptionist | No | Low |
| `update_plan_price` | owner | **No** | **Medium gap** — pricing at AAL1 |
| `decide_application` | receptionist | **No** | **Medium gap** — admits members at AAL1 |
| `update_gym_settings` | owner | **No** | **Medium gap** — UPI/timezone/token validity at AAL1 |
| `update_member_contact` | receptionist | **Yes** | Correct |
| `create_plan` | owner | **No** | **Medium gap** — pricing at AAL1 |
| `deactivate_plan` | owner | **No** | **Medium gap** — pricing at AAL1 |
| `issue_receipt` | receptionist | **Yes** | Correct |
| `attach_receipt_path` | receptionist | **Yes** | Correct |
| `admin_staff_assert` / directory / register / set-active / sessions-blocked | owner | **Yes** (via guard) | Correct |
| `record_consent` | any authenticated (own) | No | Correct (own data) |
| `request_privacy_action` | any active role (own) | No | Correct (own request) |
| `resolve_privacy_request` | owner | **Yes** | Correct |
| `provision_member_profile` | own | No | Correct (own profile) |
| `submit_join_application` | member | No | Correct (own application) |

**Finding M1 (Medium):** AAL2 is applied inconsistently. `verify_payment` and `create_reversal` are
protected, but `reject_payment`, `set_member_discount`, `update_plan_price`, `create_plan`,
`deactivate_plan`, `update_gym_settings`, and `decide_application` are not. This is a policy
inconsistency, not a schema-execution blocker. Do not change it during this audit; decide the
intended MFA policy before launch.

### 7.4 Security findings

| ID | Severity | Finding | Impact | Recommended direction |
|---|---|---|---|---|
| H1 | High | Hosted definer role may not bypass `FORCE RLS` | All SECURITY DEFINER helpers could fail or recurse | Verify `rolbypassrls`/superuser on the target before push |
| H2 | High | `0010`–`0012` never executed | Unproven DDL/privilege behavior | Local reset + suites before remote |
| H3 | High | MFA requires a paid plan; plan status unknown | If Free, no AAL2 → verify/receipts/admin/privacy unusable | Confirm plan; upgrade or redesign gates |
| H4 | High | Account deletion is structurally blocked | `audit_log_entries.actor` and payment/profile FKs are `RESTRICT`; deleting `auth.users` cascades to `profiles`, then fails | Design anonymization/retention; do not promise automatic erasure |
| M1 | Medium | Inconsistent AAL2 coverage | Financial/config actions at AAL1 | Define and apply a consistent policy |
| M2 | Medium | Receipt upload path not constrained | Any receptionist can upload a PDF into any member folder | Add a storage INSERT `WITH CHECK` on path shape later |
| M3 | Medium | One application per auth user | Rejected applicant cannot reapply (unique + no delete path) | Product decision / future migration |
| M4 | Medium | Seed not applied by `db push` | Missing `app_settings` breaks token minting | Run reviewed seed SQL after push |
| M5 | Medium | No first-owner bootstrap | Owner-gated RPCs cannot create the first owner | Dashboard auth user + service-role profile insert |
| M6 | Medium | Consent evidence cascades with auth user | Legal evidence destroyed on deletion | Retention/anonymization design |
| L1 | Low | Non-idempotent DDL | Partial application is hard to retry | Repair, don't blind re-run |
| L2 | Low | Broad `REVOKE ALL` in 0002 | Unsafe on a non-empty project | Initialize only an empty project |
| L3 | Low | `privacy_requests` has no open-request uniqueness/rate limit | Request spam | Add later if needed |
| L4 | Low | `payments_insert_override` reads role without `is_active` | Defense-in-depth gap; RLS compensates | Align in a later hardening migration |
| L5 | Low | Numbering gap `0006`/`0007` | Operator confusion | Keep the documented explanation |

### 7.5 Positive controls worth preserving

- `payments_insert_override` forces `entry_type`, `state`, `recorded_by`, `receipt_issued`, and
  `receipt_path` server-side; a client cannot mint a verified payment or a reversal.
- The composite reversal FK plus the deferred cap trigger makes reversal chains and over-reversal
  structurally impossible.
- Receipt issuance is one-way and refuses reversals and fully reversed payments.
- All SECURITY DEFINER functions pin `search_path`; helper EXECUTE is revoked from clients.
- Every authority action writes an append-only audit row (with the pre-profile consent exception
  explicitly documented).
- `is_active` is a durable database-level authorization switch, not a UI hint.

---

## 8. Test verification results

### A. Tests actually executed during this task

**None of the database SQL suites were executed.** The environment cannot run them:

| Check | Result |
|---|---|
| `docker ps` / `docker info` | Docker CLI present; daemon **not reachable** (`dockerDesktopLinuxEngine` pipe missing) |
| `node_modules/.bin/supabase status` | Fails at Docker inspection; reports `"linked_project":null` |
| `psql` | Not on `PATH` |
| `supabase` CLI | Local `3.1.0`; cached `3.2.0`; not on global `PATH` |
| Node / npx | Available |
| Local Supabase containers | Not running (daemon down) |

Commands used for the audit were read-only: file inspection, `Select-String`, `git status`,
`git log`, `git ls-files`, tool version checks, and `supabase status`. No migration, no reset, no
remote call, no file modification other than this report.

### B. Tests previously reported by agents (not independently verified now)

| Suite | Reported result | Source | Status |
|---|---|---|---|
| `0001`–`0009` on a fresh local reset | **732/732 assertions**, all exit 0 | `PHASE_5_FINAL_REPORT.md`, `PHASE_5_PROGRESS_REPORT.md`, `PHASE_5_RELEASE_READINESS.md` | **Agent-reported only** |
| `0009_receipt_issuance_validation.sql` | 19/19 | Phase 5 reports | Agent-reported only |
| `0006_concurrency_validation.sql` | 93/93 as `supabase_admin` | Phase 4/5 reports | Agent-reported only; needs `dblink` |
| Jest / TypeScript / ESLint | 19 suites, 243 tests; `tsc` clean; lint clean | WS-8 report | Not re-run; not DB proof |

These results are credible for the local stack used at the time, but they do **not** cover
`0010`–`0012`, and they do not prove hosted-role behavior.

### C. SQL tests written but never executed

| Suite | Status | Why |
|---|---|---|
| `0010_receipt_storage_validation.sql` | **Never executed** | Docker daemon unavailable in WS-4; explicitly recorded as unexecuted |
| `0011_staff_administration_validation.sql` | **Never executed** | Header: “could not be executed … Docker daemon was unavailable … committed unexecuted” |
| `0012_privacy_consent_validation.sql` | **Never executed** | Header: “committed unexecuted … must be run before 0012 is promoted” |

`0006` and `0007` are also test-only suites, but they were reported executed earlier despite having
no corresponding migration files.

### D. Tests that require a real Supabase environment

| Suite / capability | Requirement |
|---|---|
| `0010_receipt_storage_validation.sql` | Storage schema, `storage.foldername`, `storage.objects` policies, storage roles |
| `0011_staff_administration_validation.sql` | `auth.users` data, GoTrue-managed columns, `supabase_admin` behavior |
| `0012_privacy_consent_validation.sql` | `auth.users`, authenticated role switching, JWT GUC simulation |
| `0006_concurrency_validation.sql` | Multiple real backends (`dblink`), `supabase_admin` |
| `0007_date_math_validation.sql` | `supabase_admin` context |
| All suites | Supabase roles `anon`/`authenticated`/`service_role`, `auth.uid()`/`auth.jwt()`, `SET LOCAL ROLE` |

Plain PostgreSQL is insufficient: the suites simulate PostgREST identity with `SET LOCAL ROLE` and
`request.jwt` GUCs and rely on Supabase-managed schemas.

---

## 9. Unverified items

| Item | Why unverified | How to verify |
|---|---|---|
| Remote database is empty | Remote access prohibited | Owner reads Table Editor; or a read-only `select count(*)` on `information_schema.tables` in the dashboard |
| Remote migration history | Remote access prohibited | Dashboard / `supabase migration list --linked` after linking |
| `postgres` has `BYPASSRLS` or superuser on hosted | No remote query | `select rolbypassrls, rolsuper from pg_roles where rolname = current_user;` |
| Definer can read `auth.users` | No remote query | `select count(*) from auth.users;` as the migration role |
| Definer owns/can policy `storage.objects` | No remote query | `select relowner::regrole from pg_class where oid = 'storage.objects'::regclass;` |
| `postgres` can write `storage.buckets` | No remote query | `select has_table_privilege(current_user, 'storage.buckets', 'INSERT');` |
| `btree_gist` resolves in migration `search_path` | No remote query | `show search_path;` and `select extnamespace::regnamespace from pg_extension where extname='btree_gist';` |
| `0010`–`0012` DDL correctness | Never executed | Local reset + the three suites |
| Hosted plan supports MFA | Unknown | Dashboard plan/billing; config template says MFA is a Pro feature |
| Hosted backup/PITR | Unknown | Dashboard; WS-6 found no evidence |
| Edge Function `staff-admin` deployment | Not deployed | `supabase functions deploy staff-admin` (later, owner-approved) |
| Live auth/OTP/SMS delivery | Demo mode | Set `EXPO_PUBLIC_AUTH_MODE=live` in a non-production build and test |
| App end-to-end live flows | Demo mode | Smoke tests after initialization |

---

## 10. Database initialization prerequisites

### 10.1 Project and plan

- A dedicated Supabase project that is genuinely empty (no user tables in `public`).
- The project ref must match the URL recorded in `.env` and WS-6. `config.toml`'s
  `project_id = "GYM_Management"` is **not** the hosted ref.
- A plan that supports **MFA/TOTP** (the CLI config template states MFA is a Pro-plan capability).
  Without it, `assert_aal2()` can never pass and staff operations are unusable.
- Backups: Supabase daily backups are a paid capability; the Free plan has none. Because the target
  is empty, a pre-push schema dump is cheap and sufficient for the first run.

### 10.2 Supabase services and schemas

- PostgreSQL 17 (config targets PG 17).
- Auth (GoTrue) enabled with `auth.users`, `auth.uid()`, `auth.jwt()`.
- Storage enabled with `storage.buckets`, `storage.objects`, `storage.foldername`.
- PostgREST enabled for the `public` schema.
- Roles `anon`, `authenticated`, `service_role`, `authenticator`, `postgres`,
  `supabase_admin`, `supabase_storage_admin`, `supabase_auth_admin`.
- Extensions `pgcrypto` and `btree_gist` available/resolvable.

### 10.3 Privileges to confirm before push

The migration/definer role must be able to:

1. Create tables, functions, triggers, policies, and indexes in `public`.
2. Read `auth.users` (0011 directory/registration checks).
3. Insert/update `storage.buckets` and create policies on `storage.objects` (0010).
4. Bypass RLS (or be superuser) so SECURITY DEFINER helpers can read `FORCE RLS` tables.
5. Alter default privileges for `postgres` (and optionally `supabase_admin`).

### 10.4 Seed data

`supabase/seed.sql` is applied by local `db reset`, **not** by `db push`. After a remote push:

- `app_settings (id = 1)` is required by `mint_attendance_token()`; without it the RPC raises
  “Gym settings are not initialized.”
- The four plans (`Monthly`, `Quarterly`, `Half yearly`, `Yearly`) are required for the app's
  plan catalogue and join flow.

### 10.5 First Owner bootstrap

No migration creates an Owner. The bootstrap must be:

1. Create the Owner auth user in the Supabase Dashboard (email + password).
2. Insert the matching `profiles` row with `role = 'owner'`, `is_active = true`, using the
   service-role/admin SQL context.
3. Enrol a TOTP factor and verify it, so the session reaches `aal2`.

Without this, `admin_register_staff`, `create_plan`, `update_gym_settings`,
`resolve_privacy_request`, and all other owner/AAL2 RPCs are unreachable.

### 10.6 Edge Function and app environment

- `staff-admin` is the only Edge Function. It must be deployed for staff auth-user creation,
  activation, and session blocking. It requires the platform-injected service-role key.
- `EXPO_PUBLIC_AUTH_MODE=live` must be set in the deployment environment (not necessarily in the
  current `.env`) before the app will use Supabase Auth.
- The Expo app must never receive the service-role key; only the publishable key is allowed.

---

## 11. Safe initialization procedure

> This section is a plan for the owner. **None of it was executed in this audit.**

### Step 1 — Pre-initialization verification

1. Open the Supabase Dashboard and confirm the project ref, organisation, and region.
2. Confirm the project is the Gym Management project and is intended to be initialized.
3. Confirm `public` contains no business tables (only platform objects, if any).
4. Record the plan and backup status. On Free, export schema/data first
   (`supabase db dump` or Dashboard export). On Pro+, confirm daily backups/PITR.
5. Run the read-only privilege checks in §9. Stop if any required check fails.
6. Confirm no one else is writing to the project.

**Gate 1:** project identity, emptiness, plan/MFA, backup, and privilege checks all pass.

### Step 2 — Migration execution plan

**Exact order:**

```text
0001_core_schema.sql
0002_rls_and_triggers.sql
0003_authority_functions.sql
0004_views.sql
0005_profile_provisioning.sql
0008_stage5_write_paths.sql
0009_receipt_issuance.sql
0010_receipt_storage.sql
0011_staff_administration.sql
0012_privacy_consent.sql
```

**Recommended execution method:** link once, inspect, then push.

```bash
# from gym-management-app
npx supabase link --project-ref <confirmed-ref>
npx supabase migration list --linked          # expect an empty remote history
npx supabase db push --dry-run                # if supported by CLI 3.2
npx supabase db push                          # applies 10 migrations in order
```

**Preconditions:** Step 1 passed; CLI authenticated to the correct account; Docker is **not**
required for a remote push.

**Expected output:** 10 migration versions recorded in
`supabase_migrations.schema_migrations`; 15 tables, 4 views, 38 routines, 23 triggers, 30 policies,
and the `receipts` bucket.

**Critical failure conditions — stop immediately if:**

- Any migration raises an error. Do not retry blindly; inspect the object state.
- `0003` logs the `WARNING (MEDIUM-01 residual)` about `supabase_admin` defaults. Record it; it is
  expected on some environments, but confirm whether it matters for future objects.
- `0010` fails on `storage.buckets` or `storage.objects` privileges.
- `0011`/`0012` fail on `auth.users` access.
- The remote history is not empty before the push. A non-empty history means this is not a clean
  first initialization; stop and reconcile.

**Validation after each group:**

| Gate | After | Verify |
|---|---|---|
| G1 | 0001 | 13 tables; `pgcrypto`, `btree_gist`; `freezes_no_overlap` exists |
| G2 | 0002 | RLS enabled+forced on 13; 23 policies; `members.auth_user_id` |
| G3 | 0003 | 18 routines; `payments_reversal_cap` trigger; ACLs |
| G4 | 0004 | 4 views; `security_invoker=true` |
| G5 | 0005 | `provision_member_profile` |
| G6 | 0008 | 4 write-path routines |
| G7 | 0009 | `issue_receipt` |
| G8 | 0010 | `receipts` bucket private/PDF/5 MiB; 3 storage policies; `attach_receipt_path` |
| G9 | 0011 | `profiles.is_active`; 5 admin routines |
| G10 | 0012 | 2 tables; 4 policies; 3 routines |

### Step 3 — Database verification checklist

Run in the SQL editor (read-only catalog queries) or via `psql`:

- **Tables:** 15 in `public`; list names.
- **Columns:** `members.auth_user_id`; `profiles.is_active`; `payments.receipt_issued`,
  `receipt_path`; `consent_records.*`; `privacy_requests.*`.
- **Primary keys:** one per table; `app_settings.id` check `id = 1`.
- **Foreign keys:** all listed in §4.2; pay special attention to `audit_log_entries.actor`
  (`RESTRICT`), `members.auth_user_id` (`SET NULL`), `join_applications.auth_user_id` (`CASCADE`),
  and the composite reversal FK.
- **Indexes:** 26 explicit secondary indexes; `attendance_member_token_uq`; `freezes_no_overlap`.
- **Functions:** 38 distinct routines; verify `prosecdef = true` and `proconfig` contains
  `search_path`.
- **Triggers:** 23; verify `trg_client_guard`, `trg_role_guard`, `trg_payments_insert_override`,
  `payments_reversal_cap`, and 0012's guards.
- **RLS:** `relrowsecurity` and `relforcerowsecurity` true on all 15.
- **Policies:** 30; spot-check the 23 table policies + 3 storage + 4 privacy.
- **Grants:** `anon` has no table/function privileges; `authenticated` has the intended surface;
  `service_role` is narrow.
- **Storage bucket:** `receipts` private, `file_size_limit = 5242880`,
  `allowed_mime_types = {application/pdf}`.
- **Storage policies:** exactly 3; no UPDATE/DELETE policy.

### Step 4 — Security validation

Run these as negative/positive tests against the initialized project (or a staging clone). Prefer
the committed SQL suites where possible; otherwise use the app with test accounts.

| # | Test | Expected |
|---|---|---|
| S1 | Member A reads Member B's `members` row | 0 rows / denied |
| S2 | Member A reads Member B's `payments`/receipts | 0 rows; storage object denied |
| S3 | Member calls `verify_payment` / `create_plan` | `42501` insufficient role |
| S4 | Receptionist calls `create_plan` / `update_gym_settings` / `admin_*` | `42501` |
| S5 | Deactivated receptionist calls any RPC | `42501` (inactive → NULL role) |
| S6 | Member/receptionist calls `issue_receipt` | `42501` |
| S7 | Receptionist at AAL1 calls `verify_payment` / `issue_receipt` | `42501` AAL2 required |
| S8 | Anyone directly updates `payments`/`audit_log_entries` | denied by grant + trigger |
| S9 | Member calls `record_consent` for another user | impossible (no user-id parameter) |
| S10 | Receptionist reads `consent_records`/`privacy_requests` | 0 rows |
| S11 | Owner resolves a privacy request at AAL1 | `42501` |
| S12 | Member opens another member's receipt path | storage policy denies |

### Step 5 — Post-initialization smoke tests

Run on a **staging/preview** project, never production:

1. Owner authentication (email/password).
2. Owner MFA/TOTP verification (session `aal2`).
3. Member registration / profile provisioning.
4. Member submits a join application.
5. Receptionist approves the application (member row created/linked).
6. Membership activation via a recorded payment.
7. Receptionist verifies the payment at AAL2.
8. Attendance QR token minted (receptionist, AAL2).
9. Member scans/checks in; attendance row created.
10. Full payment recorded (no partial payments).
11. Receipt issued (one-way) and PDF uploaded/attached.
12. Member retrieves only their own receipt.
13. Membership renewal creates a new period.
14. Member isolation re-tested with two members.
15. Staff deactivation denies the receptionist immediately.
16. Consent recorded and visible to the member and owner only.
17. Privacy request submitted by member and resolved by owner at AAL2.

---

## 12. Post-initialization verification checklist

Use this as the sign-off sheet.

- [ ] 15 public tables exist with the expected names.
- [ ] `members.auth_user_id` exists and is unique.
- [ ] `profiles.is_active` exists and defaults to true.
- [ ] `payments.receipt_issued` and `payments.receipt_path` exist.
- [ ] `consent_records` and `privacy_requests` exist.
- [ ] Every table has a primary key.
- [ ] All 30+ foreign keys exist with the intended `ON DELETE` behavior.
- [ ] 26 explicit secondary indexes exist.
- [ ] `attendance_member_token_uq` and `freezes_no_overlap` exist.
- [ ] 38 routines exist; all SECURITY DEFINER routines pin `search_path`.
- [ ] 23 triggers exist and are enabled.
- [ ] RLS is enabled **and forced** on all 15 tables.
- [ ] 23 table policies + 3 storage policies + 4 privacy policies exist.
- [ ] `anon` has no table or function privileges.
- [ ] `authenticated` has only the intended grants.
- [ ] `service_role` has only the intended narrow writes.
- [ ] `receipts` bucket is private, PDF-only, 5 MiB.
- [ ] Exactly 3 storage policies exist; no UPDATE/DELETE policy.
- [ ] `app_settings` has exactly one row (`id = 1`) with the intended timezone/validity.
- [ ] Four plans exist with the intended names/prices.
- [ ] One Owner profile exists with `role='owner'`, `is_active=true`.
- [ ] Owner has a verified TOTP factor.
- [ ] Remote `supabase_migrations.schema_migrations` lists exactly the 10 applied versions.
- [ ] `staff-admin` Edge Function deployed (if staff creation will be used).
- [ ] `EXPO_PUBLIC_AUTH_MODE=live` set only in the intended deployment.
- [ ] Backup/export taken and stored off-platform.
- [ ] No service-role key in the Expo bundle or repository.

---

## 13. Owner action checklist

Ordered, one-time actions:

1. [ ] Confirm the hosted project ref and that it is the intended Gym project.
2. [ ] Confirm the project is empty and safe to initialize.
3. [ ] Confirm the plan supports MFA/TOTP; upgrade if required.
4. [ ] Record/confirm backup capability; export schema before the first push.
5. [ ] Run the read-only privilege checks in §9.
6. [ ] Decide whether to accept the AAL2 gaps (M1) or schedule a hardening migration.
7. [ ] Approve the local replay of `0010`–`0012` before any remote push.
8. [ ] Link the project and verify the remote migration history is empty.
9. [ ] Push the 10 migrations in the documented order.
10. [ ] Seed `app_settings` and the four plans with a reviewed SQL script.
11. [ ] Create the Owner auth user and Owner profile.
12. [ ] Enrol Owner TOTP; verify an `aal2` session.
13. [ ] Deploy `staff-admin` and confirm its environment.
14. [ ] Run the §11 Step 4 security tests.
15. [ ] Run the §11 Step 5 smoke tests on staging.
16. [ ] Set `EXPO_PUBLIC_AUTH_MODE=live` in the deployment environment.
17. [ ] Take and store a post-initialization backup.
18. [ ] Record the final verification results in the project docs.

---

## 14. Final verdict

### **READY WITH CONDITIONS**

The migration source is **ordered, dependency-complete, and structurally sound** for a clean
Supabase project. It is **not** blocked by a known SQL defect or a missing migration. It is also
**not** unconditionally ready, because the tail has never been executed and several hosted-specific
assumptions remain unverified.

### Conditions to close before initialization

| # | Condition | Exit criterion |
|---|---|---|
| C1 | Prove `0010`–`0012` locally | `npx supabase db reset` applies all 10 migrations + seed; suites 0010, 0011, 0012 pass with recorded counts |
| C2 | Confirm hosted definer privileges | `postgres` (or the migration role) can bypass RLS / is superuser; can read `auth.users`; can manage `storage.objects`/`storage.buckets`; `btree_gist` resolves |
| C3 | Confirm MFA plan | TOTP is available; Owner can reach `aal2` |
| C4 | Prepare seed + Owner bootstrap | Reviewed SQL for `app_settings` + plans; Owner auth user + `profiles` row; TOTP enrolled |
| C5 | Prepare recovery | Pre-push export; documented repair steps for a partial push; no blind re-run |
| C6 | Resolve or accept security findings | Explicit decision on M1 (AAL2 gaps), M2 (receipt upload path), M3 (reapply), H4/M6 (erasure/retention) |

### Why not “READY FOR DATABASE INITIALIZATION”

Because three of the ten migrations have never run anywhere, the hosted role assumptions are
unconfirmed, and the first-owner/seed steps are not automated. A remote push today could succeed,
but it could also fail at `0010` or `0011` and leave a partially initialized project that is
non-trivial to repair (no down migrations).

### Why not “BLOCKED — MIGRATION ISSUES FOUND”

No migration-level defect was found: ordering is correct, dependencies exist, and the security
model is coherent. The gaps are verification and operational prerequisites, not a broken sequence.

### Single next step

**Start Docker Desktop, run `npx supabase db reset` on the local stack, then execute suites
`0010`, `0011`, and `0012` against that fresh reset and record the pass/fail counts.** Do not link
or push to the remote project until those results are recorded.

---

*End of report. No remote Supabase operation, migration application, file edit outside this report,
commit, push, or deployment was performed.*
