# Production Readiness — Stage 2B, WS-8 Report
## Legal, Privacy, Consent and User Rights

**Workstream:** WS-8  
**Date:** 20 November 2026  
**App:** `gym-management-app` (Expo / React Native / TypeScript / Supabase)  
**Scope:** legal/privacy audit, data inventory, Privacy Policy and Terms drafts, consent/acknowledgement and consent recording, account deletion requests, data export requests, retention framework, role privacy review, legal document integration, tests and documentation.

**Status legend:** `IMPLEMENTED` = code written in this workstream. `VERIFIED` = executed locally with the stated result. `NOT VERIFIED` = not executed or not observable in this environment. `BLOCKED` = prevented by an external/operational dependency. `OWNER ACTION REQUIRED` = a human decision/approval is needed. `DRAFT — LEGAL REVIEW REQUIRED` = legal text is not approved.

---

## 1. Executive summary

WS-8 is **complete as a local implementation and documentation workstream**, but it is **not production-ready**. The app previously had no privacy/terms acknowledgement, no consent evidence, no deletion/export request path, and no approved retention framework. This workstream adds:

- a versioned, draft Privacy Policy and Terms of Service that describe the features that actually exist;
- mandatory, unchecked-by-default Privacy Policy and Terms acceptance in the existing online join flow, with optional marketing consent kept separate;
- an append-only `consent_records` table and `record_consent(...)` RPC bound to `auth.uid()`, with no target-user parameter and no IP/fingerprint/secret storage;
- a member-initiated `privacy_requests` workflow for account deletion, data export, correction and privacy questions, plus an Owner + AAL2 review queue;
- a single in-app legal reader at `/legal/[doc]`, linked from login, joining, the member Privacy & data screen and the Owner More hub;
- local SQL tests committed unexecuted, and Jest coverage for consent gating, legal document integrity and the RPC clients.

**Verified locally:** `npx tsc --noEmit` clean; `npx expo lint` clean; `npx jest --runInBand` 19 suites / 243 tests passed.

**Not verified / blocked:** the 0012 migration has not been applied to any database; the SQL test suite has not been executed; no live Supabase, device, deployment or remote verification was performed. Legal approval and owner decisions are outstanding. **WS-8 verdict: NOT READY.**

**Prior workstreams remain unchanged:** WS-6 backups/PITR/restore drills are still **BLOCKED / NOT VERIFIED**. WS-7 code-level observability is locally verified, but live monitoring is **NOT VERIFIED** and external alerting is **BLOCKED**.

---

## 2. Workstream status

| Item | Status | Evidence / limit |
|---|---|---|
| Privacy/legal audit of the actual app | IMPLEMENTED | Code, migrations and prior reports reviewed |
| Data inventory | IMPLEMENTED | Section 5 |
| Privacy Policy draft | DRAFT — LEGAL REVIEW REQUIRED | `docs/LEGAL_PRIVACY_POLICY_DRAFT.md` |
| Terms of Service draft | DRAFT — LEGAL REVIEW REQUIRED | `docs/LEGAL_TERMS_OF_SERVICE_DRAFT.md` |
| In-app legal documents | IMPLEMENTED | `src/constants/legal.ts`, `src/app/legal/[doc].tsx` |
| Consent UI in join flow | IMPLEMENTED | `src/app/(auth)/join.tsx` |
| Consent recording/versioning | IMPLEMENTED (code + migration file) | `0012_privacy_consent.sql`, `src/services/consent` |
| Account deletion request path | IMPLEMENTED (workflow only) | `privacy_requests` + Owner queue |
| Data export request path | IMPLEMENTED (request only, no automatic export) | `privacy_requests` + Owner queue |
| Retention framework | PROPOSED — OWNER ACTION REQUIRED | Section 14; no purge jobs |
| Role privacy review | IMPLEMENTED / local inspection | Section 15; no security weakening |
| TypeScript | VERIFIED | `npx tsc --noEmit` — no errors |
| ESLint | VERIFIED | `npx expo lint` — no errors |
| Jest | VERIFIED | 19 suites, 243 tests passed |
| SQL tests | NOT VERIFIED | Local Supabase/Docker unavailable; no remote access permitted |
| Migration applied | NOT VERIFIED / BLOCKED | File created only; no remote operation |
| Live consent/request flows | NOT VERIFIED | No remote Supabase, device or deployment |
| Owner/legal approval | OWNER ACTION REQUIRED | Placeholders, jurisdiction, retention, refunds, liability |
| WS-6 backups/PITR/restore | BLOCKED (unchanged) | No backup, PITR or restore verification |
| WS-7 live monitoring / alerting | NOT VERIFIED / BLOCKED (unchanged) | Local code only; no external sink/alerting |

---

## 3. Scope

### In scope

- Registration/onboarding, OTP verification, MFA, join application, member profile and contact collection.
- Attendance/QR, plans, membership validity, freezes, payments, reversals, receipts, notifications and staff administration.
- Supabase tables, RLS, storage buckets, audit logs, application logging and health checks.
- Existing privacy/legal screens, account deletion, data export, retention and role boundaries.
- Privacy Policy, Terms of Service, consent UI/recording, account lifecycle requests, retention framework and tests.

### Out of scope

- Applying migrations remotely, linking a Supabase project, deploying Edge Functions or the app.
- Publishing the legal documents or claiming legal approval/compliance.
- Implementing automated erasure, automated export or destructive retention jobs.
- WS-9 or the final production audit.
- Changing `.env`, inserting secrets, committing, pushing or deploying.

---

## 4. Existing privacy/legal audit

### 4.1 What existed before WS-8

| Area | Finding |
|---|---|
| Registration/joining | `(auth)/join.tsx` collected full name, phone, email, password and plan. Verification used provider challenges. No privacy/terms screen, checkbox or acknowledgement. |
| Authentication | Demo provider in the default environment; live provider supports Supabase Auth, OTP, password, MFA and SecureStore-backed sessions. |
| Member data | `profiles` mirrors `auth.users`; `members` holds name/phone/email, plan, locked price, membership end, pending plan request and auth link. |
| Attendance | `attendance_events` and `qr_tokens`; server validates check-in and replay; token hash stored, not plaintext. |
| Payments/receipts | Append-only payment/reversal design; receipt PDFs in a private `receipts` bucket with member/staff storage policies. |
| Notifications | Notification contracts exist, but no external push/SMS/email provider is configured in this build. |
| Staff | Owner-gated staff administration with AAL2, `profiles.is_active` and audit rows. |
| Audit | Owner-only `audit_log_entries`; append-only guard; actor resolves from the authenticated profile. |
| Logging/monitoring | WS-7 local structured logging and health checks; no remote log sink or external alerting. |
| Privacy screens | None. No Privacy Policy, Terms, consent history or privacy request screen. |
| Account deletion | No in-app request or deletion path. |
| Data export | No export or export-request path. |
| Retention | Unresolved; prior docs explicitly deferred legal confirmation. No purge jobs except the documented QR-token design intent. |
| Role privacy | RLS separated member/staff/owner reads; receptionists could not read audit. No consent/request tables existed. |

### 4.2 Critical gaps confirmed

1. **No acknowledgement before registration.** A member could be created without seeing or accepting any privacy/terms text.
2. **No consent evidence.** There was no record of which document version a user saw or accepted.
3. **No user-rights intake.** A member had no in-app way to request deletion, export or correction.
4. **Retention was undefined.** Prior documentation proposed periods but explicitly did not establish approved obligations.
5. **Deletion was conflated with cancellation.** No UI or workflow distinguished ending a membership from deleting an account.
6. **Audit/retention interaction was not surfaced.** `audit_log_entries.actor` references `profiles(id) on delete restrict`; deleting an auth user can cascade `profiles` and be blocked by existing audit rows. This makes blind automatic auth deletion unsafe.

---

## 5. Data inventory

The app stores only the fields needed for membership operations. No advertising identifier, location, contacts, microphone audio or device fingerprint is stored in app tables. Supabase infrastructure may process request metadata (IP/user agent) for hosting and auth security; the app does not persist it.

| Data category | Data fields / types | Purpose and collection point | Storage and access roles | Retention consideration (PROPOSED) | Deletion implication |
|---|---|---|---|---|---|
| Identity/contact | Name, phone, email | Join form, reception contact edit, profile provisioning | `auth.users`, `profiles`, `members`, `join_applications`; member own, reception/owner operational | Active membership + a reasonable post-membership period (PROPOSED) | Contact fields can be corrected/anonymised; historical application may remain |
| Authentication | Auth user id, role, active flag, MFA status, session tokens | Sign-up, sign-in, staff invite, session restore | Supabase Auth; on-device SecureStore; role checked server-side | While account exists (PROPOSED) | Auth user deletion cascades `profiles`/`join_applications`; audit FK may restrict |
| Membership | Plan, locked price, membership end, status, pending plan, discount suggestion | Join, payment verification, plan/freeze functions | `members`, `membership_periods`; member own, staff operational | Active membership + accounting period (PROPOSED) | Member rows are archived, not client-deleted; financial history retained |
| Freezes | Request, decision, dates, actor, reason | Member request via reception, Owner decision | `membership_freezes`; member own, staff/owner | Membership history period (PROPOSED) | Retained with membership/audit history |
| Attendance | Check-in timestamp/date, member/membership link, source/token event | Member scan, server `check_in` | `attendance_events`; member own, staff/owner | Operational history window (PROPOSED) | Historical attendance may be retained for reports/audit; not rewritten silently |
| QR tokens | Token hash, expiry, consumption | Reception mints; server validates | `qr_tokens`; no direct client access | Short-lived; purge intent documented (PROPOSED) | Expired token rows can be purged by the Owner under an approved job; no job created here |
| Payments | Amount, method, reference/UTR, status, discount, recorder/verifier, timestamps | Reception records; server verifies | `payments`; member own, staff/owner | Accounting/fraud/legal period (PROPOSED) | Retained; reversals are new rows; no client delete |
| Reversals | Reversal row, target payment, reason, actor | Reception/Owner authority function | `payments` (entry_type reversal); staff/owner | Accounting/fraud/legal period (PROPOSED) | Retained as append-only financial history |
| Receipts | Receipt flag/path, PDF metadata | Reception issues on verified payment | `payments.receipt_path`; private `receipts` bucket; member own, reception insert, staff read | Accounting period (PROPOSED) | PDF is immutable through the API; owner-managed retention |
| Notifications | Recipient/channel/message contracts (no external provider configured) | Future delivery contracts only | In-memory/contract layer; no remote provider | Not applicable until a provider is configured (PROPOSED) | No stored notification history today |
| Staff | Name, role, phone, email, active, last sign-in | Owner staff administration | `profiles` + `auth.users`; Owner directory, staff own | Employment/access period + audit (PROPOSED) | Deactivation revokes access; deletion needs owner review |
| Audit | Action, actor, actor role, table, row id, old/new values, timestamp | Every authority action | `audit_log_entries`; Owner only | Long-lived audit period (PROPOSED) | Append-only; actor FK can restrict profile deletion |
| Operational logs | Local structured events, sanitised context | App errors/health | Device console/local sink only; no remote sink | Device/session lifetime (PROPOSED) | Local only; no server retention today |
| Consent | User id, type, document version, accepted flag, source, timestamp | Join review step; member Privacy & data screen | `consent_records`; member own, Owner all | Evidence-of-consent period (PROPOSED) | Append-only; new versions append; account deletion may cascade |
| Privacy requests | User id, type, details, state, resolution note, timestamps, resolver | Member Privacy & data screen; Owner queue | `privacy_requests`; member own, Owner all | Request-handling period (PROPOSED) | Workflow record only; deletion is performed separately by the Owner |

**Security considerations common to all categories:** server-side role checks, RLS on every table, least-privilege grants, private receipt bucket, append-only payment/audit guards, AAL2 for staff administration and privacy resolution, no service-role key in the app, and sanitised local logs. Residual risks are listed in sections 22–23.

**Excessive collection/access review:** no advertising/analytics SDK, no location, no contacts, no biometric data and no marketing provider were found. The main over-collection risk is historical audit `old_values`/`new_values` containing personal data; access is Owner-only and retention must be approved. Receptionists can see operational member/payment data but not audit, consent or privacy requests. No unnecessary access was added by WS-8.

---

## 6. Privacy findings

1. **Consent was absent, not merely unrecorded.** The join flow had no disclosure step; adding a hidden record would have been misleading. The UI now presents the documents before submission.
2. **Marketing was not a feature.** No marketing provider is configured. Marketing consent is therefore optional and does not enable any delivery by itself.
3. **Camera use is narrow.** `expo-camera` is configured with a QR-specific permission string; `QrScanner` requests permission only when the scanner is needed and handles `canAskAgain`/denial with an “Open settings” path. Permission denial does not block the rest of the app.
4. **Payment receipts are private.** The `receipts` bucket is private, PDF-only, size-limited, with member-folder and staff read policies; no public URL.
5. **Audit data can contain PII.** Owner-only access and append-only rules are appropriate, but retention and export handling need legal review.
6. **Auth deletion is not a clean privacy eraser.** `profiles` and `join_applications` cascade from `auth.users`; `members.auth_user_id` is set null; `audit_log_entries.actor` restricts profile deletion. Automatic deletion could fail or destroy audit linkage. A reviewed workflow is the safe choice.
7. **No data export existed.** The new request path does not pretend to generate an export.
8. **Retention was unresolved.** This report supplies a PROPOSED framework but does not invent legal obligations or create purge jobs.
9. **Local logs are not remote monitoring.** WS-7 code logs locally; no remote retention or alerting is claimed.

---

## 7. Privacy Policy

**Deliverable:** `docs/LEGAL_PRIVACY_POLICY_DRAFT.md`  
**Status:** DRAFT — LEGAL REVIEW REQUIRED  
**Version:** `2026-11-20-draft.1`

The draft contains all 22 required sections: introduction; controller/operator identity; information collected; information users provide; automatically collected information; membership/attendance; payments/receipts; authentication/security; purposes; access/sharing; third parties; Supabase hosting; notifications; retention; security; rights/requests; account deletion; correction; breach handling; minors; changes; contact.

It is grounded in actual behaviour: no card/UPI processing in the app, private receipt storage, Owner-only audit, role-based access, local-only logs, no marketing provider, and a reviewed (not instant) deletion request. Owner identity, address, contact, grievance officer, effective date, minimum age, jurisdiction and retention periods are placeholders. It makes no compliance, certification, encryption, backup or immediate-deletion guarantee.

**In-app relationship:** `src/constants/legal.ts` holds a condensed, versioned rendering of the same text for the mobile reader. The version identifier is shared with consent recording. Any approved change must update both the docs draft and the constants, and bump the version.

---

## 8. Terms of Service

**Deliverable:** `docs/LEGAL_TERMS_OF_SERVICE_DRAFT.md`  
**Status:** DRAFT — LEGAL REVIEW REQUIRED  
**Version:** `2026-11-20-draft.1`

The draft covers acceptance; registration; accurate information; account security; member responsibilities; membership validity; attendance; QR rules; freezes; fees/payments; payment recording; receipts; discounts/authorization; cancellation/refunds (owner review); prohibited use; fraud/abuse; staff/owner responsibilities; availability; suspension/termination; limitation of liability (legal review); dispute resolution (owner/legal review); changes; contact.

It deliberately does **not** invent prices, refund entitlements, notice periods, cancellation fees, liability caps, arbitration clauses or a jurisdiction. Those are explicit placeholders/review items. It states the implemented boundaries: payments are recorded, not processed; reversals are new rows; receipts are private; the attendance QR is separate from the UPI QR; camera denial is handled; account deletion is separate from membership cancellation.

---

## 9. Consent implementation

### 9.1 Join flow

`src/app/(auth)/join.tsx` review step now shows:

- **Privacy Policy** — mandatory checkbox, unchecked by default, with a link to read the document.
- **Terms of Service** — mandatory checkbox, unchecked by default, with a link to read the document.
- **Optional gym marketing messages** — separate checkbox, unchecked by default, explicitly not required for membership.

The “Create account” button is disabled until both mandatory boxes are checked. `submit()` also re-checks the same pure helper, so a disabled-state bypass cannot submit without acceptance. There is no preselected mandatory consent.

### 9.2 Demo honesty

When `provider.mode === 'demo'`, the flow still requires the boxes (so the interaction is reviewable) but the UI explicitly says the acceptance is **not recorded anywhere** because no server is connected. The demo path calls no consent RPC and creates no consent row. It never claims a record exists.

### 9.3 Live recording

When `provider.mode === 'live'`, submission first calls `recordConsents(buildJoinConsentEvents(consent))`:

1. privacy_policy (accepted = true);
2. terms_of_service (accepted = true);
3. marketing (accepted = the user's actual choice, including false).

If any call fails, the join application is **not** submitted. The screen reports how many events were recorded and preserves the server's error. If all succeed, `submitJoinApplication` runs as before. This ordering prevents “account created, consent unknown”. It does not claim success if the server refused.

### 9.4 Member Privacy & data screen

`src/app/(member)/privacy.tsx` provides:

- links to both legal documents;
- the latest recorded marketing choice, with a control that appends a new decision (accept or withdraw);
- the latest acceptance/decline per document with version and date;
- four privacy request actions (deletion, export, correction, inquiry) with an explanation and optional details;
- the member's own request history and Owner notes.

In demo mode the actions are disabled with a reason; no consent or request is claimed.

### 9.5 Camera permission

The existing `QrScanner` requests camera permission only when the scanner is active. It explains the purpose (“read the entrance QR”), distinguishes `canAskAgain`, offers “Open settings” after denial, and does not bypass the OS. WS-8 did not add any new permission. Real-device permission behaviour is **NOT VERIFIED** in this environment.

---

## 10. Consent versioning

- **Version identifier:** `2026-11-20-draft.1`, held in `src/constants/legal.ts` and recorded with every event.
- **Append-only:** `consent_records` has no client INSERT/UPDATE/DELETE grant and a client-mutation guard on all three operations. A new version creates a new row; earlier rows are never edited.
- **What is recorded:** authenticated user id (`auth.uid()`), consent type, document version, accepted boolean, source (`member_join` or `member_privacy_screen`) and timestamp.
- **What is not recorded:** password, OTP, session token, MFA secret, IP address, device fingerprint or any secret.
- **Ownership:** `record_consent` has no user-id parameter; the target is always `auth.uid()`. A user cannot record consent for another account.
- **Access:** a member reads only their own rows; the Owner reads all rows as controller evidence; receptionists read neither.
- **Audit:** when a profile exists, `audit_authority('consent.recorded', …)` writes an audit row. During the live join window, consent can arrive before the profile row exists (OTP session, no profile yet); the append-only consent row is then the evidence and no fake actor is invented. This is documented in the migration.

**Version-change procedure (OWNER ACTION REQUIRED):** approve the new text, update both docs and `src/constants/legal.ts`, bump the version, present it for acceptance where required, and retain the old rows.

---

## 11. Account lifecycle

| Stage | Current behaviour | Privacy implication |
|---|---|---|
| Join | Member enters details, verifies contacts, reviews and accepts documents, submits application | Consent is recorded in live mode before submission; demo records nothing |
| Account | Supabase Auth user + `profiles` row with role `member` | Auth/session security is Supabase-managed; app stores no password |
| Application | `join_applications` row linked to `auth_user_id` | Contact data duplicated for the application; cascades on auth deletion |
| Membership | Reception links/creates the member and verifies payment | Membership starts only on verified payment; financial rows append |
| Active use | Attendance, payments, receipts, notifications (not configured) | Member sees own; staff/owner see operational data |
| End of membership | Membership expires or is cancelled by the gym process | No in-app member self-cancellation screen exists; not invented here |
| Account deletion request | New `privacy_requests` workflow | Reviewed, auditable; not instant; not the same as cancellation |
| Data export request | New `privacy_requests` workflow | Owner-managed; no automatic export |
| Staff offboarding | Owner deactivates `profiles.is_active` | Access denied immediately; auth user deletion handled separately |

**Deletion semantics confirmed in schema:** `profiles` and `join_applications` reference `auth.users` with `on delete cascade`; `members.auth_user_id` uses `on delete set null`; `audit_log_entries.actor` uses `on delete restrict`. Therefore deleting an auth user can remove profile/application data, leave the member/financial row without an auth link, and be blocked by existing audit rows. This is why WS-8 does not automate deletion.

---

## 12. Data deletion process

**Status:** IMPLEMENTED as an auditable request workflow; actual erasure is OWNER ACTION REQUIRED and NOT VERIFIED.

1. A signed-in member opens **Privacy & data → Request account deletion**, optionally adds details.
2. `request_privacy_action('account_deletion', details)` binds the request to `auth.uid()` and inserts state `submitted`; an audit row `privacy.requested` is written.
3. The Owner sees the request in **Owner → More → Privacy requests**.
4. Owner + AAL2 moves it to `in_review`, then `completed` or `rejected`, with an optional note. Each transition writes `privacy.request_resolved`.
5. `completed` means “the Owner recorded the reviewed outcome”; it does **not** delete anything in the database. The Owner performs any approved deletion/anonymisation separately under the gym’s procedure.
6. Payment, reversal, receipt and audit records are retained where needed; the Owner explains this in the resolution note.

The app makes **no promise of immediate or complete deletion**. It does not delete auth users, profiles, members, payments, receipts or audit rows from any client or RPC path. SQL test T04 asserts the privacy functions contain no `DELETE FROM`/`TRUNCATE`.

**Owner procedure still required:** decide whether to delete the auth user, anonymise profile/contact fields, or retain; check audit FK restrictions; record the exact action and legal basis; handle receipt PDFs and backups separately (WS-6 is blocked).

---

## 13. Data export status

**Status:** IMPLEMENTED as a request path only; **NOT VERIFIED** as an export capability.

- A member can request “Copy of my data” via `privacy_requests` (`data_export`).
- The request is visible to the Owner with details and state.
- **No automatic export generator, file, email or download exists.** The app does not claim one.
- The Owner must define the export scope (account, membership, attendance, payments, receipts, consent, requests), a secure delivery method, identity verification and a response timeframe.
- Data export format, redaction rules and delivery channel are **OWNER/LEGAL DECISIONS**.

---

## 14. Data retention framework

**All periods below are PROPOSED. They are not legal obligations and no automatic deletion/purge job is created.** The Owner and legal adviser must approve final periods, then implement any deletion with a reviewed, logged, non-destructive-by-default procedure.

| Category | Purpose | Proposed retention | Legal/business dependency | Deletion/anonymisation approach | Owner responsibility |
|---|---|---|---|---|---|
| Authentication/account | Sign-in, security, role | Account lifetime + short closure period (PROPOSED) | Auth security, dispute handling | Delete/anonymise after review; check audit FK | Approve closure procedure |
| Member profile/contact | Membership operation, contact | Active membership + post-membership period (PROPOSED) | Accounting, support | Anonymise contact fields; archive member row | Approve fields to anonymise |
| Membership/periods | Validity, plan, freeze history | Long-lived membership history (PROPOSED) | Accounting, disputes | Retain/archive; do not silently rewrite | Approve period |
| Attendance | Visit history, inactivity follow-up | Operational history window (PROPOSED) | Reports, disputes | Retain or aggregate; no client deletion | Approve window |
| QR tokens | Entrance validation | Very short-lived (PROPOSED) | Replay/security | Expired-row purge under approved job | Approve job + audit |
| Payments/reversals | Financial record | Accounting/fraud/legal period (PROPOSED) | Tax/accounting/fraud | Retain; append-only reversals | Confirm statutory period |
| Receipts | Proof of payment | Accounting period (PROPOSED) | Accounting/audit | Retain PDF; owner-managed storage cleanup | Confirm period + backup handling |
| Notifications | Delivery contracts | Not applicable until provider configured (PROPOSED) | Future consent | No stored history today | Re-review before enabling |
| Staff records | Access administration | Employment/access period + audit (PROPOSED) | Security/audit | Deactivate; delete/anonymise after review | Approve offboarding |
| Audit log | Accountability/security | Long-lived audit period (PROPOSED) | Fraud/audit/legal | Append-only; archive if needed | Approve access/retention |
| Operational logs | Troubleshooting | Device/session lifetime (PROPOSED) | Security | Local only; no remote sink today | Decide future sink/retention |
| Consent records | Evidence of acceptance | Evidence period (PROPOSED) | Accountability | Append-only; new versions append | Approve evidence period |
| Privacy requests | Request handling | Handling period + audit (PROPOSED) | Rights/audit | Retain workflow record; do not delete mid-review | Approve period |

**Prohibited by this workstream:** automatic destructive retention jobs, blind `DELETE`/`TRUNCATE`, deleting payment/audit/receipt history, or promising a retention period before approval.

---

## 15. Permissions and privacy review

| Data/action | Member | Receptionist | Owner |
|---|---|---|---|
| Own profile/contact | Read own | Read/update operational member contact | Read all |
| Other members' profiles | No | Read operational | Read all |
| Membership/attendance | Read own | Read/record operational | Read all |
| Payments | Read own | Record/verify/reverse per authority | Read/report |
| Receipts | Read own signed link | Upload/read per role | Read |
| Staff directory | No | No (own profile via auth) | Read/admin |
| Audit log | No | No | Read |
| Consent records | Read own | No | Read all |
| Privacy requests | Create/read own | No | Read/resolve |
| Account deletion/export | Request own only | No | Review + perform separately |
| Gym settings | No | No | Read/update |
| Monitoring/health | No | No | Operational/owner |

**Findings:**

- RLS and server functions remain the authority; no client role was widened.
- Receptionists gained no access to consent, privacy requests or audit.
- Members cannot read another member’s consent/request rows; SQL tests L01–L06 and P11 assert this.
- Owner consent access is controller evidence, not a member-facing feature.
- AAL2 remains required for staff administration and is now also required for privacy request resolution.
- Payment append-only, receipt immutability and audit append-only protections were not weakened.

---

## 16. Legal document integration

- **One route:** `/legal/[doc]` (`privacy` | `terms`). No per-workspace duplicate screens.
- **Entry points:** join review step (mandatory links), login footer, member Privacy & data screen, Owner More → Legal documents.
- **Mobile layout:** safe-area aware, scrollable, readable body text, section headings, back control, DRAFT banner and placeholder highlighting.
- **Versioning:** the reader shows the document version and update date; the same version is recorded at consent.
- **Placeholders:** the reader explicitly lists the placeholders and marks them in the text. No fake identity, contact or jurisdiction is shown.
- **Draft status:** both documents display “DRAFT — LEGAL REVIEW REQUIRED” in the reader and in the docs.
- **Typed routes:** the route is registered in the root layout; navigation uses the existing Expo Router tree.

---

## 17. Tests executed

### Commands actually run

| Command | Result |
|---|---|
| `npx tsc --noEmit` | Passed, no output |
| `npx expo lint` | Passed, no errors |
| `npx jest --runInBand` | 19 suites passed, 243 tests passed |
| SQL test suite `0012_privacy_consent_validation.sql` | **NOT EXECUTED** — no local Supabase/Docker, no remote access |
| Remote migration/RLS verification | **NOT EXECUTED** — prohibited |

### New Jest coverage (`src/__tests__/consent-privacy.test.ts`, 25 tests)

- consent defaults are all false and the initial object is frozen;
- both mandatory documents block completion until accepted;
- marketing is never mandatory;
- marketing acceptance/refusal is reflected in the built events;
- mandatory events carry the correct document versions and sources;
- Privacy draft has 22 sections and the required topic ids;
- Terms draft has the required topic ids;
- every owner-dependent placeholder appears in the text;
- only `privacy`/`terms` resolve; unknown documents return null;
- unauthenticated consent/request calls are refused before RPC;
- consent RPC receives only type/version/accepted/source (no target user id);
- server errors preserve message + classification;
- a batch stops at the first failure and reports `recorded`;
- success is reported only when all events append;
- consent history maps server rows;
- privacy request RPC sends type/trimmed details/null and no user id;
- own-request listing filters by `auth_user_id`;
- owner resolution sends id/state/note and preserves a non-owner refusal;
- request type/state labels are stable.

### SQL coverage committed but NOT VERIFIED (`supabase/tests/0012_privacy_consent_validation.sql`)

- authenticated-only EXECUTE; anon/service_role denied; definer + pinned `search_path`;
- no target-user parameter on consent/request RPCs;
- RLS enabled + forced on both tables; no client INSERT/UPDATE/DELETE;
- unauthenticated calls refused;
- consent binds to caller; mandatory decline refused; marketing decline allowed;
- blank version/unknown type/source refused; new version appends; earlier row preserved;
- direct consent mutation denied;
- member own rows only; receptionist none; owner all;
- request intake bound to caller, audited; validation errors;
- member cannot resolve own request; owner AAL1 refused; owner AAL2 transitions; closed request cannot reopen; unknown id refused;
- resolution does not delete member/consent rows;
- payment/audit/member DELETE privileges remain absent;
- privacy functions contain no `DELETE FROM`/`TRUNCATE`.

---

## 18. Actual test results

```
npx tsc --noEmit
(no output — exit 0)

npx expo lint
(no errors — exit 0)

npx jest --runInBand
Test Suites: 19 passed, 19 total
Tests:       243 passed, 243 total
Snapshots:   0 total
Time:        20.045 s
```

**Not claimed:** these results prove TypeScript/lint/Jest only. They do not prove the migration applies, RLS behaves as intended in PostgreSQL, the live join flow records consent, the screens render correctly on a device, camera denial works on hardware, or the remote Supabase project is configured safely.

---

## 19. Files changed

### Created

- `supabase/migrations/0012_privacy_consent.sql`
- `supabase/tests/0012_privacy_consent_validation.sql`
- `src/constants/legal.ts`
- `src/components/legal/consent-checkbox.tsx`
- `src/components/legal/legal-link.tsx`
- `src/app/legal/[doc].tsx`
- `src/services/consent/index.ts`
- `src/services/privacy/index.ts`
- `src/app/(member)/privacy.tsx`
- `src/app/(owner)/privacy.tsx`
- `src/__tests__/consent-privacy.test.ts`
- `docs/LEGAL_PRIVACY_POLICY_DRAFT.md`
- `docs/LEGAL_TERMS_OF_SERVICE_DRAFT.md`
- `docs/PRODUCTION_READINESS_STAGE_2B_WS8_REPORT.md` (this report)

### Modified

- `src/app/_layout.tsx` — registered the single legal route. (This file also carries pre-existing WS-7 changes; they were preserved.)
- `src/app/(auth)/join.tsx` — consent state, checkboxes, mandatory gating, live recording, honest demo note.
- `src/app/(auth)/login.tsx` — Privacy/Terms links in the auth footer.
- `src/app/(member)/_layout.tsx` — registered the member privacy screen.
- `src/app/(member)/attendance.tsx` — “Privacy & data” entry point.
- `src/app/(owner)/_layout.tsx` — registered the Owner privacy queue.
- `src/app/(owner)/more.tsx` — Privacy requests row + Legal documents section.

### Preserved uncommitted work (not authored by WS-8)

- `src/services/supabase/client.ts` (pre-existing modification)
- `src/services/observability/`, `src/__tests__/observability.test.ts` (WS-7)
- `docs/PRODUCTION_READINESS_STAGE_2B_WS6_REPORT.md`, `docs/PRODUCTION_READINESS_STAGE_2B_WS7_REPORT.md`

### Not changed

`.env`, `package.json`, Supabase clients, navigation roots, audit system, existing authority functions, RLS policies, seed data, payment/receipt flows.

---

## 20. Owner actions

1. **Complete legal identity/contact placeholders:** legal name, registered address, privacy email, phone, grievance officer, effective date.
2. **Approve the legal text** with a qualified adviser: Privacy Policy, Terms, jurisdiction, liability, dispute resolution, breach notification, age/minors, subprocessors/DPA.
3. **Approve retention periods** in section 14 and document the legal/business basis. No purge job should be enabled until this is approved.
4. **Define the account-deletion procedure:** auth user deletion vs anonymisation; audit FK restrictions; receipt PDF handling; backup copies; response template.
5. **Define the data-export procedure:** scope, identity verification, secure delivery, format, timeframe.
6. **Define cancellation/refund/freeze rules** and insert them into the Terms; do not rely on the draft placeholders.
7. **Apply migration 0012** through the approved remote process, then run the SQL suite and record the result. (Not done here.)
8. **Verify production Supabase settings:** HTTPS/TLS, at-rest encryption, backups, PITR, restore drill, access control and logging. WS-6 remains blocked until this is evidenced.
9. **Configure live monitoring and external alerting** if desired. WS-7 remains incomplete until this is evidenced.
10. **Decide the marketing channel and consent UX** before sending any marketing. No provider is configured today.
11. **Test on real iOS/Android hardware:** join consent, document reading, camera allow/deny/settings, member privacy screen, Owner queue, AAL2 behaviour.
12. **Review the consent versioning procedure** for future policy changes and ensure both docs and `src/constants/legal.ts` stay in sync.

---

## 21. Legal review requirements

The following require legal review and must not be treated as settled:

- controller/operator identity and contact details;
- applicable law/jurisdiction and dispute-resolution clause;
- liability limitation/exclusion wording;
- cancellation, refund, freeze and fee rules;
- retention periods and any statutory accounting/tax obligations;
- breach notification timing and authority reporting;
- children/minors age threshold and guardian consent;
- international transfers and Supabase/subprocessor terms;
- data subject request identity verification and response timelines;
- whether “account deletion” should delete, anonymise or restrict each record;
- marketing consent wording and withdrawal mechanics;
- accessibility/consumer-law disclosures required in the gym’s market.

The drafts deliberately contain no invented prices, refund entitlements, legal bases, jurisdiction or compliance claims. **DRAFT — LEGAL REVIEW REQUIRED.**

---

## 22. Known limitations

1. **Migration not applied.** The SQL is a local file only; no database has executed it.
2. **SQL tests not executed.** Docker/local Supabase was unavailable; remote access was prohibited.
3. **Live flows not verified.** No remote Supabase, device, build or deployment was used.
4. **No automatic deletion or export.** The workflow records requests; the Owner performs the action separately.
5. **No member self-service cancellation.** Membership cancellation remains a gym process; it is documented as distinct from deletion.
6. **No age verification.** The app has no age gate; the owner/legal adviser must decide the requirement.
7. **No marketing provider.** Marketing consent is recorded but sends nothing.
8. **No remote log retention/monitoring.** WS-7 remains locally verified only.
9. **No backup/PITR verification.** WS-6 remains blocked.
10. **Audit PII retention is unresolved.** Old/new audit values may contain personal data; Owner-only access is in place, but retention/export rules need approval.
11. **Consent audit pre-profile window.** During live join, consent may be recorded before a profile exists; the append-only consent row is the evidence and no audit row is invented. This is intentional but should be reviewed.
12. **Auth deletion is not a guaranteed clean erasure.** Cascade/restrict behaviour means the Owner must choose deletion vs anonymisation and handle audit rows.
13. **In-app text is condensed.** The docs drafts are the fuller source; both must be updated together.
14. **No legal publication.** Nothing was published or externally linked.

---

## 23. Security review

### Preserved controls

- RLS remains enabled and forced on existing tables; new tables are enabled/forced with member-own and Owner policies.
- No service-role/secret key was added to the app, docs or tests.
- No `.env` change, secret, token, OTP or password was written to consent/privacy records.
- No client INSERT/UPDATE/DELETE grant was added to the new tables; all writes are security-definer RPCs.
- `record_consent` and `request_privacy_action` have no target-user parameter; ownership is `auth.uid()`.
- Consent is append-only at the grant and trigger level; privacy-request resolution is Owner + AAL2.
- Existing payment append-only, receipt immutability, audit append-only, MFA/AAL2, RBAC and authority functions were not weakened.
- RLS boundary tests were written for member/member isolation, receptionist denial and Owner access (committed, not executed).
- The camera permission remains QR-specific; no new permission or background access was added.

### Residual risks

- **Unapplied migration:** behaviour is not proven in PostgreSQL. A syntax/ACL/RLS defect would only surface when the suite runs.
- **Consent evidence before profile:** intended, but requires operational understanding; the consent row must not be edited or purged without an approved retention decision.
- **Audit FK restrict:** auth deletion may fail or require anonymisation; this is a feature of preserving audit integrity, not a bug to bypass.
- **Owner concentration:** the Owner can read consent/requests/audit. This is appropriate for a small gym controller but should be covered by staff policy and account security.
- **No remote monitoring:** a production incident would not trigger external alerts; WS-7 external alerting is still blocked.
- **No backup verification:** deletion/export decisions cannot rely on unverified backups; WS-6 remains blocked.
- **Legal text risk:** placeholders and unreviewed clauses must not be published as final.

---

## 24. Final verdict

**WS-8: NOT READY.**

- **Code implementation:** IMPLEMENTED and locally typechecked/linted/Jest-tested.
- **Privacy/legal drafts:** DRAFT — LEGAL REVIEW REQUIRED.
- **Consent recording/versioning:** implemented at code/migration level; **NOT VERIFIED** against a database.
- **Account deletion/data export:** secure reviewed request workflow implemented; actual erasure/export is **OWNER ACTION REQUIRED** and **NOT VERIFIED**.
- **Retention:** PROPOSED framework only; no periods approved and no destructive jobs created.
- **Role privacy:** reviewed; no controls weakened.
- **Remote/live verification:** **BLOCKED / NOT VERIFIED** (no remote Supabase, deployment or device access).
- **WS-6:** remains **BLOCKED** (backups, PITR, independent backups, restore drills, metrics not verified).
- **WS-7:** code-level observability locally verified; live monitoring **NOT VERIFIED**; external alerting **BLOCKED**.
- **Production readiness:** not claimed.

**Stop point:** WS-8 is complete as a local implementation and documentation workstream. Do not apply the migration, deploy, publish the legal documents, commit/push, or start WS-9/final production audit without owner approval and the required legal/operational review.
