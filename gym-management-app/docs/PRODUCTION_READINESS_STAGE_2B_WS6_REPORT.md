# Production Readiness — Stage 2B: WS-6 Backup, Recovery and Disaster Preparedness — Report

**Stage:** Production Readiness — Stage 2B, Workstream 6 (backup, recovery and disaster preparedness)
**Type:** Read-only audit + recovery design + runbooks. No remote Supabase access, no backup
creation, no restore, no migration, no application-code change, no environment-file change.
**Date:** 20 November 2026
**Repository baseline:** `main` @ `317ba57` (working tree clean)
**Overall verdict:** **BLOCKED**

> **Scope note:** This report separates three different things that are easy to confuse:
> (1) what the application schema already protects, (2) what Supabase can provide, and
> (3) what is actually configured and verified for this project. Only (1) was inspected
> directly. (2) is taken from current Supabase documentation. (3) is **not configured and
> not verified** — no production project was accessed and no recovery test was executed.

---

## 1. Executive summary

Pulse GYM Management holds data that cannot be reconstructed from the app: member records,
membership periods, freezes, attendance, payments, reversals, receipt metadata, receipt PDFs and
the staff audit trail. The schema is deliberately append-only for financial history and the
client-facing API has no update/delete path for most tables. That is good protection against
casual tampering and accidental in-app edits, but it is **not** a backup. It does not protect
against a deleted project, a lost Storage bucket, a damaged database, a compromised owner account,
a failed migration, or an operator running a destructive SQL statement.

The audit found:

1. **No backup configuration exists in the repository.** There is no backup script, no scheduled
   job, no CI workflow, no restore script and no recovery runbook. `supabase/config.toml` is local
   development configuration only and contains no cloud backup settings.
2. **No evidence that provider backups are enabled for a production project.** No production
   project reference, plan or backup status is recorded anywhere in the repository. Supabase
   automatic daily backups are a Pro/Team/Enterprise capability; the Free plan has none. If the
   future production project is on Free, the effective recovery point is **no recovery point**.
3. **Database backups would not cover receipt PDFs.** Supabase database backups exclude Storage
   objects. A database restore can therefore restore `receipt_path` values that point at PDFs
   which no longer exist, or leave orphaned PDFs with no payment row.
4. **The application's destructive-operation protection is good but incomplete.** Clients cannot
   update or delete financial rows; the receipt bucket has no UPDATE/DELETE policy; foreign keys
   use `on delete restrict` for history. However, the dashboard SQL editor, `service_role`, and
   the database owner bypass these client controls. The audit log records authority-function
   actions, not every direct SQL delete.
5. **No recovery test has been run for this project** — none is described in the repository and
   none was executed in this stage. Docker is installed but its daemon is not running; `psql`, `pg_dump`
   and the Supabase CLI are not on `PATH`; and WS-6 forbids remote access. Every recovery test in
   §9 is therefore **NOT VERIFIED**.
6. **The two newest migrations (`0010`, `0011`) have not been executed locally** in the available
   environment. A production migration runbook must not treat them as proven until a clean local or
   staging replay passes.
7. **The shipped local environment points at a live Supabase project and does not select live auth.**
   `EXPO_PUBLIC_SUPABASE_URL` is set to `https://nyeybfpojbvzcmhtlgns.supabase.co`, a publishable key is
   present, and `EXPO_PUBLIC_AUTH_MODE` is not set, so the client currently resolves to the demo auth
   provider. No backup configuration exists in the repository, and the plan/backup status of the
   referenced project were **not** inspected in this stage (remote Supabase access is prohibited).

**Bottom line:** the application is reasonably resistant to *in-app* destructive actions, but the
project currently has **no demonstrated ability to recover** from loss, corruption, compromise or a
bad migration. Recovery is a production requirement, not a later optimisation. The immediate owner
actions are: confirm the Supabase plan, enable daily backups (Pro or above), decide on PITR, create
a separate break-glass account, start independent encrypted exports, mirror the `receipts` bucket
off-platform, and run the first isolated restore drill. Until those are done, this workstream is
**BLOCKED**, not READY.

### Evidence basis

| Item | What was used |
|---|---|
| Repository state | `main` @ `317ba57`, clean working tree |
| Schema and migrations | `supabase/migrations/0001`–`0005`, `0008`–`0011`; `supabase/seed.sql` |
| Local configuration | `supabase/config.toml`; `supabase/.gitignore`; root `.gitignore`; git-ignored `.env` (sets `EXPO_PUBLIC_SUPABASE_URL`, publishable key present, `EXPO_PUBLIC_AUTH_MODE` unset). The live project was not inspected in WS-6; no backup status recorded. |
| Storage design | `0010_receipt_storage.sql`; WS-4 report |
| Authority and audit paths | `0002_rls_and_triggers.sql`; `0003_authority_functions.sql`; `0008`, `0009`, `0010`, `0011` |
| Prior findings | Stage 1 audit; Stage 2A plan; WS-1 to WS-5 reports; Phase 5 final report |
| Provider capability | Supabase “Database Backups” documentation, retrieved 20 Nov 2026 |
| Not inspected | Production project, organisation, plan, backup history, Storage backup status, real data volumes |

---

## 2. Existing backup audit

### 2.1 Repository-level findings

| Check | Finding | Consequence |
|---|---|---|
| Backup configuration file | None | No declared schedule, retention or destination |
| Backup / export script | None in `scripts/` (only local-stack and readiness harnesses) | No repeatable export exists |
| Restore script | None | Restore is undocumented and untested |
| Scheduled job / cron | None | Nothing runs automatically |
| CI workflow | No `.github/` directory | No automated backup or verification |
| Recovery runbook | None before this report | Recovery depended on improvisation |
| Backup destination / bucket | None | No off-platform copy exists |
| Backup credentials | None | No separate backup identity exists |
| `supabase/config.toml` backup section | None | It is local dev config; cloud backups are not configured there |
| Seed file | `supabase/seed.sql` — baseline `app_settings` + four plans only | Not a backup; never contains member or payment data |
| Local reset procedure | `supabase db reset` | Destructive local-only convenience; not a production recovery procedure |
| Live project / auth configuration | Local git-ignored `.env` -> `https://nyeybfpojbvzcmhtlgns.supabase.co`; publishable key present; `EXPO_PUBLIC_AUTH_MODE` unset | No backup status exists in the repo; the live project was not inspected in this stage; the client cannot currently reach the configured project via live auth |

### 2.2 Provider capability versus configured capability

Supabase documents the following capabilities. **These are provider facts, not evidence about this
project.** No production project was accessed, so the “Configured / verified here” column is
deliberately conservative.

| Capability | Provider support (documented) | Configured / verified here |
|---|---|---|
| Automatic daily database backups | Pro: 7 days; Team: 14 days; Enterprise: 30 days | **Unknown / no evidence** |
| Backups on Free plan | None; provider recommends CLI `db dump` exports | **No export exists** |
| Point-in-time recovery (PITR) | Pro+ add-on; continuous WAL; recovery point up to ~2 minutes; retention 7/14/28 days; approximately $100/$200/$400 per month at the time of audit | **Unknown / not verified** |
| Database backup contents | Database only; **Storage objects are excluded** | Receipt PDFs are not protected by a DB backup |
| Restore to a new project | Recommended before overwriting current data | No drill has been performed |
| Project deletion | Deletes the project and its backups | No guard or second-owner control documented |
| Custom-role passwords in daily backups | Not retained | Any custom DB roles need separate credential recovery |
| Storage object backup | No provider-managed Storage backup could be verified; the Storage backup documentation URL returned HTTP 404 at audit time | Treat Storage as **not backed up** unless the dashboard explicitly proves otherwise |

**Interpretation:** if the production project is on the Free plan, the current RPO is effectively
“infinite” — there is no recovery point. If it is on Pro with daily backups, the RPO is up to 24
hours and the retention is 7 days. Neither state has been confirmed.

The project referenced by the local `.env` was not inspected during this stage (no remote Supabase
access is permitted), and no backup status is recorded in the repository, so the “Configured /
verified” position for backups remains unknown. The same applies to the plan.

### 2.3 Migration history and reproducibility

Nine migration files exist and are applied in filename order:

| Migration | Purpose | Recovery relevance |
|---|---|---|
| `0001_core_schema.sql` | 13 tables, constraints, indexes, append-only financial design | Baseline schema |
| `0002_rls_and_triggers.sql` | RLS, grants, immutability triggers, client-mutation denial | Prevents client-side mutation, not operator deletion |
| `0003_authority_functions.sql` | Authority RPCs for payments, reversals, freezes, attendance, settings | Recreates all business write paths |
| `0004_views.sql` | Status and reporting views | Recovery validation depends on these views |
| `0005_profile_provisioning.sql` | Self-provisioning of member profile only | Auth/profile linkage |
| `0008_stage5_write_paths.sql` | Contact update, plans, join application write paths | Recreates later write paths |
| `0009_receipt_issuance.sql` | One-way receipt flag | Receipt metadata semantics |
| `0010_receipt_storage.sql` | Private `receipts` bucket, Storage RLS, `attach_receipt_path` | Storage schema and receipt-path authority |
| `0011_staff_administration.sql` | `is_active`, owner staff functions, audit actions | Staff revocation and audit |

Notes:

- There are **no `0006` or `0007` migration files**. Those numbers exist only as test files
  (`0006_concurrency_validation.sql`, `0007_date_math_validation.sql`). This is a numbering gap,
  not a missing production migration.
- There are **no down/undo migrations**. Recovery from a bad migration must use a pre-migration
  backup/PITR or a forward fix, not a rollback script.
- `0010` and `0011` were authored but **not executed locally** in the available environment
  (Docker daemon unavailable). Their SQL has been inspected, but their runtime application is not
  proven. They must be replayed on a clean local or staging database before any production push.
- The authoritative applied-migration record in a live project is
  `supabase_migrations.schema_migrations`; repository filenames alone do not prove what was applied.

### 2.4 What the schema already protects — and what it does not

**Protections confirmed by inspection:**

- Client roles have no UPDATE/DELETE grant on financial and history tables. `0002` grants only
  narrow INSERT paths (payments, follow-up events) and SELECT; the `trg_client_guard` trigger
  rejects client UPDATE/DELETE on all 13 tables.
- Payments are append-only. A reversal is a new positive row referencing the original payment;
  reversal-to-reversal chains are blocked by a composite foreign key. There is no “reversed” state
  that mutates the original row.
- Membership periods are append-only; full reversals insert `membership_period_voids` rows rather
  than mutating periods.
- History foreign keys use `on delete restrict` (payments, periods, voids, attendance, freezes,
  follow-ups, audit actor), so a member or staff profile with history cannot be deleted without
  first deleting or re-pointing that history.
- The `receipts` bucket is private, PDF-only and 5 MiB; there is no UPDATE or DELETE policy, and
  uploads use `upsert: false`. Stored receipts are immutable through the Storage API for client
  roles.
- `receipt_issued` is one-way and only `issue_receipt` can set it; `receipt_path` is only written by
  `attach_receipt_path`, with an exact deterministic path.

**Limits that matter for recovery:**

- Dashboard SQL executed as the database owner, and `service_role` calls, bypass RLS and client
  grants. A deliberate `delete`, `truncate` or `drop` is still possible with elevated access.
- The audit log is **action-based**, emitted by authority functions and selected triggers. It is not
  a generic before/after DML audit on every table. A direct SQL delete by an operator may leave no
  audit row. Detection therefore cannot rely on the audit log alone.
- `profiles.id` references `auth.users(id) on delete cascade`. Deleting an auth user attempts to
  delete the profile; history foreign keys usually block that, but a profile with no history will
  cascade. `members.auth_user_id` is `on delete set null`, so deleting an auth user does not delete
  the member row.
- The protection is against **application-level** mistakes, not against loss of the database,
  Storage objects, credentials or the whole project.

### 2.5 Existing recovery procedures

None. The only reset procedure is `supabase db reset`, which is destructive, local-only, and must
never be pointed at production. There is no documented restore order, no validation checklist, no
named restorer, and no evidence of a prior drill.

---

## 3. Critical-data inventory

Production row counts and Storage volume are unknown; they must be recorded before sizing backup
retention. The table below classifies what must survive a disaster.

| Priority | Data | Tables / location | Why loss matters | Reconstructable? | Backup requirement |
|---|---|---|---|---|---|
| P0 | Verified payments and reversals | `payments` | Money owed/received, dispute evidence, revenue reports | No — external UPI/bank records are partial and not linked | Every backup; PITR if affordable |
| P0 | Receipt metadata | `payments.receipt_issued`, `payments.receipt_path` | Proves whether a receipt was issued and where it lives | Partly, but issuance history is lost | Every DB backup |
| P0 | Receipt PDFs | Storage bucket `receipts`, path `{member_uuid}/{payment_uuid}.pdf` | Member-facing proof of payment | Only by re-rendering, which may not be legally equivalent | Independent object copy |
| P0 | Audit trail | `audit_log_entries` | Staff accountability, incident investigation | No | Every DB backup; retain long-term |
| P0 | Members and contact data | `members` | Identity, contact, plan linkage | No | Every DB backup |
| P0 | Membership periods and voids | `membership_periods`, `membership_period_voids` | Validity, reversal history, renewal correctness | No | Every DB backup |
| P1 | Membership freezes | `membership_freezes` | Validity extension, freeze disputes | No | Every DB backup |
| P1 | Attendance | `attendance_events` | Activity, inactivity/lost-member reports, disputes | No | Every DB backup |
| P1 | Plans and prices | `plans` | Price catalogue, historical references | Mostly from repo seed, but edits are production data | Every DB backup |
| P1 | Settings | `app_settings` | Timezone, UPI ID, token validity, UPI QR path | Partly from repo defaults | Every DB backup |
| P1 | Staff profiles and roles | `profiles`, `auth.users` | Access control and audit attribution | No — must be rebuilt and re-enrolled | DB backup + auth verification |
| P2 | Join applications | `join_applications` | Prospective-member pipeline | No, but lower financial impact | DB backup |
| P2 | Follow-up events | `follow_up_events` | Lost-member follow-up history | No, but lower financial impact | DB backup |
| P3 | QR tokens | `qr_tokens` | Ephemeral attendance tokens | Yes — re-mint | Not required; expires quickly |

**Retention guidance:** financial records, receipts and audit history should be retained at least as
long as the gym's accountant and legal adviser require. For an Indian small business this is often
discussed as around eight financial years for tax records and around six years for GST records;
**confirm the exact requirement with the gym's accountant.** The backup plan below keeps monthly
archives for 12 months and a financial-year archive for eight years so that the policy can be
extended without redesign.

**Privacy:** every backup contains member names, phone numbers, emails, payment data and staff
identities. Backups are therefore production-sensitive data and must be encrypted and access
controlled exactly like the live database.

---

## 4. Proposed RPO and RTO

### 4.1 Definitions in plain language

- **RPO (Recovery Point Objective):** how much recent data the gym can afford to lose, measured in
  time. “RPO 15 minutes” means the restored system may be missing up to the last 15 minutes of work.
- **RTO (Recovery Time Objective):** how long the gym can operate without the system before the
  business impact becomes unacceptable. RTO includes detection, decision-making, restore,
  validation and cutover — not just the database restore itself.

### 4.2 Business assumptions

- Single gym, small staff, no 24/7 operations desk.
- A few hours of downtime is painful but survivable; **lost payment or receipt history is not**.
- The owner can approve an emergency restore, but should not be the only person who can perform one.
- Attendance can be reconstructed from the door log or staff memory for a short window; payments
  and receipts cannot be reconstructed reliably.
- Production volumes are assumed to be small (thousands of members, tens of thousands of payments,
  well under 100 GB of receipts). These are assumptions, not measurements.

### 4.3 Recommended targets

| Data class | Recommended RPO | Recommended RTO | Justification |
|---|---|---|---|
| Payments, reversals, receipt metadata, audit | **≤ 5 minutes** (PITR) | **4 hours** full restore; **1 hour** for a single-record correction | Financial disputes and audit evidence; daily-only backups risk losing a full day of money |
| Members, plans, periods, freezes | **≤ 15 minutes** | 4 hours | Validity and renewal disputes; moderate volume |
| Attendance | **≤ 24 hours** | 8 hours | Operational, not financial; can be reconstructed for a short window |
| Receipt PDFs | **≤ 24 hours** | 8 hours | Must match the payment ledger; object copy cadence can be daily |
| Settings and plans | **≤ 24 hours** | 4 hours | Small and easily re-entered, but must match history |
| Staff/auth | **≤ 24 hours** | 4 hours plus re-enrolment | Access must be restored safely; MFA may need re-enrolment |

### 4.4 Minimum viable versus recommended

| Tier | Configuration | Effective RPO | Realistic RTO | Relative cost |
|---|---|---|---|---|
| **Minimum viable** | Supabase Pro daily backups + independent encrypted daily dump + daily receipt-bucket mirror | Up to 24 hours | 8 hours | Pro plan + storage |
| **Recommended** | Pro + PITR 7 days + independent daily dump + daily receipt mirror + quarterly drill | ≤ 5 minutes (provider states up to ~2 minutes) | 4 hours | Pro + PITR (~$100/month at audit time) + storage |
| **Over-provisioned for one gym** | Team/Enterprise + 28-day PITR + multi-region extras | Near-zero | < 1 hour | Not justified by this business size |

**Recommendation:** start with the minimum viable tier immediately; add 7-day PITR if the owner can
accept approximately $100/month. Do not wait for PITR to start independent exports — they are the
only protection against project deletion or a compromised Supabase organisation.

### 4.5 Backup frequency and retention

| Layer | Frequency | Retention | Destination | Notes |
|---|---|---|---|---|
| Supabase daily backup | Daily (provider-managed, Pro+) | 7 days (Pro); 14 (Team); 30 (Enterprise) | Provider | Confirm in Dashboard → Database → Backups |
| PITR (if enabled) | Continuous WAL | 7 / 14 / 28 days | Provider | Add-on; confirm current price and retention |
| Independent logical dump | Daily | 30 days | Owner-controlled encrypted storage | Full schema + data; roles separately |
| Weekly archive | Weekly | 12 weeks | Same, versioned/immutable if possible | Protects against a corrupted daily chain |
| Monthly archive | Monthly | 12 months | Same, colder storage | Financial-year evidence |
| Financial-year archive | Once per year | 8 years (confirm with accountant) | Encrypted cold storage | Payments, receipts, audit |
| Receipt object mirror | Daily incremental; weekly full manifest | Match DB retention | Owner-controlled encrypted storage | Object bytes + SHA-256 manifest |
| Restore drill | Quarterly | Keep drill report for 3 years | Isolated project | A backup is not proven until restored |

### 4.6 Recommended target versus configured capability

| Question | Answer today |
|---|---|
| Is there a configured RPO? | **No.** No backup mechanism is configured in the repo, and no provider backup status is recorded. |
| Is there a configured RTO? | **No.** No restore procedure or drill exists. |
| Is PITR enabled? | **Unknown / not verified.** |
| Is there an independent export? | **No.** |
| Is there a receipt-object copy? | **No.** |
| Has any restore been measured? | **No.** |

The targets above are recommendations. They are **not** current capabilities.

---

## 5. Database backup strategy

### 5.1 Layered model

```
Layer 0  Supabase daily backups (provider)        -> protects against many platform/operator errors
Layer 1  Supabase PITR (provider add-on)          -> narrows RPO to minutes
Layer 2  Independent logical dumps (owner)        -> protects against project deletion / org compromise
Layer 3  Encrypted off-platform archives          -> protects against provider-account loss / ransomware
Layer 4  Restore drills in an isolated project    -> proves all of the above actually work
```

No single layer is sufficient. Layer 0 alone fails if the project is deleted or the organisation is
compromised. Layer 2 alone fails if it is never tested or is stored with the same credentials as
production.

### 5.2 Layer 0 — provider daily backups

- Requires Pro, Team or Enterprise. Confirm the plan and the visible backup list before go-live.
- Covers the database, not Storage objects.
- Retention is fixed by plan (7/14/30 days). It is not a long-term archive.
- The provider restore flow should be treated as **restore to a new project first**, validate, then
  cut over. Do not overwrite the only production copy as the first action.
- Record the backup timestamp and backup identifier for every incident.

### 5.3 Layer 1 — point-in-time recovery

- Enable only after confirming the plan, region, retention and current price in the dashboard.
- Provider-stated recovery point is up to about two minutes; plan for a 5-minute RPO to leave margin.
- PITR is the correct tool for “a bad migration ran 20 minutes ago” and “a staff account deleted
  rows an hour ago”. It is not a substitute for off-platform exports.
- A PITR restore is still a restore: validate in isolation where the provider allows it; otherwise
  take a fresh logical dump of the current state before restoring, so the pre-incident state is not
  lost.

### 5.4 Layer 2 — independent logical exports

Use the Supabase CLI (or `pg_dump` directly) from a secured admin machine. The database URL is a
secret: read it from a password manager or a protected environment variable, never paste it into a
shell that records history or into a ticket.

```powershell
# Placeholder only. Never commit the real URL or password.
$env:PROD_DB_URL = "postgresql://postgres.<project-ref>:<password>@<host>:5432/postgres"

# 1. Roles first (custom roles and their attributes).
npx supabase db dump --db-url $env:PROD_DB_URL --role-only -f .\backup\roles.sql

# 2. Schema next.
npx supabase db dump --db-url $env:PROD_DB_URL -f .\backup\schema.sql

# 3. Data last.
npx supabase db dump --db-url $env:PROD_DB_URL --data-only --use-copy -f .\backup\data.sql

# 4. Checksums and a manifest.
Get-FileHash .\backup\roles.sql, .\backup\schema.sql, .\backup\data.sql -Algorithm SHA256 |
  Out-File .\backup\SHA256SUMS.txt
```

Notes:

- `supabase db dump` and `pg_dump` versions must be compatible with the production Postgres version.
- Logical dumps primarily cover the application schema. **Auth and Storage metadata coverage must
  be verified in a drill**; Storage object bytes are definitely not included.
- A logical dump is not a physical backup. It is slower to restore but portable across projects and
  providers, which is exactly what is needed for project-loss recovery.
- Keep the dump, the checksum file and a short manifest (project ref, UTC timestamp, migration
  version, row counts) together.

### 5.5 Encryption, storage and the 3-2-1 rule

- Encrypt every export before it leaves the admin machine. Use `age`, GPG, or an archive tool with
  AES-256. Example (tool must be installed):
  ```powershell
  age -r <backup-public-key> -o .\backup\data.sql.age .\backup\data.sql
  ```
- Store the private key/passphrase **separately** from the backup storage, in a password manager or
  hardware token. A backup encrypted with a key stored beside it is not protected.
- Follow 3-2-1: at least three copies, on two different media or services, with one off-site.
- Use a storage location with versioning and, where available, object lock/immutability. This is the
  main defence against ransomware and against an attacker deleting the backups with the same account.
- Do not store backups in the repository, in the app bundle, or in a public bucket.
- Record who downloaded each backup and when.

### 5.6 Integrity checks

Every export should produce, and every restore should verify:

1. **File checksum** — SHA-256 recorded at creation and re-checked before restore.
2. **Dump completion** — `pg_restore`/`psql` exits zero with `ON_ERROR_STOP=1`.
3. **Table counts** — every public table, compared with the source at the backup timestamp.
4. **Referential integrity** — no orphaned payments, periods, voids, attendance, freezes or audit
   actors.
5. **Financial reconciliation** — verified payments minus verified reversals equals the expected net.
6. **Receipt reconciliation** — every non-null `receipt_path` resolves to a Storage object.
7. **View smoke test** — `v_member_status`, `v_inactive_members`, `v_daily_report`,
   `v_month_revenue` return rows and agree with the base tables.
8. **Auth/role smoke test** — owner, receptionist and member can authenticate; RLS still denies
   cross-member access; staff administration still works.

### 5.7 Restore discipline

- **Never restore directly over the only production copy as the first action.** Restore to a new
  project or an isolated local stack, validate, then plan the cutover.
- Restore order: roles → schema → data → Storage objects → auth verification → application smoke
  test.
- Take a fresh dump of the current production state before any destructive repair, even if it is
  believed corrupt. It may still contain recoverable rows.
- Use `ON_ERROR_STOP=1` and capture the full log. Do not ignore errors and continue.
- A restore is not complete until the validation checklist in §9 passes and the owner signs off.

### 5.8 Protection against accidental destructive operations

| Control | Recommendation |
|---|---|
| Separate identities | Owner's daily login must not be the backup/restore identity; use a break-glass account stored in a password manager |
| MFA | Enforce MFA on the Supabase account, email account and password manager |
| Organisation membership | Keep the member list minimal; remove departed staff immediately; review quarterly |
| Dashboard SQL | Do not run ad-hoc `delete`, `truncate`, `drop` or `update` in production; require a written change and a fresh backup first |
| Migrations | Test on a staging clone; never `supabase db reset --linked`; never `db push` an untested migration |
| App-level deletes | Already denied for clients; keep it that way — do not add a delete policy “for convenience” |
| Soft deletion | Use `members.archived_at` for members and `plans.is_active` for plans; never hard-delete history |
| Foreign keys | Keep `on delete restrict` on history; do not replace with `cascade` to make deletion “work” |
| Storage | Keep the bucket private and keep the absence of UPDATE/DELETE policies; do not add an owner delete policy |
| Project deletion | Restrict who can delete the Supabase project; require two-person approval; keep off-platform exports |
| Verification | After any maintenance, run the read-only integrity checks in §9.5 |

### 5.9 Migration safety

- Every production migration needs: a fresh pre-migration dump, a staging replay, a rollback plan
  (usually PITR or a forward fix), and a named approver.
- `0010` and `0011` are not locally proven. Replay all migrations `0001`–`0011` on a clean local or
  staging database before production.
- Record the applied version list before and after:
  ```sql
  select * from supabase_migrations.schema_migrations order by version;
  ```
- If a migration fails midway, do not manually edit `schema_migrations` to “make it match”. Repair
  the schema or restore to the pre-migration point, then reconcile the version table deliberately.
- Prefer expand/contract changes (add nullable column, backfill, switch reads, then tighten) over
  destructive in-place changes.

---

## 6. Receipt/storage backup strategy

### 6.1 Why a database backup is not enough

The `receipts` bucket is a private Storage bucket, separate from the Postgres database. Supabase
documents that database backups **do not include Storage objects**. Consequences:

- Restoring the database restores `payments.receipt_path` and `receipt_issued`, but not the PDFs.
- A member can be shown “receipt issued” while the signed URL returns 404.
- Deleting a PDF after the last database backup leaves no copy anywhere.
- Restoring an older database backup does not bring back objects deleted after that backup.

### 6.2 What to copy

| Item | Source | Why |
|---|---|---|
| Receipt PDF bytes | Storage object `receipts/{member_uuid}/{payment_uuid}.pdf` | The actual document |
| Object metadata | `storage.objects` (`bucket_id`, `name`, `metadata`, `created_at`) | Path, size, MIME, ownership |
| Manifest | Generated list of path, size, SHA-256, timestamp | Detects missing or altered files |
| Receipt linkage | `payments.id`, `member_id`, `receipt_issued`, `receipt_path` | Reconciles files to ledger rows |
| Bucket configuration | `public=false`, 5 MiB limit, PDF-only, policies | Recreates the bucket correctly |

### 6.3 How to copy

Use a secured admin machine, not the mobile app and not a staff account:

- Prefer the Supabase CLI Storage commands if the installed CLI version supports recursive copy; or
- Use the Storage API with a `service_role` key from a short, audited admin script. The key must
  never be placed in the app, the repository, a screenshot or a ticket.
- Download to an encrypted local folder, compute SHA-256 for each file, write a manifest, then
  upload the encrypted archive to the off-platform destination.
- Run a **full** copy weekly and an incremental copy daily (new objects since the last manifest).
- Keep at least one copy in immutable/versioned storage.

Example manifest shape (generated, not hand-written):

```text
path,size_bytes,sha256,copied_at_utc
<member_uuid>/<payment_uuid>.pdf,48213,<64-hex>,2026-11-20T10:15:00Z
```

### 6.4 Restore and reconciliation

1. Restore the database first (or confirm the current database is correct).
2. Restore objects to the same bucket/path in the isolated environment.
3. Verify each file against the manifest SHA-256.
4. Run the path-resolution query in §9.5. Every non-null `receipt_path` must resolve.
5. Verify that `receipt_issued = true` rows are either backed by a file or explicitly classified as
   legacy flag-only receipts (see below).
6. Only then point the application at the restored environment.

### 6.5 A note on receipt-state inconsistency

`issue_receipt` (as hardened in `0010`) does **not** require `receipt_path` to be non-null. The
normal client flow attaches the path first and then issues, but the database permits:

- `receipt_issued = true`, `receipt_path = null` — a legacy or flag-only receipt. This is not
  automatically corruption; it means no PDF was attached. Do not invent a file.
- `receipt_issued = false`, `receipt_path != null` — an upload/attach succeeded but issuance did not.
  This is a retry case, not necessarily corruption.

Recovery validation must classify these rows rather than “fixing” them blindly.

### 6.6 If a receipt PDF is lost and no copy exists

- Do **not** silently generate a new PDF with the same receipt number and present it as the original.
- Restore from the independent object copy if available.
- If no copy exists, the owner must approve a documented exception: issue a clearly marked duplicate
  or a manual receipt outside the system, record the incident and notify the member. This is an
  operational/legal decision, not a code change.
- Do not flip `receipt_issued` back to false to force re-issuance; the flag is intentionally one-way.
- If the database itself was rolled back to before issuance, reconcile the ledger and audit log
  before re-issuing.

### 6.7 Protection against unauthorised deletion

- Keep the bucket private and keep the absence of client UPDATE/DELETE policies.
- Keep `upsert: false` so an existing path cannot be overwritten.
- Restrict `service_role` to a small number of administrators; rotate it after any suspicion.
- Mirror objects off-platform; provider-side policies cannot protect against a compromised
  `service_role` or a dashboard deletion.
- Record object counts and total bytes daily; a sudden drop is an incident signal.

---

## 7. Security and access controls

### 7.1 Who can do what

| Role | Who | MFA | Can read backups? | Can restore? | Notes |
|---|---|---|---|---|---|
| Gym owner | Business owner | Required | Yes, via break-glass | Yes, with second approver | Should not use the daily app account for restores |
| Backup administrator | Trusted technical helper | Required | Yes | Yes | Separate identity; documented in the owner checklist |
| Receptionist | Front desk | Required (AAL2) | No | No | No Supabase dashboard access |
| Member | Gym member | App login | No | No | Own receipts only |
| Supabase organisation owner | Account owner | Required | Yes | Yes | Highest-risk identity; protect with hardware MFA |
| Developer/contractor | Build/maintenance | Required | Time-bound only | No by default | Remove access when the engagement ends |

### 7.2 Separate backup permissions

- Create a dedicated break-glass Supabase account for recovery. It should not be the account used
  for daily app administration or dashboard browsing.
- Store its credentials and recovery codes in a password manager, with a sealed physical copy in the
  gym safe if the owner wants an offline fallback.
- The backup storage account (cloud drive/S3-compatible) must be separate from the Supabase account.
  Compromise of one must not automatically give access to the other.
- Use a dedicated encryption key for backups, stored separately from the ciphertext.

### 7.3 Credential rotation

Rotate, in this order, after a suspected compromise or a staff departure with access:

1. Supabase account password and MFA factors.
2. Database password (this invalidates existing direct connections).
3. `service_role` key (this invalidates admin scripts; the mobile app does not use it).
4. JWT secret only if session forgery is suspected — this signs out **all** users, including staff,
   so plan a maintenance window.
5. SMTP/provider credentials and any Storage access keys.
6. Backup storage credentials and encryption passphrase (re-encrypt future backups; retain the old
   key only as long as old backups must be readable).

Record the rotation date and the person who performed it. Never place a rotated secret in the repo,
a report, a screenshot or a chat message.

### 7.4 Backup encryption and retention

- Provider backups are encrypted at rest by the provider. That does not remove the need for
  access control.
- Independent exports must be encrypted **before** leaving the admin machine.
- Retain backups only as long as the policy requires; delete expired copies securely. Do not keep
  indefinite unlabelled copies — they increase PII exposure and make “which copy is current?”
  ambiguous.
- Keep a retention register: backup ID, date, type, location, checksum, expiry, who verified it.

### 7.5 Tamper evidence

- Store checksums in a separate location from the backup files (or in a signed manifest).
- Prefer immutable/object-lock storage for weekly and monthly archives.
- A backup that can be silently modified by the same account that can delete production is not a
  trustworthy recovery source.

### 7.6 Protection from compromised production credentials

- The mobile app contains no `service_role` key and no database password. That is verified in the
  existing architecture and must remain true.
- A compromised staff account can perform only its authorised RPCs; it cannot delete financial
  history through the API.
- A compromised owner account is much worse: it can use the dashboard, service role, and staff-admin
  functions. Treat it as a critical incident (RB-5), not a password reset.
- A compromised Supabase organisation owner can delete the project and its provider backups. Only
  off-platform, separately credentialed exports protect against this.

---

## 8. Disaster recovery runbooks

### 8.0 Rules that apply to every runbook

1. **Declare the incident and start a UTC timeline.** Record detection time, decision time, restore
   start/end, validation end and return-to-service time.
2. **Preserve evidence before changing anything.** Export relevant audit rows, database logs,
   Storage object lists and screenshots. Do not delete logs or “clean up” first.
3. **Stop writes before restoring.** Ask staff to stop recording payments, freezes and check-ins.
   Put the app into a maintenance posture by disabling staff accounts if necessary.
4. **Never restore over the only production copy as the first action.** Restore to an isolated
   project/local stack, validate, then cut over with owner approval.
5. **Take a fresh dump of the current state before any destructive repair**, even if it looks
   corrupt. It may contain the only copy of the last few hours.
6. **Two-person rule for destructive actions.** The owner approves; the backup administrator
   executes. Record both names.
7. **No secrets in tickets, chat or reports.** Redact connection strings, keys and member PII.
8. **Do not guess.** If the cause is unknown, escalate to Supabase support before restoring.

---

### RB-1 — Accidental member-data deletion

**Typical causes:** dashboard table editor deletion; ad-hoc `delete from public.members`; deleting
dependent rows first and then the member; an auth-user deletion that cascades to an unreferenced
profile; a bug in a future admin surface.

**Detection**

- A member reports missing history, or staff cannot find a member who checked in recently.
- Member count, payment count or attendance count drops unexpectedly.
- Foreign-key errors or “member not found” in the app.
- Audit log shows a related authority action, but a direct SQL delete may leave **no audit row** —
  absence of an audit row is not proof that nothing happened.

**Immediate containment (0–15 minutes)**

1. Stop all staff writes: disable receptionist accounts or instruct staff to stop recording.
2. Identify the exact member ID(s), the approximate deletion time and the method (dashboard, SQL,
   auth admin). Ask who was in the dashboard.
3. Preserve the current database state with a fresh dump before any repair.
4. Do not re-create the member manually until you know which dependent rows are missing; a new UUID
   will not match historical payments, periods, attendance or receipts.
5. Revoke dashboard access for any account under suspicion.

**Recovery steps**

1. Determine whether the member row alone was deleted, or dependent rows too.
   - Foreign keys normally block deleting a member that has payments, periods, attendance, freezes
     or follow-ups. If the member had history, the deletion likely involved elevated access and
     multiple statements.
2. Restore the latest backup/PITR to an **isolated** project at a timestamp before the deletion.
3. From the isolated restore, export only the affected rows in dependency order:
   `members` → `membership_periods` / `payments` → `membership_period_voids` →
   `membership_freezes` / `attendance_events` / `follow_up_events` → `audit_log_entries` references.
4. In production, inside a single transaction, re-insert the rows with their **original UUIDs**.
   Do not let the database generate new IDs. Check each foreign key before committing.
5. If the deletion was widespread or the schema state is uncertain, do a full restore to a new
   project and cut over instead of surgical re-insertion.
6. Restore the member's receipt PDFs from the object mirror if they were also removed.
7. Write an incident note in the audit trail or operational log; do not fabricate authority actions.

**Validation**

- Member count and payment/period/attendance counts match the pre-incident snapshot.
- No orphaned rows; the member's `membership_end` and freeze-derived validity match the views.
- The member can authenticate, see their payments and receipts, and check in.
- Financial totals for the member and for the day match the pre-incident report.
- Every restored `receipt_path` resolves to a PDF.

**Return-to-service criteria**

- Owner confirms the member's records are complete.
- Integrity checks in §9.5 pass for the affected member and for global totals.
- Receptionist accounts are re-enabled with fresh sessions.
- Incident note and corrective action recorded.

**Escalation**

- Supabase support if the deletion happened through the dashboard and the audit/backup evidence is
  needed from the provider.
- Developer if the cause is an application or migration defect.
- Accountant if the loss affects tax or reconciliation records.

**Do not:** create a replacement member with a new UUID and call it recovered; that breaks every
historical link.

---

### RB-2 — Database corruption

**Typical causes:** storage-level corruption, a failed provider operation, a bad manual `update`,
index corruption after an unclean shutdown, or logical corruption from a buggy script.

**Detection**

- Persistent database errors, failed queries, or “invalid page”/checksum errors.
- The app returns inconsistent results for the same member or payment.
- `pg_dump` fails or produces a truncated file.
- Provider status incident or support notice.
- Views disagree with base-table totals.

**Immediate containment (0–15 minutes)**

1. Stop writes and put the app into maintenance posture.
2. Do not run `VACUUM FULL`, `REINDEX`, `DROP` or “repair” commands without provider guidance; they
   can worsen physical corruption.
3. Capture the exact error text, timestamp (UTC), query and affected object.
4. Take a fresh dump of the current state if the database is readable; keep it as evidence.
5. Check the Supabase status page and open a support ticket immediately for physical corruption.

**Recovery steps**

1. If the provider confirms an infrastructure incident, follow provider guidance; do not restore
   independently until they advise.
2. Distinguish logical from physical corruption:
   - **Logical** (bad data from a script): restore the affected rows/table from a backup or PITR to
     an isolated project, then reconcile.
   - **Physical** (pages/indexes/storage): use provider backup/PITR restore; a logical dump may also
     fail if corruption is widespread.
3. Restore to a new project where possible. Validate there before any production cutover.
4. If restoring in place is unavoidable, keep the pre-restore dump and require owner approval.
5. After restore, run `ANALYZE` and the read-only integrity checks; let the provider advise on
   `REINDEX`/`pg_amcheck` if available.

**Validation**

- The same failing query now succeeds.
- Table counts, financial reconciliation, receipt reconciliation and views match the last known-good
  snapshot.
- No new errors in the database logs for a defined observation window (for example, one hour).
- A sample of members can authenticate and read their history.

**Return-to-service criteria**

- Provider confirms the underlying incident is resolved (for infrastructure corruption).
- Integrity checks pass and the owner signs off.
- A root-cause note exists; if the cause was an application bug, it is fixed before re-enabling writes.

**Escalation**

- Supabase support first for any suspected physical corruption.
- Developer for logical corruption caused by application or migration code.
- Owner and accountant for financial reconciliation.

**Do not:** restore over production while the provider is still investigating; you may destroy the
evidence they need.

---

### RB-3 — Failed production migration

**Typical causes:** a migration that assumes an object exists, a lock timeout, a constraint violation
on existing data, a permissions error, or an untested migration (`0010`/`0011` are currently in this
category).

**Detection**

- `supabase db push`/migration command exits non-zero.
- The app starts returning 500s or “function does not exist” after a deploy.
- `supabase_migrations.schema_migrations` shows a version that is not fully reflected in the schema.
- Schema diff shows drift between the repository and production.

**Immediate containment (0–15 minutes)**

1. Stop further migrations and stop the deploy pipeline.
2. Put the app into maintenance posture; stop staff writes.
3. Record the exact migration version, the failing statement and the full error.
4. Take a fresh dump of the current state before attempting any repair.
5. Do not manually insert/delete rows in `schema_migrations` to “fix” the version list.

**Recovery steps**

1. Determine whether the failed migration was transactional. The repository migrations use
   `begin; ... commit;`, so a failure inside one file should roll back that file — but earlier files
   in the same push may already be applied.
2. Inspect the applied version list:
   ```sql
   select * from supabase_migrations.schema_migrations order by version;
   ```
3. If the schema is unchanged and only the version record is wrong, reconcile deliberately after
   comparing the actual schema with the repository.
4. If the schema is partially changed, choose one:
   - **Preferred:** restore the pre-migration backup/PITR to a new project, validate, then cut over.
   - **Forward fix:** write a new corrective migration, test it on a staging clone, then apply it.
     Never edit an already-applied migration file in place.
5. If data was altered by the migration, reconcile affected rows from the pre-migration snapshot.
6. Re-run the full migration replay (`0001`–`0011`) on a clean local/staging database before the next
   production attempt.
7. Update the deployment record with the failed version, the fix and the approver.

**Validation**

- `schema_migrations` matches the repository versions exactly.
- `supabase db diff` (against a staging clone) shows no unexpected drift.
- The app's read and write smoke tests pass: login, member list, payment recording, reversal,
  freeze, attendance, receipt issuance, settings, staff administration.
- RLS still denies cross-member access and non-owner staff administration.
- The SQL validation suites are run on the **staging clone**, never on production (they create
  fixtures and are destructive by design).

**Return-to-service criteria**

- Staging replay is green.
- Production schema and version table agree.
- Owner and developer sign off; a rollback/PITR point is recorded.

**Escalation**

- Developer immediately.
- Supabase support if the migration caused platform-level locking or data loss.
- Owner for go/no-go on cutover.

**Do not:** run `supabase db reset --linked`, edit an applied migration, or hand-edit
`schema_migrations` without reconciling the actual schema.

---

### RB-4 — Supabase service outage

**Typical causes:** provider incident, regional network failure, auth service degradation, Storage
outage, or a billing/plan suspension.

**Detection**

- App shows network/auth errors for all users.
- Supabase status page reports an incident.
- Dashboard is unreachable or API returns 5xx.
- Staff cannot record payments or check in.

**Immediate containment (0–15 minutes)**

1. Confirm the scope: one device, one network, one service, or the whole project.
2. Check the Supabase status page and the project dashboard.
3. Do not recreate the project, rotate keys, or restore data while the provider is investigating.
4. Switch to the manual fallback: paper/offline receipt log with member name, amount, method, UTR and
   staff initials. Record check-ins on paper. Reconcile after service returns.
5. Tell staff what to say to members and when to escalate.

**Recovery steps**

1. For a short outage, wait for provider recovery and verify service before resuming writes.
2. For a prolonged outage, decide with the owner whether to restore the latest independent dump to a
   **new** Supabase project.
3. If failing over to a new project:
   - create the project in the same or a nearby region,
   - apply migrations in order,
   - restore the latest validated dump and Storage objects,
   - recreate staff auth accounts and MFA,
   - update the app's `EXPO_PUBLIC_SUPABASE_URL` and publishable key,
   - rebuild/update the app (Expo public environment values are baked at build time, so a dashboard
     change alone is not enough),
   - run the full smoke test.
4. Keep the old project untouched until the new one is validated; it may recover.

**Validation**

- Auth, reads, writes, Storage signed URLs and Realtime (if used) all work.
- A test payment can be recorded, verified, receipted and reversed in the restored environment.
- Staff and member roles resolve correctly; MFA works.
- Paper fallback entries are reconciled into the system with a clear note.

**Return-to-service criteria**

- Provider status is green, or the new environment passes the full smoke test.
- No duplicate payments or attendance entries from the fallback reconciliation.
- Owner communicates the resumption to staff.

**Escalation**

- Supabase support and status page.
- Developer for failover and app rebuild.
- Owner for the business decision to fail over.

**Do not:** impulsively delete/recreate the project, or change DNS/env values without a tested
target and a rollback plan.

---

### RB-5 — Compromised Owner/staff account

**Typical causes:** phishing, reused password, stolen session, shared dashboard login, lost device,
or a leaked `service_role` key.

**Detection**

- Unexpected audit rows: `staff.created`, `staff.activated`, `settings.changed`, `payment.reversed`,
  `receipt.issued` at unusual times.
- A new staff account, role change, or MFA reset the owner did not request.
- Login notifications from an unknown location/device.
- Members report receipts or payment states they did not expect.
- Supabase or email provider security alert.

**Immediate containment (0–15 minutes)**

1. Disable the compromised staff account (`admin_set_staff_active` for receptionists; Supabase Auth
   ban/sign-out for any account, including owner).
2. Reset the account password and MFA; revoke all sessions.
3. If the `service_role` key or database password may be exposed, rotate it immediately.
4. If session forgery is suspected, rotate the JWT secret — this signs out everyone.
5. Preserve audit logs and auth logs; do not delete the compromised account before exporting evidence.
6. Check whether provider backups, the project, or the backup storage were accessed or deleted.
7. If the Supabase organisation itself is compromised, create a clean organisation/project and treat
   it as RB-8; do not trust the old dashboard.

**Recovery steps**

1. Determine what the attacker did: read data, create staff, change settings, reverse payments,
   delete rows, download receipts, delete backups.
2. Restore affected data from a pre-compromise PITR point to an isolated project; extract only the
   affected rows or compare full snapshots.
3. Re-apply legitimate changes made after the compromise point, with owner confirmation.
4. Recreate staff accounts with new credentials and mandatory TOTP; do not restore old MFA factors
   blindly.
5. Reconcile payments, reversals, receipts and audit entries; annotate the incident.
6. If member PII was exfiltrated, move to RB-7 (breach) immediately.

**Validation**

- Audit log shows no unauthorised actions after the containment time.
- Staff directory contains only known, active people with correct roles.
- Financial reconciliation matches the pre-compromise snapshot plus approved legitimate changes.
- Receipt paths resolve; no unexpected objects exist in the bucket.
- All sessions are fresh; old sessions are invalid.

**Return-to-service criteria**

- Owner and a second trusted person sign off.
- Credentials are rotated and recorded.
- A monitoring period (for example, 72 hours of daily audit review) completes without anomalies.

**Escalation**

- Supabase support immediately if the organisation/project/backups were accessed.
- Developer for forensic queries and credential rotation.
- Legal/counsel and insurer if PII was accessed or exfiltrated.
- Police/cybercrime reporting if required by local law or the insurer.

**Do not:** merely change the password and continue. A compromised owner account may have created
persistence (new staff, new keys, changed recovery email) that survives a password reset.

---

### RB-6 — Receipt storage loss

**Typical causes:** objects deleted via dashboard/service role, bucket misconfiguration, Storage
outage, a failed migration that altered policies, or a database restore that points at objects which
no longer exist.

**Detection**

- Members report a receipt link that returns 404/403.
- `receipt_path` rows exist but the object list is shorter than expected.
- Storage object count or total bytes drops.
- A database restore completed but receipt PDFs are missing.
- Storage service status incident.

**Immediate containment (0–15 minutes)**

1. Stop any deletion or bucket reconfiguration.
2. Export the current `storage.objects` list and the `payments.receipt_path` linkage before changing
   anything.
3. Confirm whether the cause is the database, the bucket, permissions, or the Storage service.
4. Do not add a DELETE policy, do not make the bucket public, and do not overwrite existing paths.

**Recovery steps**

1. If the database is correct but objects are missing, restore the objects from the independent
   mirror to the **same deterministic path**.
2. If the database was restored, reconcile `payments.receipt_path` with the object list; restore any
   missing objects from the mirror.
3. If the bucket/policies were damaged, recreate the bucket from `0010` (private, PDF-only, 5 MiB,
   no UPDATE/DELETE policy) and restore objects.
4. Verify each restored file's SHA-256 against the manifest.
5. If a file has no copy anywhere, follow §6.6: owner-approved documented exception, no silent
   fabricated replacement.

**Validation**

- Every non-null `receipt_path` resolves to an object in `receipts`.
- Every object path matches the deterministic `{member_uuid}/{payment_uuid}.pdf` pattern.
- Sampled PDFs open and show the correct member, amount and receipt number.
- `receipt_issued = true` rows are either backed by a file or classified as legacy flag-only rows.
- Object count and total bytes match the manifest.

**Return-to-service criteria**

- Member and staff can download receipts through signed URLs.
- No orphaned objects or paths remain unexplained.
- Owner signs off on any exception.

**Escalation**

- Supabase support for Storage service/bucket issues.
- Developer for policy or path bugs.
- Owner for member communication and duplicate-receipt exceptions.

**Do not:** make the bucket public or add a delete policy to “fix” access; that weakens the entire
receipt security model.

---

### RB-7 — Suspected data breach

**Typical causes:** stolen credentials, exposed `service_role` key, misconfigured public bucket, a
vulnerable dependency, a compromised admin device, or an insider exporting data.

**Detection**

- Unusual bulk reads/exports, unexpected API traffic, or Storage download spikes.
- A leaked key or screenshot appears outside the organisation.
- Member complaints about unsolicited contact or someone knowing their payment details.
- Supabase/security-provider alert.
- A staff member reports a suspicious request or device.

**Immediate containment (0–15 minutes)**

1. Treat it as a security incident, not a support ticket. Assign one incident lead.
2. Revoke suspected sessions, rotate database/service-role/JWT credentials, and disable suspect
   accounts.
3. Preserve logs and evidence; do not delete accounts, objects or audit rows.
4. Check whether backups or exports were accessed; if so, assume they are compromised.
5. If the breach is ongoing, consider taking the app offline to stop further exfiltration.
6. Do not communicate speculation to members before the facts and legal advice are ready.

**Recovery steps**

1. Scope the data: which tables/objects, which members, what time window, was it read or altered?
2. Rebuild credentials and access from a clean device; do not reuse the compromised device.
3. If data integrity is uncertain, restore from a pre-breach backup to a new project and compare.
4. If malicious changes exist, revert them from the clean snapshot and document each reversal.
5. Engage legal counsel to assess notification duties (for example, under India's DPDP Act 2023,
   contractual duties, or other applicable law) and any insurer/regulator obligations.
6. Prepare member communication only with legal approval; do not include unnecessary PII.
7. Record the full timeline, affected data, containment, notifications and corrective actions.

**Validation**

- No unauthorised sessions or keys remain active.
- Audit/auth logs show no attacker activity after containment.
- Data integrity checks pass against a known-good snapshot.
- Public-facing Storage/app surfaces are confirmed non-public.
- Legal/owner sign-off on notification decisions.

**Return-to-service criteria**

- Root cause identified and fixed, or compensating controls in place.
- Credentials rotated and MFA enforced.
- Legal/owner approval to resume.
- Monitoring plan for the following weeks.

**Escalation**

- Supabase support and security contact.
- Legal counsel and cyber-insurance provider.
- Data protection authority / law enforcement if advised by counsel.
- Developer for forensic analysis and remediation.

**Do not:** quietly delete logs, “clean up” affected accounts, or notify members with unverified
details; all three destroy evidence or create legal risk.

---

### RB-8 — Complete production environment recovery

**Scenario:** the Supabase project is deleted, the organisation is lost, the region is unavailable
for an extended period, or the environment must be rebuilt from scratch.

**Detection**

- Dashboard/project returns “not found” or the organisation is inaccessible.
- Provider confirms project deletion or prolonged regional loss.
- All app requests fail and the project cannot be restored in place.

**Immediate containment (0–15 minutes)**

1. Confirm the project reference and whether deletion was accidental or malicious.
2. Contact Supabase support immediately: deleting a project also deletes its provider backups, so
   support must be engaged before any replacement work.
3. Preserve every local/off-platform export, manifest, encryption key and credential record.
4. Do not create a new project with the same name and assume it inherits anything; it does not.
5. Tell staff to use the manual fallback and stop attempting writes.

**Recovery steps**

1. Create a new Supabase project in an appropriate region; record the new project reference.
2. Apply migrations `0001`–`0011` in order, using versions that have passed a clean replay. This is
   the one situation where a controlled `db push` to an empty project is appropriate; it must still
   be tested, and it is not performed by WS-6.
3. Restore roles, schema and data from the latest validated independent dump (or the latest provider
   backup if it is still available and exportable).
4. Restore the `receipts` bucket and all objects from the independent mirror; verify SHA-256.
5. Recreate staff auth users and profiles, enforce MFA, and verify roles. Expect all sessions to be
   invalid; members and staff will need to sign in again. Verify whether password hashes survived
   the restore; if not, use the password-reset flow.
6. Recreate `app_settings` (timezone, UPI ID, token validity, UPI QR path) and confirm plans/prices.
7. Update the app's environment to the new project URL/key and rebuild or publish an update. Expo
   public environment values are build-time, so a server-side change alone is insufficient.
8. Run the full validation checklist in §9.5, including a test payment, reversal, receipt, freeze and
   attendance scan.
9. Keep the old project/data (if any) read-only until the new environment is accepted.

**Validation**

- All P0/P1 row counts match the last known-good snapshot within the accepted RPO.
- Financial reconciliation is exact; no duplicate payments or reversals.
- Every receipt path resolves; sampled PDFs open.
- Audit history is present and continuous up to the backup point.
- Owner/receptionist/member authentication and RLS behave correctly.
- Staff administration and AAL2 gates work.
- The app can record and reverse a test payment and issue a test receipt.

**Return-to-service criteria**

- Owner signs the recovery acceptance record.
- Staff are re-onboarded with new credentials/MFA.
- Members are informed of any receipt or password actions they must take.
- A post-recovery drill confirms the new backup chain is running.

**Escalation**

- Supabase support (project deletion/region incident).
- Developer (rebuild, migrations, app release).
- Owner (business continuity, member communication).
- Accountant/legal (financial records, notification duties).

**Do not:** assume provider backups still exist after project deletion, or restore an old database
without the matching Storage objects.

---

## 9. Recovery-test procedure

### 9.1 Why no test was executed

The following facts were verified on the audit machine:

| Prerequisite | Status |
|---|---|
| Docker CLI | Present at `C:\Users\HP\AppData\Local\Programs\DockerDesktop\resources\bin\docker.exe` |
| Docker daemon | **Not running** — `npipe:////./pipe/dockerDesktopLinuxEngine` cannot be reached |
| `psql` | **Not found** on `PATH` |
| `pg_dump` | **Not found** on `PATH` |
| `supabase` CLI | **Not found** on `PATH` (available only through `npx` if dependencies resolve) |
| Isolated cloud project | Not available; remote Supabase access is prohibited in WS-6 |
| Production backup | Not permitted to create or inspect |
| Local database | Not running (requires Docker) |

Therefore **no restore, no PITR drill, no Storage restore and no migration replay were executed**.
Every test in §9.3 is marked **NOT VERIFIED**. No recovery time, data-loss window or integrity result
is reported, because none was measured.

### 9.2 Safety rules for the drill

1. Use a **separate** Supabase project or a local Docker stack. Never point the drill at production.
2. Use a **separate** database URL, service-role key and Storage bucket. Do not reuse production
   credentials.
3. Treat the dump as production PII: encrypted at rest, access-limited, deleted after the drill per
   the retention policy.
4. Do not run the project's SQL validation suites against production; they create fixtures and are
   destructive by design. Run them only on the isolated drill database.
5. Do not modify production during the drill. No `supabase link` to production, no `db push`, no
   restore, no delete.
6. Record the source backup timestamp and the drill start/end in UTC.
7. Stop and escalate if any step would require a production write.

### 9.3 Test matrix

| ID | Test | Environment | Status | Reason |
|---|---|---|---|---|
| T-01 | Logical dump and restore of members, plans, periods, freezes | Isolated local/cloud | **NOT VERIFIED** | Docker daemon down; no `psql`/`pg_dump`; no isolated project |
| T-02 | Restore attendance history | Isolated | **NOT VERIFIED** | Same |
| T-03 | Restore payments and reversals; reconcile totals | Isolated | **NOT VERIFIED** | Same |
| T-04 | Restore receipt metadata (`receipt_issued`, `receipt_path`) | Isolated | **NOT VERIFIED** | Same |
| T-05 | Restore receipt PDFs and verify SHA-256 | Isolated Storage | **NOT VERIFIED** | No object copy exists |
| T-06 | Restore audit log and verify continuity | Isolated | **NOT VERIFIED** | Same as T-01 |
| T-07 | PITR to a chosen timestamp | Isolated/cloud | **NOT VERIFIED** | PITR status unknown; remote access prohibited |
| T-08 | Replay migrations `0001`–`0011` on a clean database | Isolated | **NOT VERIFIED** | `0010`/`0011` never executed locally; no database runtime |
| T-09 | Auth/RLS smoke test after restore | Isolated | **NOT VERIFIED** | No restore performed |
| T-10 | Project-deletion tabletop (no execution) | Tabletop | **NOT VERIFIED** | Not run in this stage |

### 9.4 Drill procedure (for execution once an isolated environment exists)

**Preparation**

0. Install a PostgreSQL client (`psql`, `pg_dump`) or the Supabase CLI on the drill machine, and
   confirm its major version is compatible with the source database. The audit machine had neither
   on `PATH`, which is one reason the drill could not run here.
1. Create an isolated Supabase project (or start local Supabase with Docker) named for the drill,
   never production.
2. Record the source backup ID/timestamp and the expected migration versions.
3. Decrypt the backup into the isolated admin machine; verify its SHA-256 against the manifest.
4. Create an empty destination database and a separate Storage bucket.

**Database restore**

5. Restore roles, then schema, then data:
   ```powershell
   psql $env:DRILL_DB_URL -v ON_ERROR_STOP=1 -f .\backup\roles.sql
   psql $env:DRILL_DB_URL -v ON_ERROR_STOP=1 -f .\backup\schema.sql
   psql $env:DRILL_DB_URL -v ON_ERROR_STOP=1 -f .\backup\data.sql
   ```
6. If the dump is from a different migration version, apply the missing migrations in order and
   record every one.
7. Restore Storage objects to the same paths; verify each SHA-256.
8. Recreate the bucket configuration (private, PDF-only, 5 MiB, policies from `0010`).

**Validation**

9. Run the checks in §9.5. Save every query and result to the drill report.
10. Run the SQL validation suites on the isolated database (not production).
11. Run a manual app smoke test against the isolated project: owner login, receptionist payment,
    reversal, receipt, member receipt download, freeze approval, attendance scan, settings update,
    staff deactivation. Use test data only.

**Measurement**

12. Record restore start/end, validation start/end, total recovery time and the backup timestamp.
13. Record every failed step, workaround and corrective action.
14. Delete the drill environment and the decrypted dump after the report is signed, unless retention
    policy requires keeping the evidence.

### 9.5 Validation checks

Run these on the restored database (read-only unless stated). Compare against the source snapshot.

**Row counts**

```sql
select 'profiles' as table_name, count(*) from public.profiles
union all select 'plans', count(*) from public.plans
union all select 'members', count(*) from public.members
union all select 'payments', count(*) from public.payments
union all select 'membership_periods', count(*) from public.membership_periods
union all select 'membership_period_voids', count(*) from public.membership_period_voids
union all select 'attendance_events', count(*) from public.attendance_events
union all select 'membership_freezes', count(*) from public.membership_freezes
union all select 'join_applications', count(*) from public.join_applications
union all select 'follow_up_events', count(*) from public.follow_up_events
union all select 'audit_log_entries', count(*) from public.audit_log_entries
union all select 'app_settings', count(*) from public.app_settings
order by table_name;
```

**Financial reconciliation**

```sql
select
  coalesce(sum(payable) filter (where entry_type = 'payment'  and state = 'verified'), 0) as verified_payments,
  coalesce(sum(payable) filter (where entry_type = 'reversal' and state = 'verified'), 0) as verified_reversals,
  coalesce(sum(payable) filter (where entry_type = 'payment'  and state = 'verified'), 0)
    - coalesce(sum(payable) filter (where entry_type = 'reversal' and state = 'verified'), 0) as net_received
from public.payments;
```

**Orphan checks** (each should return zero)

```sql
select count(*) from public.payments p
  left join public.members m on m.id = p.member_id
  where m.id is null;

select count(*) from public.membership_periods mp
  left join public.payments p on p.id = mp.created_by_payment
  where p.id is null;

select count(*) from public.membership_period_voids v
  left join public.membership_periods p on p.id = v.period_id
  where p.id is null;

select count(*) from public.attendance_events a
  left join public.members m on m.id = a.member_id
  where m.id is null;

select count(*) from public.membership_freezes f
  left join public.members m on m.id = f.member_id
  where m.id is null;
```

**Receipt consistency**

```sql
select
  count(*) filter (where receipt_issued and receipt_path is null) as flag_only,
  count(*) filter (where not receipt_issued and receipt_path is not null) as path_without_flag,
  count(*) filter (where receipt_issued) as issued,
  count(*) filter (where receipt_path is not null) as paths
from public.payments;

select p.id, p.receipt_path
from public.payments p
left join storage.objects o
  on o.bucket_id = 'receipts' and o.name = p.receipt_path
where p.receipt_path is not null and o.id is null;
```

`flag_only` may be non-zero for legacy receipts and is not automatically corruption.
`path_without_flag` should normally be zero; investigate any row. The second query must return no
rows.

**Audit continuity**

```sql
select count(*), min(at), max(at) from public.audit_log_entries;
select action, count(*) from public.audit_log_entries group by action order by count(*) desc;
```

Compare the counts and time range with the source. Confirm there is no unexplained gap around the
incident/backup boundary.

**Membership validity**

- Compare `select * from public.v_member_status` between source and restore, ordered deterministically.
  For a small gym, export both to CSV, sort, and compare hashes.
- Compare freeze counts by state and the sum of `extension_days`.
- Confirm a sample of memberships ends on the same date before and after restore.

**Views**

```sql
select count(*) from public.v_member_status;
select count(*) from public.v_inactive_members;
select count(*) from public.v_daily_report;
select count(*) from public.v_month_revenue;
```

**Auth and RLS**

- Owner, receptionist and member can authenticate.
- A member cannot read another member's payments, receipts or attendance.
- A receptionist cannot read the audit log or administer staff.
- Owner staff administration works only with AAL2.
- A deactivated staff account is denied.

**Storage**

- Bucket is private.
- Only PDFs are present, each within 5 MiB.
- Every path is `{member_uuid}/{payment_uuid}.pdf`.
- Sampled PDFs open and match the ledger.

### 9.6 Metrics to record

| Metric | How to measure | Result |
|---|---|---|
| Backup timestamp | Provider backup ID or dump manifest | Not measured |
| Restore start | UTC timestamp before roles restore | Not measured |
| Database ready | UTC timestamp after data restore, before validation | Not measured |
| Storage ready | UTC timestamp after object verification | Not measured |
| Validation complete | UTC timestamp after §9.5 and smoke test | Not measured |
| Total recovery time | Validation complete − restore start | Not measured |
| Data-loss window | Incident time minus backup timestamp | Not measured |
| Row-count differences | §9.5 counts, source vs restore | Not measured |
| Financial difference | §9.5 reconciliation, source vs restore | Not measured |
| Receipt files missing | §9.5 path-resolution query | Not measured |
| Failed steps | Drill log | Not measured |
| Corrective actions | Drill log | Not measured |

### 9.7 Pass/fail criteria

A drill passes only if all of the following are true:

- All P0/P1 table counts match the source at the backup timestamp, except rows legitimately created
  after it (which define the measured data-loss window).
- Zero orphan rows in the checks above.
- Verified payments minus verified reversals matches the source exactly.
- Every non-null `receipt_path` resolves to an object; sampled SHA-256 values match the manifest.
- Audit log count and time range match the source; no unexplained gap.
- Owner/receptionist/member authentication and RLS checks pass.
- A test payment, reversal, receipt, freeze and attendance scan all work in the restored environment.
- Total recovery time is within the target RTO, or the gap is documented with a corrective action.

Any failure is recorded as **FAIL**, not “acceptable”, and produces a corrective action with an owner
and due date.

### 9.8 Expected corrective actions (pre-populated)

These are the likely findings once the drill is actually run; they are not results.

| Potential finding | Corrective action |
|---|---|
| `0010`/`0011` fail on a clean replay | Fix the migration on a branch, re-run all suites, then retry staging |
| Storage objects absent from the dump | Add the independent object mirror to the schedule |
| Auth users/sessions missing or invalid | Document the re-authentication procedure and test it |
| Receipt paths point to missing objects | Restore objects first, then reconcile paths |
| PITR not enabled | Owner decision and plan upgrade |
| Restore slower than RTO | Pre-stage tooling, document commands, consider a warm standby or smaller dump |
| Checksums differ | Investigate transfer/storage corruption; re-copy and re-verify |
| Custom roles/passwords missing | Record and recreate roles separately; rotate credentials |

---

## 10. Owner setup checklist

### 10.1 One-time setup (do first)

- [ ] Confirm the production Supabase project reference, region and current plan.
- [ ] If the project is on Free, upgrade to **Pro** (daily backups) or accept in writing that there
      is no provider backup and rely on independent exports only.
- [ ] Open **Dashboard → Database → Backups** and confirm the daily backup list and retention.
- [ ] Decide whether to enable **PITR**; record the chosen retention (7/14/28 days) and monthly cost.
- [ ] Create a dedicated **break-glass** Supabase account for recovery, with MFA and recovery codes
      stored in a password manager and a sealed physical copy in the safe.
- [ ] Remove unused organisation members; require MFA for everyone who remains.
- [ ] Set a billing/usage alert so a failed payment cannot silently suspend the project.
- [ ] Choose an encrypted off-platform destination with versioning/object lock (cloud drive,
      S3-compatible bucket, or encrypted external drive kept off-site).
- [ ] Store the backup encryption key/passphrase **separately** from the backups.
- [ ] Run the first independent dump using §5.4 and verify its SHA-256.
- [ ] Run the first `receipts` bucket mirror and write the manifest.
- [ ] Record the names of the **two people authorised to restore** (owner + backup administrator).
- [ ] Put a printed incident card in the safe: Supabase support URL, developer phone, accountant
      phone, break-glass location, and the rule “do not restore over production first”.
- [ ] Run the first isolated restore drill (§9) before go-live. If it cannot be run, record the
      project as **not recovery-ready**.

### 10.2 Recurring checks

| Frequency | Check | Who |
|---|---|---|
| Daily (automatic) | Dump job and Storage mirror complete; checksum written | Backup administrator |
| Weekly (10 minutes) | Backup list shows the last 7 days; no failed job; object count is stable | Owner or backup administrator |
| Weekly | Review audit log for unexpected staff, settings, reversals or receipt actions | Owner |
| Monthly | Restore a sample table (for example, members + payments) into an isolated database and compare counts | Backup administrator |
| Quarterly | Full restore drill per §9; record recovery time and failures | Owner + backup administrator |
| Quarterly | Review who has Supabase, backup-storage and encryption-key access | Owner |
| After staff departure | Disable the staff account, revoke sessions, rotate shared secrets if necessary | Owner |
| Annually | Review retention, legal hold, plan/PITR cost and provider changes | Owner + accountant |

### 10.3 During an incident

- [ ] Stop writes and tell staff to use the paper fallback.
- [ ] Preserve evidence; do not delete logs, accounts or objects.
- [ ] Identify the last known-good time and the latest validated backup.
- [ ] Call the backup administrator; use the two-person rule for any restore.
- [ ] Restore to an isolated project first; never overwrite production as the first action.
- [ ] Validate using §9.5; get owner sign-off before cutover.
- [ ] Record the timeline, data-loss window, actions and follow-ups.
- [ ] Inform members only with verified facts and legal advice where required.

### 10.4 When to contact Supabase support

Contact support immediately for:

- Project unavailable, deleted, or inaccessible for more than 15 minutes.
- Suspected database corruption or a provider incident.
- Suspected breach or unauthorised dashboard access.
- PITR/backup restore failures or missing backups.
- Billing/plan suspension that affects availability.
- Any question about what a provider backup actually contains.

Include the project reference, UTC timestamps, the exact error, the backup ID and the actions already
taken. **Never include passwords, service-role keys or member PII in the ticket.**

---

## 11. Risks and limitations

### 11.1 Risks

| Risk | Likelihood | Impact | Current control | Residual risk |
|---|---|---|---|---|
| No provider backup configured | High until confirmed | Critical | None demonstrated | Full data loss on project/database loss |
| Free plan with no backups | Unknown | Critical | None | No recovery point |
| Receipt PDFs excluded from DB backup | Certain | High | Private bucket, no client delete | Lost receipts after Storage loss |
| Project deletion removes backups | Low/Medium | Critical | None documented | Total loss; only off-platform exports help |
| Compromised owner/organisation account | Medium | Critical | MFA recommended; no break-glass yet | Attacker can delete project and backups |
| Human error during restore | Medium | High | This report's runbooks | Restoring over production would worsen loss |
| No restore drill | Certain today | High | None | Backups are unproven |
| `0010`/`0011` not locally executed | High | Medium/High | SQL inspected | Production migration may fail |
| No down migrations | Certain | Medium | Forward-fix/PITR guidance | Rollback depends on backups |
| Audit log is not full DML audit | Certain | Medium | Authority-function audit | Direct SQL deletes may be invisible |
| Backup contains PII | Certain | High | Encryption recommended | Leak if storage/key mishandled |
| Expo env baked at build time | Certain | Medium | Documented in RB-4/RB-8 | New-project failover needs a rebuild |
| Single provider/region | Certain | High | Provider backups | Regional outage can exceed RTO |
| No monitoring/alerting for backup failure | Certain | High | Manual weekly check | Silent backup failure |
| Small team, no 24/7 coverage | Certain | Medium | Runbooks, escalation list | Detection may be slow |
| Cost of PITR (~$100/month) | Medium | Medium | Minimum viable tier | Owner may decline; RPO stays 24h |

### 11.2 Limitations of this audit

- No production Supabase project, organisation, plan, backup list or Storage configuration was
  accessed. Statements about what is “configured” are therefore limited to “not found in the repo”
  and “not verified”.
- No production data volumes, row counts or Storage size were measured.
- No restore, PITR drill, Storage restore or migration replay was executed.
- Provider capabilities and prices are taken from documentation retrieved on 20 November 2026 and
  can change; confirm in the dashboard before purchase.
- The Storage backup documentation URL returned HTTP 404 at audit time; no provider-managed Storage
  backup capability could be confirmed.
- `0010` and `0011` were inspected but not executed in this environment.
- This report is operational and technical guidance, not legal advice. Retention and breach
  notification requirements must be confirmed with the gym's accountant and counsel.

---

## 12. READY / NOT READY / BLOCKED status

Status definitions used here:

- **READY** — implemented and verified with evidence.
- **NOT READY** — absent or incomplete, but can be built without an external blocker.
- **BLOCKED** — requires owner access, a paid provider capability, an isolated environment or a
  business decision that this stage cannot supply.

| Area | Status | Evidence / reason |
|---|---|---|
| Schema-level destructive protection | **READY (design)** | Append-only payments/periods/voids, client UPDATE/DELETE denied, `trg_client_guard`, `on delete restrict` history FKs, private receipt bucket with no UPDATE/DELETE policy. Inspected, not runtime-tested. |
| Provider daily backups | **BLOCKED** | No production project access; no plan or backup list recorded; Free plan has none. |
| Point-in-time recovery | **BLOCKED** | Pro+ add-on; status and retention unknown; cost decision required. |
| Independent database exports | **NOT READY** | No script, schedule, destination, encryption or checksum exists. |
| Receipt/Storage backup | **NOT READY** | No object mirror or manifest; DB backups exclude Storage objects. |
| Backup access control | **NOT READY** | No break-glass account, separate backup identity or documented restorers. |
| Backup integrity verification | **NOT READY** | No checksums, manifests or automated validation. |
| Migration safety for `0010`/`0011` | **NOT READY** | Authored but not executed locally; clean replay still required. |
| Disaster recovery runbooks | **READY (documentation only)** | Eight runbooks in §8, but none has been exercised. |
| Recovery testing | **BLOCKED / NOT VERIFIED** | Docker daemon unavailable; no `psql`/`pg_dump`; no isolated project; remote access prohibited. |
| Backup monitoring/alerting | **NOT READY** | No scheduled job, no failure alert; WS-7 observability is not started. |
| Owner operational readiness | **NOT READY** | Checklist in §10 is entirely open. |
| **Overall WS-6** | **BLOCKED** | Recovery capability is neither configured nor proven. This is not a code defect; it is an owner/provider/environment dependency. |

**Why not READY:** there is no evidence of a single restorable backup, no retention, no access
control and no drill.

**Why not simply NOT READY:** the remaining work requires production Supabase access, a plan/spend
decision, and an isolated restore environment — all outside what WS-6 is permitted to do. The
correct status is therefore BLOCKED, with the owner actions in §10 as the unblock path.

**Production gate:** do not treat the system as production-ready for financial data until provider
backups are confirmed, independent exports and receipt mirrors are running, and at least one
isolated restore drill passes the §9 criteria.

---

## 13. Recommended next workstream

**Immediate (before WS-7): owner-led WS-6 activation**

1. Confirm the Supabase plan and backup list; upgrade to Pro if needed.
2. Create the break-glass identity and enforce MFA.
3. Start the daily encrypted logical dump and the receipt-bucket mirror.
4. Run the first isolated restore drill and record the measured RTO/data-loss window.
5. Replay `0001`–`0011` on a clean local/staging database, specifically `0010` and `0011`.

These are prerequisites for any production go-live, not optional polish.

**Then: WS-7 — crash reporting, monitoring and structured logging**

WS-7 is the next planned workstream in the Stage 2A sequence. It should add:

- backup job success/failure alerting (so a silent backup failure is caught),
- Storage object-count/byte alerts,
- auth and payment error monitoring,
- a structured incident log that complements the audit trail,
- a dashboard for the owner's weekly review.

WS-7 should **not** be used as a reason to postpone the backup activation above. Observability makes
backups trustworthy; it does not replace them.

**After WS-7:** WS-8 (privacy policy, terms, consent), then the final production gate. The production
gate should require every row in §12 to be READY, with a signed drill report and a current owner
checklist.

**WS-6 stops here.** No WS-7 work, remote Supabase operation, backup, restore, migration, code change,
environment change, commit, push or deployment was performed in this stage.

---

*End of WS-6 report. All unexecuted recovery tests are marked NOT VERIFIED; no recovery result has
been fabricated.*
