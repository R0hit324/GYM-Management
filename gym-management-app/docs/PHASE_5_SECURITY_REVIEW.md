# Phase 5 — Security Review

**Scope reviewed:** Phase 5 features shipped through Stage 8 (`P5-01`…`P5-16`
register as confirmed by the owner), with emphasis on the newly added
authority surfaces and the new read paths.

**Method:** migration text review (0002/0003/0004/0005/0008/0009), client source
grep, SQL validation suites, and live-database RLS/function behaviour.

**Verdict:** the shipped Phase 5 surfaces hold the required control posture —
no weakening of RLS, no bypass of AAL2, no unrestricted write path, no service
role in the app — with residual items explicitly BLOCKED and documented below.

---

## 1. Control posture at entry to Phase 5

Phase 5 began from a verified Phase 4 baseline:

- RLS enabled on every application table; policies select-own / select-staff /
  insert-staff / update-override as designed (0002).
- Authority functions SECURITY DEFINER with `require_role(...)`,
  `assert_aal2()` and `audit_authority(...)` (0003).
- Payments financially append-only (insert override, full payment only, reversal
  caps, deferred backstop) (0003/0002).

No Phase 5 stage weakened any of these; the only database changes added during
Phase 5 were additive authority functions, their EXECUTE grants and their tests.

## 2. Phase 5 additions reviewed

### 2.1 Receipt issuance — `issue_receipt` (0009)

- **Gate:** `require_role(array['receptionist'])` + `assert_aal2()`.
- **Target:** verified rows only; one-way false→true with a conditional update
  (`state = 'verified' and receipt_issued = false`), so a second call is refused
  and nothing can be un-issued.
- **Financial immutability:** only `receipt_issued` changes; price, payable,
  discount, state, method, UTR, verifier, timestamps untouched; payments insert
  override keeps the column false and no function ever set it before 0009.
- **Attribution:** `audit_authority('receipt.issued', 'payments', …)` with old/new
  JSON.
- **Exposure:** `revoke ... from public, anon, service_role; grant execute ...
  to authenticated;` — client-callable authority function only.
- **Finding:** none. Resolved by design and by the 19-assertion validation suite.

### 2.2 Stage 5 write paths (0008) and authority functions used by the new
owner/reception screens (0003)

- Owner: `create_plan`, `deactivate_plan`, `update_plan_price`, `update_gym_settings`.
- Receptionist/owner: `update_member_contact`, `submit_join_application`,
  `request_plan_assignment`, `decide_application`, freeze write paths.
- All follow the 0003 convention: SECURITY DEFINER, `require_role`, AAL2 where the
  action is a staff action, `audit_authority`, EXECUTE to `authenticated` only
  (revoked from `public, anon, service_role`).
- Owner-only actions refuse the receptionist (asserted in suites, e.g. member
  `update_plan_price -> Insufficient role`).

### 2.3 New read surfaces used by Phase 5 screens

- `join_applications` (own + staff policies), `membership_periods` /
  `membership_period_voids` (own + staff), `membership_freezes` (own + staff),
  `audit_log_entries` (owner-only), `app_settings` (authenticated),
  `plans` (member + staff), `follow_up_events` (staff).
- The Phase 5 screens consume only these existing policies; no new policy was
  added during Phase 5 (by design, the backend already authorised the behaviour).

## 3. Client posture

- **Writes:** grep of `src/services/data/writes.ts` and the auth provider shows
  every mutation goes through `client.rpc('<authority_function>')` — including
  `issue_receipt`, `verify_payment`, `reject_payment`, `create_reversal`,
  `update_plan_price`, `update_gym_settings`, `request_freeze`, `decide_freeze`,
  `end_freeze`, `update_member_contact`, `create_plan`, `deactivate_plan,
  submit_join_application`, `request_plan_assignment`, `decide_application`.
  No component or screen writes a table row directly (no
  `.from(...).insert/.update/.delete` outside RPC calls).
- **No service-role key:** grep for `service_role|SERVICE_ROLE|createAdminClient`
  across `src/` returns no code path; the anon key + authenticated session token
  only.
- **Export:** owner-only CSV/text share from owner-scoped rows; capped; no
  automatic upload.
- **Notifications:** in-app derived only; no push/SMS/email provider calls.

## 4. Residual findings and resolutions

| # | Finding | Severity | Resolution |
|---|---|---|---|
| P5-1 | `issue_receipt` was additive and metadata-only — no financial column touched | Info | Confirmed by 0009 design + 19-assertion suite; no change needed |
| P5-2 | Receipt one-way (no un-issue) enforced by conditional update + lock | Info | Confirmed by suite (`issue_receipt` twice refused) |
| P5-3 | Export row cap (500) added client-side to keep payloads review-sized | Low | Implemented; documented |
| P5-4 | Live analytics reuse existing bounded reads (no new privilege) | Info | Confirmed; no new grant/policy/RPC |
| P5-5 | Push/SMS/email delivery not configured | Blocked | Owner action (provider credentials/consent); documented |
| P5-6 | Staff account administration via Admin API | Blocked | Prohibited in app; owner action item |
| P5-7 | Stored PDF/image receipts / storage bucket | Blocked | No bucket in environment; documented |
| P5-8 | Production backups / store builds | Blocked | Owner action items |

No new security defect was introduced by the Phase 5 implementation; no
existing control was weakened.

## 5. Verification evidence

- `0009_receipt_issuance_validation.sql` — PASS (19 assertions; one-way receipt,
  verified-only gate, metadata-only, audit attribution, grant posture).
- `0008_stage5_write_paths_validation.sql` — PASS (22 assertions; owner-only
  plan/settings/application paths).
- `0003_authority_functions_validation.sql` — PASS (139 assertions; role/AAL2
  refusals, audit coverage).
- Backend/frontend harnesses re-run in Stage 10 (see progress report).

## 6. Residual risk register (owner action items)

1. Configure push/SMS/email provider credentials + consent records (Stage 7
   BLOCKED; remains open).
2. Staff account administration path (P5-12) requires Supabase Admin API/service
   role — prohibited in app; owner action.
3. Storage bucket + PDF receipt rendering (P5-04/P5-06) — BLOCKED; needs owner
   decision.
4. Production backup / release build pipeline — BLOCKED; owner action.

## 7. Sign-off

- Security review of Phase 5 code: **PASS** (no new findings; residuals BLOCKED
  and listed).
- Conditions to proceed to release candidate: close or explicitly accept the
  BLOCKED residuals above, and complete the Stage 10 full-reset regression.
