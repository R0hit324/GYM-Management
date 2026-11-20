# Production Readiness — Stage 2B: WS-1 Production Supabase Provisioning Report

**Stage:** Production Readiness — Stage 2B, Workstream 1 (Production Supabase provisioning).
**Type:** Planning / handoff report. **No provisioning was executed and none is permitted in
this stage.**

---

## 1. Existing configuration audit (Part 1)

### 1.1 Supabase project references
- Local project id: `GYM_Management` (`supabase/config.toml`).
- Local stack: API `127.0.0.1:54321`, DB `127.0.0.1:54322`, Studio `127.0.0.1:54323`,
  SMTP `127.0.0.1:54324; container names prefixed `supabase_db_GYM_Management`, etc.
- No hardcoded production project reference exists in app code, scripts, migrations or docs
  (only example URLs such as `https://abcdefgh.supabase.co` and the local stack resolution in
  `scripts/local-stack.mjs`).
- Local verification scripts resolve credentials from `supabase status -o env` or explicit
  env overrides (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`,
  `MAILPIT_URL`); the secret key is used only by local scripts, never by the app.

### 1.2 Migration history
- Applied sequence (local reset): `0001_core_schema.sql`, `0002_rls_and_triggers.sql`,
  `0003_authority_functions.sql`, `0004_views.sql`, `0005_profile_provisioning.sql`,
  `0008_stage5_write_paths.sql`, `0009_receipt_issuance.sql`; seed `supabase/seed.sql`.
- Suites: `0001`–`0009` validation files (`0006` via `supabase_admin`).
- Additive-only design; no destructive operations in shipped migrations.

### 1.3 RLS / authority functions
- RLS enabled on all app tables; select-own/select-staff, insert-staff, update-override.
- Authority functions: SECURITY DEFINER, pinned `search_path`, `require_role`,
  `assert_aal2`, `audit_authority`; EXECUTE to `authenticated` only (revoked from
  `public`, `anon`, `service_role`).

### 1.4 Authentication assumptions
- Local: email confirmations disabled; SMS via `test_otp` map with dummy Twilio block; TOTP
  MFA enabled; rate limits configured; magic-link template override.
- Production assumptions (from Phase 5 / Phase 1 audits): production requires real provider
  config (SMTP, SMS, push); TOTP MFA; real rate limits; real verification settings.

### 1.5 Environment variable handling
- App reads only: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  (or legacy `EXPO_PUBLIC_SUPABASE_ANON_KEY`), `EXPO_PUBLIC_AUTH_MODE`.
- Service-role key has no app slot/reader (by design).
- `.env` git-ignored; only names observed, no values printed here.

### 1.6 Local Supabase setup
- Docker-based local stack; verified healthy; reset workflow `npx supabase db reset`.

---

## 2. Production provisioning instructions (Part 2)

**Preconditions (owner):** production organisation/account and billing plan chosen; no project
yet assumed to exist.

### 2.1 Provisioning checklist
1. Create new Supabase project (`supabase new project` or dashboard: *New project*).
2. Project name: propose a dedicated production name (e.g. the gym's production project; avoid
   reusing the local `GYM_Management` id).
3. Region: choose nearest region for the gym's primary operating location.
4. Database password: strong, unique, stored in the owner-only secrets manager (not in repo).
5. MFA: enable for project administrators (dashboard → Authentication → MFA).
6. Authentication security: enable email auth + real SMTP; enable phone auth + real provider;
   enable TOTP MFA (enroll + verify); configure rate limits/abuse protection; configure
   verification requirements (email confirm, phone confirm) per business policy.
7. API: capture production URL + publishable key (`supabase keys` / dashboard → API).
8. Database backups: enable automated backups (and PITR where the plan allows).
9. Access control: restrict dashboard access; enable appropriate roles/grants for the
   `authenticated`/`service_role` (DB-level service role stays server-side only).

### 2.2 Owner dashboard steps (manual action — not performed here)
- Dashboard → *New project* → name/region → DB password → create.
- Dashboard → Authentication → Providers → Email: configure SMTP; templates as needed.
- Dashboard → Authentication → Providers → Phone: configure provider; disable local `test_otp`.
- Dashboard → Authentication → MFA: enable TOTP.
- Dashboard → Authentication → Rate limits / abuse protection: configure.
- Dashboard → Settings → API / Backups / Database: capture settings.
- Copy publishable key and project URL into the production `.env` in a later stage, with
  `EXPO_PUBLIC_AUTH_MODE=live`.

---

## 3. Database deployment preparation (Part 3)

### 3.1 Suitability of shipped migrations for a clean production DB
- All shipped migrations are additive (no destructive DDL); suitable for a clean production
  database.

### 3.2 Migration ordering / dependencies
- Order preserved: `0001` → `0002` → `0003` → `0004` → `0005` → `0008` → `0009` (no `0006`/
  `0007` migration files; suites exercise embedded logic).

### 3.3 Extensions / settings
- Postgres 17; expected extensions used locally (`pgcrypto` for token hashing, `dblink` for
  concurrency suite, `pgcrypto`/`pg_stat_statements` etc. as designed). Production must have
  the same extensions available/allowed.

### 3.4 Seed data
- `supabase/seed.sql` seeds app settings/plans for local; production seed must be reviewed
  and limited to production-acceptable data (no demo members/plans/credentials).

### 3.5 Security / authorization verification before deployment
- Re-run all validation suites against a fresh reset (`0001`–`0009`); harness the role/AAL2
  matrix; confirm `audit_authority` coverage; confirm EXECUTE grants.

### 3.6 Production migration checklist (safe procedure)
1. Provision production project (WS-1).
2. Apply migrations via approved deployment method only (later stage; not executed here).
3. Re-run full validation suites on the deployed schema (read-only verification).
4. Owner sign-off before go-live.

---

## 4. Environment separation (Part 4)

- Production: `EXPO_PUBLIC_SUPABASE_URL=<https://<ref>.supabase.co>`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<production key>`, `EXPO_PUBLIC_AUTH_MODE=live`.
- Local: `http://127.0.0.1:54321`, local publishable key, `EXPO_PUBLIC_AUTH_MODE` unset or `demo`.
- Only publishable key in app; service-role never in app; never commit `.env` or secrets.

---

## 5. Deliverables, status and remaining owner actions (Part 5)

- Report deliverable: `docs/PRODUCTION_READINESS_STAGE_2B_WS1_REPORT.md` (this file).
- Validation/rollback: validate via fresh local reset + suites before any later deployment;
  rollback = restore from backup / revert schema delta; no destructive ops in migrations.

## 6. Status

| Area | READY | NOT READY | BLOCKED |
|---|---|---|---|
| WS-1 production Supabase provisioning | ❌ | ✅ (local verified) | ✅ (not performed) |
| Production auth/email/SMS/MFA config | ❌ | ✅ (local verified) | ✅ (manual) |
| Database migration readiness | ✅ (from local reset evidence) | ✅ | ✅ (production apply not done) |

## 7. Remaining owner actions

1. Create the production Supabase project (region, DB password, MFA, providers, backups).
2. Enable production auth/email/SMS/TOTP configuration in the dashboard.
3. Decide backup/PITR plan and access controls.
4. Provide owner authorization before any future remote Supabase operation (link/push/migrate).

---

*End of Stage 2B WS-1 report. Planning/handoff only; no production access, no migrations, no configuration changes, no commit/push/deploy performed in this stage.*
