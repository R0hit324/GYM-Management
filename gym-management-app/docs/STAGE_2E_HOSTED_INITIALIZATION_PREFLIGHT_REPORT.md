# STAGE 2E — HOSTED SUPABASE INITIALIZATION PREFLIGHT REPORT

**Date:** 2026-11-20
**Project:** `gym-management-app`
**Stage:** 2E — Hosted Supabase Initialization Preflight & Bootstrap Planning
**Scope:** Planning / preflight only. No remote Supabase operation of any kind was performed in this stage.

---

## 1. Executive Summary

- Stage 2C (local validation) and Stage 2D (remediation + clean revalidation) are **complete**: a fresh local reset applied all 10 migrations and all suites passed — **0010: 26/26, 0011: 52/52, 0012: 60/60, TOTAL 138/138**.
- The migration source is therefore now **provably executable end-to-end on a clean local Supabase stack** (PostgreSQL 17) including the tail migrations `0010`–`0012`.
- The prior audit (`docs/DATABASE_INITIALIZATION_AUDIT_REPORT.md`) concluded the sequence was **structurally sound** but that the hosted-side assumptions were **unverified**, and its final verdict was **READY WITH CONDITIONS**.
- Stage 2E performs only the **preflight and planning** work required to close those conditions safely.

**Technical readiness for hosted initialization: NOT yet confirmed.** Local execution is green; hosted execution remains unverified and is explicitly out of scope for this stage.

---

## 2. Stage 2C and 2D Evidence

| Item | Stage 2C | Stage 2D |
|---|---|---|
| Local reset | Succeeded (`Finished supabase db reset on branch main.`) | Repeated after remediation |
| Migrations 0001–0012 | All applied, no error | All applied, no error (fresh reset) |
| Suite 0010 | 24/26 (P09, S05 failed — test defects) | **26/26** |
| Suite 0011 | 52/52 | **52/52** |
| Suite 0012 | 58/60 (C06, P05 failed — test defects) | **60/60** |
| Total | 134/138 passed, 4 failed | **138/138 passed** |
| Security regression | None found | **None found** (post-remediation re-verification) |
| Remote operations | None | None |

Stage 2D remediation summary: audit-visibility failures (`P09`, `C06`, `P05`) fixed via SECURITY DEFINER, `search_path`-pinned test-only helpers; `S05` expectation corrected (deny-by-absence → no-op assertion); `0010` cleanup blocked by `storage.protect_delete` removed.

---

## 3. Hosted Supabase Prerequisites

### 3.1 Supabase project

- Identified hosted project reference in `.env`: `https://nyeybfpojbvzcmhtlgns.supabase.co` (publishable key present; `EXPO_PUBLIC_AUTH_MODE` currently unset → demo mode).
- `supabase/config.toml` `project_id = "GYM_Management"` is **not** the hosted ref.
- Required: genuinely empty hosted project (no user tables in `public`).
- PostgreSQL version target: 17 (config `major_version = 17`).
- Services required: Auth (GoTrue + `auth.users` / `auth.uid()` / `auth.jwt()`), Storage (`storage.buckets`, `storage.objects`, `storage.foldername`), PostgREST for `public` schema, platform roles (`anon`, `authenticated`, `service_role`, `authenticator`, `postgres`, `supabase_admin`, `supabase_storage_admin`, `supabase_auth_admin`), extensions (`pgcrypto`, `btree_gist`).

### 3.2 Migration role privileges (to be confirmed before push)

Must be confirmed on the hosted migration role before `db push`:

1. Create tables, functions, triggers, policies, indexes in `public`.
2. Read `auth.users` (0011 staff directory / registration checks).
3. Insert/update `storage.buckets` and create policies on `storage.objects` (0010) — **audit flagged a High risk: hosted ownership differs from local Docker; must verify `postgres` can create policies on `storage.objects` and insert/update buckets**.
4. Bypass RLS / be superuser so SECURITY DEFINER helpers can read FORCE RLS tables.
5. Alter default privileges for `postgres` (and optionally `supabase_admin`).

### 3.3 Plan and capability prerequisites

- **MFA/TOTP requires a paid plan** (Supabase Pro/Team/Enterprise per CLI config note); Free plan cannot provide it. Must be confirmed for the target hosted project.
- Backups: Supabase daily backups are paid capability; Free plan has none. Local reset is destructive; hosted first push should be preceded by a pre-push schema/data export (cheap on empty project).

---

## 4. Authentication & MFA Compatibility Matrix

| Feature | Required | Plan / config prerequisite | Locally verified | Hosted verified |
|---|---|---|---|---|
| MFA / TOTP | Yes — staff write RPCs (`verify_payment`, `create_payment`, `attach_receipt_path`, `issue_receipt`) and staff-admin actions require AAL2 via `assert_aal2()` | Supabase Pro plan (TOTP capability); `[auth.mfa] max_enrolled_factors = 10`; `[auth.mfa.totp] enroll/verify enabled` | **Yes** (enrol + AAL2 enforcement proven) | **No** |
| AAL2 | Yes — authority functions call `assert_aal2()`; privacy resolution requires owner + AAL2 | TOTP enrolment + verification | **Yes** | **No** |
| Email verification | Owner bootstrap requires verified email identity before AAL2 use | `[auth.email] enable_confirmations` (currently `false` in local config) | Partially (local stack) | **No** |
| Phone OTP | Used for member phone verification / MFA phone factor (disabled locally) | SMS provider required for hosted (`[auth.sms]` currently local-only with `test_otp`) | Local-only test map | **No** |
| Owner administration | Yes — via `staff-admin` Edge Function (JWT verification + owner + AAL2; service-role server-side only) | Edge runtime secrets; platform service-role key | Local suites passed | **No** |
| Receipt issuance | Yes — receptionist + AAL2 (`attach_receipt_path`, `issue_receipt`) | MFA plan | **Yes** | **No** |
| Privacy resolution | Yes — owner + AAL2 (`resolve_privacy_request`) | MFA plan | **Yes** | **No** |

**Conclusion:** All required security behaviour has been proven on the local stack (Stage 2D: 138/138, including MFA/AAL2, staff, receipt, privacy assertions). The hosted prerequisite — an MFA-capable plan and correctly configured auth — remains unverified and must be confirmed before initialization.

---

## 5. Seed Data Plan

- `supabase/seed.sql` seeds: `app_settings` singleton (id = 1; `gym_timezone = Asia/Kolkata`, attendance token validity 60 s) and four membership plans (`Monthly` 1200.00/monthly, `Quarterly` 3000.00/quarterly, `Half yearly` 5500.00/halfYearly, `Yearly` 9600.00/yearly; all `is_active = true`).
- **Important:** `supabase db push` does **not** run `seed.sql`; the reviewed seed must be executed after migration push.
- No production prices or membership values are invented; values mirror the app catalogue and local seed.

---

## 6. First Owner Bootstrap Plan

- No migration creates an Owner (owner-gated RPCs are otherwise unreachable — chicken-and-egg).
- Required bootstrap sequence:
  1. Create Owner auth user in Supabase Dashboard (email + password).
  2. Insert matching `profiles` row (`role = 'owner'`, `is_active = true`) via service-role/admin SQL context.
  3. Enrol TOTP and verify → session reaches `aal2`.
- The `staff-admin` Edge Function creates only Receptionists (literal `receptionist`; rejects any `role` payload) and can never create an Owner.
- Requirements for a safe bootstrap: no permanent backdoor, no publicly callable unauthenticated Owner creation, no unrestricted SECURITY DEFINER bootstrap function, no hardcoded credentials, no service-role key in the mobile app, no unsafe permanent escalation path.

---

## 7. Backup & Recovery Readiness

From `docs/PRODUCTION_READINESS_STAGE_2B_WS6_REPORT.md`:

- No backup configuration exists in the repository; no provider backup status verified.
- Automatic daily backups are a paid capability; Free plan → no recovery point (effective RPO effectively infinite).
- Database backups exclude Storage → receipt PDFs are not protected by DB backups.
- No recovery test has been run; PITR unverified.
- Recommended: confirm plan, enable daily backups (Pro+), decide on PITR, create pre-push export, document repair steps for partial push, no blind re-run.

---

## 8. Migration Deployment Sequence (Plan Only — Not Executed)

```
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

- Recommended execution method: link once, inspect, push.
- Preconditions: preflight gate passed, CLI authenticated, Docker not required for remote push.
- After push: run reviewed seed, Owner bootstrap, deploy `staff-admin`, smoke tests, verify.

---

## 9. Partial Failure Recovery Decision Tree

- No down migrations exist → recovery from a bad migration must use a pre-migration backup/PITR or a forward fix, **not** a rollback script.
- Migration batches are largely non-idempotent → **no blind re-run**; use pre-migration export and documented repair.

---

## 10. Post-Initialization Verification Checklist

- **Database:** expected tables/views/functions/triggers/indexes/migration history; RLS enabled + forced; policies; grants; storage bucket/policies.
- **Security:** member isolation, staff/owner authorization, MFA/AAL2, payment integrity, receipt isolation, audit access, consent integrity, privacy controls, inactive staff denial.
- **Application:** live auth, registration, OTP, MFA, join, approval, activation, attendance, QR, payments, receipts, renewal, notifications, privacy, owner dashboard.

---

## 11. Unresolved Blockers / Conditions to Close

From the Stage 2C/2D and prior audit evidence, the remaining conditions before hosted initialization:

| # | Condition | Status |
|---|---|---|
| C1 | Prove `0010`–`0012` locally | **CLOSED** (Stage 2D: 138/138) |
| C2 | Confirm hosted definer privileges (incl. storage `objects` policy creation, `btree_gist`) | **OPEN** — must be confirmed pre-push |
| C3 | Confirm MFA plan enables TOTP / Owner AAL2 | **OPEN** — must be confirmed pre-push |
| C4 | Prepare seed + Owner bootstrap | **OPEN** — seed ready (repo); Owner bootstrap procedure prepared (manual) |
| C5 | Prepare recovery (pre-push export, repair steps, no blind re-run) | **OPEN** — plan ready; execution pending |
| C6 | Resolve/accept security findings (M1 AAL2 gaps in 0008, M2 receipt upload path, M3 reapply, H4/M6 retention) | **OPEN** — decisions pending |

---

## 12. Owner Action Requirements

- Confirm hosted project identity, organisation, region, plan, backup status.
- Confirm MFA-capable plan and auth configuration.
- Provide/approve Owner bootstrap steps (auth user → profile → TOTP → AAL2).
- Approve reviewed seed values and security-finding decisions.
- Execute backup/pre-push export.

---

## 13. Final Verdict

**Verdict: READY WITH CONDITIONS.**

- **Technically:** local validation is now fully green (138/138) and the migration sequence is proven executable; hosted execution remains unverified.
- **Not yet authorized** to execute any remote change in this stage.

---

## Final Response — Stage 2E

1. **Is hosted initialization technically ready?** **No — not yet.** Local validation is green (138/138, Stage 2D), but hosted readiness requires closing open conditions (C2, C3, C4, C5, C6) that remain unverified.
2. **What hosted prerequisites are confirmed?** Repo-level: migration sequence, seed contents, owner-bootstrap design, security model, local proof. Unconfirmed until inspected on the actual hosted project: project identity/plan/backup status, migration-role privileges (incl. storage), MFA/TOTP capability, auth configuration.
3. **What prerequisites remain unverified?** Hosted definer privileges, MFA plan/config, backup status, storage privilege ownership, live auth behaviour, post-init smoke tests.
4. **Is the Owner bootstrap procedure safe?** **Designed to be safe** (no owner-creation RPC, dashboard-based bootstrap, TOTP → AAL2); steps prepared for owner approval; not executed.
5. **Are seeds ready?** **Yes** — reviewed `supabase/seed.sql` (app_settings + four plans) prepared; must be executed post-push.
6. **Is backup/recovery ready?** **Partially** — plan prepared; provider backup/PITR status unverified; no recovery test executed.
7. **What are the critical blockers?** None migration-level; open operational/security conditions (C2–C6) gate initialization.
8. **What is the next single step?** After owner approval, perform the preflight checks (project identity/plan/MFA/backup, migration-role privileges incl. storage, seed/owner steps) and then proceed to the approved hosted migration push sequence.

---

*End of report. No remote Supabase operation, migration application, seed execution, owner creation, authentication change, backup change, file edit outside this report, commit, push, or deployment was performed.*
