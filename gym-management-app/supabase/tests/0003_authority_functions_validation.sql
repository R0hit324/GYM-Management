-- =====================================================================
-- tests/0003_authority_functions_validation.sql
-- Phase 3B.3 behavioral validation for 0003_authority_functions.sql.
--
-- Prerequisites: local Supabase stack running; database freshly reset
-- (npx supabase db reset) with migrations 0001, 0002 AND 0003 applied;
-- the 3B.1 suite (56) has already run in this state and left its
-- documented fixtures; the 3B.2 suite (123) has already run and cleaned
-- up after itself. This suite's fixture UUIDs (3b3*-prefixed) are
-- disjoint from BOTH, and cleanup removes every trace again.
--
-- Contexts:
--   postgres        — catalog/ACL checks, fixtures, business-rule
--                     sections. Personas are simulated with
--                     SET LOCAL ROLE authenticated + request.jwt GUCs
--                     (session_user stays postgres, so the 0002 payments
--                     override is skipped — irrelevant to 0003 paths).
--   authenticator   — mid-suite `\connect` to the stack's REAL client
--                     login role: genuine RPC-context tests for the AAL2
--                     gates, the transaction-local GUC path in
--                     create_reversal, the pooled-session regression
--                     (audit condition B) and the 0002 override
--                     regression (G05/G06/G07).
--
-- Every negative test pins the expected SQLSTATE class AND a message
-- fragment; an unrelated error is a failure, not a pass. Positive tests
-- reject vacuous 0-row passes. Results live in the persistent
-- suite_results schema, which is dropped again at the end.
-- =====================================================================

drop schema if exists suite_results cascade;
create schema suite_results;

create table suite_results.t_results (
  num    text,
  label  text,
  passed boolean,
  detail text
);
grant usage on schema suite_results to public;
grant all on suite_results.t_results to public;

-- minted tokens are captured here for the check_in sections
create table suite_results.tokens (
  k          text primary key,
  token      text not null,
  token_hash text not null
);
grant all on suite_results.tokens to public;

-- negative helper: statement MUST fail with wanted SQLSTATE class
-- (+ optional message fragment).
create function suite_results.check_fail(
  p_num text, p_label text, p_stmt text, p_want_sqlstate text, p_want_err text default null
) returns void language plpgsql as $cf$
declare
  v_ok    boolean;
  v_detail text;
  v_state text;
  v_msg   text;
begin
  begin
    execute p_stmt;
    v_ok := false;
    v_detail := 'statement unexpectedly succeeded';
  exception when others then
    get stacked diagnostics v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    if left(v_state, 2) <> left(p_want_sqlstate, 2) then
      v_ok := false;
      v_detail := format('SQLSTATE %s (wanted %s): %s', v_state, p_want_sqlstate, v_msg);
    elsif p_want_err is not null and position(lower(p_want_err) in lower(v_msg)) = 0 then
      v_ok := false;
      v_detail := format('wrong violation (SQLSTATE %s, wanted "%s" in message): %s',
                         v_state, p_want_err, v_msg);
    else
      v_ok := true;
      v_detail := format('rejected as expected (SQLSTATE %s): %s', v_state, v_msg);
    end if;
  end;
  insert into suite_results.t_results values (p_num, p_label, v_ok, v_detail);
end $cf$;

-- positive helper: statement MUST succeed AND affect/return > 0 rows.
create function suite_results.check_ok(p_num text, p_label text, p_stmt text)
returns void language plpgsql as $co$
declare
  v_ok    boolean;
  v_detail text;
  v_msg   text;
  v_rows  bigint;
begin
  begin
    execute p_stmt;
    get diagnostics v_rows = ROW_COUNT;
    if v_rows = 0 then
      v_ok := false;
      v_detail := 'statement matched no rows (vacuous pass rejected)';
    else
      v_ok := true;
      v_detail := format('accepted as expected (%s row(s))', v_rows);
    end if;
  exception when others then
    get stacked diagnostics v_msg = MESSAGE_TEXT;
    v_ok := false;
    v_detail := format('expected success, got error: %s', v_msg);
  end;
  insert into suite_results.t_results values (p_num, p_label, v_ok, v_detail);
end $co$;

-- boolean assertion helper.
create function suite_results.check_true(p_num text, p_label text, p_ok boolean, p_detail text)
returns void language plpgsql as $ct$
begin
  insert into suite_results.t_results values (p_num, p_label, p_ok, p_detail);
end $ct$;

-- 3B.3 context: migration 0003's global function default-privilege
-- lockdown removes the engine's built-in PUBLIC EXECUTE from every
-- future function — including these helpers, which non-postgres
-- personas (anon/authenticated blocks) must be able to call. Grant it
-- explicitly; scope is this throwaway schema only (dropped at the end).
grant execute on function suite_results.check_fail(text,text,text,text,text)
  to public;
grant execute on function suite_results.check_ok(text,text,text) to public;
grant execute on function suite_results.check_true(text,text,boolean,text)
  to public;

-- =====================================================================
-- fixtures (as postgres). All UUIDs carry the 3b3 prefix; disjoint from
-- the 0001/0002 suites' fixtures.
-- =====================================================================

-- auth users (12): owner, recA, recB, member1, member2, member4,
-- staff profile (receptionist, unlinked), linked member profile,
-- expired member profile, applicant profile, auth user WITHOUT profile,
-- fake application auth account (no profile either).
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '3b3a1111-0000-0000-0000-000000000001', 'authenticated', 'authenticated', '3b3-owner@example.com',    'x', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '3b3a2222-0000-0000-0000-000000000002', 'authenticated', 'authenticated', '3b3-rec-a@example.com',     'x', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '3b3a9999-0000-0000-0000-000000000009', 'authenticated', 'authenticated', '3b3-rec-b@example.com',     'x', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '3b3a3333-0000-0000-0000-000000000003', 'authenticated', 'authenticated', '3b3-m1@example.com',        'x', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '3b3a4444-0000-0000-0000-000000000004', 'authenticated', 'authenticated', '3b3-m2@example.com',        'x', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '3b3a5555-0000-0000-0000-000000000005', 'authenticated', 'authenticated', '3b3-m4@example.com',        'x', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '3b3a6666-0000-0000-0000-000000000006', 'authenticated', 'authenticated', '3b3-staff@example.com',     'x', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '3b3a7777-0000-0000-0000-000000000007', 'authenticated', 'authenticated', '3b3-linked@example.com',    'x', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '3b3a8888-0000-0000-0000-000000000008', 'authenticated', 'authenticated', '3b3-expired@example.com',   'x', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '3b3a1212-0000-0000-0000-000000000012', 'authenticated', 'authenticated', '3b3-appl@example.com',      'x', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '3b3a0000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '3b3-noprofile@example.com', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '3b3adead-0000-0000-0000-00000000dead', 'authenticated', 'authenticated', '3b3-fake@example.com',      'x', now(), now());

-- profiles (10; the last two auth users deliberately have none)
insert into public.profiles (id, display_name, role) values
  ('3b3a1111-0000-0000-0000-000000000001', '3b3 Owner',          'owner'),
  ('3b3a2222-0000-0000-0000-000000000002', '3b3 Rec A',          'receptionist'),
  ('3b3a9999-0000-0000-0000-000000000009', '3b3 Rec B',          'receptionist'),
  ('3b3a3333-0000-0000-0000-000000000003', '3b3 Member One',     'member'),
  ('3b3a4444-0000-0000-0000-000000000004', '3b3 Member Two',     'member'),
  ('3b3a5555-0000-0000-0000-000000000005', '3b3 Member Four',    'member'),
  ('3b3a6666-0000-0000-0000-000000000006', '3b3 Staff Profile',  'receptionist'),
  ('3b3a7777-0000-0000-0000-000000000007', '3b3 Linked Profile', 'member'),
  ('3b3a8888-0000-0000-0000-000000000008', '3b3 Expired Profile','member'),
  ('3b3a1212-0000-0000-0000-000000000012', '3b3 Applicant',      'member');

-- plans: monthly active / monthly INACTIVE / quarterly active / monthly
-- active whose price P01 will raise 1200 -> 1300
insert into public.plans (id, name, duration, price, is_active) values
  ('3b3c1111-0000-0000-0000-000000000001', '3b3 Monthly',   'monthly',   1500.00, true),
  ('3b3c2222-0000-0000-0000-000000000002', '3b3 Inactive',  'monthly',    999.00, false),
  ('3b3c3333-0000-0000-0000-000000000003', '3b3 Quarterly', 'quarterly', 4000.00, true),
  ('3b3c5555-0000-0000-0000-000000000005', '3b3 Price',     'monthly',   1200.00, true);

-- members
--   M1 pendingPayment (linked to member1, plan set, never verified)
--   M2 active until 2026-12-01 (linked member2)
--   M3 expired 2026-01-31 (linked expP)
--   M4 active until 2027-06-30 (linked member4) — the freeze member
--   M5 never paid, no plan, no auth link — assignment/discount target
--   M6 linked to linkedP (already-linked deny target), end 2027-01-31
--   M7 no auth link, end 2027-06-30 — full-reversal void target
insert into public.members (id, full_name, phone, plan_id, price_locked, membership_end, auth_user_id, joined_on) values
  ('3b3b1111-0000-0000-0000-000000000001', '3b3 Member One',  '+911000000001', '3b3c1111-0000-0000-0000-000000000001', null,    null,       '3b3a3333-0000-0000-0000-000000000003', '2026-11-01'),
  ('3b3b2222-0000-0000-0000-000000000002', '3b3 Member Two',  '+911000000002', '3b3c1111-0000-0000-0000-000000000001', 1500.00, '2026-12-01','3b3a4444-0000-0000-0000-000000000004', '2026-09-01'),
  ('3b3b3333-0000-0000-0000-000000000003', '3b3 Member Three','+911000000003', '3b3c1111-0000-0000-0000-000000000001', 1500.00, '2026-01-31','3b3a8888-0000-0000-0000-000000000008', '2025-11-01'),
  ('3b3b4444-0000-0000-0000-000000000004', '3b3 Member Four', '+911000000004', '3b3c1111-0000-0000-0000-000000000001', 1500.00, '2027-06-30','3b3a5555-0000-0000-0000-000000000005', '2026-07-01'),
  ('3b3b5555-0000-0000-0000-000000000005', '3b3 Member Five', '+911000000005', null, null, null, null, '2026-11-01'),
  ('3b3b6666-0000-0000-0000-000000000006', '3b3 Member Six',  '+911000000006', '3b3c1111-0000-0000-0000-000000000001', 1500.00, '2027-01-31','3b3a7777-0000-0000-0000-000000000007', '2026-11-01'),
  ('3b3b8888-0000-0000-0000-000000000008', '3b3 Member Seven','+911000000007', '3b3c1111-0000-0000-0000-000000000001', 1500.00, '2027-06-30', null, '2026-06-30');

-- payments (all cash, no UTR). Verified rows carry verified_by/at;
-- awaiting rows carry neither (0001 pairing constraints).
insert into public.payments
  (id, member_id, plan_id, entry_type, original_price, discount_pct, discount_amount, payable, method, state, recorded_by, verified_by, verified_at)
values
  -- PV1: M2's verified payment backing period PR1 (recB records, owner verifies)
  ('3b3e0001-0000-0000-0000-000000000001', '3b3b2222-0000-0000-0000-000000000002', '3b3c1111-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'verified', '3b3a9999-0000-0000-0000-000000000009', '3b3a1111-0000-0000-0000-000000000001', now()),
  -- PW1: M2 renewal, verified in V02 (stacking: 2026-12-02..2027-01-01)
  ('3b3e0002-0000-0000-0000-000000000002', '3b3b2222-0000-0000-0000-000000000002', '3b3c1111-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'awaitingVerification', '3b3a9999-0000-0000-0000-000000000009', null, null),
  -- PW2: M1 first-ever payment, verified in V09
  ('3b3e0003-0000-0000-0000-000000000003', '3b3b1111-0000-0000-0000-000000000001', '3b3c1111-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'awaitingVerification', '3b3a9999-0000-0000-0000-000000000009', null, null),
  -- PW3: recorded by recA — V01 self-verify deny, J03 self-reject deny
  ('3b3e0004-0000-0000-0000-000000000004', '3b3b2222-0000-0000-0000-000000000002', '3b3c1111-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'awaitingVerification', '3b3a2222-0000-0000-0000-000000000002', null, null),
  -- PW4: inactive plan C2 — V05 deny
  ('3b3e0005-0000-0000-0000-000000000005', '3b3b3333-0000-0000-0000-000000000003', '3b3c2222-0000-0000-0000-000000000002', 'payment',  999.00, 0, 0,  999.00, 'cash', 'awaitingVerification', '3b3a9999-0000-0000-0000-000000000009', null, null),
  -- PW5: plan inconsistent with member — V06 deny
  ('3b3e0006-0000-0000-0000-000000000006', '3b3b2222-0000-0000-0000-000000000002', '3b3c3333-0000-0000-0000-000000000003', 'payment', 4000.00, 0, 0, 4000.00, 'cash', 'awaitingVerification', '3b3a9999-0000-0000-0000-000000000009', null, null),
  -- PW6: M3 post-expiry re-anchor — V08 verify
  ('3b3e0007-0000-0000-0000-000000000007', '3b3b3333-0000-0000-0000-000000000003', '3b3c1111-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'awaitingVerification', '3b3a9999-0000-0000-0000-000000000009', null, null),
  -- PW7: M4 renewal while frozen — V07 deny
  ('3b3e0008-0000-0000-0000-000000000008', '3b3b4444-0000-0000-0000-000000000004', '3b3c1111-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'awaitingVerification', '3b3a9999-0000-0000-0000-000000000009', null, null),
  -- PW8: stays awaiting — X01 unverified-reversal deny
  ('3b3e0014-0000-0000-0000-000000000014', '3b3b2222-0000-0000-0000-000000000002', '3b3c1111-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'awaitingVerification', '3b3a9999-0000-0000-0000-000000000009', null, null),
  -- PW10: J01 reject positive
  ('3b3e000a-0000-0000-0000-00000000000a', '3b3b2222-0000-0000-0000-000000000002', '3b3c1111-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'awaitingVerification', '3b3a9999-0000-0000-0000-000000000009', null, null),
  -- PW12: G01 authenticator AAL2 verify (stacks: 2027-01-02..2027-02-02)
  ('3b3e000c-0000-0000-0000-00000000000c', '3b3b2222-0000-0000-0000-000000000002', '3b3c1111-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'awaitingVerification', '3b3a9999-0000-0000-0000-000000000009', null, null),
  -- PW9: M5 + pending plan assignment applied atomically at P12 verify
  ('3b3e000d-0000-0000-0000-00000000000d', '3b3b5555-0000-0000-0000-000000000005', '3b3c3333-0000-0000-0000-000000000003', 'payment', 4000.00, 0, 0, 4000.00, 'cash', 'awaitingVerification', '3b3a9999-0000-0000-0000-000000000009', null, null),
  -- PV2: M2 verified, NO period — X06..X10 partial/full reversal target
  ('3b3e0010-0000-0000-0000-000000000010', '3b3b2222-0000-0000-0000-000000000002', '3b3c1111-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'verified', '3b3a9999-0000-0000-0000-000000000009', '3b3a1111-0000-0000-0000-000000000001', now()),
  -- PV4: M7 verified — X11 full reversal voids PR7, membership_end -> null
  ('3b3e0011-0000-0000-0000-000000000011', '3b3b8888-0000-0000-0000-000000000008', '3b3c1111-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'verified', '3b3a9999-0000-0000-0000-000000000009', '3b3a1111-0000-0000-0000-000000000001', now()),
  -- PV5: recorded AND verified by recA — X02 self-reverse deny
  ('3b3e0012-0000-0000-0000-000000000012', '3b3b2222-0000-0000-0000-000000000002', '3b3c1111-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'verified', '3b3a2222-0000-0000-0000-000000000002', '3b3a2222-0000-0000-0000-000000000002', now()),
  -- PV6: M2 verified 800 — G02/G03 authenticator AAL reversal target
  ('3b3e0013-0000-0000-0000-000000000013', '3b3b2222-0000-0000-0000-000000000002', '3b3c1111-0000-0000-0000-000000000001', 'payment',  800.00, 0, 0,  800.00, 'cash', 'verified', '3b3a9999-0000-0000-0000-000000000009', '3b3a1111-0000-0000-0000-000000000001', now());

-- membership periods: M2's live period (2026-09-01..2026-12-01, created
-- by PV1) and M7's period (2026-06-30..2027-06-30, created by PV4 —
-- X11 will void it via full reversal)
insert into public.membership_periods
  (id, member_id, plan_id, start_date, end_date, price_applied, created_by_payment)
values
  ('3b3f1111-0000-0000-0000-000000000001', '3b3b2222-0000-0000-0000-000000000002', '3b3c1111-0000-0000-0000-000000000001', '2026-09-01', '2026-12-01', 1500.00, '3b3e0001-0000-0000-0000-000000000001'),
  ('3b3f3333-0000-0000-0000-000000000003', '3b3b8888-0000-0000-0000-000000000008', '3b3c1111-0000-0000-0000-000000000001', '2026-06-30', '2027-06-30', 1500.00, '3b3e0011-0000-0000-0000-000000000011');

-- freezes: only the ones that cannot be created through request_freeze
-- are fixture-inserted directly:
--   FZ3 — M4, starts at the GYM-local "today" (+3 days): the
--         frozen-now / scan-ends-freeze window (approved in F10).
--   FZ4 — M3 (expired member): decision-time lapse deny (F13).
--   FZ6 — M2 2027-05-01..05: authenticator AAL decide target (G10-G12).
insert into public.membership_freezes
  (id, member_id, start_date, end_date, reason, state, requested_by)
values
  ('3b310003-0000-0000-0000-000000000003', '3b3b4444-0000-0000-0000-000000000004', public.app_gym_date(), public.app_gym_date() + 3, 'Medical',  'pending', '3b3a2222-0000-0000-0000-000000000002'),
  ('3b310004-0000-0000-0000-000000000004', '3b3b3333-0000-0000-0000-000000000003', '2027-03-01', '2027-03-05', 'Travel',   'pending', '3b3a2222-0000-0000-0000-000000000002'),
  ('3b310006-0000-0000-0000-000000000006', '3b3b2222-0000-0000-0000-000000000002', '2027-05-01', '2027-05-05', 'Personal', 'pending', '3b3a2222-0000-0000-0000-000000000002');

-- join applications (submitted unless noted)
insert into public.join_applications (id, auth_user_id, full_name, phone, email, plan_id, state) values
  ('3b330001-0000-0000-0000-000000000001', '3b3a1212-0000-0000-0000-000000000012', '3b3 Applicant One',     '+912000000001', '3b3-appl1@example.com', '3b3c1111-0000-0000-0000-000000000001', 'submitted'),
  ('3b330002-0000-0000-0000-000000000002', '3b3a6666-0000-0000-0000-000000000006', '3b3 Staff Applicant',   '+912000000002', '3b3-staff1@example.com','3b3c1111-0000-0000-0000-000000000001', 'submitted'),
  ('3b330003-0000-0000-0000-000000000003', '3b3a7777-0000-0000-0000-000000000007', '3b3 Linked Applicant',  '+912000000003', '3b3-link1@example.com', '3b3c1111-0000-0000-0000-000000000001', 'submitted'),
  ('3b330004-0000-0000-0000-000000000004', '3b3adead-0000-0000-0000-00000000dead', '3b3 Ghost Applicant',   '+912000000004', '3b3-ghost@example.com', '3b3c1111-0000-0000-0000-000000000001', 'submitted'),
  ('3b330005-0000-0000-0000-000000000005', null,                                   '3b3 Unlinked Applicant','+912000000005', null,                    '3b3c1111-0000-0000-0000-000000000001', 'submitted'),
  ('3b330006-0000-0000-0000-000000000006', null,                                   '3b3 Draft Applicant',   '+912000000006', null,                    '3b3c1111-0000-0000-0000-000000000001', 'draft');

-- expired attendance token fixture (plaintext known to the suite;
-- created_at backdated so the expiry check passes while the token is dead)
insert into public.qr_tokens (id, token_hash, purpose, expires_at, minted_by, created_at)
values ('3b320001-0000-0000-0000-000000000001',
        encode(sha256(convert_to('expired-scan-token-fixed-plaintext-0001', 'utf8')), 'hex'),
        'attendance', now() - interval '1 hour',
        '3b3a2222-0000-0000-0000-000000000002',
        now() - interval '2 hours');

-- gym settings singleton: token validity 60 for default mints
insert into public.app_settings (id, gym_timezone, attendance_token_validity_seconds)
values (1, 'Asia/Kolkata', 60)
on conflict (id) do update
  set gym_timezone = 'Asia/Kolkata',
      attendance_token_validity_seconds = 60;

-- =====================================================================
-- SECTION A — catalog & ACL surface (as postgres) [audit condition A]
-- =====================================================================

-- A01: all 13 authority functions are SECURITY DEFINER
select suite_results.check_true('A01', '13 authority functions are SECURITY DEFINER',
  (
    select count(*) = 13 from (
      values ('verify_payment(uuid)'),
             ('reject_payment(uuid)'),
             ('create_reversal(uuid,numeric,text)'),
             ('request_freeze(uuid,date,date,text)'),
             ('decide_freeze(uuid,boolean)'),
             ('end_freeze(uuid)'),
             ('check_in(text,text)'),
             ('mint_attendance_token(integer)'),
             ('set_member_discount(uuid,numeric)'),
             ('request_plan_assignment(uuid,uuid)'),
             ('update_plan_price(uuid,numeric)'),
             ('decide_application(uuid,boolean)'),
             ('update_gym_settings(text,text,text,integer)')
    ) as s(sig)
    join pg_proc p on p.oid = to_regprocedure('public.' || sig)
    where p.prosecdef
  ),
  'every §10 function runs as definer (current_user = postgres inside)');

-- A02: the 13 are granted to authenticated AND denied to anon
select suite_results.check_true('A02', '13 authority fns: EXECUTE -> authenticated only (no anon)',
  (
    select count(*) = 13 from (
      values ('verify_payment(uuid)'),('reject_payment(uuid)'),
             ('create_reversal(uuid,numeric,text)'),('request_freeze(uuid,date,date,text)'),
             ('decide_freeze(uuid,boolean)'),('end_freeze(uuid)'),('check_in(text,text)'),
             ('mint_attendance_token(integer)'),('set_member_discount(uuid,numeric)'),
             ('request_plan_assignment(uuid,uuid)'),('update_plan_price(uuid,numeric)'),
             ('decide_application(uuid,boolean)'),('update_gym_settings(text,text,text,integer)')
    ) as s(sig)
    join pg_proc p on p.oid = to_regprocedure('public.' || sig)
    where has_function_privilege('authenticated', p.oid, 'EXECUTE')
      and not has_function_privilege('anon', p.oid, 'EXECUTE')
  ),
  'RPC surface reachable by logged-in users only; anon has no EXECUTE');

-- A03: the 5 internal helpers have NO EXECUTE for anon/authenticated/
-- service_role and nothing is granted to PUBLIC
select suite_results.check_true('A03', '5 internals (app_gym_date/require_role/assert_aal2/audit_authority/cap-trigger): no client EXECUTE, no PUBLIC',
  (
    select count(*) = 5 from (
      values ('app_gym_date()'),
             ('require_role(text[])'),
             ('assert_aal2()'),
             ('audit_authority(text,text,uuid,jsonb,jsonb)'),
             ('payments_reversal_cap_trigger()')
    ) as s(sig)
    join pg_proc p on p.oid = to_regprocedure('public.' || sig)
    where not has_function_privilege('anon', p.oid, 'EXECUTE')
      and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
      and not has_function_privilege('service_role', p.oid, 'EXECUTE')
      and p.proacl is not null
      and not exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0)
  ),
  'internals are owner-only; PUBLIC grantee (oid 0) absent everywhere');

-- A04: assert_aal2 is SECURITY INVOKER (unresolved #4 gate reads the
-- caller's JWT context); the other helpers are definer by design
select suite_results.check_true('A04', 'assert_aal2 INVOKER; app_gym_date/require_role/audit_authority definer',
  (select not p1.prosecdef and p2.prosecdef and p3.prosecdef and p4.prosecdef
     from pg_proc p1, pg_proc p2, pg_proc p3, pg_proc p4
    where p1.oid = to_regprocedure('public.assert_aal2()')
      and p2.oid = to_regprocedure('public.app_gym_date()')
      and p3.oid = to_regprocedure('public.require_role(text[])')
      and p4.oid = to_regprocedure('public.audit_authority(text,text,uuid,jsonb,jsonb)')),
  'AAL2 gate evaluates the JWT claims of the surrounding context');

-- A05: behavioral probe — a table, a function and a sequence created
-- RIGHT NOW by postgres (the migration runner) must start from zero
-- client access, proving the default-privilege lockdown [audit
-- MEDIUM-01] applies to future objects. (pg_default_acl rows alone are
-- ambiguous: REVOKEs are stored as grantee entries with empty privilege
-- sets.)
do $probe$ begin
  create table public.__probe3b3_t (id int);
  create function public.__probe3b3_f() returns void language sql as $$ select 1 $$;
  create sequence public.__probe3b3_s;
end $probe$;

select suite_results.check_true('A05', 'default-privilege lockdown: probe table/function/sequence have no client privileges',
  (
    not has_table_privilege('anon', 'public.__probe3b3_t', 'SELECT')
    and not has_table_privilege('authenticated', 'public.__probe3b3_t', 'SELECT')
    and not has_table_privilege('service_role', 'public.__probe3b3_t', 'SELECT')
    and not has_function_privilege('anon', 'public.__probe3b3_f()', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.__probe3b3_f()', 'EXECUTE')
    and not has_function_privilege('service_role', 'public.__probe3b3_f()', 'EXECUTE')
    and not has_function_privilege('public', 'public.__probe3b3_f()', 'EXECUTE')
    and not has_sequence_privilege('anon', 'public.__probe3b3_s', 'USAGE')
    and not has_sequence_privilege('authenticated', 'public.__probe3b3_s', 'USAGE')
    and not has_sequence_privilege('service_role', 'public.__probe3b3_s', 'USAGE')
  ),
  'future postgres-created objects start with zero grants (tables, functions incl. PUBLIC, sequences)');

drop table public.__probe3b3_t;
drop function public.__probe3b3_f();
drop sequence public.__probe3b3_s;

-- A06: hygiene [3B.2 audit LOW-01] — the 0002 trigger functions carry no
-- client EXECUTE
select suite_results.check_true('A06', '0002 trigger functions: anon/authenticated/service_role EXECUTE revoked',
  (
    select count(*) = 4 from (
      values ('set_updated_at()'),
             ('assert_no_client_mutation()'),
             ('profiles_role_guard()'),
             ('payments_insert_override()')
    ) as s(sig)
    join pg_proc p on p.oid = to_regprocedure('public.' || sig)
    where not has_function_privilege('anon', p.oid, 'EXECUTE')
      and not has_function_privilege('authenticated', p.oid, 'EXECUTE')
      and not has_function_privilege('service_role', p.oid, 'EXECUTE')
  ),
  'trigger functions are outside every RPC surface');

-- A07: the reversal backstop is a DEFERRABLE INITIALLY DEFERRED
-- constraint trigger on payments
select suite_results.check_true('A07', 'payments_reversal_cap constraint trigger: deferrable, initially deferred',
  (
    select count(*) = 1 from pg_trigger
     where tgrelid = 'public.payments'::regclass
       and tgname = 'payments_reversal_cap'
       and tgdeferrable
       and tginitdeferred
  ),
  'commit-time backstop: cumulative reversals can never exceed the original');

-- A08: every function created by 0003 (13 authority + 4 helpers + cap
-- trigger fn) pins search_path = 'public'
insert into suite_results.t_results
select 'A08', 'all 18 0003 functions pin search_path = public',
  (
    select count(*) = 18 from (
      values (to_regprocedure('public.verify_payment(uuid)')),
             (to_regprocedure('public.reject_payment(uuid)')),
             (to_regprocedure('public.create_reversal(uuid,numeric,text)')),
             (to_regprocedure('public.request_freeze(uuid,date,date,text)')),
             (to_regprocedure('public.decide_freeze(uuid,boolean)')),
             (to_regprocedure('public.end_freeze(uuid)')),
             (to_regprocedure('public.check_in(text,text)')),
             (to_regprocedure('public.mint_attendance_token(integer)')),
             (to_regprocedure('public.set_member_discount(uuid,numeric)')),
             (to_regprocedure('public.request_plan_assignment(uuid,uuid)')),
             (to_regprocedure('public.update_plan_price(uuid,numeric)')),
             (to_regprocedure('public.decide_application(uuid,boolean)')),
             (to_regprocedure('public.update_gym_settings(text,text,text,integer)')),
             (to_regprocedure('public.app_gym_date()')),
             (to_regprocedure('public.require_role(text[])')),
             (to_regprocedure('public.assert_aal2()')),
             (to_regprocedure('public.audit_authority(text,text,uuid,jsonb,jsonb)')),
             (to_regprocedure('public.payments_reversal_cap_trigger()'))
    ) s(oid)
    join pg_proc p on p.oid = s.oid
    where 'search_path=public' = any (p.proconfig)
  ),
  'pinned search_path prevents search-path hijacking in definer context';

-- =====================================================================
-- SECTION R — role matrix: who can even reach the authority surface
-- (as postgres; personas simulated). Audit condition A: the gate order
-- is grants (EXECUTE) -> require_role -> AAL2.
-- =====================================================================

-- R01/R02: anon has no EXECUTE on ANY authority function (A02 verified
-- in catalog; here the runtime behavior is pinned)
begin;
set local role anon;

select suite_results.check_fail('R01', 'anon RPC verify_payment -> permission denied',
  $s$select public.verify_payment('3b3e0003-0000-0000-0000-000000000003'::uuid)$s$,
  '42', 'permission denied');

select suite_results.check_fail('R02', 'anon RPC check_in -> permission denied',
  $s$select public.check_in('anon-garbage-token')$s$,
  '42', 'permission denied');
commit;

-- R03: a MEMBER token calling a receptionist function -> 'Insufficient role'
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b3a3333-0000-0000-0000-000000000003","role":"member"}';
set local request.jwt.claim.sub = '3b3a3333-0000-0000-0000-000000000003';

select suite_results.check_fail('R03', 'member verify_payment -> Insufficient role',
  $s$select public.verify_payment('3b3e0003-0000-0000-0000-000000000003'::uuid)$s$,
  '42501', 'Insufficient role');
commit;

-- R04: OWNER calling a receptionist function -> 'Insufficient role'
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b3a1111-0000-0000-0000-000000000001","role":"owner","aal":"aal2"}';
set local request.jwt.claim.sub = '3b3a1111-0000-0000-0000-000000000001';

select suite_results.check_fail('R04', 'owner verify_payment -> Insufficient role',
  $s$select public.verify_payment('3b3e0003-0000-0000-0000-000000000003'::uuid)$s$,
  '42501', 'Insufficient role');
commit;

-- R05: authenticated JWT whose auth user has NO profile row ->
-- 'Insufficient role' (role resolves from profiles, never JWT claims)
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b3a0000-0000-0000-0000-000000000000","role":"authenticated"}';
set local request.jwt.claim.sub = '3b3a0000-0000-0000-0000-000000000000';

select suite_results.check_fail('R05', 'profileless auth user verify_payment -> Insufficient role',
  $s$select public.verify_payment('3b3e0003-0000-0000-0000-000000000003'::uuid)$s$,
  '42501', 'Insufficient role');
commit;

-- R06..R10: members/owners are locked out of every other surface too
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b3a3333-0000-0000-0000-000000000003","role":"member"}';
set local request.jwt.claim.sub = '3b3a3333-0000-0000-0000-000000000003';

select suite_results.check_fail('R06', 'member mint_attendance_token -> Insufficient role',
  $s$select public.mint_attendance_token(null)$s$,
  '42501', 'Insufficient role');

select suite_results.check_fail('R07', 'member create_reversal -> Insufficient role',
  $s$select public.create_reversal('3b3e0010-0000-0000-0000-000000000010'::uuid, 100)$s$,
  '42501', 'Insufficient role');

select suite_results.check_fail('R08', 'member update_plan_price -> Insufficient role',
  $s$select public.update_plan_price('3b3c5555-0000-0000-0000-000000000005'::uuid, 1300)$s$,
  '42501', 'Insufficient role');

select suite_results.check_fail('R09', 'member decide_application -> Insufficient role',
  $s$select public.decide_application('3b330001-0000-0000-0000-000000000001'::uuid, true)$s$,
  '42501', 'Insufficient role');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b3a1111-0000-0000-0000-000000000001","role":"owner","aal":"aal2"}';
set local request.jwt.claim.sub = '3b3a1111-0000-0000-0000-000000000001';

select suite_results.check_fail('R10', 'owner set_member_discount -> Insufficient role (O-15 owner read-only)',
  $s$select public.set_member_discount('3b3b5555-0000-0000-0000-000000000005'::uuid, 10)$s$,
  '42501', 'Insufficient role');
commit;

-- =====================================================================
-- SECTION F — freeze lifecycle (request/decide/end) and derived-pause
-- store behavior [audit condition D lives in decide_application; freeze
-- conditions here: eligibility re-check, conditional transitions,
-- inclusive extension_days, membership_end untouched (derived model)]
-- =====================================================================

-- F01: recA requests fz1 for M4 (2027-01-01..10, inclusive 10 days)
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b3a2222-0000-0000-0000-000000000002","role":"receptionist","aal":"aal2"}';
set local request.jwt.claim.sub = '3b3a2222-0000-0000-0000-000000000002';

select suite_results.check_ok('F01', 'recA requests fz1 (M4, 2027-01-01..10)',
  $s$select public.request_freeze('3b3b4444-0000-0000-0000-000000000004'::uuid,
                                  '2027-01-01', '2027-01-10', 'Medical')$s$);

-- F02: recA approves fz1 (recording AND deciding by the same
-- receptionist is allowed; only the OWNER is excluded [C1])
select suite_results.check_ok('F02', 'recA approves fz1',
  $s$select public.decide_freeze(
    (select id from public.membership_freezes
      where member_id = '3b3b4444-0000-0000-0000-000000000004'
        and start_date = '2027-01-01' and state = 'pending'), true)$s$);
commit;

-- F03: fz1 approved: extension_days = end - start + 1 = 10 (inclusive,
-- O-02); decision attributed to recA; audit row emitted
select suite_results.check_true('F03', 'fz1 approved: extension_days 10, decided_by recA, audited',
  (
    select f.state = 'approved' and f.decided_by = '3b3a2222-0000-0000-0000-000000000002'
       and f.decided_at is not null and f.extension_days = 10
      from public.membership_freezes f
     where f.id = (select id from public.membership_freezes
                    where member_id = '3b3b4444-0000-0000-0000-000000000004'
                      and start_date = '2027-01-01')
  ) and (
    select count(*) = 1 from public.audit_log_entries
     where action = 'freeze.approved'
       and row_id = (select id from public.membership_freezes
                      where member_id = '3b3b4444-0000-0000-0000-000000000004'
                        and start_date = '2027-01-01')
       and actor = '3b3a2222-0000-0000-0000-000000000002'
  ),
  'derived-pause model: approval writes freeze-row fields only');

-- F04: overlapping request against the APPROVED fz1 -> 0001 exclusion
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b3a2222-0000-0000-0000-000000000002","role":"receptionist"}';
set local request.jwt.claim.sub = '3b3a2222-0000-0000-0000-000000000002';

select suite_results.check_fail('F04', 'overlapping freeze request -> 23P01 freezes_no_overlap',
  $s$select public.request_freeze('3b3b4444-0000-0000-0000-000000000004'::uuid,
                                  '2027-01-05', '2027-01-20', 'Other')$s$,
  '23P01', 'freezes_no_overlap');

-- F05: recA ends fz1 early (receptionist unfreeze)
select suite_results.check_ok('F05', 'recA ends fz1 early',
  $s$select public.end_freeze(
    (select id from public.membership_freezes
      where member_id = '3b3b4444-0000-0000-0000-000000000004'
        and start_date = '2027-01-01'))$s$);
commit;

-- F06: ended attribution
select suite_results.check_true('F06', 'fz1 ended: ended_via receptionist, ended_by recA, audited',
  (
    select f.state = 'ended' and f.ended_via = 'receptionist'
       and f.ended_by = '3b3a2222-0000-0000-0000-000000000002'
       and f.ended_at is not null
      from public.membership_freezes f
     where f.id = (select id from public.membership_freezes
                    where member_id = '3b3b4444-0000-0000-0000-000000000004'
                      and start_date = '2027-01-01')
  ) and (
    select count(*) = 1 from public.audit_log_entries
     where action = 'freeze.ended'
       and row_id = (select id from public.membership_freezes
                      where member_id = '3b3b4444-0000-0000-0000-000000000004'
                        and start_date = '2027-01-01')
  ),
  'conditional transition recorded with attribution');

-- F07: double-end impossible
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b3a2222-0000-0000-0000-000000000002","role":"receptionist"}';
set local request.jwt.claim.sub = '3b3a2222-0000-0000-0000-000000000002';

select suite_results.check_fail('F07', 'ending an already-ended freeze denied',
  $s$select public.end_freeze(
    (select id from public.membership_freezes
      where member_id = '3b3b4444-0000-0000-0000-000000000004'
        and start_date = '2027-01-01'))$s$,
  '55000', 'Only an approved freeze can be ended');

-- F08: recA requests fz2 (M4 2027-02-01..10) — kept PENDING; the OWNER
-- is refused as decider [C1]
select suite_results.check_ok('F08', 'recA requests fz2 (M4, 2027-02-01..10)',
  $s$select public.request_freeze('3b3b4444-0000-0000-0000-000000000004'::uuid,
                                  '2027-02-01', '2027-02-10', 'Personal')$s$);
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b3a1111-0000-0000-0000-000000000001","role":"owner","aal":"aal2"}';
set local request.jwt.claim.sub = '3b3a1111-0000-0000-0000-000000000001';

select suite_results.check_fail('F09', 'owner decide_freeze -> Insufficient role [C1]',
  $s$select public.decide_freeze(
    (select id from public.membership_freezes
      where member_id = '3b3b4444-0000-0000-0000-000000000004'
        and start_date = '2027-02-01'), true)$s$,
  '42501', 'Insufficient role');
commit;

-- F10/F11: recA approves FZ3 (the gym-today..+3 window); extension 4
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b3a2222-0000-0000-0000-000000000002","role":"receptionist","aal":"aal2"}';
set local request.jwt.claim.sub = '3b3a2222-0000-0000-0000-000000000002';

select suite_results.check_ok('F10', 'recA approves fz3 (gym-today..+3)',
  $s$select public.decide_freeze('3b310003-0000-0000-0000-000000000003'::uuid, true)$s$);
commit;

select suite_results.check_true('F11', 'fz3 approved with extension_days 4, membership_end untouched',
  (
    select f.state = 'approved' and f.extension_days = 4
       and f.decided_by = '3b3a2222-0000-0000-0000-000000000002'
      from public.membership_freezes f
     where f.id = '3b310003-0000-0000-0000-000000000003'
  ) and (
    select m4_end_untouched
      from (select m.membership_end = '2027-06-30' as m4_end_untouched
              from public.members m
             where m.id = '3b3b4444-0000-0000-0000-000000000004') x
  ),
  'derived-pause model: no membership write at approval (0004 views derive)');

-- F12: a frozen-now member cannot get another freeze (eligibility, §2.1)
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b3a2222-0000-0000-0000-000000000002","role":"receptionist","aal":"aal2"}';
set local request.jwt.claim.sub = '3b3a2222-0000-0000-0000-000000000002';

select suite_results.check_fail('F12', 'request while frozen-now denied',
  $s$select public.request_freeze('3b3b4444-0000-0000-0000-000000000004'::uuid,
                                  current_date, current_date + 2, 'Travel')$s$,
  '55000', 'currently frozen');

-- F13: decision-time eligibility re-check — M3 has lapsed since the
-- request, so approval is refused even though the request exists
select suite_results.check_fail('F13', 'approving a freeze for a lapsed member refused at decision time',
  $s$select public.decide_freeze('3b310004-0000-0000-0000-000000000004'::uuid, true)$s$,
  '55000', 'lapsed');

-- F14: recA requests fz5 (M2 2027-04-01..05)
select suite_results.check_ok('F14', 'recA requests fz5 (M2, 2027-04-01..05)',
  $s$select public.request_freeze('3b3b2222-0000-0000-0000-000000000002'::uuid,
                                  '2027-04-01', '2027-04-05', 'Travel')$s$);
commit;

-- F15: recB (a DIFFERENT receptionist) rejects fz5
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b3a9999-0000-0000-0000-000000000009","role":"receptionist","aal":"aal2"}';
set local request.jwt.claim.sub = '3b3a9999-0000-0000-0000-000000000009';

select suite_results.check_ok('F15', 'recB rejects fz5',
  $s$select public.decide_freeze(
    (select id from public.membership_freezes
      where member_id = '3b3b2222-0000-0000-0000-000000000002'
        and start_date = '2027-04-01'), false)$s$);
commit;

-- F16: rejection recorded with the rejecting actor + audit
select suite_results.check_true('F16', 'fz5 rejected: decided_by recB, no extension, audited',
  (
    select f.state = 'rejected' and f.decided_by = '3b3a9999-0000-0000-0000-000000000009'
       and f.extension_days is null
      from public.membership_freezes f
     where f.id = (select id from public.membership_freezes
                    where member_id = '3b3b2222-0000-0000-0000-000000000002'
                      and start_date = '2027-04-01')
  ) and (
    select count(*) = 1 from public.audit_log_entries
     where action = 'freeze.rejected'
       and row_id = (select id from public.membership_freezes
                      where member_id = '3b3b2222-0000-0000-0000-000000000002'
                        and start_date = '2027-04-01')
  ),
  'freeze rejection attributed to the deciding receptionist');

-- =====================================================================
-- SECTION C — attendance tokens & check_in (mint gate, hash/expiry,
-- pendingPayment default-deny, expired-silent, replay, persona gates)
-- [unresolved #3 default-deny; O-10 scan-ends-freeze is V13/V14 because
-- the frozen window must still be live for V07's renewal deny]
-- =====================================================================

-- C01: recA (AAL2) mints a default-validity token; plaintext captured
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b3a2222-0000-0000-0000-000000000002","role":"receptionist","aal":"aal2"}';
set local request.jwt.claim.sub = '3b3a2222-0000-0000-0000-000000000002';

select suite_results.check_ok('C01', 'recA (AAL2) mints default token -> captured as key a',
  $s$with m as (select public.mint_attendance_token(null) as tok)
  insert into suite_results.tokens (k, token, token_hash)
  select 'a', tok, encode(sha256(convert_to(tok, 'utf8')), 'hex') from m$s$);
commit;

-- C02: exactly-once plaintext: 64 hex chars, and the stored side holds
-- only the SHA-256 hash
select suite_results.check_true('C02', 'minted token: 64 chars, hash-only storage',
  (
    select length(t.token) = 64
       and t.token_hash = encode(sha256(convert_to(t.token, 'utf8')), 'hex')
       and (select count(*) = 1 from public.qr_tokens
             where token_hash = t.token_hash)
      from suite_results.tokens t where t.k = 'a'
  ),
  'plaintext exists ONLY in the capture table, never in qr_tokens');

-- C03: AAL1 claims -> mint refused (unresolved #4 default posture)
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b3a2222-0000-0000-0000-000000000002","role":"receptionist"}';
set local request.jwt.claim.sub = '3b3a2222-0000-0000-0000-000000000002';

select suite_results.check_fail('C03', 'recA without AAL2 cannot mint',
  $s$select public.mint_attendance_token(null)$s$,
  '42501', 'multi-factor authentication');
commit;

-- C04: explicit validity 5 (lower boundary) accepted
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b3a2222-0000-0000-0000-000000000002","role":"receptionist","aal":"aal2"}';
set local request.jwt.claim.sub = '3b3a2222-0000-0000-0000-000000000002';

select suite_results.check_ok('C04', 'recA mints 5-second token -> captured as key b',
  $s$with m as (select public.mint_attendance_token(5) as tok)
  insert into suite_results.tokens (k, token, token_hash)
  select 'b', tok, encode(sha256(convert_to(tok, 'utf8')), 'hex') from m$s$);

select suite_results.check_fail('C05', 'mint with validity 700 refused (bounded 5..600)',
  $s$select public.mint_attendance_token(700)$s$,
  '55000', 'between 5 and 600');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b3a1111-0000-0000-0000-000000000001","role":"owner","aal":"aal2"}';
set local request.jwt.claim.sub = '3b3a1111-0000-0000-0000-000000000001';

select suite_results.check_fail('C06', 'owner cannot mint (§8.1: owner reads the door screen, staff mint)',
  $s$select public.mint_attendance_token(null)$s$,
  '42501', 'Insufficient role');
commit;

-- C07/C08: member personas — garbage token, then pendingPayment deny
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b3a4444-0000-0000-0000-000000000004","role":"member"}';
set local request.jwt.claim.sub = '3b3a4444-0000-0000-0000-000000000004';

select suite_results.check_fail('C07', 'check_in with unknown token refused',
  $s$select public.check_in('not-a-real-token')$s$,
  '55000', 'token is invalid');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b3a3333-0000-0000-0000-000000000003","role":"member"}';
set local request.jwt.claim.sub = '3b3a3333-0000-0000-0000-000000000003';

select suite_results.check_fail('C08', 'pendingPayment member denied (unresolved #3 default-deny)',
  $s$select public.check_in((select token from suite_results.tokens where k = 'a'))$s$,
  '55000', 'payment is pending');
commit;

-- C09/C10: M2 checks in with token a -> verified attendance stored
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b3a4444-0000-0000-0000-000000000004","role":"member"}';
set local request.jwt.claim.sub = '3b3a4444-0000-0000-0000-000000000004';

select suite_results.check_ok('C09', 'member2 checks in with token a',
  $s$select public.check_in((select token from suite_results.tokens where k = 'a'))$s$);
commit;

select suite_results.check_true('C10', 'M2 attendance row: verified, default door',
  (
    select count(*) = 1 from public.attendance_events e
     where e.member_id = '3b3b2222-0000-0000-0000-000000000002'
       and e.token_id = (select id from public.qr_tokens
                          where token_hash = (select token_hash from suite_results.tokens where k = 'a'))
       and e.status = 'verified'
       and e.door = 'main'
  ),
  'successful scan stored exactly once (O-29)');

-- C11: SAME member reusing the SAME token -> replay refused
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b3a4444-0000-0000-0000-000000000004","role":"member"}';
set local request.jwt.claim.sub = '3b3a4444-0000-0000-0000-000000000004';

select suite_results.check_fail('C11', 'token replay by the same member refused',
  $s$select public.check_in((select token from suite_results.tokens where k = 'a'))$s$,
  '55000', 'replay refused');
commit;

-- C12/C13: an EXPIRED member attends silently (O-32) with the same
-- token — uniqueness is per (member, token), not global
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b3a8888-0000-0000-0000-000000000008","role":"member"}';
set local request.jwt.claim.sub = '3b3a8888-0000-0000-0000-000000000008';

select suite_results.check_ok('C12', 'expired member (M3) checks in silently with token a',
  $s$select public.check_in((select token from suite_results.tokens where k = 'a'))$s$);
commit;

select suite_results.check_true('C13', 'M3 attendance row exists (expired-silent rule)',
  (
    select count(*) = 1 from public.attendance_events
     where member_id = '3b3b3333-0000-0000-0000-000000000003'
       and token_id = (select id from public.qr_tokens
                        where token_hash = (select token_hash from suite_results.tokens where k = 'a'))
  ),
  'different member may reuse the token; expired member admitted silently');

-- C14: expired token plaintext -> expiry refused
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b3a4444-0000-0000-0000-000000000004","role":"member"}';
set local request.jwt.claim.sub = '3b3a4444-0000-0000-0000-000000000004';

select suite_results.check_fail('C14', 'expired token refused at the door',
  $s$select public.check_in('expired-scan-token-fixed-plaintext-0001')$s$,
  '55000', 'token has expired');

-- C15: token b (5-second mint) still valid -> second successful scan
select suite_results.check_ok('C15', 'member2 checks in with token b',
  $s$select public.check_in((select token from suite_results.tokens where k = 'b'))$s$);
commit;

-- C16: owner persona cannot check in (member-only gate)
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b3a1111-0000-0000-0000-000000000001","role":"owner","aal":"aal2"}';
set local request.jwt.claim.sub = '3b3a1111-0000-0000-0000-000000000001';

select suite_results.check_fail('C16', 'owner check_in -> Insufficient role',
  $s$select public.check_in('x')$s$,
  '42501', 'Insufficient role');
commit;

-- C17: member token with NO linked member record
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b3a1212-0000-0000-0000-000000000012","role":"member"}';
set local request.jwt.claim.sub = '3b3a1212-0000-0000-0000-000000000012';

select suite_results.check_fail('C17', 'member account without a member record refused',
  $s$select public.check_in('x')$s$,
  '42501', 'No member record');
commit;

-- =====================================================================
-- SECTION V — verify_payment (stacking math, plan gates, self-verify,
-- frozen renewal, first payment, post-expiry re-anchor) + the O-10
-- scan-ends-freeze companion test
-- =====================================================================

-- V01: self-verification default-deny (unresolved #1)
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b3a2222-0000-0000-0000-000000000002","role":"receptionist","aal":"aal2"}';
set local request.jwt.claim.sub = '3b3a2222-0000-0000-0000-000000000002';

select suite_results.check_fail('V01', 'recA cannot verify own recording (segregation of duties)',
  $s$select public.verify_payment('3b3e0004-0000-0000-0000-000000000004'::uuid)$s$,
  '42501', 'Self-verification is not permitted');

-- V02: recA verifies PW1 (recorded by recB) -> stacked renewal
select suite_results.check_ok('V02', 'recA verifies PW1 (AAL2)',
  $s$select public.verify_payment('3b3e0002-0000-0000-0000-000000000002'::uuid)$s$);
commit;

-- V03: stacking math (§4.2 anchored): start = 2026-12-02,
-- end = 2026-09-01 + 4 months = 2027-01-01; member end/price updated;
-- verifier attributed; audited
select suite_results.check_true('V03', 'PW1 verified: anchored stacking 2026-12-02..2027-01-01, member updated',
  (
    select p.state = 'verified'
       and p.verified_by = '3b3a2222-0000-0000-0000-000000000002'
       and p.verified_at is not null
      from public.payments p
     where p.id = '3b3e0002-0000-0000-0000-000000000002'
  ) and (
    select count(*) = 1 from public.membership_periods pp
     where pp.created_by_payment = '3b3e0002-0000-0000-0000-000000000002'
       and pp.start_date = '2026-12-02'
       and pp.end_date = '2027-01-01'
       and pp.price_applied = 1500.00
  ) and (
    select m.membership_end = '2027-01-01' and m.price_locked = 1500.00
      from public.members m
     where m.id = '3b3b2222-0000-0000-0000-000000000002'
  ) and (
    select count(*) = 1 from public.audit_log_entries
     where action = 'payment.verified'
       and row_id = '3b3e0002-0000-0000-0000-000000000002'
  ),
  'renewal-before-expiry stacks from the era anchor, not from a clamped end');

-- V04: double-verify impossible (conditional transition)
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b3a2222-0000-0000-0000-000000000002","role":"receptionist","aal":"aal2"}';
set local request.jwt.claim.sub = '3b3a2222-0000-0000-0000-000000000002';

select suite_results.check_fail('V04', 'verifying PW1 again refused (not awaiting)',
  $s$select public.verify_payment('3b3e0002-0000-0000-0000-000000000002'::uuid)$s$,
  '55000', 'not awaiting verification');

-- V05: inactive plan gate (3B.2 audit condition C / LOW-03)
select suite_results.check_fail('V05', 'verifying against an INACTIVE plan refused',
  $s$select public.verify_payment('3b3e0005-0000-0000-0000-000000000005'::uuid)$s$,
  '55000', 'inactive');

-- V06: plan/member consistency gate
select suite_results.check_fail('V06', 'payment plan inconsistent with member plan refused',
  $s$select public.verify_payment('3b3e0006-0000-0000-0000-000000000006'::uuid)$s$,
  '55000', 'inconsistent');

-- V07: renewal while frozen refused (O-04; fz3 approved and covering now)
select suite_results.check_fail('V07', 'renewal for a frozen member refused',
  $s$select public.verify_payment('3b3e0008-0000-0000-0000-000000000008'::uuid)$s$,
  '55000', 'currently frozen');

-- V08: post-expiry re-anchor (O-05) — M3 renewed at TODAY
select suite_results.check_ok('V08', 'recA verifies PW6 for expired M3 (re-anchor)',
  $s$select public.verify_payment('3b3e0007-0000-0000-0000-000000000007'::uuid)$s$);
commit;

-- V09: re-anchored period: start = gym-today, end = +1 month; gap days
-- uncovered, no retroactivity
select suite_results.check_true('V09', 'PW6 period re-anchored at verification date',
  (
    select count(*) = 1 from public.membership_periods pp
     where pp.created_by_payment = '3b3e0007-0000-0000-0000-000000000007'
       and pp.start_date = public.app_gym_date()
       and pp.end_date = (public.app_gym_date() + interval '1 month')::date
       and pp.price_applied = 1500.00
  ) and (
    select m.membership_end = (public.app_gym_date() + interval '1 month')::date
      from public.members m
     where m.id = '3b3b3333-0000-0000-0000-000000000003'
  ),
  'post-expiry renewal starts at the actual verification date');

-- V10/V11: first-ever payment (M1 pendingPayment) -> period from today
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b3a2222-0000-0000-0000-000000000002","role":"receptionist","aal":"aal2"}';
set local request.jwt.claim.sub = '3b3a2222-0000-0000-0000-000000000002';

select suite_results.check_ok('V10', 'recA verifies PW2 (M1 first payment)',
  $s$select public.verify_payment('3b3e0003-0000-0000-0000-000000000003'::uuid)$s$);
commit;

select suite_results.check_true('V11', 'M1 pendingPayment -> active until today + 1 month',
  (
    select m.membership_end = (public.app_gym_date() + interval '1 month')::date
       and m.price_locked = 1500.00
      from public.members m
     where m.id = '3b3b1111-0000-0000-0000-000000000001'
  ),
  'never-paid member becomes active on first verification');

-- V12: owner cannot verify (role gate before anything else)
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b3a1111-0000-0000-0000-000000000001","role":"owner","aal":"aal2"}';
set local request.jwt.claim.sub = '3b3a1111-0000-0000-0000-000000000001';

select suite_results.check_fail('V12', 'owner verify_payment -> Insufficient role',
  $s$select public.verify_payment('3b3e000c-0000-0000-0000-00000000000c'::uuid)$s$,
  '42501', 'Insufficient role');
commit;

-- V13: the frozen member scans the gym QR -> O-10: the scan ENDS fz3
-- (and the same token reuse by a different member is fine)
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b3a5555-0000-0000-0000-000000000005","role":"member"}';
set local request.jwt.claim.sub = '3b3a5555-0000-0000-0000-000000000005';

select suite_results.check_ok('V13', 'member4 scans with token a while frozen',
  $s$select public.check_in((select token from suite_results.tokens where k = 'a'))$s$);
commit;

-- V14: fz3 ended via scan, attributed to the member; audited; M4 got
-- ordinary verified attendance (O-35: failed scans are never stored,
-- but this one succeeded)
select suite_results.check_true('V14', 'fz3 ended via scan; audit freeze.ended_scan; M4 attendance stored',
  (
    select f.state = 'ended' and f.ended_via = 'scan'
       and f.ended_by = '3b3a5555-0000-0000-0000-000000000005'
       and f.ended_at is not null
      from public.membership_freezes f
     where f.id = '3b310003-0000-0000-0000-000000000003'
  ) and (
    select count(*) = 1 from public.audit_log_entries
     where action = 'freeze.ended_scan'
       and row_id = '3b310003-0000-0000-0000-000000000003'
  ) and (
    select count(*) = 1 from public.attendance_events
     where member_id = '3b3b4444-0000-0000-0000-000000000004'
  ),
  'scan-vs-receptionist unfreeze: the member scan wins cleanly and still attends');

-- =====================================================================
-- SECTION J — reject_payment (same self-rule as verify; attribution in
-- verified_by/verified_at as required by 0001's pairing constraints;
-- NOT AAL2-gated by design)
-- =====================================================================

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b3a2222-0000-0000-0000-000000000002","role":"receptionist"}';
set local request.jwt.claim.sub = '3b3a2222-0000-0000-0000-000000000002';

-- J01: recA rejects PW10 (recorded by recB)
select suite_results.check_ok('J01', 'recA rejects PW10',
  $s$select public.reject_payment('3b3e000a-0000-0000-0000-00000000000a'::uuid)$s$);

-- J02: double-reject impossible
select suite_results.check_fail('J02', 'rejecting PW10 again refused (not awaiting)',
  $s$select public.reject_payment('3b3e000a-0000-0000-0000-00000000000a'::uuid)$s$,
  '55000', 'not awaiting verification');

-- J03: self-rejection default-deny (unresolved #1)
select suite_results.check_fail('J03', 'recA cannot reject own recording',
  $s$select public.reject_payment('3b3e0004-0000-0000-0000-000000000004'::uuid)$s$,
  '42501', 'Self-rejection is not permitted');

-- J04: a VERIFIED payment cannot be rejected
select suite_results.check_fail('J04', 'rejecting verified PV1 refused',
  $s$select public.reject_payment('3b3e0001-0000-0000-0000-000000000001'::uuid)$s$,
  '55000', 'not awaiting verification');

-- J05: unknown payment id
select suite_results.check_fail('J05', 'rejecting an unknown payment refused',
  $s$select public.reject_payment(gen_random_uuid())$s$,
  'P0002', 'Payment not found');
commit;

-- J06: rejected rows carry the deciding receptionist (0001 requires
-- verified_by/verified_at for decided rows) + audit
select suite_results.check_true('J06', 'PW10 rejected with decider attribution + audit',
  (
    select p.state = 'rejected'
       and p.verified_by = '3b3a2222-0000-0000-0000-000000000002'
       and p.verified_at is not null
      from public.payments p
     where p.id = '3b3e000a-0000-0000-0000-00000000000a'
  ) and (
    select count(*) = 1 from public.audit_log_entries
     where action = 'payment.rejected'
       and row_id = '3b3e000a-0000-0000-0000-00000000000a'
       and actor = '3b3a2222-0000-0000-0000-000000000002'
  ),
  'verified_by doubles as the decision attribution for rejections');

-- J07: owner cannot reject
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b3a1111-0000-0000-0000-000000000001","role":"owner","aal":"aal2"}';
set local request.jwt.claim.sub = '3b3a1111-0000-0000-0000-000000000001';

select suite_results.check_fail('J07', 'owner reject_payment -> Insufficient role',
  $s$select public.reject_payment('3b3e0004-0000-0000-0000-000000000004'::uuid)$s$,
  '42501', 'Insufficient role');
commit;

-- =====================================================================
-- SECTION X — reversals (append-only rows, remaining-amount math, void
-- mechanics, self-reverse deny) and the deferred commit-time backstop
-- =====================================================================

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b3a2222-0000-0000-0000-000000000002","role":"receptionist","aal":"aal2"}';
set local request.jwt.claim.sub = '3b3a2222-0000-0000-0000-000000000002';

-- X01: an AWAITING payment cannot be reversed
select suite_results.check_fail('X01', 'reversing an unverified payment refused',
  $s$select public.create_reversal('3b3e0014-0000-0000-0000-000000000014'::uuid, 100)$s$,
  '55000', 'Only verified payments');

-- X02: self-reversal default-deny (unresolved #2): recorded OR verified
-- by the actor
select suite_results.check_fail('X02', 'recA cannot reverse a payment she recorded AND verified',
  $s$select public.create_reversal('3b3e0012-0000-0000-0000-000000000012'::uuid, 100)$s$,
  '42501', 'Self-reversal is not permitted');

-- X03: unknown original
select suite_results.check_fail('X03', 'reversing an unknown payment refused',
  $s$select public.create_reversal(gen_random_uuid(), 100)$s$,
  'P0002', 'Original payment not found');

-- X04: amount must be positive
select suite_results.check_fail('X04', 'zero-amount reversal refused',
  $s$select public.create_reversal('3b3e0010-0000-0000-0000-000000000010'::uuid, 0)$s$,
  '55000', 'must be positive');

-- X05: whole rupees only
select suite_results.check_fail('X05', 'fractional reversal amount refused',
  $s$select public.create_reversal('3b3e0010-0000-0000-0000-000000000010'::uuid, 300.50)$s$,
  '55000', 'whole rupee');

-- X06: recA reverses 500 of PV2 (recorded recB, verified owner)
select suite_results.check_ok('X06', 'recA reverses 500 of PV2',
  $s$select public.create_reversal('3b3e0010-0000-0000-0000-000000000010'::uuid, 500)$s$);
commit;

-- X07: the reversal row is append-only, instantly verified, mirrors the
-- original's method, attributed; partials touch NO period and NO
-- membership_end (O-24); audited
select suite_results.check_true('X07', '500 reversal stored verified/attributed; no period impact; audited',
  (
    select r.entry_type = 'reversal'
       and r.reversal_of = '3b3e0010-0000-0000-0000-000000000010'
       and r.state = 'verified'
       and r.payable = 500.00
       and r.original_price = 500.00
       and r.method = 'cash'
       and r.currency = 'INR'
       and r.recorded_by = '3b3a2222-0000-0000-0000-000000000002'
       and r.verified_by = '3b3a2222-0000-0000-0000-000000000002'
       and r.verified_at is not null
      from public.payments r
     where r.reversal_of = '3b3e0010-0000-0000-0000-000000000010'
  ) and (
    select m.membership_end = '2027-01-01'
      from public.members m
     where m.id = '3b3b2222-0000-0000-0000-000000000002'
  ) and (
    -- scoped to this suite's data: the UNMODIFIED 0001 regression suite
    -- deliberately leaves its own full-reversal + void fixture behind
    -- (bbbb/aaaa ids), and 0002's cleanup preserves it, so a GLOBAL
    -- voids count is 1 before this suite ever runs. The partial
    -- reversal must not have voided any 3B.3 period.
    select count(*) = 0 from public.membership_period_voids
     where period_id::text like '3b3%'
        or voided_by::text like '3b3%'
        or reversal_id::text like '3b3%'
  ) and (
    select count(*) = 1 from public.audit_log_entries
     where action = 'payment.reversed'
       and (new_values ->> 'reversal_of') = '3b3e0010-0000-0000-0000-000000000010'
       and (new_values ->> 'full_reversal') = 'false'
  ),
  'partial reversal: money only, membership untouched (O-24)');

-- X08: second partial taking the sum to exactly 1500 (full via sum,
-- NOT via a single full amount -> no void, since payV2 has no period)
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b3a2222-0000-0000-0000-000000000002","role":"receptionist","aal":"aal2"}';
set local request.jwt.claim.sub = '3b3a2222-0000-0000-0000-000000000002';

select suite_results.check_ok('X08', 'recA reverses another 1000 of PV2 (sum = full)',
  $s$select public.create_reversal('3b3e0010-0000-0000-0000-000000000010'::uuid, 1000)$s$);

-- X09: over-refund refused by the remaining-amount check
select suite_results.check_fail('X09', 'reversal beyond remaining refused',
  $s$select public.create_reversal('3b3e0010-0000-0000-0000-000000000010'::uuid, 1100)$s$,
  '55000', 'exceeds the remaining');

-- X10: remaining is now exactly 0 — even 1 rupee is refused
select suite_results.check_fail('X10', 'reversal of 1 with remaining 0 refused',
  $s$select public.create_reversal('3b3e0010-0000-0000-0000-000000000010'::uuid, 1)$s$,
  '55000', 'exceeds the remaining');

-- X11: FULL reversal of PV4 (amount = payable) -> voids PR7 and
-- reconstructs membership_end from the remaining non-voided periods
select suite_results.check_ok('X11', 'recA fully reverses PV4 (M7)',
  $s$select public.create_reversal('3b3e0011-0000-0000-0000-000000000011'::uuid, 1500)$s$);
commit;

-- X12: void row references the period + the reversal + the voiding
-- actor; M7 (whose only period was voided) has membership_end = null
select suite_results.check_true('X12', 'full reversal voided PR7; M7 membership_end -> null; audited full',
  (
    select count(*) = 1 from public.membership_period_voids v
     where v.period_id = '3b3f3333-0000-0000-0000-000000000003'
       and v.voided_by = '3b3a2222-0000-0000-0000-000000000002'
       and v.reversal_id = (select id from public.payments
                             where reversal_of = '3b3e0011-0000-0000-0000-000000000011')
  ) and (
    select m.membership_end is null
      from public.members m
     where m.id = '3b3b8888-0000-0000-0000-000000000008'
  ) and (
    select count(*) = 1 from public.audit_log_entries
     where action = 'payment.reversed'
       and (new_values ->> 'reversal_of') = '3b3e0011-0000-0000-0000-000000000011'
       and (new_values ->> 'full_reversal') = 'true'
       and (new_values ->> 'period_voided') = '3b3f3333-0000-0000-0000-000000000003'
  ),
  'O-23: full reversal voids ONLY the linked period; end reconstructed from non-voided periods');

-- X13: commit-time backstop [§5.3/§7]: a DIRECT insert that bypasses
-- create_reversal's own check is still capped at commit — the deferred
-- constraint trigger fires when constraints are made immediate
select suite_results.check_fail('X13', 'direct over-refund insert caught by deferred backstop at SET CONSTRAINTS',
  $s$do $x$ begin
    insert into public.payments
      (member_id, plan_id, entry_type, reversal_of, original_price,
       discount_pct, discount_amount, payable, method, state,
       recorded_by, verified_by, verified_at)
    values
      ('3b3b2222-0000-0000-0000-000000000002', '3b3c1111-0000-0000-0000-000000000001',
       'reversal', '3b3e0010-0000-0000-0000-000000000010', 100.00, 0, 0, 100.00,
       'cash', 'verified', '3b3a2222-0000-0000-0000-000000000002',
       '3b3a9999-0000-0000-0000-000000000009', now());
    set constraints all immediate;
  end $x$$s$,
  '23514', 'Cumulative reversals');

-- X14: the failed insert left no trace and PV2's reversals still sum to
-- exactly the original
select suite_results.check_true('X14', 'backstop fired cleanly: PV2 reversals sum = 1500 = payable',
  (
    select coalesce(sum(payable), 0) = 1500.00
      from public.payments
     where reversal_of = '3b3e0010-0000-0000-0000-000000000010'
       and entry_type = 'reversal'
       and state = 'verified'
  ),
  'over-refund impossible on any path');

-- =====================================================================
-- SECTION P — plan price, member discount, plan assignment applied at
-- verification, gym settings
-- =====================================================================

-- P01: owner raises plan C5 1200 -> 1300 [REC: owner-only]
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b3a1111-0000-0000-0000-000000000001","role":"owner","aal":"aal2"}';
set local request.jwt.claim.sub = '3b3a1111-0000-0000-0000-000000000001';

select suite_results.check_ok('P01', 'owner updates plan price to 1300',
  $s$select public.update_plan_price('3b3c5555-0000-0000-0000-000000000005'::uuid, 1300)$s$);

select suite_results.check_fail('P04', 'zero plan price refused',
  $s$select public.update_plan_price('3b3c5555-0000-0000-0000-000000000005'::uuid, 0)$s$,
  '55000', 'must be positive');

select suite_results.check_fail('P05', 'owner cannot set member discounts (O-15 owner read-only)',
  $s$select public.set_member_discount('3b3b5555-0000-0000-0000-000000000005'::uuid, 10)$s$,
  '42501', 'Insufficient role');

select suite_results.check_fail('P18', 'unknown timezone refused',
  $s$select public.update_gym_settings('Mars/Olympus', null, null, null)$s$,
  '55000', 'Unknown time zone');

select suite_results.check_fail('P19', 'token validity 700 refused (bounded 5..600)',
  $s$select public.update_gym_settings(null, null, null, 700)$s$,
  '55000', 'between 5 and 600');
commit;

-- P02: price persisted + audited with old/new values
select suite_results.check_true('P02', 'plan price persisted 1300, audited 1200 -> 1300',
  (
    select pl.price = 1300.00
      from public.plans pl
     where pl.id = '3b3c5555-0000-0000-0000-000000000005'
  ) and (
    select count(*) = 1 from public.audit_log_entries
     where action = 'plan.price_changed'
       and row_id = '3b3c5555-0000-0000-0000-000000000005'
       and (old_values ->> 'price')::numeric = 1200
       and (new_values ->> 'price')::numeric = 1300
  ),
  'locked-price maintenance with full attribution');

-- P03: receptionist cannot change plan prices
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b3a2222-0000-0000-0000-000000000002","role":"receptionist"}';
set local request.jwt.claim.sub = '3b3a2222-0000-0000-0000-000000000002';

select suite_results.check_fail('P03', 'receptionist update_plan_price -> Insufficient role',
  $s$select public.update_plan_price('3b3c5555-0000-0000-0000-000000000005'::uuid, 1400)$s$,
  '42501', 'Insufficient role');

-- P17: receptionists cannot update gym settings (§8.2 owner-only)
select suite_results.check_fail('P17', 'receptionist cannot update gym settings',
  $s$select public.update_gym_settings(null, null, null, 90)$s$,
  '42501', 'Insufficient role');

-- P06: recA sets M5's discount to 10
select suite_results.check_ok('P06', 'recA sets discount 10 on M5',
  $s$select public.set_member_discount('3b3b5555-0000-0000-0000-000000000005'::uuid, 10)$s$);

select suite_results.check_fail('P08', 'discount 101 refused (data-validity range)',
  $s$select public.set_member_discount('3b3b5555-0000-0000-0000-000000000005'::uuid, 101)$s$,
  '55000', 'between 0 and 100');

-- P09: inactive plans cannot be assigned
select suite_results.check_fail('P09', 'assigning the inactive plan refused',
  $s$select public.request_plan_assignment('3b3b5555-0000-0000-0000-000000000005'::uuid,
                                            '3b3c2222-0000-0000-0000-000000000002'::uuid)$s$,
  '55000', 'Plan is not active');

-- P10: pending assignment for the ACTIVE quarterly plan
select suite_results.check_ok('P10', 'recA requests plan C3 for M5',
  $s$select public.request_plan_assignment('3b3b5555-0000-0000-0000-000000000005'::uuid,
                                            '3b3c3333-0000-0000-0000-000000000003'::uuid)$s$);

commit;

-- P07: discount persisted + audited with old/new values (jsonb numeric
-- scale preserved: 0.00 / 10.00)
select suite_results.check_true('P07', 'discount persisted 10, audited with old/new',
  (
    select m.discount_pct = 10
      from public.members m
     where m.id = '3b3b5555-0000-0000-0000-000000000005'
  ) and (
    select count(*) = 1 from public.audit_log_entries
     where action = 'discount.set'
       and row_id = '3b3b5555-0000-0000-0000-000000000005'
       and (old_values ->> 'discount_pct')::numeric = 0
       and (new_values ->> 'discount_pct')::numeric = 10
  ),
  'O-12/O-14: saved discount is a suggestion, recorded with attribution');

-- P11: the pending assignment is stored on the member + audited (checked
-- BEFORE P13's verification, which clears it)
select suite_results.check_true('P11', 'pending assignment stored on M5 with requester + audit',
  (
    select m.pending_plan_id = '3b3c3333-0000-0000-0000-000000000003'
       and m.pending_plan_requested_by = '3b3a2222-0000-0000-0000-000000000002'
      from public.members m
     where m.id = '3b3b5555-0000-0000-0000-000000000005'
  ) and (
    select count(*) = 1 from public.audit_log_entries
     where action = 'plan.assignment_requested'
       and row_id = '3b3b5555-0000-0000-0000-000000000005'
  ),
  'assignment is a member-column pair, never applied by clients');

-- P12: one pending assignment at a time; P13: verification applies the
-- assignment ATOMICALLY first (§4.2), then creates the period
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b3a2222-0000-0000-0000-000000000002","role":"receptionist","aal":"aal2"}';
set local request.jwt.claim.sub = '3b3a2222-0000-0000-0000-000000000002';

select suite_results.check_fail('P12', 'second concurrent assignment refused (one pending at a time)',
  $s$select public.request_plan_assignment('3b3b5555-0000-0000-0000-000000000005'::uuid,
                                            '3b3c3333-0000-0000-0000-000000000003'::uuid)$s$,
  '55000', 'already pending');

select suite_results.check_ok('P13', 'recA verifies PW9 -> assignment applied, then period created',
  $s$select public.verify_payment('3b3e000d-0000-0000-0000-00000000000d'::uuid)$s$);
commit;

-- P14: applied state: plan switched, price_locked = plans.price AT the
-- verification moment (4000), pending pair cleared, quarterly period,
-- both audits emitted
select suite_results.check_true('P14', 'PW9 verify applied assignment atomically (plan C3, price 4000, pending cleared)',
  (
    select m.plan_id = '3b3c3333-0000-0000-0000-000000000003'
       and m.price_locked = 4000.00
       and m.pending_plan_id is null
       and m.pending_plan_requested_by is null
       and m.membership_end = (public.app_gym_date() + interval '3 months')::date
      from public.members m
     where m.id = '3b3b5555-0000-0000-0000-000000000005'
  ) and (
    select count(*) = 1 from public.membership_periods pp
     where pp.created_by_payment = '3b3e000d-0000-0000-0000-00000000000d'
       and pp.plan_id = '3b3c3333-0000-0000-0000-000000000003'
       and pp.start_date = public.app_gym_date()
       and pp.end_date = (public.app_gym_date() + interval '3 months')::date
       and pp.price_applied = 4000.00
  ) and (
    select count(*) = 1 from public.audit_log_entries
     where action = 'plan.assignment_applied'
       and row_id = '3b3b5555-0000-0000-0000-000000000005'
  ) and (
    select count(*) = 1 from public.audit_log_entries
     where action = 'payment.verified'
       and row_id = '3b3e000d-0000-0000-0000-00000000000d'
  ),
  '§4.2: applied atomically, then the period rules run — one transaction');

-- P15/P16: owner updates settings; validity 90 (after ALL mints, so the
-- default-validity path was exercised at 60)
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b3a1111-0000-0000-0000-000000000001","role":"owner","aal":"aal2"}';
set local request.jwt.claim.sub = '3b3a1111-0000-0000-0000-000000000001';

select suite_results.check_ok('P15', 'owner updates gym settings (upi + validity 90)',
  $s$select public.update_gym_settings(null, '3b3gym@upi', null, 90)$s$);
commit;

select suite_results.check_true('P16', 'settings persisted: validity 90, upi id, timezone kept',
  (
    select s.attendance_token_validity_seconds = 90
       and s.upi_id = '3b3gym@upi'
       and s.gym_timezone = 'Asia/Kolkata'
      from public.app_settings s
     where s.id = 1
  ) and (
    select count(*) = 1 from public.audit_log_entries
     where action = 'settings.changed'
       and (new_values ->> 'attendance_token_validity_seconds') = '90'
  ),
  'null parameters leave existing values untouched; audited');

-- =====================================================================
-- SECTION L — decide_application: the ONLY member-creation path
-- [audit condition D: linking integrity]
-- Stage 2H (M1): decide_application now enforces AAL2, so the approval
-- workflow below runs under genuine AAL2 receptionist claims.
-- =====================================================================

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b3a2222-0000-0000-0000-000000000002","role":"receptionist","aal":"aal2"}';
set local request.jwt.claim.sub = '3b3a2222-0000-0000-0000-000000000002';

-- L01: a STAFF profile cannot be hijacked into a member record
select suite_results.check_fail('L01', 'approving an application carrying a receptionist profile refused',
  $s$select public.decide_application('3b330002-0000-0000-0000-000000000002'::uuid, true)$s$,
  '42501', 'Only member profiles');

-- L02: rejecting the staff-carried application works (reject path does
-- not touch the profile)
select suite_results.check_ok('L02', 'recA rejects the staff application',
  $s$select public.decide_application('3b330002-0000-0000-0000-000000000002'::uuid, false)$s$);

-- L03: an auth account ALREADY linked to M6 cannot be re-linked
select suite_results.check_fail('L03', 'approving an application for an already-linked auth account refused',
  $s$select public.decide_application('3b330003-0000-0000-0000-000000000003'::uuid, true)$s$,
  '55000', 'already linked');

-- L04: an auth user WITHOUT a profile row is refused
select suite_results.check_fail('L04', 'approving an application whose auth user has no profile refused',
  $s$select public.decide_application('3b330004-0000-0000-0000-000000000004'::uuid, true)$s$,
  '55000', 'profile does not exist');

-- L05: approve the clean applicant (applP, member profile, unlinked)
select suite_results.check_ok('L05', 'recA approves app1 (applP)',
  $s$select public.decide_application('3b330001-0000-0000-0000-000000000001'::uuid, true)$s$);

select suite_results.check_fail('L07', 'deciding an already-approved application refused',
  $s$select public.decide_application('3b330001-0000-0000-0000-000000000001'::uuid, true)$s$,
  '55000', 'not decidable');

select suite_results.check_fail('L08', 'a draft application is not decidable',
  $s$select public.decide_application('3b330006-0000-0000-0000-000000000006'::uuid, true)$s$,
  '55000', 'not decidable');

-- L09: approve the no-auth application -> UNLINKED member created
select suite_results.check_ok('L09', 'recA approves app5 (no auth account)',
  $s$select public.decide_application('3b330005-0000-0000-0000-000000000005'::uuid, true)$s$);

select suite_results.check_fail('L11', 'deciding an already-decided application refused',
  $s$select public.decide_application('3b330005-0000-0000-0000-000000000005'::uuid, false)$s$,
  '55000', 'not decidable');
commit;

-- L06: the created member is linked to applP, joined on the gym-local
-- today, application approved with decider attribution + audit
select suite_results.check_true('L06', 'app1 approved: member linked to applP, joined today, attributed + audited',
  (
    select mm.auth_user_id = '3b3a1212-0000-0000-0000-000000000012'
       and mm.joined_on = public.app_gym_date()
       and mm.plan_id = '3b3c1111-0000-0000-0000-000000000001'
      from public.members mm
     where mm.auth_user_id = '3b3a1212-0000-0000-0000-000000000012'
  ) and (
    select j.state = 'approved'
       and j.decided_by = '3b3a2222-0000-0000-0000-000000000002'
       and j.decided_at is not null
      from public.join_applications j
     where j.id = '3b330001-0000-0000-0000-000000000001'
  ) and (
    select count(*) = 1 from public.audit_log_entries
     where action = 'application.decided'
       and row_id = '3b330001-0000-0000-0000-000000000001'
       and (new_values ->> 'member_id') = (select id::text from public.members
                                            where auth_user_id = '3b3a1212-0000-0000-0000-000000000012')
  ),
  'D-integrity: member created with the application''s plan and linked 1:1');

-- L10: the unlinked creation: no auth link, data carried over
select suite_results.check_true('L10', 'app5 approved: UNLINKED member created from the application data',
  (
    select mm.auth_user_id is null
       and mm.full_name = '3b3 Unlinked Applicant'
       and mm.phone = '+912000000005'
       and mm.plan_id = '3b3c1111-0000-0000-0000-000000000001'
      from public.members mm
     where mm.full_name = '3b3 Unlinked Applicant'
  ) and (
    select count(*) = 1 from public.members mm
     where mm.full_name = '3b3 Unlinked Applicant'
       and mm.auth_user_id is null
  ),
  'applications without an auth account create walk-in members');

-- L12: member token cannot decide applications
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b3a3333-0000-0000-0000-000000000003","role":"member"}';
set local request.jwt.claim.sub = '3b3a3333-0000-0000-0000-000000000003';

select suite_results.check_fail('L12', 'member decide_application -> Insufficient role',
  $s$select public.decide_application('3b330003-0000-0000-0000-000000000003'::uuid, true)$s$,
  '42501', 'Insufficient role');
commit;

-- =====================================================================
-- SECTION G — the REAL PostgREST login role (session_user =
-- authenticator): genuine RPC contexts for the AAL2 gates, the
-- transaction-local GUC in create_reversal, the pooled-session
-- regression [audit condition B], and the 0002 override regression
-- =====================================================================

\connect "host=127.0.0.1 port=5432 dbname=postgres user=authenticator"

-- G01: recA (AAL2) verifies PW12 through the genuine RPC surface
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b3a2222-0000-0000-0000-000000000002","role":"receptionist","aal":"aal2"}';
set local request.jwt.claim.sub = '3b3a2222-0000-0000-0000-000000000002';

select suite_results.check_ok('G01', 'authenticator RPC: recA (AAL2) verifies PW12',
  $s$select public.verify_payment('3b3e000c-0000-0000-0000-00000000000c'::uuid)$s$);
commit;

-- G02: second stacking round: era anchor 2026-12-02..2027-01-01 ->
-- start 2027-01-02, end 2026-12-02 + 2 months = 2027-02-02
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b3a2222-0000-0000-0000-000000000002","role":"receptionist"}';
set local request.jwt.claim.sub = '3b3a2222-0000-0000-0000-000000000002';

select suite_results.check_true('G02', 'PW12 stacked 2027-01-02..2027-02-02; member end advanced',
  (
    select count(*) = 1 from public.membership_periods pp
     where pp.created_by_payment = '3b3e000c-0000-0000-0000-00000000000c'
       and pp.start_date = '2027-01-02'
       and pp.end_date = '2027-02-02'
       and pp.price_applied = 1500.00
  ) and (
    select m.membership_end = '2027-02-02'
      from public.members m
     where m.id = '3b3b2222-0000-0000-0000-000000000002'
  ),
  'anchor arithmetic holds across consecutive same-plan renewals');

-- G03: AAL1 claims -> create_reversal refused at the genuine gate
select suite_results.check_fail('G03', 'authenticator RPC: reversal without AAL2 refused',
  $s$select public.create_reversal('3b3e0013-0000-0000-0000-000000000013'::uuid, 300)$s$,
  '42501', 'multi-factor authentication');

-- G04: AAL2 claims RE-ISSUED mid-transaction -> 300 of PV6 reversed
-- (recA is neither the recorder nor the verifier of PV6)
set local request.jwt.claims = '{"sub":"3b3a2222-0000-0000-0000-000000000002","role":"receptionist","aal":"aal2"}';

select suite_results.check_ok('G04', 'authenticator RPC: recA (AAL2) reverses 300 of PV6',
  $s$select public.create_reversal('3b3e0013-0000-0000-0000-000000000013'::uuid, 300)$s$);
commit;

-- G05: the reversal landed as provided and PV6's running total is 300
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b3a2222-0000-0000-0000-000000000002","role":"receptionist"}';
set local request.jwt.claim.sub = '3b3a2222-0000-0000-0000-000000000002';

select suite_results.check_true('G05', 'PV6 reversal row intact; cumulative 300 of 800',
  (
    select r.state = 'verified' and r.payable = 300.00
       and r.reversal_of = '3b3e0013-0000-0000-0000-000000000013'
      from public.payments r
     where r.reversal_of = '3b3e0013-0000-0000-0000-000000000013'
  ) and (
    select coalesce(sum(payable), 0) = 300.00
      from public.payments
     where reversal_of = '3b3e0013-0000-0000-0000-000000000013'
       and entry_type = 'reversal' and state = 'verified'
  ),
  'authority path inserts the exact row it intends (override skipped)');
commit;

-- G06: pooled-session regression [audit condition B]: the SAME physical
-- connection, next transaction — the transaction-local GUC set inside
-- create_reversal is gone; it can never leak into a subsequent request.
-- (Engine fact: after a transaction-local set_config + COMMIT the
-- placeholder persists for the session with an EMPTY value — the
-- correct "not active" predicate is NULL-or-empty.)
select suite_results.check_true('G06', 'app.bypass_payment_override INACTIVE in the next transaction on the same connection',
  (select coalesce(current_setting('app.bypass_payment_override', true), '') = ''),
  'set_config(is_local => true) is scoped to the reversal transaction only');

-- G07: override regression in the genuine context (T01/T02 analog): a
-- plain receptionist INSERT is forced to awaitingVerification
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b3a2222-0000-0000-0000-000000000002","role":"receptionist"}';
set local request.jwt.claim.sub = '3b3a2222-0000-0000-0000-000000000002';

select suite_results.check_ok('G07', 'authenticator: recA records a payment (spoofed state discarded)',
  $s$insert into public.payments
    (id, member_id, plan_id, original_price, discount_pct, discount_amount,
     payable, method, state, recorded_by)
  values ('3b3e0020-0000-0000-0000-000000000020',
          '3b3b2222-0000-0000-0000-000000000002',
          '3b3c1111-0000-0000-0000-000000000001',
          1500.00, 0, 0.00, 1500.00, 'cash', 'verified',
          '3b3a2222-0000-0000-0000-000000000002')$s$);

select suite_results.check_true('G08', 'override forced awaitingVerification with no verifier',
  (
    select p.state = 'awaitingVerification'
       and p.verified_by is null
       and p.entry_type = 'payment'
       and p.currency = 'INR'
      from public.payments p
     where p.id = '3b3e0020-0000-0000-0000-000000000020'
  ),
  '0002 override contract intact underneath 0003');

-- G09/G10: member/owner INSERTs hit the override guard itself (BEFORE
-- INSERT fires before WITH CHECK on this engine — proven in 3B.2)
set local request.jwt.claims = '{"sub":"3b3a3333-0000-0000-0000-000000000003","role":"member"}';
set local request.jwt.claim.sub = '3b3a3333-0000-0000-0000-000000000003';

select suite_results.check_fail('G09', 'member INSERT into payments -> override guard',
  $s$insert into public.payments (member_id, plan_id, method, state, recorded_by)
  values ('3b3b2222-0000-0000-0000-000000000002',
          '3b3c1111-0000-0000-0000-000000000001',
          'cash', 'awaitingVerification', '3b3a3333-0000-0000-0000-000000000003')$s$,
  '42501', 'Only receptionists');

set local request.jwt.claims = '{"sub":"3b3a1111-0000-0000-0000-000000000001","role":"owner","aal":"aal2"}';
set local request.jwt.claim.sub = '3b3a1111-0000-0000-0000-000000000001';

select suite_results.check_fail('G10', 'owner INSERT into payments -> override guard (spoofed claim irrelevant)',
  $s$insert into public.payments (member_id, plan_id, method, state, recorded_by)
  values ('3b3b2222-0000-0000-0000-000000000002',
          '3b3c1111-0000-0000-0000-000000000001',
          'cash', 'awaitingVerification', '3b3a1111-0000-0000-0000-000000000001')$s$,
  '42501', 'Only receptionists');
commit;

-- G11: anon RPC through the real login role -> permission denied
begin;
set local role anon;

select suite_results.check_fail('G11', 'anon RPC verify_payment -> permission denied',
  $s$select public.verify_payment('3b3e0004-0000-0000-0000-000000000004'::uuid)$s$,
  '42', 'permission denied');
commit;

-- G12: member JWT calling verify -> Insufficient role (authoritative
-- profile role, not JWT claims)
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b3a3333-0000-0000-0000-000000000003","role":"receptionist"}';
set local request.jwt.claim.sub = '3b3a3333-0000-0000-0000-000000000003';

select suite_results.check_fail('G12', 'member JWT spoofing role=receptionist still refused (profile is authoritative)',
  $s$select public.verify_payment('3b3e0004-0000-0000-0000-000000000004'::uuid)$s$,
  '42501', 'Insufficient role');
commit;

-- G13/G14: the AAL2 gate on decide_freeze at the genuine RPC surface —
-- G13 runs under aal1 receptionist claims, then G14 RE-ISSUES the
-- claims with aal2 and approves fz6
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b3a2222-0000-0000-0000-000000000002","role":"receptionist"}';
set local request.jwt.claim.sub = '3b3a2222-0000-0000-0000-000000000002';

select suite_results.check_fail('G13', 'decide_freeze without AAL2 refused',
  $s$select public.decide_freeze('3b310006-0000-0000-0000-000000000006'::uuid, true)$s$,
  '42501', 'multi-factor authentication');

set local request.jwt.claims = '{"sub":"3b3a2222-0000-0000-0000-000000000002","role":"receptionist","aal":"aal2"}';

select suite_results.check_ok('G14', 'recA (AAL2) approves fz6',
  $s$select public.decide_freeze('3b310006-0000-0000-0000-000000000006'::uuid, true)$s$);
commit;

-- G15: fz6 approved with inclusive extension 5 (2027-05-01..05)
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b3a2222-0000-0000-0000-000000000002","role":"receptionist","aal":"aal2"}';
set local request.jwt.claim.sub = '3b3a2222-0000-0000-0000-000000000002';

select suite_results.check_true('G15', 'fz6 approved: extension_days 5',
  (
    select f.state = 'approved' and f.extension_days = 5
       and f.decided_by = '3b3a2222-0000-0000-0000-000000000002'
      from public.membership_freezes f
     where f.id = '3b310006-0000-0000-0000-000000000006'
  ),
  'inclusive window arithmetic at the genuine gate');

-- G16: double-decide impossible (conditional transition; the aal2 gate
-- must NOT mask the transition check, so aal2 claims stay active)
select suite_results.check_fail('G16', 'deciding fz6 again refused (already decided)',
  $s$select public.decide_freeze('3b310006-0000-0000-0000-000000000006'::uuid, true)$s$,
  '55000', 'already been decided');

-- G17/G18: mint gate in the genuine context; default validity now comes
-- from the P15-updated settings (90). G17 re-issues aal1 claims so the
-- gate itself is exercised; G18 re-issues aal2 and mints.
set local request.jwt.claims = '{"sub":"3b3a2222-0000-0000-0000-000000000002","role":"receptionist"}';

select suite_results.check_fail('G17', 'mint without AAL2 refused at the genuine gate',
  $s$select public.mint_attendance_token(null)$s$,
  '42501', 'multi-factor authentication');

set local request.jwt.claims = '{"sub":"3b3a2222-0000-0000-0000-000000000002","role":"receptionist","aal":"aal2"}';

select suite_results.check_ok('G18', 'recA (AAL2) mints with the updated 90 s default -> captured as key g',
  $s$with m as (select public.mint_attendance_token(null) as tok)
  insert into suite_results.tokens (k, token, token_hash)
  select 'g', tok, encode(sha256(convert_to(tok, 'utf8')), 'hex') from m
  returning k$s$);
commit;

\connect "host=127.0.0.1 port=5432 dbname=postgres user=postgres"

-- G19: the minted-at-90-default token really expires ~90 s out
select suite_results.check_true('G19', 'token g stored with ~90 s validity (settings-driven default)',
  (
    select t.expires_at between now() + interval '80 seconds'
                            and now() + interval '100 seconds'
      from public.qr_tokens t
     where t.token_hash = (select token_hash from suite_results.tokens where k = 'g')
  ),
  'app_settings.attendance_token_validity_seconds drives the default');

-- =====================================================================
-- SECTION Z — audit coverage, cleanup, verdict
-- =====================================================================

-- Z01: every authority-bearing action emitted exactly the audit rows the
-- suite exercised (30 rows across 15 distinct actions)
select suite_results.check_true('Z01', 'audit coverage: 30 rows across the 15 designed actions',
  (
    select count(*) = 30 and count(distinct action) = 15
      from public.audit_log_entries
     where action in (
       'payment.verified', 'payment.rejected', 'payment.reversed',
       'freeze.requested', 'freeze.approved', 'freeze.rejected',
       'freeze.ended', 'freeze.ended_scan',
       'application.decided', 'discount.set', 'plan.price_changed',
       'plan.assignment_requested', 'plan.assignment_applied',
       'settings.changed', 'token.minted')
  ),
  'expected: 5 verified, 1 rejected, 4 reversed, 3 requested, 3 approved, 1 rejected-freeze, 1 ended, 1 ended_scan, 3 applications, 1 discount, 1 price, 1 requested-assignment, 1 applied-assignment, 1 settings, 3 tokens');

-- Z02: cleanup — delete every trace of this suite (3b3 pattern + the
-- two L-section members by full_name/auth link). Order respects the
-- RESTRICT FKs (attendance -> voids -> periods -> payments -> freezes ->
-- applications -> follow-ups -> members -> tokens -> plans -> profiles
-- -> auth.users). Audit log entries: delete ALL (0002 precedent).
begin;
  delete from public.audit_log_entries;
  delete from public.attendance_events
   where member_id::text like '3b3%'
      or token_id in (select id from public.qr_tokens
                       where id::text like '3b3%' or minted_by::text like '3b3%');
  delete from public.membership_period_voids
   where period_id::text like '3b3%' or voided_by::text like '3b3%'
      or reversal_id::text like '3b3%';
  delete from public.membership_periods
   where id::text like '3b3%' or member_id::text like '3b3%'
      or created_by_payment::text like '3b3%';
  delete from public.payments
   where id::text like '3b3%' or member_id::text like '3b3%'
      or recorded_by::text like '3b3%' or verified_by::text like '3b3%'
      or reversal_of::text like '3b3%';
  delete from public.membership_freezes
   where id::text like '3b3%' or member_id::text like '3b3%'
      or requested_by::text like '3b3%' or decided_by::text like '3b3%'
      or ended_by::text like '3b3%';
  delete from public.join_applications
   where id::text like '3b3%' or auth_user_id::text like '3b3%'
      or decided_by::text like '3b3%';
  delete from public.follow_up_events where member_id::text like '3b3%';
  delete from public.members
   where id::text like '3b3%' or auth_user_id::text like '3b3%'
      or full_name like '3b3%';
  delete from public.qr_tokens
   where id::text like '3b3%' or minted_by::text like '3b3%';
  delete from public.plans where id::text like '3b3%';
  delete from public.profiles where id::text like '3b3%';
  delete from auth.users where id::text like '3b3%';
  update public.app_settings
     set attendance_token_validity_seconds = 60,
         upi_id = null
   where id = 1;
commit;

select suite_results.check_ok('Z03', 'cleanup committed',
  $s$select 1$s$);

-- Z04: zero residue across every table the suite touched
select suite_results.check_true('Z04', 'zero residue after cleanup',
  (
    select (select count(*) from public.members
             where id::text like '3b3%' or auth_user_id::text like '3b3%'
                or full_name like '3b3%') = 0
       and (select count(*) from public.profiles
             where id::text like '3b3%') = 0
       and (select count(*) from public.plans
             where id::text like '3b3%') = 0
       and (select count(*) from public.payments
             where id::text like '3b3%' or member_id::text like '3b3%'
                or recorded_by::text like '3b3%') = 0
       and (select count(*) from public.membership_periods
             where id::text like '3b3%' or member_id::text like '3b3%') = 0
       and (select count(*) from public.membership_period_voids
             where voided_by::text like '3b3%') = 0
       and (select count(*) from public.membership_freezes
             where id::text like '3b3%' or member_id::text like '3b3%') = 0
       and (select count(*) from public.join_applications
             where id::text like '3b3%' or auth_user_id::text like '3b3%') = 0
       and (select count(*) from public.attendance_events
             where member_id::text like '3b3%') = 0
       and (select count(*) from public.qr_tokens
             where id::text like '3b3%' or minted_by::text like '3b3%') = 0
       and (select count(*) from public.follow_up_events
             where member_id::text like '3b3%') = 0
       and (select count(*) from auth.users
             where id::text like '3b3%') = 0
       and (select count(*) from public.audit_log_entries) = 0
  ),
  'the database is back to the post-reset + 0001-suite fixture state');

-- =====================================================================
-- verdict
-- =====================================================================
do $v$
declare
  v_total integer;
  v_fail  integer;
begin
  select count(*), count(*) filter (where not passed)
    into v_total, v_fail
    from suite_results.t_results;

  raise notice '0003 validation: % of % assertions passed', v_total - v_fail, v_total;

  if v_fail > 0 then
    raise exception '0003 VALIDATION FAILED: % of % assertions failed', v_fail, v_total;
  end if;
end
$v$;

select num, label, detail from suite_results.t_results order by num;

drop schema suite_results cascade;
