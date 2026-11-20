#!/usr/bin/env node
/**
 * Phase 4 — Stage 2 frontend read visibility check (LOCAL ONLY).
 *
 * Proves, with real authenticated sessions against the local Supabase stack,
 * that the read layer the app uses returns only what each role is allowed to
 * see:
 *
 *   - Member  → own v_member_status row, own payments, own attendance, the
 *               active plan catalogue, and NO staff report rows.
 *   - Receptionist / Owner → every member, payment and attendance row, plus
 *               the v_daily_report / v_month_revenue aggregates.
 *
 * It exercises the exact column lists the client selects (services/data/
 * queries.ts) through PostgREST, so a missing grant or column fails here
 * before it fails on a device.
 *
 * Safety:
 *   - Refuses any API URL that is not 127.0.0.1 / localhost.
 *   - Reads the local stack's URL and keys from `supabase status -o env` at
 *     runtime (or from SUPABASE_* env overrides). No key is stored in the
 *     repository.
 *   - Fixtures are prefixed `frontend-role-` and removed through the local
 *     Postgres container unless `--keep` is passed.
 *
 * Usage:
 *   node scripts/frontend-role-visibility-check.mjs
 *   node scripts/frontend-role-visibility-check.mjs --keep
 */
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { resolveLocalStack } from './local-stack.mjs';

const stack = resolveLocalStack();
const API_URL = stack.apiUrl.replace(/\/+$/, '');
const PUBLISHABLE_KEY = stack.publishableKey;
const SECRET_KEY = stack.secretKey;
const DB_CONTAINER = process.env.SUPABASE_DB_CONTAINER ?? 'supabase_db_GYM_Management';
const KEEP = process.argv.includes('--keep');

if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(API_URL)) {
  console.error(`Refusing to run against a non-local API URL: ${API_URL}`);
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

function select(path, token) {
  return call(path, { token });
}

function ids(rows) {
  return new Set((rows ?? []).map((row) => row.member_id ?? row.id));
}

function hasAll(rows, expected) {
  const set = ids(rows);
  return expected.every((id) => set.has(id));
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

async function createUser(email, password, displayName, role) {
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
  return { id: user.id, email, password, role };
}

async function signIn(user) {
  const session = await call('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: { email: user.email, password: user.password },
  });
  if (!session.ok) throw new Error(`sign in ${user.email}: ${errText(session)}`);
  user.aal1 = session.data.access_token;
  user.token = session.data.access_token;
}

async function reachAal2(user) {
  const enroll = await call('/auth/v1/factors', {
    method: 'POST',
    token: user.aal1,
    body: { factor_type: 'totp', friendly_name: `frontend-role-${user.email}` },
  });
  if (!enroll.ok) throw new Error(`enroll TOTP ${user.email}: ${errText(enroll)}`);
  const factorId = enroll.data.id;
  const secret = enroll.data.totp?.secret;

  const challenge = await call(`/auth/v1/factors/${factorId}/challenge`, {
    method: 'POST',
    token: user.aal1,
    body: {},
  });
  if (!challenge.ok) throw new Error(`challenge ${user.email}: ${errText(challenge)}`);
  const verified = await call(`/auth/v1/factors/${factorId}/verify`, {
    method: 'POST',
    token: user.aal1,
    body: { challenge_id: challenge.data.id, code: totp(secret) },
  });
  if (!verified.ok) throw new Error(`verify TOTP ${user.email}: ${errText(verified)}`);
  user.aal2 = verified.data.access_token;
  user.token = verified.data.access_token;
}

function psql(sql) {
  const proc = spawnSync(
    'docker',
    ['exec', '-i', DB_CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-t', '-A'],
    { input: sql, encoding: 'utf8' },
  );
  return proc;
}

async function cleanup() {
  const sql = `
begin;
create temp table _u on commit drop as
  select id from auth.users where email like 'frontend-role-%@local.test';
create temp table _m on commit drop as
  select id from public.members where email like 'frontend-role-%@local.test';
delete from public.membership_period_voids
 where period_id in (select id from public.membership_periods where member_id in (select id from _m));
delete from public.attendance_events where member_id in (select id from _m);
delete from public.membership_freezes where member_id in (select id from _m);
delete from public.follow_up_events where member_id in (select id from _m);
delete from public.membership_periods where member_id in (select id from _m);
delete from public.payments where member_id in (select id from _m);
delete from public.qr_tokens where minted_by in (select id from _u);
delete from public.join_applications
 where auth_user_id in (select id from _u) or email like 'frontend-role-%@local.test';
delete from public.members where id in (select id from _m);
delete from public.audit_log_entries where actor in (select id from _u);
delete from public.profiles where id in (select id from _u);
delete from auth.users where id in (select id from _u);
commit;
`;
  const proc = psql(sql);
  if (proc.status !== 0) {
    console.log(`WARN  fixture cleanup failed: ${proc.stderr?.trim() || proc.error?.message || 'docker unavailable'}`);
  } else {
    console.log('INFO  frontend-role fixtures removed');
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const password = 'Frontend#1';
const ownerEmail = `frontend-role-owner-${suffix}@local.test`;
const recEmail = `frontend-role-rec-${suffix}@local.test`;
const memberAEmail = `frontend-role-member-a-${suffix}@local.test`;
const memberBEmail = `frontend-role-member-b-${suffix}@local.test`;

try {
  section('Fixtures');
  const owner = await createUser(ownerEmail, password, 'Frontend Owner', 'owner');
  const rec = await createUser(recEmail, password, 'Frontend Receptionist', 'receptionist');
  const memberA = await createUser(memberAEmail, password, 'Frontend Member A', 'member');
  const memberB = await createUser(memberBEmail, password, 'Frontend Member B', 'member');

  await signIn(owner);
  await signIn(rec);
  await signIn(memberA);
  await signIn(memberB);
  await reachAal2(owner);
  await reachAal2(rec);

  const seed = psql(`
begin;
do $$
declare
  v_owner uuid := (select id from auth.users where email = '${ownerEmail}');
  v_rec uuid := (select id from auth.users where email = '${recEmail}');
  v_member_a uuid;
  v_member_b uuid;
  v_plan uuid := (select id from public.plans where name = 'Monthly');
  v_payment_a uuid;
  v_payment_b uuid;
  v_token uuid;
begin
  if v_owner is null or v_rec is null or v_plan is null then
    raise exception 'fixture prerequisites missing';
  end if;

  insert into public.members (full_name, phone, email, plan_id, price_locked, membership_end, joined_on, auth_user_id)
  values ('Frontend Member A', '+919700000101', '${memberAEmail}', v_plan, 1500, current_date + 20, current_date - 60, (select id from auth.users where email = '${memberAEmail}'))
  returning id into v_member_a;

  insert into public.members (full_name, phone, email, plan_id, price_locked, membership_end, joined_on, auth_user_id)
  values ('Frontend Member B', '+919700000102', '${memberBEmail}', v_plan, 1500, current_date - 10, current_date - 90, (select id from auth.users where email = '${memberBEmail}'))
  returning id into v_member_b;

  insert into public.payments
    (member_id, plan_id, entry_type, original_price, discount_pct, discount_amount, payable,
     method, state, recorded_by, verified_by, recorded_at, verified_at)
  values
    (v_member_a, v_plan, 'payment', 1500, 0, 0, 1500, 'cash', 'verified', v_rec, v_rec, now(), now())
  returning id into v_payment_a;

  insert into public.payments
    (member_id, plan_id, entry_type, original_price, discount_pct, discount_amount, payable,
     method, state, recorded_by, verified_by, recorded_at, verified_at)
  values
    (v_member_b, v_plan, 'payment', 1500, 0, 0, 1500, 'cash', 'verified', v_rec, v_rec,
     now() - interval '40 days', now() - interval '40 days')
  returning id into v_payment_b;

  insert into public.membership_periods (member_id, plan_id, start_date, end_date, price_applied, created_by_payment)
  values (v_member_a, v_plan, current_date, current_date + 20, 1500, v_payment_a);

  insert into public.membership_periods (member_id, plan_id, start_date, end_date, price_applied, created_by_payment)
  values (v_member_b, v_plan, current_date - 40, current_date - 10, 1500, v_payment_b);

  insert into public.qr_tokens (token_hash, expires_at, minted_by)
  values (encode(sha256('frontend-role-${suffix}'::bytea), 'hex'), now() + interval '1 hour', v_rec)
  returning id into v_token;

  insert into public.attendance_events (member_id, token_id, door, status, checked_in_at)
  values (v_member_a, v_token, 'Main door', 'verified', now());

  raise notice 'member_a=% member_b=%', v_member_a, v_member_b;
end $$;
commit;
`);

  check('fixture SQL applied', seed.status === 0, seed.stderr?.trim()?.replace(/\s+/g, ' ').slice(0, 300));

  const memberIds = psql(
    `select id, email from public.members where email like 'frontend-role-member-%' order by email;`,
  );
  const rows = memberIds.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [id, email] = line.split('|');
      return { id, email };
    });
  const memberAId = rows.find((row) => row.email === memberAEmail)?.id;
  const memberBId = rows.find((row) => row.email === memberBEmail)?.id;
  check('two member fixtures linked to auth users', Boolean(memberAId && memberBId), `${rows.length} row(s)`);

  const STATUS_COLUMNS =
    'member_id,full_name,phone,email,plan_id,plan_name,plan_duration,price_locked,discount_pct,' +
    'stored_membership_end,joined_on,auth_user_id,status,effective_expiry,days_remaining,is_frozen,' +
    'active_freeze_count,gym_date';
  const PAYMENT_COLUMNS =
    'id,member_id,plan_id,entry_type,original_price,discount_pct,discount_amount,payable,method,utr,' +
    'state,receipt_issued,recorded_by,verified_by,recorded_at,verified_at,reversal_of,note';
  const ATTENDANCE_COLUMNS = 'id,member_id,door,status,checked_in_at';
  const REPORT_COLUMNS =
    'report_date,today,gross,reversals,net,attendance,unique_visitors,new_members,renewals,discounts,refunds';
  const MONTH_COLUMNS =
    'report_month,today,gross,reversals,net,attendance,unique_visitors,new_members,renewals,discounts,refunds';
  const PLAN_COLUMNS = 'id,name,duration,price,currency,is_active';

  // -- Member A: own rows only ---------------------------------------------
  section('Member session reads');
  const memberStatus = await select(`/rest/v1/v_member_status?select=${STATUS_COLUMNS}`, memberA.token);
  check(
    'member reads exactly their own v_member_status row',
    memberStatus.ok && memberStatus.data.length === 1 && memberStatus.data[0].member_id === memberAId,
    `HTTP ${memberStatus.status}, rows=${memberStatus.data?.length}`,
  );
  check(
    'member status carries the real status/expiry columns',
    memberStatus.ok &&
      memberStatus.data[0]?.status === 'active' &&
      Boolean(memberStatus.data[0]?.effective_expiry) &&
      memberStatus.data[0]?.plan_name === 'Monthly',
    JSON.stringify(memberStatus.data?.[0] ?? {}).slice(0, 240),
  );

  const memberFiltered = await select(
    `/rest/v1/v_member_status?select=member_id&member_id=eq.${memberBId}`,
    memberA.token,
  );
  check(
    'member cannot read another member through v_member_status',
    memberFiltered.ok && memberFiltered.data.length === 0,
    `rows=${memberFiltered.data?.length}`,
  );

  const memberRaw = await select(`/rest/v1/members?select=id,full_name,auth_user_id`, memberA.token);
  check(
    'members table RLS exposes only the linked member row',
    memberRaw.ok && memberRaw.data.length === 1 && memberRaw.data[0].id === memberAId,
    `rows=${memberRaw.data?.length}`,
  );

  const memberPayments = await select(`/rest/v1/payments?select=${PAYMENT_COLUMNS}`, memberA.token);
  check(
    'member reads only their own payment rows',
    memberPayments.ok &&
      memberPayments.data.length === 1 &&
      memberPayments.data[0].member_id === memberAId &&
      memberPayments.data[0].state === 'verified',
    `rows=${memberPayments.data?.length}`,
  );

  const memberAttendance = await select(
    `/rest/v1/attendance_events?select=${ATTENDANCE_COLUMNS}`,
    memberA.token,
  );
  check(
    'member reads only their own attendance rows',
    memberAttendance.ok &&
      memberAttendance.data.length === 1 &&
      memberAttendance.data[0].member_id === memberAId,
    `rows=${memberAttendance.data?.length}`,
  );

  const memberPlans = await select(`/rest/v1/plans?select=${PLAN_COLUMNS}`, memberA.token);
  check(
    'member reads the active plan catalogue',
    memberPlans.ok && memberPlans.data.length >= 4 && memberPlans.data.every((plan) => plan.is_active),
    `rows=${memberPlans.data?.length}`,
  );

  const memberDaily = await select(`/rest/v1/v_daily_report?select=${REPORT_COLUMNS}`, memberA.token);
  check(
    'member gets no v_daily_report rows (staff gate)',
    memberDaily.ok && memberDaily.data.length === 0,
    `HTTP ${memberDaily.status}, rows=${memberDaily.data?.length}`,
  );

  const memberMonthly = await select(`/rest/v1/v_month_revenue?select=${MONTH_COLUMNS}`, memberA.token);
  check(
    'member gets no v_month_revenue rows (staff gate)',
    memberMonthly.ok && memberMonthly.data.length === 0,
    `HTTP ${memberMonthly.status}, rows=${memberMonthly.data?.length}`,
  );

  const memberInactive = await select(
    `/rest/v1/v_inactive_members?select=member_id,full_name,membership_end,last_successful_attendance_date,inactive_days,is_inactive,gym_date`,
    memberA.token,
  );
  check(
    'member inactive view exposes no other member',
    memberInactive.ok && !hasAll(memberInactive.data, [memberBId]),
    `rows=${memberInactive.data?.length}`,
  );

  const memberFollowUps = await select('/rest/v1/follow_up_events?select=id,member_id', memberA.token);
  check(
    'member cannot read follow-up events',
    memberFollowUps.ok && memberFollowUps.data.length === 0,
    `HTTP ${memberFollowUps.status}, rows=${memberFollowUps.data?.length}`,
  );

  const memberProfiles = await select('/rest/v1/profiles?select=id,role', memberA.token);
  check(
    'member reads only their own profile',
    memberProfiles.ok && memberProfiles.data.length === 1 && memberProfiles.data[0].role === 'member',
    `rows=${memberProfiles.data?.length}`,
  );

  // -- Receptionist: full operational read ---------------------------------
  section('Receptionist session reads');
  const recStatus = await select(`/rest/v1/v_member_status?select=${STATUS_COLUMNS}`, rec.token);
  check(
    'receptionist sees every member status row',
    recStatus.ok && hasAll(recStatus.data, [memberAId, memberBId]),
    `HTTP ${recStatus.status}, rows=${recStatus.data?.length}`,
  );

  const recPayments = await select(`/rest/v1/payments?select=${PAYMENT_COLUMNS}`, rec.token);
  check(
    'receptionist sees both fixture payments',
    recPayments.ok && hasAll(recPayments.data, [memberAId, memberBId]),
    `rows=${recPayments.data?.length}`,
  );

  const recAttendance = await select(
    `/rest/v1/attendance_events?select=${ATTENDANCE_COLUMNS}`,
    rec.token,
  );
  check(
    'receptionist sees member attendance',
    recAttendance.ok && recAttendance.data.some((row) => row.member_id === memberAId),
    `rows=${recAttendance.data?.length}`,
  );

  const recInactive = await select(
    `/rest/v1/v_inactive_members?select=member_id,full_name,membership_end,last_successful_attendance_date,inactive_days,is_inactive,gym_date`,
    rec.token,
  );
  check(
    'receptionist sees member inactivity metrics for both fixtures',
    recInactive.ok && hasAll(recInactive.data, [memberAId, memberBId]),
    `rows=${recInactive.data?.length}`,
  );
  check(
    'expired fixture is flagged inactive',
    recInactive.ok &&
      recInactive.data.some((row) => row.member_id === memberBId && row.is_inactive === true),
    `rows=${recInactive.data?.length}`,
  );
  check(
    'active fixture with a visit today is not flagged inactive',
    recInactive.ok &&
      recInactive.data.some((row) => row.member_id === memberAId && row.is_inactive === false),
    `rows=${recInactive.data?.length}`,
  );

  const recDaily = await select(`/rest/v1/v_daily_report?select=${REPORT_COLUMNS}&order=report_date.desc`, rec.token);
  const recToday = recDaily.data?.[0];
  check(
    'receptionist reads today’s daily report with real aggregates',
    recDaily.ok &&
      recToday?.report_date === recToday?.today &&
      recToday?.net >= 1500 &&
      recToday?.attendance >= 1 &&
      recToday?.unique_visitors >= 1,
    `HTTP ${recDaily.status}, ${JSON.stringify(recToday ?? {}).slice(0, 220)}`,
  );

  const recMonthly = await select(
    `/rest/v1/v_month_revenue?select=${MONTH_COLUMNS}&order=report_month.desc`,
    rec.token,
  );
  check(
    'receptionist reads the current month revenue row',
    recMonthly.ok &&
      recMonthly.data.length >= 1 &&
      recMonthly.data[0].report_month.slice(0, 7) === recMonthly.data[0].today.slice(0, 7) &&
      recMonthly.data[0].net >= 1500,
    `HTTP ${recMonthly.status}, ${JSON.stringify(recMonthly.data?.[0] ?? {}).slice(0, 220)}`,
  );

  const recFollowUps = await select('/rest/v1/follow_up_events?select=id,member_id', rec.token);
  check('receptionist can read follow-up events', recFollowUps.ok, `HTTP ${recFollowUps.status}`);

  const recApplications = await select('/rest/v1/join_applications?select=id,state', rec.token);
  check('receptionist can read join applications', recApplications.ok, `HTTP ${recApplications.status}`);

  // -- Owner: same operational read plus reports ---------------------------
  section('Owner session reads');
  const ownerStatus = await select(`/rest/v1/v_member_status?select=${STATUS_COLUMNS}`, owner.token);
  check(
    'owner sees every member status row',
    ownerStatus.ok && hasAll(ownerStatus.data, [memberAId, memberBId]),
    `HTTP ${ownerStatus.status}, rows=${ownerStatus.data?.length}`,
  );

  const ownerPayments = await select(`/rest/v1/payments?select=${PAYMENT_COLUMNS}`, owner.token);
  check(
    'owner reads payment rows',
    ownerPayments.ok && hasAll(ownerPayments.data, [memberAId, memberBId]),
    `rows=${ownerPayments.data?.length}`,
  );

  const ownerDaily = await select(`/rest/v1/v_daily_report?select=${REPORT_COLUMNS}`, owner.token);
  check(
    'owner reads the daily report view',
    ownerDaily.ok && ownerDaily.data.length >= 1,
    `HTTP ${ownerDaily.status}, rows=${ownerDaily.data?.length}`,
  );

  const ownerMonthly = await select(`/rest/v1/v_month_revenue?select=${MONTH_COLUMNS}`, owner.token);
  check(
    'owner reads the month revenue view',
    ownerMonthly.ok && ownerMonthly.data.length >= 1,
    `HTTP ${ownerMonthly.status}, rows=${ownerMonthly.data?.length}`,
  );

  const ownerAudit = await select('/rest/v1/audit_log_entries?select=id,action,table_name', owner.token);
  check('owner can read the audit trail', ownerAudit.ok, `HTTP ${ownerAudit.status}`);

  // -- Route registration checks (static, source-of-truth) -----------------
  section('Route registration checks');
  const readSource = (rel) => readFileSync(resolve(process.cwd(), rel), 'utf8');
  const memberLayoutSource = readSource('src/app/(member)/_layout.tsx');
  check('member layout registers the payments route', /name="payments"/.test(memberLayoutSource));
  const ownerLayoutSource = readSource('src/app/(owner)/_layout.tsx');
  for (const route of ['more', 'applications', 'plans', 'settings', 'audit']) {
    check(
      `owner layout registers /${route}`,
      new RegExp(`<Stack\\.Screen name="${route}"`).test(ownerLayoutSource),
      ownerLayoutSource.includes(`<Stack.Screen name="${route}"`) ? 'registered' : 'MISSING',
    );
  }
  const receptionLayoutSource = readSource('src/app/(reception)/_layout.tsx');
  check(
    'reception layout registers the applications route',
    /name="applications"/.test(receptionLayoutSource),
  );

  // -- Cross-role negative checks ------------------------------------------
  section('Negative checks');
  const memberAudit = await select('/rest/v1/audit_log_entries?select=id', memberA.token);
  check(
    'member cannot read the audit trail',
    memberAudit.ok && memberAudit.data.length === 0,
    `HTTP ${memberAudit.status}, rows=${memberAudit.data?.length}`,
  );

  const memberApplications = await select('/rest/v1/join_applications?select=id,state', memberA.token);
  check(
    'member reads no application that is not theirs',
    memberApplications.ok && memberApplications.data.length === 0,
    `rows=${memberApplications.data?.length}`,
  );

  const memberBPayments = await select(
    `/rest/v1/payments?select=${PAYMENT_COLUMNS}&member_id=eq.${memberBId}`,
    memberA.token,
  );
  check(
    'member cannot read another member’s payment rows via member_id filter',
    memberBPayments.ok && memberBPayments.data.length === 0,
    `rows=${memberBPayments.data?.length}`,
  );

  const memberAWildMemberId = await select(
    '/rest/v1/payments?select=id&member_id=eq.00000000-0000-0000-0000-000000000000',
    memberA.token,
  );
  check(
    'member cannot read rows filtered to a member id that is not linked to them',
    memberAWildMemberId.ok && memberAWildMemberId.data.length === 0,
    `rows=${memberAWildMemberId.data?.length}`,
  );

  const anonStatus = await call(`/rest/v1/v_member_status?select=member_id`, {
    token: PUBLISHABLE_KEY,
  });
  check(
    'anonymous requests cannot read member status',
    anonStatus.status === 401 || (anonStatus.ok && anonStatus.data.length === 0),
    `HTTP ${anonStatus.status}, rows=${anonStatus.data?.length}`,
  );
} catch (error) {
  failures += 1;
  console.error(`\nFATAL  ${error instanceof Error ? error.message : String(error)}`);
} finally {
  console.log(`\n== Verdict ==`);
  const passed = results.filter((r) => r.ok).length;
  console.log(`frontend role visibility: ${passed} of ${results.length} checks passed, ${failures} failure(s)`);
  if (!KEEP) {
    await cleanup();
  } else {
    console.log('INFO  --keep supplied: frontend-role fixtures left in place');
  }
  process.exit(failures === 0 ? 0 : 1);
}
