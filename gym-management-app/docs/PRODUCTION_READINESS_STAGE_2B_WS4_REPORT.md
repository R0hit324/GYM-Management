# Production Readiness — Stage 2B: WS-4 Secure Storage and PDF Receipt Infrastructure — Report

**Stage:** Production Readiness — Stage 2B, Workstream 4 (secure storage + PDF receipts).
**Type:** Implementation + verification + reporting stage (no production remote operations).

---

## 1. Objective

Turn the existing receipt **flag** into a real, secure receipt **document**:

- generate a PDF receipt on device,
- store it privately (no public bucket, no public URL),
- restrict access by role and ownership (member own folder; staff RBAC),
- issue only for server-verified payments, with correct reversal handling,
- keep the existing payment/receipt architecture — no duplicate tables, no duplicate payment logic,
- and leave an honest, tested audit trail of what is proven locally vs. what still needs the owner.

## 2. Existing architecture audit

- **Receipt state (already existed — reused, not duplicated):**
  - `public.payments.receipt_issued boolean` (0001) — one-way flag.
  - `public.payments.receipt_path text` (0001, line 156) — **already present and unused**; 0009
    deliberately left it `NULL` because no Storage bucket existed. WS-4 fills this column; it does
    **not** add a column, table or bucket-per-receipt structure.
  - `issue_receipt(p_payment_id)` (0009) — the only writer of `receipt_issued`; receptionist +
    AAL2; verified-only; one-way; metadata-only; audited `receipt.issued`.
- **Client surfaces (extended in place):**
  - `src/app/(reception)/transaction-history.tsx` — staff issue action (was flag-only).
  - `src/app/(member)/payments.tsx` — member read-only payments view (was "no PDF exists" copy).
  - `src/services/data/{rows,queries,mappers,writes,index}.ts` — payment row/type/write plumbing.
- **Storage:** `supabase/config.toml` had `[storage] enabled = true` (50 MiB global limit) and **no
  buckets configured**; no `storage.objects` policy existed; no storage client wrapper existed in
  `src/`.
- **Gaps found:**
  1. No PDF generation or template.
  2. No private bucket, no object naming convention, no Storage RLS.
  3. `receipt_path` never written; no authority function to write it.
  4. `issue_receipt` (0009) accepted **reversal rows** and **fully reversed payments** — a reversal
     correction record could be "receipted", and a payment already fully refunded could still be
     flagged as receipted. Both are receipt-integrity defects.
  5. No signed-URL download path for members or staff.

## 3. Implemented services (new files)

`src/services/receipts/`

| File | Responsibility |
|---|---|
| `receipt.ts` | Receipt view model, deterministic receipt number, money/date formatting, **single eligibility gate** (verified only, no reversal entry, no fully reversed payment). |
| `render.ts` | Receipt **HTML** template — the testable source of all receipt content; HTML-escapes every dynamic value; contains no PII beyond name + business member id. |
| `pdf.ts` | `renderReceiptPdf(html)` via `expo-print` `printToFileAsync({ html, base64: true, width: 595, height: 842 })`. Excluded from the barrel so tests never load a native module. |
| `storage.ts` | Private-bucket contract: fixed bucket `receipts`, PDF MIME, 5 MiB cap, UUID-only deterministic path, TTL-clamped signed URLs, idempotent "already stored" detection. Wraps the **existing** shared Supabase client — no second client. |
| `issue.ts` | Issuance orchestration + failure taxonomy (`not_verified`, `reversal_entry`, `fully_reversed`, `member_mismatch`, `storage_unavailable`, `invalid_path`, `render_failed`, `upload_failed`, `attach_failed`, `issue_failed`). |
| `encoding.ts` | Base64 → `Uint8Array`/`ArrayBuffer` decoder for the PDF bytes returned by expo-print. |
| `index.ts` | Barrel for screens/tests. |

## 4. Storage design — bucket and policies

Bucket created by migration `0010_receipt_storage.sql`:

| Setting | Value |
|---|---|
| Bucket id / name | `receipts` / `receipts` |
| `public` | **false** (private; no public URL path exists in the app) |
| `file_size_limit` | `5242880` (5 MiB) |
| `allowed_mime_types` | `['application/pdf']` |

Object naming (deterministic, enforced server-side):

```
receipts/{member_uuid}/{payment_uuid}.pdf
```

Policies on `storage.objects` (default deny — nothing else is granted):

| Policy | Role | Command | Rule |
|---|---|---|---|
| `receipts_select_own` | authenticated member | SELECT | `bucket_id = 'receipts'` **and** first folder segment ∈ member ids whose `auth_user_id = auth.uid()` |
| `receipts_select_staff` | receptionist + owner | SELECT | `bucket_id = 'receipts'` |
| `receipts_insert_receptionist` | receptionist | INSERT | `bucket_id = 'receipts'` |

- **No UPDATE policy and no DELETE policy** → stored receipts are immutable through the Storage API
  for every client role.
- Owner is read-only on receipts by design (issuance stays a receptionist duty, matching
  `issue_receipt`'s existing role gate).
- Uploads use `upsert: false`, so an existing object can never be silently overwritten.

## 5. PDF approach

- **Renderer:** `expo-print` (`~58.0.9`, SDK 58, `expo-go` supported). Platform WebView renders
  HTML → PDF, so Unicode/Devanagari member names and the `₹` glyph render correctly with no
  hand-rolled font embedding.
- **Install note:** `npx expo install expo-print` failed with `npm error code EALLOWSCRIPTS`
  (project `allowScripts` policy rejects the flag Expo CLI passes). Direct
  `npm install expo-print@~58.0.9` succeeded; `package.json` carries `"expo-print": "~58.0.9"`.
- **Content (all under test):** gym identity, receipt number `RCPT-YYYYMMDD-<payment8>`, minimal
  member details (name + `GB-XXXXXXXX`), plan + validity, original amount, discount (% and
  amount), amount paid, method, verified date, reference/UTR, explicit verified status badge,
  reversal line + net received, and a "verified payment only" footer.
- **Only verified money can ever reach the template** — the eligibility gate runs before rendering
  (client) and the server re-checks state/entry type/reversal (RPCs).
- **No credentials or env values** in the template (asserted by test).

## 6. Issuance flow (ordering is the safety property)

```
validate (verified, not reversal, not fully reversed, member matches payment)
      ↓
render HTML → PDF (device)
      ↓
upload to private bucket  (identical existing object = idempotent success)
      ↓
attach_receipt_path       (server recomputes path; receptionist + AAL2)
      ↓
issue_receipt             (one-way flag; last)
```

- A render/upload/attach failure therefore **never** marks a payment receipted.
- Retries are safe: identical object → accepted; same path → idempotent no-op; flag already true →
  reported as `duplicate: true` without re-rendering.
- The client derives the upload folder from the **member** record, and refuses
  `payment.memberId !== member.id` (`member_mismatch`).
- Amounts, state, method, verifier and timestamps are never written on the client path.

## 7. Database / migration changes

**`supabase/migrations/0010_receipt_storage.sql`** (additive; **not executed anywhere**):

1. Private `receipts` bucket (`on conflict do update` re-asserts privacy + limits).
2. The three `storage.objects` policies above; no UPDATE/DELETE.
3. **New** `public.attach_receipt_path(p_payment_id uuid, p_receipt_path text)`:
   - `require_role(['receptionist'])` + `assert_aal2()`;
   - payment row lock; rejects missing row, non-verified state, reversal entry;
   - **recomputes** `${member_id}/${payment_id}.pdf` and refuses any other string;
   - one-way `NULL → path`; identical path is an idempotent no-op; different path refused;
   - audit `receipt.stored` (before/after JSON);
   - `EXECUTE` revoked from `public, anon, service_role`, granted to `authenticated` only.
4. **`create or replace` `issue_receipt`** — same signature, same grants, same metadata-only /
   one-way / verified-only semantics, plus two integrity gates:
   - reversal rows can never be receipted;
   - fully reversed payments (sum of verified reversals ≥ payable) can never be receipted.

No table, column, money rule, verifier column, existing policy or grant is weakened or removed.

**`supabase/tests/0010_receipt_storage_validation.sql`** — 26 assertions covering bucket privacy /
MIME / size, policy posture, storage RLS matrix (member own-folder, staff all, member upload denied,
receptionist upload allowed, UPDATE/DELETE denied, owner upload denied), `attach_receipt_path`
gates (AAL1, member, pending, reversal, foreign path, success, metadata neutrality, idempotency,
single audit row), and `issue_receipt` hardening (reversal refused, fully reversed refused, normal
issue once, second issue refused).

## 8. Client integration

- **Reception → Transaction History** (`src/app/(reception)/transaction-history.tsx`):
  `Issue receipt` now runs the full document pipeline with the shared client and opens a signed URL
  link; expanded details show `Issued · PDF stored privately` vs `Issued · PDF not stored`, plus an
  `Open receipt PDF` action (short-lived signed URL via `expo-web-browser`).
- **Member → Payments** (`src/app/(member)/payments.tsx`): receipt state copy updated and an
  `Open receipt PDF` action added for the member's own stored receipt. Members have **no** write
  path; the query filter is defence in depth and Storage RLS is the gate.
- **Data layer:** `PaymentRecord.receiptPath`, `PaymentRow.receipt_path`, `PAYMENT_COLUMNS`,
  mapper passthrough, `attachReceiptPath()` RPC wrapper and barrel export. Demo mode never issues or
  downloads a receipt (explicit copy).

## 9. Security controls

- Private bucket only; **no public URL API is used anywhere** in the app.
- Publishable/anon client only — **no service-role key** in the app, tests or template.
- Least-privilege Storage RLS: member = own folder SELECT; staff = all SELECT; receptionist =
  INSERT; no UPDATE/DELETE for anyone.
- Deterministic UUID-only object paths; invalid ids are refused (not sanitised) — no traversal or
  name injection; the server recomputes the path so a caller cannot aim a payment at another
  member's file.
- PDF-only + 5 MiB enforced client-side and by the bucket; `upsert: false`.
- Signed URLs are short-lived: default **300 s**, hard clamp **3600 s** (`clampSignedUrlTtl`).
- Issuance requires receptionist + AAL2 on **both** RPCs; verified payment only; one-way flag.
- Reversals: reversal rows are never receiptable; fully reversed payments are never receiptable;
  partially reversed receipts clearly show the reversal and net received.
- Every dynamic value in the HTML is escaped; the template carries no phone, email or secrets.
- Failures are surfaced, never simulated as success; the flag is written last.

## 10. Tests and actual results

### 10.1 New automated suites (storage/PDF mocked — no network, no bucket, no real member data)

| Suite | Tests | Result |
|---|---|---|
| `src/__tests__/receipt-pdf.test.ts` | 17 | **PASS** |
| `src/__tests__/receipt-issuance.test.ts` | 25 | **PASS** |
| **Total (WS-4)** | **42** | **PASS** |

Coverage mapped to the required test list:

| Requirement | Where proven |
|---|---|
| PDF content/formatting | receipt-pdf: all fields, currency grouping, dates, status badge, reversal note, escaping, no PII/secret leakage |
| Issuance for verified payments only | receipt-pdf eligibility; receipt-issuance `not_verified` for pending/rejected |
| Reversed handling | `reversal_entry` + `fully_reversed` refused; partial reversal shown with net amount |
| Member cross-account denial (client-side) | `member_mismatch` guard + path derived from member; foreign/non-UUID paths refused |
| Unauthorized staff denial | Server-side in migration 0010 (owner/member refused, AAL1 refused) — **SQL suite unexecuted** (see 10.3); client never bypasses RPCs |
| Upload/download authorization | storage adapter: fixed private bucket, PDF MIME, path validation, size/empty refusal, RLS error propagation, signed URL path validation |
| Signed URL expiry | default 300 s, clamp to 3600 s, invalid path refused |
| Missing storage config | `storage_unavailable` with zero renders/writes |
| Failure handling + duplicate prevention | render_failed, upload_failed, attach_failed, issue_failed all stop before later steps; identical-object retry; idempotent no-op; missing-path completion |

### 10.2 Final gates (actual runs, this stage)

| Check | Result |
|---|---|
| `npx jest src/__tests__/receipt-pdf.test.ts` | **PASS** — 17/17, exit 0 |
| `npx jest src/__tests__/receipt-issuance.test.ts` | **PASS** — 25/25, exit 0 |
| `npx jest` (full suite) | **PASS** — **14 suites / 150 tests**, exit 0 |
| `npx tsc --noEmit` | **PASS** — exit 0 |
| `npx expo lint` | **PASS** — exit 0 |
| `npx expo-doctor` | **exit 1 — pre-existing version drift only** (see below) |

- Full-suite delta vs. WS-3 close: **+2 suites / +42 tests** (12/108 → 14/150); all previously
  passing suites remain green.
- `expo-doctor` reports **10 packages out of date** (`@expo/ui`, `expo`, `expo-haptics`,
  `expo-linking`, `expo-router`, `expo-splash-screen`, `expo-status-bar`, `expo-symbols`,
  `jest-expo`, `expo-web-browser`). **`expo-print` is not flagged.** This drift predates WS-4 and
  was not "fixed" here to avoid an unrelated dependency sweep; it is recorded as a known warning.

### 10.3 SQL suite — NOT EXECUTED (honest status)

`supabase/tests/0010_receipt_storage_validation.sql` was **authored but not run**:

```
npx supabase status
→ StatusDbInspectError: failed to connect to the docker API at
  npipe:////./pipe/dockerDesktopLinuxEngine; check if the path is correct and if the
  daemon is running
docker info → Server: same Docker daemon connection failure (CLI 29.7.2 present,
  daemon not running)
```

Consequences, stated plainly:

- Bucket creation, Storage RLS enforcement, `attach_receipt_path` and the `issue_receipt`
  hardening are **code-reviewed and type-checked, not database-proven**.
- The required DB-level proofs — member cross-account denial, unauthorized staff denial,
  signed-URL expiry under RLS, migration idempotency — remain **pending execution** on a local or
  reset Supabase stack. No result is claimed for them.
- No remote Supabase access, `supabase link`, `db push` or production bucket creation was performed
  (WS-4 restriction).

## 11. Owner dashboard / provisioning steps (owner action — not performed)

1. **Apply migrations** to the target project using the owner's normal release process
   (0001→0010; 0010 is additive and idempotent for the bucket).
2. **Verify the bucket:** Storage → `receipts` exists, **Public = off**, 5 MiB limit,
   `application/pdf` only. Confirm no public URL is handed out.
3. **Verify policies:** Storage → Policies → `receipts_select_own`, `receipts_select_staff`,
   `receipts_insert_receptionist`; confirm **no** UPDATE/DELETE policy exists.
4. **Confirm member linkage:** every member who should open their own receipt must have
   `public.members.auth_user_id` set — the member SELECT policy matches on that column. Members
   without a linked auth user will (correctly) see nothing.
5. **Smoke test on a non-production copy:** receptionist (AAL2) issues a receipt on a verified
   payment; owner and member open it; a member cannot open another member's path; a pending payment
   and a reversal row are refused; a second issue is refused.
6. **Run the SQL suite** (`supabase/tests/0010_receipt_storage_validation.sql`) on a reset local
   stack when Docker is available, and record the pass/fail count.
7. **Rebuild dev/production builds** so the newly added `expo-print` native module is included.
8. Decide whether to align the 10 out-of-date Expo packages (`npx expo install --check`) in a
   separate, dedicated change.

## 12. Remaining owner actions

1. Provision/authorize the production Supabase project and apply migrations 0001–0010
   (Stage 2B WS-1/WS-2 outstanding).
2. Enable live auth mode for production (owner-managed env; WS-2).
3. Run and archive the 0010 SQL validation on a local/reset stack (Docker required).
4. Verify bucket privacy + policy posture in the Supabase dashboard after applying the migration.
5. Execute the non-production smoke test in §11.5.
6. Rebuild apps to include `expo-print`.
7. External notification providers remain owner-blocked (WS-3).

## 13. Status

| Area | READY | NOT READY | BLOCKED |
|---|---|---|---|
| PDF receipt generation (template + expo-print renderer) | ✅ | — | — |
| Verified-only issuance, reversal handling, duplicate prevention (client pipeline) | ✅ | — | — |
| Private bucket + least-privilege policy **design/migration** | ✅ (authored) | — | ✅ (needs apply to a project) |
| PDF/issuance/storage automated tests (mocked storage) | ✅ 42/42 | — | — |
| Full local gates (tsc, lint, jest) | ✅ | — | — |
| DB proof of Storage RLS / RPC gates (`0010` SQL suite) | ❌ | ✅ (suite ready) | ✅ (Docker daemon unavailable) |
| Real bucket creation, upload, download, signed-URL expiry | ❌ | ✅ (code ready) | ✅ (no remote access per WS-4) |
| Staff RBAC / member cross-account denial **at runtime** | ❌ | ✅ (designed + client-tested) | ✅ (needs §11 smoke test) |
| Android release signing / legal artifacts | ❌ | — | ✅ (pre-existing) |
| Exception: `expo-doctor` dependency drift | ❌ | ✅ (10 packages, pre-existing) | — |

**Overall: READY at code level (PDF + private storage + issuance integrity, 42 new tests, all gates
green) · NOT READY for live receipt storage until the migration is applied and the SQL suite runs ·
BLOCKED pending owner project access, Docker for local DB proof, and the rebuild that ships
`expo-print`.**

## 14. Restrictions compliance

- No remote Supabase access or modification; no `supabase link` / `db push` / migration execution.
- No production bucket created; no real member data uploaded; no PDF stored anywhere.
- No secrets read, printed or committed; no service-role key introduced.
- No `.env` change; no commit, push or deploy — all work remains uncommitted in the working tree.
- No duplicate receipt table, payment logic, storage client or receipt-flag path: the existing
  `payments` columns, `issue_receipt`, shared Supabase client and data layer were extended/reused.
- No RLS, payment-integrity, AAL2 or role rule weakened; `issue_receipt` was only **tightened**.
- No fabricated results: the unexecuted SQL suite and the `expo-doctor` warning are reported as
  they are. WS-5 has not begun.

---

*End of Stage 2B WS-4 report. Implementation stage complete at code level; database proof, live
storage and runtime authorization verification remain owner/Docker-blocked.*
