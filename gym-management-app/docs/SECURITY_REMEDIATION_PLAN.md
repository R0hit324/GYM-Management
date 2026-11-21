# STAGE 2 — SECURITY REMEDIATION PLANNING

**Project:** Gym Management App (`gym-management-app`)
**Date:** 2026-11-21
**Stage:** Security Remediation Planning — Stage 2
**Mode:** **PLANNING ONLY** (read-only investigation; no remediation implemented; no tests created/run; no migrations/policies/auth/hosted/deploy changes; no install/update performed).

**Source-of-truth inputs:**
- `docs/COMPREHENSIVE_SECURITY_AUDIT_REPORT.md` (Stage 1 — Full Security Audit & Penetration Test)
- `docs/STAGE_2G_SECURITY_FINDINGS_RESOLUTION_AND_INITIALIZATION_GATE_REPORT.md` (M1–M6 status)
- `docs/STAGE_2H_SECURITY_REMEDIATION_AND_INITIALIZATION_GATE_REPORT.md` (M1/M2 remediation outcomes)
- `docs/STAGE_2J_A_HOSTED_DATABASE_STATE_VERIFICATION_REPORT.md` (hosted init block)
- `docs/PHASE_3B_2_FINAL_SECURITY_AUDIT.md`, `docs/PHASE_3B_3_FINAL_SECURITY_AUDIT.md`, `docs/PHASE_5_SECURITY_REVIEW.md`, `docs/PHASE_5_INITIAL_AUDIT.md`
- Code/migrations: `supabase/migrations/*`, `supabase/tests/*`, `src/services/*`, `supabase/functions/staff-admin/*`, `supabase/config.toml`, `scripts/*`, `package.json`/lockfile (npm audit output).

---

## 1. Executive Summary

- Stage 1 (full security audit & penetration test) is **complete** with a cumulative verdict of **SECURITY PASS WITH CONDITIONS**; no new CRITICAL/HIGH vulnerability was found during the audit or this planning review.
- Confirmed-and-remediated findings: **M1** (AAL2 enforcement gaps) and **M2** (storage INSERT path-shape `WITH CHECK`) — both validated in Stage 2G and **fixed + regression-verified in Stage 2H**.
- Open / pending / blocked items under planning review: **M3** (migration reapply risk — VALID RISK), **H4** (data retention — DECISION PENDING), **M6** (privacy/consent — DECISION PENDING), hosted initialization (**BLOCKED** — migration-history reconciliation required), owner live auth (**DEFERRED**).
- Dependency posture: **0 critical, 0 high; 27 moderate**, all dev-tooling-chain findings; no production runtime dependency affected.

This stage does **not** change any of the above. It converts the Stage 1 findings into an evidence-based, ordered remediation plan.

## 2. Current Security Posture

| Area | Status |
|---|---|
| Application/backend security (RLS, AAL2, authority functions, immutability, overrides) | **PASS (with conditions)** — regression suites green |
| Stage 1 audit contribution | **NO NEW CRITICAL/HIGH**; executed attack checks **PASS**; no SQL-injection surface; no secrets exposure |
| M1 AAL2 | **FIXED AND VERIFIED** (Stage 2H) |
| M2 Storage INSERT WITH CHECK | **FIXED AND VERIFIED** (Stage 2H, migration `0013`) |
| M3 Migration reapply / partial failure | **VALID RISK** (documented) |
| H4 Data retention | **DECISION PENDING** (Owner/legal) |
| M6 Privacy / consent | **DECISION PENDING** (Owner/legal) |
| Hosted initialization | **BLOCKED** (`APPLICATION SCHEMA ABSENT IN INSPECTED PUBLIC SCHEMA — MIGRATION HISTORY RECONCILIATION REQUIRED`) |
| Owner live auth | **DEFERRED** |
| Dependency vulnerabilities | **27 moderate (dev-only chains); 0 critical/high** |

## 3. Verified Findings

### 3.1 M3 — Migration Reapply / Partial-Failure Risk (VALID RISK)

- **Finding source:** Stage 2G investigation; reported through Stage 2H (`docs/STAGE_2H_...`).
- **Migration(s) involved:** `supabase/migrations/0001`–`0013` sequence; notably `0002_rls_and_triggers.sql`, `0003_authority_functions.sql`, `0008_stage5_write_paths.sql`, `0010_receipt_storage.sql`, `0012_privacy_consent.sql`, `0013_receipt_storage_insert_path_check.sql`.
- **Evidence gathered in Stage 2 planning:**
  - Migration DDL is largely **not idempotent**: plain `create table`, `create function`, `create policy`, `create view` statements (e.g., `0002` policies at lines 269–393, `0003` functions, `0004` views, `0008` functions, `0012` tables/policies), while only selected functions use `create or replace` and `0001` extensions use `if not exists`.
  - `0013` uses `drop policy if exists … ; create policy …` (idempotent policy recreation) and is wrapped in an explicit transaction (`begin; … commit;`).
  - No down migrations are present; historical migrations preserved unchanged.
- **Reapply behaviour:** `supabase db push`/CLI migration tracking normally prevents reapplication of applied migrations; the risk is (a) accidental manual re-execution against a populated DB and (b) partial execution leaving inconsistent state (no transaction wrap on pre-0013 migrations; non-idempotent DDL).
- **Recovery:** forward-only discipline, backup/export before any apply; manual recovery would require point-in-time/restore discipline (documented as owner/infrastructure action).

### 3.2 H4 — Data Retention (DECISION PENDING)

- **Finding source:** Stage 2G/2H (H4); retention review outcome **DECISION PENDING**.
- **Data categories:** member personal data (`profiles`, `members`), attendance events, financial/payment records (`payments`, `membership_periods`, `membership_period_voids`, reversals), receipts (private storage objects + `receipt_path`/`receipt_issued`), audit logs (`audit_log_entries`), consent records (`consent_records`), privacy requests (`privacy_requests`), staff records (`profiles` role/is_active + auth users).
- **Evidence:** `0012_privacy_consent.sql` header explicitly states it creates **no retention/purge jobs** and does not delete rows; financial/audit/receipt retention intentionally retained (design/owner decisions).
- **Open questions:** retention windows per category; whether expired/inactive data may be purged; how retention interacts with financial-audit integrity and consent withdrawal.

### 3.3 M6 — Privacy and Consent (DECISION PENDING)

- **Finding source:** Stage 2G/2H (M6); assessed, decision pending.
- **Surface:** `consent_records` (append-only, `auth_user_id`-bound via `record_consent` RPC with no target-user parameter; mandatory vs marketing separated by check constraint; `accepted or consent_type='marketing'`), `privacy_requests` (member-initiated queue; Owner + AAL2 resolution; resolution records decision, not automatic erasure), RLS (`consent_records_select_own/_owner`, `privacy_requests_select_own/_owner`).
- **Enforcement posture (as designed/implemented):** server-bound consent writer; no client-side erasure/export claims; privacy requests never delete financial/receipt/audit rows.

### 3.4 Hosted Initialization / Migration History Reconciliation (BLOCKED)

- **Finding source:** Stage 2J-A; final classification **`APPLICATION SCHEMA ABSENT IN INSPECTED PUBLIC SCHEMA — MIGRATION HISTORY RECONCILIATION REQUIRED`**.
- **Evidence:** Owner-executed SQL (`to_regclass('public.profiles')` → `NULL`; public inventory → no rows); CLI `migration list --linked` showed migrations through `0013`; remote dump unavailable (Docker) so full object-level remote inspection incomplete.
- **Planning implication:** no hosted remediation action may proceed until migration history is reconciled and state re-classified.

### 3.5 Owner Live Authentication (DEFERRED)

- No remediation task; auth mode/env/passwords/auth provider/owner credentials remain Owner-controlled and unchanged.

## 4. Findings Requiring Additional Evidence

- None newly discovered during Stage 2 planning; all listed findings are carried from Stage 1 with their then-current verified status.
- **Note:** hosted runtime behaviour (rate limits, MFA server config, storage bucket state on hosted) remains **not directly observable** in this planning stage and was recorded as **NOT TESTED** in Stage 1.

## 5. Risk Ranking

| Rank | Finding(s) | Severity | Priority class | Status |
|---|---|---|---|---|
| 1 | M1 / M2 | HIGH | **P0** (now remediated & verified) | FIXED |
| 2 | H4 | Medium | **P1** | DECISION PENDING (Owner/legal) |
| 3 | M6 | Medium | **P1** | DECISION PENDING (Owner/legal) |
| 4 | M3 | Medium | **P2** | VALID RISK (documented) |
| 5 | Dependency moderate (dev) | Low–Moderate | **P3** | PLAN ONLY (no upgrade performed) |
| 6 | Hosted init | High operational | **P4** | BLOCKED (pending reconciliation + owner decisions) |

## 6. Dependency Security Analysis (Stage 1 output re-confirmed)

- **Totals:** 0 critical, 0 high, **27 moderate** (prod deps affected: **0**).
- **Affected chains (dev-only):**
  - `jest` / `@jest/core`, `@jest/*` 30.x canary line via `jest-expo`; transitive: `jest-config`, `jest-runner`, `jest-runtime`, `jest-snapshot`, `jest-circus`, `jest-cli`, `jest-resolve-dependencies`, `jest-expo`, `babel-jest`, `babel-plugin-istanbul`, `test-exclude`, `glob`, `jest-watch-typeahead`.
  - `@typescript-eslint/*` (`eslint-plugin`, `parser`, `type-utils`, `utils`, `typescript-estree`) ranges `6.16.0 – 8.72.2`.
  - `expo` via `@expo/fingerprint` (moderate) → `minimatch`.
  - `glob` → `minimatch` / `test-exclude`; `minimatch` advisory (GHSA-g3hv-75wg-m249).
- **Safe versions / fix availability:** Jest `29.7.0` (semver-major), `expo@52.0.49` (semver-major) — fixes require coordinated upgrade; not performed during planning.
- **Assessment:** dev/CI-only exposure; still subject to supply-chain/CI risk; production runtime **not** affected.

## 7. Remediation Roadmap

1. **Batch R-1 (P1, owner-gated):** Data retention + privacy/consent governance (H4, M6) — design retention categories, deletion-vs-integrity rules, consent withdrawal semantics; requires Owner/legal approvals before any implementation.
2. **Batch R-2 (P2):** Migration safety remediation (M3) — forward-only/idempotency-safe approach, transactional discipline, recovery plan.
3. **Batch R-3 (P3):** Dependency hardening — staged, compatibility-assessed upgrades of dev tooling.
4. **Batch R-4 (P4):** Hosted initialization readiness — only after R-2-aligned migration history reconciliation and owner/legal decisions.

## 8. Remediation Batch Design

### Batch R-2 — Migration Safety (recommended first implementable technical batch)
- **Findings:** M3 (VALID RISK).
- **Scope:** `supabase/migrations/0001`–`0013` behaviour on reapply/partial execution; future migrations discipline.
- **Likely files:** new forward-only migration(s) only (e.g., idempotent reconciliation where justified); no edits to historical migrations (preserved by rule).
- **Approach:** keep historical migrations immutable; ensure any new migration is transactional and idempotent-safe; document recovery/rollback (forward-only, backup-before-apply).
- **Risk:** low (local/planning; no changes applied in this stage).

### Batch R-1 — Privacy / Data Retention (owner-gated)
- **Findings:** H4, M6.
- **Scope:** retention categories and consent/privacy workflows.
- **Approach:** owner-approved retention durations; design deletion constraints (financial/audit integrity); consent withdrawal handling; privacy-request resolution semantics.
- **Blocked by:** Owner/legal decisions — must not be implemented autonomously.

## 9. Regression Test Plan (planning only — no tests created/run in this stage)

For each remediation batch, intended test coverage (existing + future):
- SQL/RPC/RLS/role tests from existing suites (`0001`–`0013` suites) must remain green.
- New tests to be added later per batch (e.g., migration-safety test, retention/privacy tests) — **not created in this planning stage**.

## 10. Attack Retest Plan (planning only — no attacks executed in this stage)

- Migration reapply safety: simulate safe reapply discipline (planned).
- Privacy/retention: unauthorized access to retained data, consent-bypass, withdrawal effects — to be re-run post-remediation via existing negative suites.

## 11. Rollback / Recovery Plans

- Forward-only migration discipline; backup/export before apply; documented manual recovery for partial states (M3).

## 12. Owner Decisions Required

| Decision ID | Question | Options | Status |
|---|---|---|---|
| D-1 | Retention durations / deletion authority (H4) | Retain-all vs time-bound purge vs legal-minimum | PENDING (Owner/legal) |
| D-2 | Financial/audit retention posture (H4) | Indefinite retain vs bounded | PENDING (Owner/legal) |
| D-3 | Privacy/consent enforcement semantics (M6) | Current design vs enhanced enforcement | PENDING (Owner/legal) |
| D-4 | Hosted initialization approval / migration reconciliation (hosted init) | Reconcile-then-apply vs reset-vs-restore | BLOCKED (Owner) |

## 13. Blockers

- Hosted initialization: migration-history reconciliation required (Stage 2J-A).
- Owner live auth: deferred.
- Owner/legal decisions: H4, M6.
- Dev-dependency upgrades: compatibility planning needed (semver-major).

## 14. Security Acceptance Criteria (for remediation stages)

- No CRITICAL/HIGH open in app/backend after accepted findings.
- Regression suites green; attack retests pass.
- Owner decisions recorded before privacy/retention changes.
- Hosted readiness gate re-evaluated after migration reconciliation.

## 15. Recommended Next Remediation Batch

- **Recommended first implementable technical batch:** **Batch R-2 — Migration Safety (M3)** — local, no owner decision required, low regression risk, and it de-risks the future hosted initialization path.
- **Owner-gated prerequisite/next:** **Batch R-1 — Privacy/Data Retention (H4, M6)** pending Owner/legal decisions.
- Dependency hardening (P3) and hosted initialization (P4) follow after the above.

---

## Step 9 — Final Response (Stage 2 Planning Completion)

1. **Stage 2 status:** **COMPLETE** (planning only; read-only investigation; `docs/SECURITY_REMEDIATION_PLAN.md` created; no remediation implemented; no tests run; no migrations/policies/auth/hosted/deploy changes; no installs/updates).
2. **Stage 1 findings revalidated:** M1/M2 re-confirmed remediated & verified; M3 re-confirmed VALID RISK; H4/M6 DECISION PENDING; hosted init BLOCKED; owner auth DEFERRED; dependency findings re-reviewed.
3. **New vulnerabilities discovered during planning:** **NONE**.
4. **Proposed remediation order:** R-1 (owner-gated privacy/retention) → R-2 (migration safety) → R-3 (dependency hardening) → R-4 (hosted init readiness).
5. **First remediation batch:** **Batch R-2 (Migration Safety)** as the first implementable technical batch; Batch R-1 requires owner approvals first.
6. **Exact files likely to change (for next stage):** new forward-only migration(s) under `supabase/migrations/`; planning docs only so far.
7. **Tests required (next stage):** existing suites re-run; migration-safety-specific tests to be added then.
8. **Risks:** partial-failure/reapply risk (M3); owner-decision dependency (H4/M6); dev-dep upgrade compatibility (P3).
9. **Owner decisions required:** D-1, D-2, D-3, hosted-init approval.
10. **Files modified during Stage 2:** `docs/SECURITY_REMEDIATION_PLAN.md` (created). No other files modified.
11. **Hosted system touched:** **NO**.
12. **Whether any fixes were implemented:** **NO.**

---

*End of Stage 2 — Security Remediation Planning report. No remediation was implemented, no test was created or run, and no hosted action was taken during this stage. STOPPED awaiting owner approval before any remediation begins.*
