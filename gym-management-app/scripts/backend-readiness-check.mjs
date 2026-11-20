#!/usr/bin/env node
/**
 * Phase 4 — Stage 1 backend readiness check (LOCAL ONLY).
 *
 * Proves, against a running local Supabase stack, that:
 *   1. the seed initialised app_settings + the four plans;
 *   2. member signup can self-provision a `member` profile (0005) and the
 *      role cannot be changed by the client;
 *   3. member email/phone verification works through Supabase Auth (local
 *      `test_otp` numbers only);
 *   4. staff sessions reach AAL2 with a TOTP factor, and the AAL2 claim is
 *      present in the JWT the database actually receives;
 *   5. member / receptionist / owner sessions are linked to the right
 *      immutable profile rows;
 *   6. the AAL2-gated RPCs reject AAL1, and `mint_attendance_token` /
 *      `update_gym_settings` work once settings are initialised.
 *
 * Safety:
 *   - Refuses any API URL that is not 127.0.0.1 / localhost.
 *   - Reads the local stack's URL and keys from `supabase status -o env` at
 *     runtime (or from SUPABASE_* env overrides). No key is stored in the
 *     repository.
 *   - Test fixtures are prefixed `readiness-` and removed at the end through
 *     the local Postgres container (pass `--keep` to inspect them).
 *
 * Usage:
 *   node scripts/backend-readiness-check.mjs
 *   node scripts/backend-readiness-check.mjs --keep
 */
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

import { resolveLocalStack } from './local-stack.mjs';

const stack = resolveLocalStack();
const API_URL = stack.apiUrl.replace(/\/+$/, '');
const PUBLISHABLE_KEY = stack.publishableKey;
const SECRET_KEY = stack.secretKey;
const DB_CONTAINER = process.env.SUPABASE_DB_CONTAINER ?? 'supabase_db_GYM_Management';
const MAILPIT_URL = stack.mailpitUrl.replace(/\/+$/, '');
const KEEP = process.argv.includes('--keep');

if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(API_URL)) {
  console.error(`Refusing to run against a non-local API URL: ${API_URL}`);
  process.exit(2);
}
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(MAILPIT_URL)) {
  console.error(`Refusing to read a non-local mail catcher: ${MAILPIT_URL}`);
  process.exit(2);
}

const results = [];
let failures = 0;

function check(name, ok, detail = '') {
  results.push({ name, ok });
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

function section(title) {
  console.log(`\n== ${title} ==`);
}

async function call(path, { method = 'GET', token = PUBLISHABLE_KEY, service = false, body, headers = {} } = {}) {
  const key = service ? SECRET_KEY : PUBLISHABLE_KEY;
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${token || key}`,
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: response.status, ok: response.ok, data, text };
}

function errText(response) {
  return (
    response.data?.message ??
    response.data?.msg ??
    response.data?.error_description ??
    response.data?.error ??
    response.text ??
    `HTTP ${response.status}`
  );
}

function rpc(fn, args, token) {
  return call(`/rest/v1/rpc/${fn}`, { method: 'POST', token, body: args });
}

function serviceSelect(path) {
  return call(path, { service: true });
}

function jwtClaims(token) {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function base32Decode(input) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of input.replace(/=+$/, '').toUpperCase()) {
    const index = alphabet.indexOf(char);
    if (index < 0) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function totp(secret, digits = 6, period = 30) {
  const counter = Math.floor(Date.now() / 1000 / period);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac('sha1', base32Decode(secret)).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 10 ** digits).padStart(digits, '0');
}

async function createStaff(email, password, displayName, role) {
  const created = await call('/auth/v1/admin/users', {
    method: 'POST',
    service: true,
    body: { email, password, email_confirm: true, user_metadata: { full_name: displayName } },
  });
  if (!created.ok) throw new Error(`admin create ${email}: ${errText(created)}`);
  const user = created.data.user ?? created.data;

  const profile = await call('/rest/v1/profiles', {
    method: 'POST',
    service: true,
    body: { id: user.id, display_name: displayName, role },
    headers: { Prefer: 'return=minimal' },
  });
  if (!profile.ok && profile.status !== 409) {
    throw new Error(`profile insert ${email}: ${errText(profile)}`);
  }

  const signIn = await call('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: { email, password },
  });
  if (!signIn.ok) throw new Error(`sign in ${email}: ${errText(signIn)}`);
  return { id: user.id, email, password, aal1: signIn.data.access_token };
}

async function enrollAndReachAal2(staff) {
  const enroll = await call('/auth/v1/factors', {
    method: 'POST',
    token: staff.aal1,
    body: { factor_type: 'totp', friendly_name: `readiness-${staff.email}` },
  });
  if (!enroll.ok) throw new Error(`enroll TOTP ${staff.email}: ${errText(enroll)}`);
  const factorId = enroll.data.id;
  const secret = enroll.data.totp?.secret;
  if (!factorId || !secret) throw new Error(`enroll TOTP ${staff.email}: missing factor/secret`);

  const challenge = await call(`/auth/v1/factors/${factorId}/challenge`, {
    method: 'POST',
    token: staff.aal1,
    body: {},
  });
  if (!challenge.ok) throw new Error(`challenge ${staff.email}: ${errText(challenge)}`);

  const verified = await call(`/auth/v1/factors/${factorId}/verify`, {
    method: 'POST',
    token: staff.aal1,
    body: { challenge_id: challenge.data.id, code: totp(secret) },
  });
  if (!verified.ok) throw new Error(`verify TOTP ${staff.email}: ${errText(verified)}`);

  // Verifying a factor rotates the session; get a fresh AAL1 token too so the
  // AAL2 gate can be proven with a real aal1 JWT after enrollment.
  const freshAal1 = await call('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: { email: staff.email, password: staff.password },
  });
  if (!freshAal1.ok) throw new Error(`re-sign in ${staff.email}: ${errText(freshAal1)}`);

  const freshChallenge = await call(`/auth/v1/factors/${factorId}/challenge`, {
    method: 'POST',
    token: freshAal1.data.access_token,
    body: {},
  });
  if (!freshChallenge.ok) throw new Error(`re-challenge ${staff.email}: ${errText(freshChallenge)}`);

  const freshVerified = await call(`/auth/v1/factors/${factorId}/verify`, {
    method: 'POST',
    token: freshAal1.data.access_token,
    body: { challenge_id: freshChallenge.data.id, code: totp(secret) },
  });
  if (!freshVerified.ok) throw new Error(`re-verify TOTP ${staff.email}: ${errText(freshVerified)}`);

  staff.aal1 = freshAal1.data.access_token;
  staff.aal2 = freshVerified.data.access_token;
  staff.factorId = factorId;
}

async function fetchEmailCode(email, attempts = 20) {
  for (let i = 0; i < attempts; i++) {
    const listed = await fetch(`${MAILPIT_URL}/api/v1/messages?limit=25`).then((r) => r.json());
    const message = (listed.messages ?? []).find((entry) =>
      (entry.To ?? []).some((to) => to.Address?.toLowerCase() === email.toLowerCase()),
    );
    if (message) {
      const full = await fetch(`${MAILPIT_URL}/api/v1/message/${message.ID}`).then((r) => r.json());
      const body = `${full.Text ?? ''}\n${full.HTML ?? ''}`;
      const match = body.match(/\b(\d{6})\b/);
      if (match) return match[1];
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return null;
}

async function cleanup(suffix) {
  const sql = `
begin;
create temp table _u on commit drop as
  select id from auth.users where email like 'readiness-%@local.test';
create temp table _m on commit drop as
  select id from public.members
   where auth_user_id in (select id from _u) or email like 'readiness-%@local.test';
delete from public.membership_period_voids
 where period_id in (select id from public.membership_periods where member_id in (select id from _m));
delete from public.membership_periods where member_id in (select id from _m);
delete from public.attendance_events where member_id in (select id from _m);
delete from public.membership_freezes where member_id in (select id from _m);
delete from public.follow_up_events where member_id in (select id from _m);
delete from public.payments where member_id in (select id from _m);
delete from public.qr_tokens where minted_by in (select id from _u);
delete from public.join_applications
 where auth_user_id in (select id from _u) or email like 'readiness-%@local.test';
delete from public.audit_log_entries where actor in (select id from _u);
delete from public.members where id in (select id from _m);
delete from public.profiles where id in (select id from _u);
delete from auth.users where id in (select id from _u);
update public.app_settings
   set gym_timezone = 'Asia/Kolkata',
       attendance_token_validity_seconds = 60
 where id = 1;
commit;
`;
  const proc = spawnSync(
    'docker',
    ['exec', '-i', DB_CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
    { input: sql, encoding: 'utf8' },
  );
  if (proc.status !== 0) {
    console.log(`WARN  fixture cleanup skipped: ${proc.stderr?.trim() || proc.error?.message || 'docker unavailable'}`);
  } else {
    console.log('INFO  readiness fixtures removed');
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const memberEmail = `readiness-member-${suffix}@local.test`;
const ownerEmail = `readiness-owner-${suffix}@local.test`;
const rec1Email = `readiness-rec1-${suffix}@local.test`;
const rec2Email = `readiness-rec2-${suffix}@local.test`;
const rec3Email = `readiness-rec3-${suffix}@local.test`;
const memberPhone = '+919800000002';
const emailProbe = `readiness-email-${suffix}@local.test`;
const password = 'Readiness#1';

try {
  // 1. Seed ---------------------------------------------------------------
  section('Seed');
  const plans = await serviceSelect('/rest/v1/plans?select=id,name,duration,price,is_active&order=name');
  check('four seeded plans present', plans.ok && plans.data.length === 4, `HTTP ${plans.status}, rows=${plans.data?.length}`);
  const planNames = new Set((plans.data ?? []).map((p) => p.name));
  check(
    'plan catalogue is Monthly / Quarterly / Half yearly / Yearly',
    ['Monthly', 'Quarterly', 'Half yearly', 'Yearly'].every((name) => planNames.has(name)),
    [...planNames].join(', '),
  );
  const monthly = (plans.data ?? []).find((p) => p.name === 'Monthly');

  const settings = await serviceSelect('/rest/v1/app_settings?select=id,gym_timezone,attendance_token_validity_seconds');
  check(
    'app_settings singleton initialised (Asia/Kolkata, 60s)',
    settings.ok &&
      settings.data.length === 1 &&
      settings.data[0].id === 1 &&
      settings.data[0].gym_timezone === 'Asia/Kolkata' &&
      settings.data[0].attendance_token_validity_seconds === 60,
    JSON.stringify(settings.data),
  );

  // 2. Member signup + provisioning --------------------------------------
  section('Member signup and profile provisioning');
  const signup = await call('/auth/v1/signup', {
    method: 'POST',
    body: {
      email: memberEmail,
      password,
      data: { full_name: 'Readiness Member', phone: memberPhone },
    },
  });
  check('member signup returns a session', signup.ok && Boolean(signup.data.access_token), `HTTP ${signup.status} ${errText(signup)}`);
  const memberId = signup.data.user?.id;
  const memberToken = signup.data.access_token;
  check('email is verified automatically in local config', Boolean(signup.data.user?.email_confirmed_at));

  const provisioned = await rpc(
    'provision_member_profile',
    { p_display_name: 'Readiness Member', p_phone: memberPhone },
    memberToken,
  );
  check('provision_member_profile succeeds for the caller', provisioned.ok, `HTTP ${provisioned.status} ${errText(provisioned)}`);
  check('provisioning returns the caller id', String(provisioned.data).replace(/"/g, '') === memberId);

  const memberProfile = await call(
    `/rest/v1/profiles?select=id,role,display_name,phone&id=eq.${memberId}`,
    { token: memberToken },
  );
  check(
    'member profile has the immutable member role',
    memberProfile.ok &&
      memberProfile.data.length === 1 &&
      memberProfile.data[0].role === 'member',
    JSON.stringify(memberProfile.data),
  );

  const rolePatch = await call(`/rest/v1/profiles?id=eq.${memberId}`, {
    method: 'PATCH',
    token: memberToken,
    body: { role: 'owner' },
    headers: { Prefer: 'return=representation' },
  });
  check('member cannot update profiles.role (no UPDATE grant)', !rolePatch.ok, `HTTP ${rolePatch.status}`);

  const roleAfterPatch = await serviceSelect(`/rest/v1/profiles?select=role&id=eq.${memberId}`);
  check('role is unchanged after the attempt', roleAfterPatch.data?.[0]?.role === 'member');

  const otherProfiles = await call('/rest/v1/profiles?select=id,role', { token: memberToken });
  check(
    'member sees only their own profile row',
    otherProfiles.ok && otherProfiles.data.length === 1 && otherProfiles.data[0].id === memberId,
    `rows=${otherProfiles.data?.length}`,
  );

  // 3. Member phone verification (local test OTP) -------------------------
  section('Member phone verification');
  const phoneRequest = await call('/auth/v1/user', {
    method: 'PUT',
    token: memberToken,
    body: { phone: memberPhone },
  });
  check('phone change OTP request accepted', phoneRequest.ok, `HTTP ${phoneRequest.status} ${errText(phoneRequest)}`);
  check(
    'phone is not confirmed before the OTP is verified',
    phoneRequest.ok && !phoneRequest.data?.phone_confirmed_at,
    JSON.stringify({ phone: phoneRequest.data?.phone, phone_confirmed_at: phoneRequest.data?.phone_confirmed_at }),
  );

  const phoneVerify = await call('/auth/v1/verify', {
    method: 'POST',
    body: { phone: memberPhone, token: '123456', type: 'phone_change' },
  });
  check(
    'phone OTP verifies and phone_confirmed_at is set',
    phoneVerify.ok && Boolean(phoneVerify.data.user?.phone_confirmed_at),
    `HTTP ${phoneVerify.status} ${errText(phoneVerify)}`,
  );

  // 4. Email verification (local mail catcher) ---------------------------
  section('Member email verification');
  const emailRequest = await call('/auth/v1/otp', {
    method: 'POST',
    body: { email: emailProbe, create_user: true },
  });
  check('email OTP request accepted', emailRequest.ok, `HTTP ${emailRequest.status} ${errText(emailRequest)}`);

  const emailCode = await fetchEmailCode(emailProbe);
  check(
    'email OTP is delivered to the local mail catcher',
    Boolean(emailCode),
    emailCode ? '6-digit code found' : 'no 6-digit code in Mailpit',
  );

  const emailVerify = emailCode
    ? await call('/auth/v1/verify', {
        method: 'POST',
        body: { email: emailProbe, token: emailCode, type: 'email' },
      })
    : null;
  check(
    'email OTP verifies (type=email) and email_confirmed_at is set',
    Boolean(emailVerify?.ok && emailVerify.data?.user?.email_confirmed_at),
    emailVerify ? `HTTP ${emailVerify.status}` : 'skipped: no code delivered',
  );

  // 5. Staff creation + TOTP/AAL2 ----------------------------------------
  section('Staff MFA (TOTP) and AAL2');
  const owner = await createStaff(ownerEmail, password, 'Readiness Owner', 'owner');
  const rec1 = await createStaff(rec1Email, password, 'Readiness Rec One', 'receptionist');
  const rec2 = await createStaff(rec2Email, password, 'Readiness Rec Two', 'receptionist');
  const rec3 = await createStaff(rec3Email, password, 'Readiness Rec Three', 'receptionist');

  check('staff sign-in starts at aal1', jwtClaims(owner.aal1)?.aal !== 'aal2');

  await enrollAndReachAal2(owner);
  await enrollAndReachAal2(rec1);
  await enrollAndReachAal2(rec2);
  await enrollAndReachAal2(rec3);

  check('owner TOTP verification yields an aal2 JWT', jwtClaims(owner.aal2)?.aal === 'aal2');
  check('receptionist TOTP verification yields an aal2 JWT', jwtClaims(rec1.aal2)?.aal === 'aal2');
  check('fresh aal1 token is still aal1 after enrollment', jwtClaims(rec1.aal1)?.aal !== 'aal2');

  // 5. Session ↔ profile linkage -----------------------------------------
  section('Session to profile linkage');
  for (const [label, staff, role] of [
    ['owner', owner, 'owner'],
    ['receptionist 1', rec1, 'receptionist'],
    ['receptionist 2', rec2, 'receptionist'],
  ]) {
    const own = await call(`/rest/v1/profiles?select=id,role&id=eq.${staff.id}`, { token: staff.aal2 });
    check(
      `${label} session resolves to its own ${role} profile`,
      own.ok && own.data.length === 1 && own.data[0].role === role,
      JSON.stringify(own.data),
    );
  }
  const staffDirectory = await call('/rest/v1/profiles?select=id,role', { token: rec1.aal2 });
  check('staff can read the profile directory', staffDirectory.ok && staffDirectory.data.length >= 4, `rows=${staffDirectory.data?.length}`);

  // 6. Application decision creates the linked member row -----------------
  section('Join application decision and member linkage');
  const application = await call('/rest/v1/join_applications', {
    method: 'POST',
    service: true,
    body: {
      auth_user_id: memberId,
      full_name: 'Readiness Member',
      phone: memberPhone,
      email: memberEmail,
      plan_id: monthly.id,
      state: 'submitted',
      phone_verified: true,
      email_verified: true,
    },
    headers: { Prefer: 'return=representation' },
  });
  check('service can create a submitted application', application.ok && application.data.length === 1, `HTTP ${application.status} ${errText(application)}`);

  const applicationId = application.data?.[0]?.id;
  const decided = await rpc('decide_application', { p_application_id: applicationId, p_approve: true }, rec1.aal1);
  check('receptionist approves the application without AAL2', decided.ok && Boolean(decided.data), `HTTP ${decided.status} ${errText(decided)}`);
  check(
    'decision returns the application id',
    String(decided.data).replace(/"/g, '') === applicationId,
    String(decided.data),
  );

  const linkedMember = await serviceSelect(
    `/rest/v1/members?select=id,auth_user_id,plan_id,price_locked&auth_user_id=eq.${memberId}`,
  );
  const memberRowId = linkedMember.data?.[0]?.id;
  check(
    'joining creates exactly one member linked to the auth user and plan',
    linkedMember.ok &&
      linkedMember.data.length === 1 &&
      linkedMember.data[0].auth_user_id === memberId &&
      linkedMember.data[0].plan_id === monthly.id,
    JSON.stringify(linkedMember.data),
  );

  // 7. Payment write + verification gates ---------------------------------
  section('Payments, verification and AAL2 gates');
  const payment = await call('/rest/v1/payments', {
    method: 'POST',
    token: rec1.aal2,
    body: { member_id: memberRowId, plan_id: monthly.id, method: 'cash' },
    headers: { Prefer: 'return=representation' },
  });
  check(
    'receptionist records a payment (server override -> awaitingVerification)',
    payment.ok && payment.data?.[0]?.state === 'awaitingVerification',
    `HTTP ${payment.status} ${errText(payment)}`,
  );
  const paymentId = payment.data?.[0]?.id;
  check('payment attribution is the recording receptionist', payment.data?.[0]?.recorded_by === rec1.id);

  const rec1SelfVerify = await rpc('verify_payment', { p_payment_id: paymentId }, rec1.aal2);
  check(
    'recording receptionist cannot verify their own payment',
    !rec1SelfVerify.ok && /Self-verification/i.test(errText(rec1SelfVerify)),
    errText(rec1SelfVerify),
  );

  const aal1Verify = await rpc('verify_payment', { p_payment_id: paymentId }, rec1.aal1);
  check(
    'verify_payment at aal1 is refused by the AAL2 gate',
    !aal1Verify.ok && /AAL2/i.test(errText(aal1Verify)),
    errText(aal1Verify),
  );

  const ownerVerify = await rpc('verify_payment', { p_payment_id: paymentId }, owner.aal2);
  check(
    'owner is refused payment verification (receptionist-only)',
    !ownerVerify.ok && /Insufficient role/i.test(errText(ownerVerify)),
    errText(ownerVerify),
  );

  const rec2Verify = await rpc('verify_payment', { p_payment_id: paymentId }, rec2.aal2);
  check('different receptionist verifies the payment at aal2', rec2Verify.ok, `HTTP ${rec2Verify.status} ${errText(rec2Verify)}`);

  const verifiedPayment = await serviceSelect(
    `/rest/v1/payments?select=id,state,verified_by,verified_at&id=eq.${paymentId}`,
  );
  check(
    'payment is verified by receptionist 2 with a timestamp',
    verifiedPayment.ok &&
      verifiedPayment.data[0]?.state === 'verified' &&
      verifiedPayment.data[0]?.verified_by === rec2.id &&
      Boolean(verifiedPayment.data[0]?.verified_at),
    JSON.stringify(verifiedPayment.data),
  );

  const periods = await serviceSelect(
    `/rest/v1/membership_periods?select=id,start_date,end_date&member_id=eq.${memberRowId}`,
  );
  check('verification created exactly one membership period', periods.ok && periods.data.length === 1, `rows=${periods.data?.length}`);

  const memberAfterVerify = await serviceSelect(
    `/rest/v1/members?select=membership_end&id=eq.${memberRowId}`,
  );
  check('membership_end was extended by the verified payment', Boolean(memberAfterVerify.data?.[0]?.membership_end));

  const aal1Reversal = await rpc(
    'create_reversal',
    { p_original_payment_id: paymentId, p_amount: 100, p_note: 'readiness' },
    rec3.aal1,
  );
  check(
    'create_reversal at aal1 is refused by the AAL2 gate',
    !aal1Reversal.ok && /AAL2/i.test(errText(aal1Reversal)),
    errText(aal1Reversal),
  );

  const reversal = await rpc(
    'create_reversal',
    { p_original_payment_id: paymentId, p_amount: 100, p_note: 'readiness' },
    rec3.aal2,
  );
  check('segregated receptionist creates a reversal at aal2', reversal.ok, `HTTP ${reversal.status} ${errText(reversal)}`);

  const reversalRow = await serviceSelect(
    `/rest/v1/payments?select=id,entry_type,reversal_of,payable&id=eq.${String(reversal.data).replace(/"/g, '')}`,
  );
  check(
    'reversal row is append-only and points at the original',
    reversalRow.ok &&
      reversalRow.data[0]?.entry_type === 'reversal' &&
      reversalRow.data[0]?.reversal_of === paymentId,
    JSON.stringify(reversalRow.data),
  );

  const aal1Freeze = await rpc(
    'decide_freeze',
    { p_freeze_id: crypto.randomUUID(), p_approve: true },
    rec3.aal1,
  );
  check(
    'decide_freeze at aal1 is refused by the AAL2 gate',
    !aal1Freeze.ok && /AAL2/i.test(errText(aal1Freeze)),
    errText(aal1Freeze),
  );

  const aal2Freeze = await rpc(
    'decide_freeze',
    { p_freeze_id: crypto.randomUUID(), p_approve: true },
    rec3.aal2,
  );
  check(
    'decide_freeze at aal2 passes the gate and reports not-found',
    !aal2Freeze.ok && /not found/i.test(errText(aal2Freeze)),
    errText(aal2Freeze),
  );

  const ownerFreeze = await rpc(
    'decide_freeze',
    { p_freeze_id: crypto.randomUUID(), p_approve: true },
    owner.aal2,
  );
  check(
    'owner cannot decide freezes (receptionist-only)',
    !ownerFreeze.ok && /Insufficient role/i.test(errText(ownerFreeze)),
    errText(ownerFreeze),
  );

  // 8. Settings-dependent RPCs -------------------------------------------
  section('Settings-dependent RPCs');
  const aal1Mint = await rpc('mint_attendance_token', {}, rec1.aal1);
  check(
    'mint_attendance_token at aal1 is refused by the AAL2 gate',
    !aal1Mint.ok && /AAL2/i.test(errText(aal1Mint)),
    errText(aal1Mint),
  );

  const minted = await rpc('mint_attendance_token', {}, rec1.aal2);
  check('mint_attendance_token succeeds with initialised settings', minted.ok && /^[0-9a-f]{64}$/.test(String(minted.data).replace(/"/g, '')), `HTTP ${minted.status} ${errText(minted)}`);

  const tokenHash = crypto.createHash('sha256').update(String(minted.data).replace(/"/g, ''), 'utf8').digest('hex');
  const tokenRow = await serviceSelect(`/rest/v1/qr_tokens?select=id,expires_at,created_at&token_hash=eq.${tokenHash}`);
  check(
    'minted token is stored hash-only with the default 60s lifetime',
    tokenRow.ok &&
      tokenRow.data.length === 1 &&
      Math.round((new Date(tokenRow.data[0].expires_at) - new Date(tokenRow.data[0].created_at)) / 1000) === 60,
    JSON.stringify(tokenRow.data),
  );

  const rec1Settings = await rpc(
    'update_gym_settings',
    { p_gym_timezone: 'UTC', p_attendance_token_validity_seconds: 120 },
    rec1.aal2,
  );
  check(
    'receptionist cannot update gym settings',
    !rec1Settings.ok && /Insufficient role/i.test(errText(rec1Settings)),
    errText(rec1Settings),
  );

  const ownerSettings = await rpc(
    'update_gym_settings',
    { p_gym_timezone: 'UTC', p_attendance_token_validity_seconds: 120 },
    owner.aal2,
  );
  check('owner updates gym settings', ownerSettings.ok, `HTTP ${ownerSettings.status} ${errText(ownerSettings)}`);

  const changed = await serviceSelect('/rest/v1/app_settings?select=gym_timezone,attendance_token_validity_seconds&id=eq.1');
  check(
    'settings change is persisted',
    changed.ok &&
      changed.data[0]?.gym_timezone === 'UTC' &&
      changed.data[0]?.attendance_token_validity_seconds === 120,
    JSON.stringify(changed.data),
  );

  const restored = await rpc(
    'update_gym_settings',
    { p_gym_timezone: 'Asia/Kolkata', p_attendance_token_validity_seconds: 60 },
    owner.aal2,
  );
  check('owner restores the seeded settings', restored.ok, errText(restored));

  const cleared = await rpc(
    'update_gym_settings',
    { p_gym_timezone: 'Asia/Kolkata', p_attendance_token_validity_seconds: 60 },
    owner.aal2,
  );
  check('settings RPC remains idempotent', cleared.ok, errText(cleared));

  // =====================================================================
  // Stage 5 — remaining write paths: member contact, plan lifecycle,
  //          join application submission.
  // =====================================================================
  section('Stage 5 write paths');

const contactUpdate = await rpc(
  'update_member_contact',
  { p_member_id: memberRowId, p_phone: '+919800000077', p_email: '3b8-contact-alt@example.com' },
  rec1.aal2,
);
check('receptionist updates member contact at aal2', contactUpdate.ok, `HTTP ${contactUpdate.status} ${errText(contactUpdate)}`);

const contactUpdateAal1 = await rpc(
  'update_member_contact',
  { p_member_id: memberRowId, p_phone: '+919800000078', p_email: null },
  rec1.aal1,
);
check('receptionist member contact update at aal1 -> MFA required', !contactUpdateAal1.ok && /multi-factor/i.test(errText(contactUpdateAal1)), errText(contactUpdateAal1));

const ownerContact = await rpc(
  'update_member_contact',
  { p_member_id: memberRowId, p_phone: '+919800000079', p_email: null },
  owner.aal2,
);
check('owner cannot update member contact (receptionist-only)', !ownerContact.ok && /Insufficient role/i.test(errText(ownerContact)), errText(ownerContact));

const createdPlan = await rpc(
  'create_plan',
  { p_name: 'Readiness New Plan', p_duration: 'quarterly', p_price: 4500, p_currency: 'INR', p_is_active: true },
  owner.aal2,
);
check('owner creates plan', createdPlan.ok, `HTTP ${createdPlan.status} ${errText(createdPlan)}`);

const recCreatePlan = await rpc(
  'create_plan',
  { p_name: 'Readiness Bad Plan', p_duration: 'quarterly', p_price: 4500, p_currency: 'INR', p_is_active: true },
  rec1.aal2,
);
check('receptionist cannot create plan', !recCreatePlan.ok && /Insufficient role/i.test(errText(recCreatePlan)), errText(recCreatePlan));

const monthlyPlan = (plans.data ?? []).find((p) => p.name === 'Monthly');
const deactivatedPlan = monthlyPlan
  ? await rpc('deactivate_plan', { p_plan_id: monthlyPlan.id }, owner.aal2)
  : { ok: false, status: 500, data: null, error: null, text: 'no monthly plan' };
check('owner deactivates plan', deactivatedPlan.ok, `HTTP ${deactivatedPlan.status} ${errText(deactivatedPlan)}`);

  // The primary readiness member already applied and was decided earlier in
  // this run (section 6); join_applications.auth_user_id is one-per-member.
  // The member-self submission check therefore uses a second application-free member.
  const secondSignup = await call('/auth/v1/signup', {
    method: 'POST',
    body: { email: `readiness-member2-${suffix}@local.test`, password, data: { full_name: 'Readiness Member Two', phone: '+919800000003' } },
  });
  check('second readiness member signup returns a session', secondSignup.ok && Boolean(secondSignup.data.access_token), `HTTP ${secondSignup.status} ${errText(secondSignup)}`);
  const secondMemberToken = secondSignup.data.access_token;
  const secondProvisioned = await rpc('provision_member_profile', { p_display_name: 'Readiness Member Two', p_phone: '+919800000003' }, secondMemberToken);
  check('second readiness member provisioned', secondProvisioned.ok, `HTTP ${secondProvisioned.status} ${errText(secondProvisioned)}`);

const joinSubmit = await rpc(
  'submit_join_application',
  { p_full_name: 'Readiness Applicant', p_phone: '+919800000088', p_email: 'readiness-applicant@example.com', p_plan_id: monthlyPlan?.id ?? 'aaaaaaaa-0000-0000-0000-000000000001' },
  secondMemberToken,
);
check('member submits own join application', joinSubmit.ok, `HTTP ${joinSubmit.status} ${errText(joinSubmit)}`);

const ownerJoinSubmit = await rpc(
  'submit_join_application',
  { p_full_name: 'Readiness Owner Applicant', p_phone: '+919800000089', p_email: 'readiness-owner@example.com', p_plan_id: 'aaaaaaaa-0000-0000-0000-000000000001' },
  owner.aal2,
);
check('owner cannot submit join application', !ownerJoinSubmit.ok && /Insufficient role/i.test(errText(ownerJoinSubmit)), errText(ownerJoinSubmit));

} catch (error) {
  failures += 1;
  console.error(`\nFATAL  ${error instanceof Error ? error.message : String(error)}`);
} finally {
  console.log(`\n== Verdict ==`);
  const passed = results.filter((r) => r.ok).length;
  console.log(`backend readiness: ${passed} of ${results.length} checks passed, ${failures} failure(s)`);
  if (!KEEP) {
    await cleanup(suffix);
  } else {
    console.log('INFO  --keep supplied: readiness fixtures left in place');
  }
  process.exit(failures === 0 ? 0 : 1);
}
