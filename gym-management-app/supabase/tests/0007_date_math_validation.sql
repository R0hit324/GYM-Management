-- =====================================================================
-- tests/0007_date_math_validation.sql
-- Phase 3B.5 date-math validation: month-end and leap-year anchoring,
-- freeze periods (active / future / pending / early unfreeze / scan
-- termination), overlapping freezes, timezone boundaries, 30-day
-- inactivity (incl. the B2 never-attended anchor), and the B1/R14
-- derived-expiry arithmetic used by verify_payment().
--
-- Prerequisites: local Supabase stack; database freshly reset with
-- migrations 0001-0004 applied; suites 0001-0006 already ran in order.
-- Fixture UUIDs are 3b7*-prefixed and disjoint; cleanup removes them.
--
-- All dates are derived from public.app_gym_date() (the configured gym
-- timezone), so the suite is run-date independent. The only fixed dates
-- are the 2036 leap-year fixtures; A00 asserts they are still in the
-- future so the anchored-renewal branch is the one under test.
--
-- DEFECT REGRESSION (fixed in this phase): a freeze ended AFTER its
-- scheduled end_date used to credit every day up to ended_at-1, past
-- the approved window. The approved rule (3B.4 §4.4) is
--   f = clamp(gym_local(ended_at) - start_date, 0, A)
-- so the consumed range must be capped at end_date. C14-C15 and D05-D06
-- pin the clamped arithmetic in both verify_payment() and the views.
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

create function suite_results.record(
  p_num text, p_label text, p_ok boolean, p_detail text
) returns void language sql as $$
  insert into suite_results.t_results
  values (p_num, p_label,
          coalesce(p_ok, false),
          case when p_ok is null
               then 'NULL condition (treated as FAIL): ' || coalesce(p_detail, '')
               else p_detail end);
$$;

create function suite_results.check_true(
  p_num text, p_label text, p_ok boolean, p_detail text
) returns void language sql as $$
  insert into suite_results.t_results
  values (p_num, p_label,
          coalesce(p_ok, false),
          case when p_ok is null
               then 'NULL condition (treated as FAIL): ' || coalesce(p_detail, '')
               else p_detail end);
$$;

-- positive RPC helper: the statement must succeed AND touch a row.
create function suite_results.check_ok(
  p_num text, p_label text, p_stmt text
) returns void language plpgsql as $$
declare
  v_rows   bigint;
  v_detail text;
  v_msg    text;
begin
  begin
    execute p_stmt;
    get diagnostics v_rows = ROW_COUNT;
    if v_rows = 0 then
      perform suite_results.record(p_num, p_label, false,
        'statement matched no rows (vacuous pass rejected)');
    else
      perform suite_results.record(p_num, p_label, true,
        format('accepted as expected (%s row(s))', v_rows));
    end if;
  exception when others then
    get stacked diagnostics v_msg = MESSAGE_TEXT;
    perform suite_results.record(p_num, p_label, false,
      'expected success, got error: ' || v_msg);
  end;
end $$;

-- negative RPC helper: SQLSTATE + message fragment must match.
create function suite_results.check_fail(
  p_num text, p_label text, p_stmt text,
  p_state text, p_frag text default null
) returns void language plpgsql as $$
declare
  v_state text;
  v_msg   text;
  v_ok    boolean;
begin
  begin
    execute p_stmt;
    perform suite_results.record(p_num, p_label, false,
      format('expected %s ("%s"), statement unexpectedly succeeded', p_state, p_frag));
  exception when others then
    get stacked diagnostics v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT;
    v_ok := left(v_state, 2) = left(p_state, 2)
            and (p_frag is null
                 or position(lower(p_frag) in lower(v_msg)) > 0);
    perform suite_results.record(p_num, p_label, v_ok,
      format('SQLSTATE %s: %s', v_state, v_msg));
  end;
end $$;

grant execute on function suite_results.record(text,text,boolean,text) to public;
grant execute on function suite_results.check_true(text,text,boolean,text) to public;
grant execute on function suite_results.check_ok(text,text,text) to public;
grant execute on function suite_results.check_fail(text,text,text,text,text) to public;

-- The fixtures below anchor every derived date to the gym date that is
-- current when they are inserted. The timezone-boundary checks later switch
-- app_settings.gym_timezone, so they must measure their expected offsets
-- from this captured anchor — re-evaluating app_gym_date() under the new
-- zone would move "today" by a day and make the suite clock-dependent.
create temporary table suite_anchor as select public.app_gym_date() as d;

-- =====================================================================
-- fixtures (as supabase_admin). Personas: recA verifies, recB records
-- (so no self-verification), memberS/memberT scan.
-- =====================================================================

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '3b7a1111-0000-0000-0000-000000000001', 'authenticated', 'authenticated', '3b7-rec-a@example.com', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '3b7a2222-0000-0000-0000-000000000002', 'authenticated', 'authenticated', '3b7-rec-b@example.com', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '3b7a3333-0000-0000-0000-000000000003', 'authenticated', 'authenticated', '3b7-scan-s@example.com', 'x', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '3b7a4444-0000-0000-0000-000000000004', 'authenticated', 'authenticated', '3b7-scan-t@example.com', 'x', now(), now());

insert into public.profiles (id, display_name, role) values
  ('3b7a1111-0000-0000-0000-000000000001', '3b7 Rec A', 'receptionist'),
  ('3b7a2222-0000-0000-0000-000000000002', '3b7 Rec B', 'receptionist'),
  ('3b7a3333-0000-0000-0000-000000000003', '3b7 Scan S', 'member'),
  ('3b7a4444-0000-0000-0000-000000000004', '3b7 Scan T', 'member');

insert into public.plans (id, name, duration, price, is_active) values
  ('3b7c1111-0000-0000-0000-000000000001', '3b7 Monthly', 'monthly', 1500.00, true),
  ('3b7c2222-0000-0000-0000-000000000002', '3b7 Yearly',  'yearly',  9000.00, true);

insert into public.members
  (id, full_name, phone, plan_id, price_locked, membership_end, auth_user_id, joined_on)
values
  -- B: month-end / leap / re-anchor / first payment
  ('3b7b0101-0000-0000-0000-000000000101', '3b7 MonthEnd',  '+919701000001', '3b7c1111-0000-0000-0000-000000000001', 1500.00, '2036-02-29', null, public.app_gym_date() - 400),
  ('3b7b0202-0000-0000-0000-000000000202', '3b7 LeapYear',  '+919701000002', '3b7c2222-0000-0000-0000-000000000002', 9000.00, '2037-02-28', null, public.app_gym_date() - 400),
  ('3b7b0303-0000-0000-0000-000000000303', '3b7 PostExpiry','+919701000003', '3b7c1111-0000-0000-0000-000000000001', 1500.00, public.app_gym_date() - 10, null, public.app_gym_date() - 100),
  ('3b7b0404-0000-0000-0000-000000000404', '3b7 FirstPay',  '+919701000004', '3b7c1111-0000-0000-0000-000000000001', null,    null,                          null, public.app_gym_date() - 5),
  -- C: freeze arithmetic
  ('3b7b0505-0000-0000-0000-000000000505', '3b7 Active',    '+919701000005', '3b7c1111-0000-0000-0000-000000000001', 1500.00, public.app_gym_date() + 30, null, public.app_gym_date() - 100),
  ('3b7b0606-0000-0000-0000-000000000606', '3b7 Future',    '+919701000006', '3b7c1111-0000-0000-0000-000000000001', 1500.00, public.app_gym_date() + 20, null, public.app_gym_date() - 100),
  ('3b7b0707-0000-0000-0000-000000000707', '3b7 Pending',   '+919701000007', '3b7c1111-0000-0000-0000-000000000001', 1500.00, public.app_gym_date() + 20, null, public.app_gym_date() - 100),
  ('3b7b0808-0000-0000-0000-000000000808', '3b7 EarlyEnd',  '+919701000008', '3b7c1111-0000-0000-0000-000000000001', 1500.00, public.app_gym_date() + 20, null, public.app_gym_date() - 100),
  ('3b7b0909-0000-0000-0000-000000000909', '3b7 Overlap',   '+919701000009', '3b7c1111-0000-0000-0000-000000000001', 1500.00, public.app_gym_date() + 20, null, public.app_gym_date() - 100),
  ('3b7b1010-0000-0000-0000-000000000a10', '3b7 LateEnd',   '+919701000010', '3b7c1111-0000-0000-0000-000000000001', 1500.00, public.app_gym_date() + 20, null, public.app_gym_date() - 100),
  -- F: earned days preserved across two renewals
  ('3b7b1111-0000-0000-0000-000000000b11', '3b7 Preserve',  '+919701000011', '3b7c1111-0000-0000-0000-000000000001', 1500.00, public.app_gym_date() + 10, null, public.app_gym_date() - 100),
  -- E: scan terminates freeze
  ('3b7b1212-0000-0000-0000-000000000c12', '3b7 ScanEnd',   '+919701000012', '3b7c1111-0000-0000-0000-000000000001', 1500.00, public.app_gym_date() + 10, '3b7a3333-0000-0000-0000-000000000003', public.app_gym_date() - 100),
  ('3b7b1313-0000-0000-0000-000000000d13', '3b7 ScanStart', '+919701000013', '3b7c1111-0000-0000-0000-000000000001', 1500.00, public.app_gym_date() + 10, '3b7a4444-0000-0000-0000-000000000004', public.app_gym_date() - 100),
  -- timezone-boundary pair
  ('3b7b1414-0000-0000-0000-000000000e14', '3b7 Tz Kolkata','+919701000014', '3b7c1111-0000-0000-0000-000000000001', 1500.00, public.app_gym_date() + 20, null, public.app_gym_date() - 100),
  ('3b7b1515-0000-0000-0000-000000000f15', '3b7 Tz GMT+12', '+919701000015', '3b7c1111-0000-0000-0000-000000000001', 1500.00, public.app_gym_date() + 20, null, public.app_gym_date() - 100),
  -- D: inactivity (never-attended and attended)
  ('3b7b1616-0000-0000-0000-000000000616', '3b7 Never40',   '+919701000016', null, null, null, null, public.app_gym_date() - 40),
  ('3b7b1717-0000-0000-0000-000000000717', '3b7 Never5',    '+919701000017', null, null, null, null, public.app_gym_date() - 5),
  ('3b7b1818-0000-0000-0000-000000000818', '3b7 Att31',     '+919701000018', null, null, null, null, public.app_gym_date() - 100),
  ('3b7b1919-0000-0000-0000-000000000919', '3b7 Att30',     '+919701000019', null, null, null, null, public.app_gym_date() - 100),
  ('3b7b2020-0000-0000-0000-000000000a20', '3b7 Att40Frz',  '+919701000020', null, null, null, null, public.app_gym_date() - 100),
  ('3b7b2121-0000-0000-0000-000000000b21', '3b7 Att40Ovl',  '+919701000021', null, null, null, null, public.app_gym_date() - 100),
  ('3b7b2222-0000-0000-0000-000000000c22', '3b7 Att20Pre',  '+919701000022', null, null, null, null, public.app_gym_date() - 100);

insert into public.payments
  (id, member_id, plan_id, entry_type, original_price, discount_pct, discount_amount,
   payable, method, state, recorded_by, verified_by, verified_at)
values
  -- verified base payments
  ('3b7e0101-0000-0000-0000-000000000101', '3b7b0101-0000-0000-0000-000000000101', '3b7c1111-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'verified', '3b7a2222-0000-0000-0000-000000000002', '3b7a2222-0000-0000-0000-000000000002', now()),
  ('3b7e0201-0000-0000-0000-000000000201', '3b7b0202-0000-0000-0000-000000000202', '3b7c2222-0000-0000-0000-000000000002', 'payment', 9000.00, 0, 0, 9000.00, 'cash', 'verified', '3b7a2222-0000-0000-0000-000000000002', '3b7a2222-0000-0000-0000-000000000002', now()),
  ('3b7e0301-0000-0000-0000-000000000301', '3b7b0303-0000-0000-0000-000000000303', '3b7c1111-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'verified', '3b7a2222-0000-0000-0000-000000000002', '3b7a2222-0000-0000-0000-000000000002', now()),
  ('3b7e0501-0000-0000-0000-000000000501', '3b7b0505-0000-0000-0000-000000000505', '3b7c1111-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'verified', '3b7a2222-0000-0000-0000-000000000002', '3b7a2222-0000-0000-0000-000000000002', now()),
  ('3b7e0601-0000-0000-0000-000000000601', '3b7b0606-0000-0000-0000-000000000606', '3b7c1111-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'verified', '3b7a2222-0000-0000-0000-000000000002', '3b7a2222-0000-0000-0000-000000000002', now()),
  ('3b7e0701-0000-0000-0000-000000000701', '3b7b0707-0000-0000-0000-000000000707', '3b7c1111-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'verified', '3b7a2222-0000-0000-0000-000000000002', '3b7a2222-0000-0000-0000-000000000002', now()),
  ('3b7e0801-0000-0000-0000-000000000801', '3b7b0808-0000-0000-0000-000000000808', '3b7c1111-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'verified', '3b7a2222-0000-0000-0000-000000000002', '3b7a2222-0000-0000-0000-000000000002', now()),
  ('3b7e0901-0000-0000-0000-000000000901', '3b7b0909-0000-0000-0000-000000000909', '3b7c1111-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'verified', '3b7a2222-0000-0000-0000-000000000002', '3b7a2222-0000-0000-0000-000000000002', now()),
  ('3b7e1001-0000-0000-0000-000000000a01', '3b7b1010-0000-0000-0000-000000000a10', '3b7c1111-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'verified', '3b7a2222-0000-0000-0000-000000000002', '3b7a2222-0000-0000-0000-000000000002', now()),
  ('3b7e1101-0000-0000-0000-000000000b01', '3b7b1111-0000-0000-0000-000000000b11', '3b7c1111-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'verified', '3b7a2222-0000-0000-0000-000000000002', '3b7a2222-0000-0000-0000-000000000002', now()),
  ('3b7e1201-0000-0000-0000-000000000c01', '3b7b1212-0000-0000-0000-000000000c12', '3b7c1111-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'verified', '3b7a2222-0000-0000-0000-000000000002', '3b7a2222-0000-0000-0000-000000000002', now()),
  ('3b7e1301-0000-0000-0000-000000000d01', '3b7b1313-0000-0000-0000-000000000d13', '3b7c1111-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'verified', '3b7a2222-0000-0000-0000-000000000002', '3b7a2222-0000-0000-0000-000000000002', now()),
  ('3b7e1401-0000-0000-0000-000000000e01', '3b7b1414-0000-0000-0000-000000000e14', '3b7c1111-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'verified', '3b7a2222-0000-0000-0000-000000000002', '3b7a2222-0000-0000-0000-000000000002', now()),
  ('3b7e1501-0000-0000-0000-000000000f01', '3b7b1515-0000-0000-0000-000000000f15', '3b7c1111-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'verified', '3b7a2222-0000-0000-0000-000000000002', '3b7a2222-0000-0000-0000-000000000002', now()),
  -- awaiting payments (recorded by recB, verified by recA)
  ('3b7e0102-0000-0000-0000-000000000102', '3b7b0101-0000-0000-0000-000000000101', '3b7c1111-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'awaitingVerification', '3b7a2222-0000-0000-0000-000000000002', null, null),
  ('3b7e0202-0000-0000-0000-000000000202', '3b7b0202-0000-0000-0000-000000000202', '3b7c2222-0000-0000-0000-000000000002', 'payment', 9000.00, 0, 0, 9000.00, 'cash', 'awaitingVerification', '3b7a2222-0000-0000-0000-000000000002', null, null),
  ('3b7e0302-0000-0000-0000-000000000302', '3b7b0303-0000-0000-0000-000000000303', '3b7c1111-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'awaitingVerification', '3b7a2222-0000-0000-0000-000000000002', null, null),
  ('3b7e0401-0000-0000-0000-000000000401', '3b7b0404-0000-0000-0000-000000000404', '3b7c1111-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'awaitingVerification', '3b7a2222-0000-0000-0000-000000000002', null, null),
  ('3b7e0502-0000-0000-0000-000000000502', '3b7b0505-0000-0000-0000-000000000505', '3b7c1111-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'awaitingVerification', '3b7a2222-0000-0000-0000-000000000002', null, null),
  ('3b7e0602-0000-0000-0000-000000000602', '3b7b0606-0000-0000-0000-000000000606', '3b7c1111-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'awaitingVerification', '3b7a2222-0000-0000-0000-000000000002', null, null),
  ('3b7e0702-0000-0000-0000-000000000702', '3b7b0707-0000-0000-0000-000000000707', '3b7c1111-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'awaitingVerification', '3b7a2222-0000-0000-0000-000000000002', null, null),
  ('3b7e0802-0000-0000-0000-000000000802', '3b7b0808-0000-0000-0000-000000000808', '3b7c1111-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'awaitingVerification', '3b7a2222-0000-0000-0000-000000000002', null, null),
  ('3b7e0902-0000-0000-0000-000000000902', '3b7b0909-0000-0000-0000-000000000909', '3b7c1111-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'awaitingVerification', '3b7a2222-0000-0000-0000-000000000002', null, null),
  ('3b7e1002-0000-0000-0000-000000000a02', '3b7b1010-0000-0000-0000-000000000a10', '3b7c1111-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'awaitingVerification', '3b7a2222-0000-0000-0000-000000000002', null, null),
  ('3b7e1102-0000-0000-0000-000000000b02', '3b7b1111-0000-0000-0000-000000000b11', '3b7c1111-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'awaitingVerification', '3b7a2222-0000-0000-0000-000000000002', null, null),
  ('3b7e1103-0000-0000-0000-000000000b03', '3b7b1111-0000-0000-0000-000000000b11', '3b7c1111-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'awaitingVerification', '3b7a2222-0000-0000-0000-000000000002', null, null),
  ('3b7e1202-0000-0000-0000-000000000c02', '3b7b1212-0000-0000-0000-000000000c12', '3b7c1111-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'awaitingVerification', '3b7a2222-0000-0000-0000-000000000002', null, null),
  ('3b7e1302-0000-0000-0000-000000000d02', '3b7b1313-0000-0000-0000-000000000d13', '3b7c1111-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'awaitingVerification', '3b7a2222-0000-0000-0000-000000000002', null, null),
  ('3b7e1402-0000-0000-0000-000000000e02', '3b7b1414-0000-0000-0000-000000000e14', '3b7c1111-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'awaitingVerification', '3b7a2222-0000-0000-0000-000000000002', null, null),
  ('3b7e1502-0000-0000-0000-000000000f02', '3b7b1515-0000-0000-0000-000000000f15', '3b7c1111-0000-0000-0000-000000000001', 'payment', 1500.00, 0, 0, 1500.00, 'cash', 'awaitingVerification', '3b7a2222-0000-0000-0000-000000000002', null, null);

insert into public.membership_periods
  (id, member_id, plan_id, start_date, end_date, price_applied, created_by_payment)
values
  ('3b7f0101-0000-0000-0000-000000000101', '3b7b0101-0000-0000-0000-000000000101', '3b7c1111-0000-0000-0000-000000000001', '2036-01-31', '2036-02-29', 1500.00, '3b7e0101-0000-0000-0000-000000000101'),
  ('3b7f0201-0000-0000-0000-000000000201', '3b7b0202-0000-0000-0000-000000000202', '3b7c2222-0000-0000-0000-000000000002', '2036-02-29', '2037-02-28', 9000.00, '3b7e0201-0000-0000-0000-000000000201'),
  ('3b7f0301-0000-0000-0000-000000000301', '3b7b0303-0000-0000-0000-000000000303', '3b7c1111-0000-0000-0000-000000000001', public.app_gym_date() - 40, public.app_gym_date() - 10, 1500.00, '3b7e0301-0000-0000-0000-000000000301'),
  ('3b7f0501-0000-0000-0000-000000000501', '3b7b0505-0000-0000-0000-000000000505', '3b7c1111-0000-0000-0000-000000000001', public.app_gym_date() - 10, public.app_gym_date() + 30, 1500.00, '3b7e0501-0000-0000-0000-000000000501'),
  ('3b7f0601-0000-0000-0000-000000000601', '3b7b0606-0000-0000-0000-000000000606', '3b7c1111-0000-0000-0000-000000000001', public.app_gym_date() - 5,  public.app_gym_date() + 20, 1500.00, '3b7e0601-0000-0000-0000-000000000601'),
  ('3b7f0701-0000-0000-0000-000000000701', '3b7b0707-0000-0000-0000-000000000707', '3b7c1111-0000-0000-0000-000000000001', public.app_gym_date() - 5,  public.app_gym_date() + 20, 1500.00, '3b7e0701-0000-0000-0000-000000000701'),
  ('3b7f0801-0000-0000-0000-000000000801', '3b7b0808-0000-0000-0000-000000000808', '3b7c1111-0000-0000-0000-000000000001', public.app_gym_date() - 5,  public.app_gym_date() + 20, 1500.00, '3b7e0801-0000-0000-0000-000000000801'),
  ('3b7f0901-0000-0000-0000-000000000901', '3b7b0909-0000-0000-0000-000000000909', '3b7c1111-0000-0000-0000-000000000001', public.app_gym_date() - 5,  public.app_gym_date() + 20, 1500.00, '3b7e0901-0000-0000-0000-000000000901'),
  ('3b7f1001-0000-0000-0000-000000000a01', '3b7b1010-0000-0000-0000-000000000a10', '3b7c1111-0000-0000-0000-000000000001', public.app_gym_date() - 5,  public.app_gym_date() + 20, 1500.00, '3b7e1001-0000-0000-0000-000000000a01'),
  ('3b7f1101-0000-0000-0000-000000000b01', '3b7b1111-0000-0000-0000-000000000b11', '3b7c1111-0000-0000-0000-000000000001', public.app_gym_date() - 20, public.app_gym_date() + 10, 1500.00, '3b7e1101-0000-0000-0000-000000000b01'),
  ('3b7f1201-0000-0000-0000-000000000c01', '3b7b1212-0000-0000-0000-000000000c12', '3b7c1111-0000-0000-0000-000000000001', public.app_gym_date() - 5,  public.app_gym_date() + 10, 1500.00, '3b7e1201-0000-0000-0000-000000000c01'),
  ('3b7f1301-0000-0000-0000-000000000d01', '3b7b1313-0000-0000-0000-000000000d13', '3b7c1111-0000-0000-0000-000000000001', public.app_gym_date() - 5,  public.app_gym_date() + 10, 1500.00, '3b7e1301-0000-0000-0000-000000000d01'),
  ('3b7f1401-0000-0000-0000-000000000e01', '3b7b1414-0000-0000-0000-000000000e14', '3b7c1111-0000-0000-0000-000000000001', public.app_gym_date() - 20, public.app_gym_date() + 20, 1500.00, '3b7e1401-0000-0000-0000-000000000e01'),
  ('3b7f1501-0000-0000-0000-000000000f01', '3b7b1515-0000-0000-0000-000000000f15', '3b7c1111-0000-0000-0000-000000000001', public.app_gym_date() - 20, public.app_gym_date() + 20, 1500.00, '3b7e1501-0000-0000-0000-000000000f01');

insert into public.membership_freezes
  (id, member_id, start_date, end_date, reason, state, requested_by,
   decided_by, decided_at, extension_days, ended_at, ended_via, ended_by)
values
  -- C1: active window covering today
  ('3b710101-0000-0000-0000-000000000101', '3b7b0505-0000-0000-0000-000000000505',
   public.app_gym_date() - 3, public.app_gym_date() + 4, 'Medical', 'approved',
   '3b7a2222-0000-0000-0000-000000000002', '3b7a2222-0000-0000-0000-000000000002', now(), 8, null, null, null),
  -- C2: future window
  ('3b710202-0000-0000-0000-000000000202', '3b7b0606-0000-0000-0000-000000000606',
   public.app_gym_date() + 5, public.app_gym_date() + 8, 'Travel', 'approved',
   '3b7a2222-0000-0000-0000-000000000002', '3b7a2222-0000-0000-0000-000000000002', now(), 4, null, null, null),
  -- C3: pending window (must never count)
  ('3b710303-0000-0000-0000-000000000303', '3b7b0707-0000-0000-0000-000000000707',
   public.app_gym_date() - 2, public.app_gym_date() + 2, 'Personal', 'pending',
   '3b7a2222-0000-0000-0000-000000000002', null, null, null, null, null, null),
  -- C4: ended yesterday (unfreeze day is active)
  ('3b710404-0000-0000-0000-000000000404', '3b7b0808-0000-0000-0000-000000000808',
   public.app_gym_date() - 5, public.app_gym_date() + 5, 'Medical', 'ended',
   '3b7a2222-0000-0000-0000-000000000002', '3b7a2222-0000-0000-0000-000000000002', now(), 11,
   ((public.app_gym_date() - 1) + time '12:00') at time zone 'Asia/Kolkata', 'receptionist',
   '3b7a2222-0000-0000-0000-000000000002'),
  -- C5: two overlapping ENDED windows (union dedupe)
  ('3b710505-0000-0000-0000-000000000505', '3b7b0909-0000-0000-0000-000000000909',
   public.app_gym_date() - 10, public.app_gym_date() - 5, 'Medical', 'ended',
   '3b7a2222-0000-0000-0000-000000000002', '3b7a2222-0000-0000-0000-000000000002', now(), 6,
   ((public.app_gym_date() - 4) + time '12:00') at time zone 'Asia/Kolkata', 'receptionist',
   '3b7a2222-0000-0000-0000-000000000002'),
  ('3b710506-0000-0000-0000-000000000506', '3b7b0909-0000-0000-0000-000000000909',
   public.app_gym_date() - 7, public.app_gym_date() - 3, 'Travel', 'ended',
   '3b7a2222-0000-0000-0000-000000000002', '3b7a2222-0000-0000-0000-000000000002', now(), 5,
   ((public.app_gym_date() - 2) + time '12:00') at time zone 'Asia/Kolkata', 'receptionist',
   '3b7a2222-0000-0000-0000-000000000002'),
  -- C6: late unfreeze AFTER the planned end (regression for the clamp)
  ('3b710606-0000-0000-0000-000000000606', '3b7b1010-0000-0000-0000-000000000a10',
   public.app_gym_date() - 10, public.app_gym_date() - 6, 'Personal', 'ended',
   '3b7a2222-0000-0000-0000-000000000002', '3b7a2222-0000-0000-0000-000000000002', now(), 5,
   ((public.app_gym_date() - 2) + time '12:00') at time zone 'Asia/Kolkata', 'receptionist',
   '3b7a2222-0000-0000-0000-000000000002'),
  -- F: 5 earned days, preserved across two renewals
  ('3b710707-0000-0000-0000-000000000707', '3b7b1111-0000-0000-0000-000000000b11',
   public.app_gym_date() - 10, public.app_gym_date() - 6, 'Medical', 'ended',
   '3b7a2222-0000-0000-0000-000000000002', '3b7a2222-0000-0000-0000-000000000002', now(), 5,
   ((public.app_gym_date() - 5) + time '12:00') at time zone 'Asia/Kolkata', 'receptionist',
   '3b7a2222-0000-0000-0000-000000000002'),
  -- E: approved windows that will be ended by a scan
  ('3b710808-0000-0000-0000-000000000808', '3b7b1212-0000-0000-0000-000000000c12',
   public.app_gym_date() - 2, public.app_gym_date() + 2, 'Travel', 'approved',
   '3b7a2222-0000-0000-0000-000000000002', '3b7a2222-0000-0000-0000-000000000002', now(), 5, null, null, null),
  ('3b710909-0000-0000-0000-000000000909', '3b7b1313-0000-0000-0000-000000000d13',
   public.app_gym_date(), public.app_gym_date() + 2, 'Medical', 'approved',
   '3b7a2222-0000-0000-0000-000000000002', '3b7a2222-0000-0000-0000-000000000002', now(), 3, null, null, null),
  -- D: inactivity freeze windows (all ended; overlaps are legal for ended rows)
  ('3b711010-0000-0000-0000-000000000a10', '3b7b2020-0000-0000-0000-000000000a20',
   public.app_gym_date() - 35, public.app_gym_date() - 26, 'Medical', 'ended',
   '3b7a2222-0000-0000-0000-000000000002', '3b7a2222-0000-0000-0000-000000000002', now(), 10,
   ((public.app_gym_date() - 25) + time '12:00') at time zone 'Asia/Kolkata', 'receptionist',
   '3b7a2222-0000-0000-0000-000000000002'),
  ('3b711111-0000-0000-0000-000000000b11', '3b7b2121-0000-0000-0000-000000000b21',
   public.app_gym_date() - 35, public.app_gym_date() - 31, 'Medical', 'ended',
   '3b7a2222-0000-0000-0000-000000000002', '3b7a2222-0000-0000-0000-000000000002', now(), 5,
   ((public.app_gym_date() - 30) + time '12:00') at time zone 'Asia/Kolkata', 'receptionist',
   '3b7a2222-0000-0000-0000-000000000002'),
  ('3b711112-0000-0000-0000-000000000c12', '3b7b2121-0000-0000-0000-000000000b21',
   public.app_gym_date() - 33, public.app_gym_date() - 26, 'Travel', 'ended',
   '3b7a2222-0000-0000-0000-000000000002', '3b7a2222-0000-0000-0000-000000000002', now(), 8,
   ((public.app_gym_date() - 25) + time '12:00') at time zone 'Asia/Kolkata', 'receptionist',
   '3b7a2222-0000-0000-0000-000000000002'),
  -- D: freeze entirely BEFORE the last-attendance anchor (must contribute 0)
  ('3b711313-0000-0000-0000-000000000d13', '3b7b2222-0000-0000-0000-000000000c22',
   public.app_gym_date() - 50, public.app_gym_date() - 40, 'Personal', 'ended',
   '3b7a2222-0000-0000-0000-000000000002', '3b7a2222-0000-0000-0000-000000000002', now(), 11,
   ((public.app_gym_date() - 39) + time '12:00') at time zone 'Asia/Kolkata', 'receptionist',
   '3b7a2222-0000-0000-0000-000000000002'),
  -- timezone pair: ended_at is 20:00 UTC, so the gym-local date differs by zone
  ('3b711414-0000-0000-0000-000000000e14', '3b7b1414-0000-0000-0000-000000000e14',
   public.app_gym_date() - 10, public.app_gym_date() + 10, 'Travel', 'ended',
   '3b7a2222-0000-0000-0000-000000000002', '3b7a2222-0000-0000-0000-000000000002', now(), 21,
   ((public.app_gym_date() - 2) + time '20:00') at time zone 'UTC', 'receptionist',
   '3b7a2222-0000-0000-0000-000000000002'),
  ('3b711515-0000-0000-0000-000000000f15', '3b7b1515-0000-0000-0000-000000000f15',
   public.app_gym_date() - 10, public.app_gym_date() + 10, 'Medical', 'ended',
   '3b7a2222-0000-0000-0000-000000000002', '3b7a2222-0000-0000-0000-000000000002', now(), 21,
   ((public.app_gym_date() - 2) + time '20:00') at time zone 'UTC', 'receptionist',
   '3b7a2222-0000-0000-0000-000000000002');

insert into public.qr_tokens (id, token_hash, purpose, expires_at, minted_by)
values
  ('3b720001-0000-0000-0000-000000000001', encode(sha256(convert_to('suite-3b7-token-scan1', 'utf8')), 'hex'),    'attendance', now() + interval '1 day', '3b7a2222-0000-0000-0000-000000000002'),
  ('3b720002-0000-0000-0000-000000000002', encode(sha256(convert_to('suite-3b7-token-scan2', 'utf8')), 'hex'),    'attendance', now() + interval '1 day', '3b7a2222-0000-0000-0000-000000000002'),
  ('3b720003-0000-0000-0000-000000000003', encode(sha256(convert_to('suite-3b7-token-inactive', 'utf8')), 'hex'), 'attendance', now() + interval '1 day', '3b7a2222-0000-0000-0000-000000000002');

insert into public.attendance_events (id, member_id, token_id, door, status, checked_in_at)
values
  ('3b750001-0000-0000-0000-000000000001', '3b7b1818-0000-0000-0000-000000000818', '3b720003-0000-0000-0000-000000000003', 'main', 'verified', now() - interval '31 days'),
  ('3b750002-0000-0000-0000-000000000002', '3b7b1919-0000-0000-0000-000000000919', '3b720003-0000-0000-0000-000000000003', 'main', 'verified', now() - interval '30 days'),
  ('3b750003-0000-0000-0000-000000000003', '3b7b2020-0000-0000-0000-000000000a20', '3b720003-0000-0000-0000-000000000003', 'main', 'verified', now() - interval '40 days'),
  ('3b750004-0000-0000-0000-000000000004', '3b7b2121-0000-0000-0000-000000000b21', '3b720003-0000-0000-0000-000000000003', 'main', 'verified', now() - interval '40 days'),
  ('3b750005-0000-0000-0000-000000000005', '3b7b2222-0000-0000-0000-000000000c22', '3b720003-0000-0000-0000-000000000003', 'main', 'verified', now() - interval '20 days');

insert into public.app_settings (id, gym_timezone, attendance_token_validity_seconds)
values (1, 'Asia/Kolkata', 60)
on conflict (id) do update
  set gym_timezone = 'Asia/Kolkata',
      attendance_token_validity_seconds = 60;

-- =====================================================================
-- SECTION A - calendar date source and timezone boundaries
-- =====================================================================

select suite_results.check_true('A00', '2036 leap fixtures are in the future (anchored-renewal branch)',
  '2036-02-29'::date > public.app_gym_date(),
  'suite is valid until 2036-02-29; adjust the fixed fixtures after that');

select suite_results.check_true('A01', 'app_gym_date uses the configured Asia/Kolkata date',
  public.app_gym_date() = (now() at time zone 'Asia/Kolkata')::date,
  'never a bare now()::date');

update public.app_settings set gym_timezone = 'Pacific/Kiritimati' where id = 1;
select suite_results.check_true('A02', 'app_gym_date follows Pacific/Kiritimati (UTC+14)',
  public.app_gym_date() = (now() at time zone 'Pacific/Kiritimati')::date,
  'configurable gym timezone is honoured');
select suite_results.check_true('A03', 'UTC+14 date is 1-2 days ahead of UTC-12',
  ((now() at time zone 'Pacific/Kiritimati')::date
   - (now() at time zone 'Etc/GMT+12')::date) between 1 and 2,
  '26-hour offset spans at most two calendar dates');

update public.app_settings set gym_timezone = 'Etc/GMT+12' where id = 1;
select suite_results.check_true('A04', 'app_gym_date follows Etc/GMT+12 (UTC-12)',
  public.app_gym_date() = (now() at time zone 'Etc/GMT+12')::date,
  'the far-west boundary zone is honoured');

update public.app_settings set gym_timezone = 'Asia/Kolkata' where id = 1;

begin;
set local timezone = 'Pacific/Kiritimati';
select suite_results.check_true('A05', 'session TimeZone cannot change app_gym_date',
  public.app_gym_date() = (now() at time zone 'Asia/Kolkata')::date,
  'the function converts explicitly, not via the session timezone');
commit;

-- fallback: no settings row -> Asia/Kolkata
delete from public.app_settings where id = 1;
select suite_results.check_true('A06', 'app_gym_date falls back to Asia/Kolkata without settings',
  public.app_gym_date() = (now() at time zone 'Asia/Kolkata')::date,
  'coalesce fallback in 0003');
insert into public.app_settings (id, gym_timezone, attendance_token_validity_seconds)
values (1, 'Asia/Kolkata', 60);

-- =====================================================================
-- SECTION B - month-end, leap-year and re-anchor arithmetic
-- =====================================================================

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b7a1111-0000-0000-0000-000000000001","role":"receptionist","aal":"aal2"}';
set local request.jwt.claim.sub = '3b7a1111-0000-0000-0000-000000000001';
select suite_results.check_ok('B01', 'month-end renewal verifies',
  $s$select public.verify_payment('3b7e0102-0000-0000-0000-000000000102'::uuid)$s$);
commit;

select suite_results.check_true('B02', 'month-end renewal starts the day after the leap February end',
  (select start_date from public.membership_periods
    where created_by_payment = '3b7e0102-0000-0000-0000-000000000102') = '2036-03-01'::date,
  'stored end 2036-02-29 + no frozen days + 1');

select suite_results.check_true('B03', 'anchored month-end end is 2036-03-31 (not a repeated +1 month clamp)',
  (select end_date from public.membership_periods
    where created_by_payment = '3b7e0102-0000-0000-0000-000000000102') = '2036-03-31'::date,
  'naive Feb-29 + 1 month would give 2036-03-29; anchor +2 months gives 03-31');

select suite_results.check_true('B04', 'membership_end follows the anchored month-end period',
  (select membership_end from public.members
    where id = '3b7b0101-0000-0000-0000-000000000101') = '2036-03-31'::date,
  'stored expiry advanced to the period end');

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b7a1111-0000-0000-0000-000000000001","role":"receptionist","aal":"aal2"}';
set local request.jwt.claim.sub = '3b7a1111-0000-0000-0000-000000000001';
select suite_results.check_ok('B05', 'yearly leap-day renewal verifies',
  $s$select public.verify_payment('3b7e0202-0000-0000-0000-000000000202'::uuid)$s$);
commit;

select suite_results.check_true('B06', 'yearly leap-day renewal starts 2037-03-01',
  (select start_date from public.membership_periods
    where created_by_payment = '3b7e0202-0000-0000-0000-000000000202') = '2037-03-01'::date,
  '2037-02-28 + 1');

select suite_results.check_true('B07', 'leap-day yearly anchor clamps to 2038-02-28',
  (select end_date from public.membership_periods
    where created_by_payment = '3b7e0202-0000-0000-0000-000000000202') = '2038-02-28'::date,
  '2036-02-29 + 24 months = 2038-02-28');

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b7a1111-0000-0000-0000-000000000001","role":"receptionist","aal":"aal2"}';
set local request.jwt.claim.sub = '3b7a1111-0000-0000-0000-000000000001';
select suite_results.check_ok('B08', 'post-expiry renewal verifies',
  $s$select public.verify_payment('3b7e0302-0000-0000-0000-000000000302'::uuid)$s$);
commit;

select suite_results.check_true('B09', 'post-expiry renewal re-anchors at the gym date (no retroactivity)',
  (select start_date from public.membership_periods
    where created_by_payment = '3b7e0302-0000-0000-0000-000000000302') = public.app_gym_date(),
  'O-05: gap days stay uncovered');

select suite_results.check_true('B10', 'post-expiry period is one calendar month from the gym date',
  (select end_date from public.membership_periods
    where created_by_payment = '3b7e0302-0000-0000-0000-000000000302')
  = (public.app_gym_date() + interval '1 month')::date,
  'start + 1 month, clamped by the calendar');

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b7a1111-0000-0000-0000-000000000001","role":"receptionist","aal":"aal2"}';
set local request.jwt.claim.sub = '3b7a1111-0000-0000-0000-000000000001';
select suite_results.check_ok('B11', 'first verified payment creates coverage',
  $s$select public.verify_payment('3b7e0401-0000-0000-0000-000000000401'::uuid)$s$);
commit;

select suite_results.check_true('B12', 'first payment starts today and runs one calendar month',
  (select start_date = public.app_gym_date()
          and end_date = (public.app_gym_date() + interval '1 month')::date
     from public.membership_periods
    where created_by_payment = '3b7e0401-0000-0000-0000-000000000401'),
  'pendingPayment validity begins at verification');

-- =====================================================================
-- SECTION C - freeze arithmetic feeding B1/R14
-- =====================================================================

select suite_results.check_true('C01', 'active freeze counts today (inclusive): 4 frozen days',
  (select effective_expiry::date from public.v_member_status
    where member_id = '3b7b0505-0000-0000-0000-000000000505')
  = public.app_gym_date() + 34,
  'window G-3..G+4, counted through G');

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b7a1111-0000-0000-0000-000000000001","role":"receptionist","aal":"aal2"}';
set local request.jwt.claim.sub = '3b7a1111-0000-0000-0000-000000000001';
select suite_results.check_fail('C02', 'renewal while frozen is refused (O-04)',
  $s$select public.verify_payment('3b7e0502-0000-0000-0000-000000000502'::uuid)$s$,
  '55000', 'currently frozen');
commit;

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b7a1111-0000-0000-0000-000000000001","role":"receptionist"}';
set local request.jwt.claim.sub = '3b7a1111-0000-0000-0000-000000000001';
select suite_results.check_ok('C03', 'receptionist ends the active freeze',
  $s$select public.end_freeze('3b710101-0000-0000-0000-000000000101'::uuid)$s$);
commit;

select suite_results.check_true('C04', 'early unfreeze credits 3 actual days (unfreeze day is active)',
  (select effective_expiry::date from public.v_member_status
    where member_id = '3b7b0505-0000-0000-0000-000000000505')
  = public.app_gym_date() + 33,
  'window G-3..G+4 ended on G: G-3..G-1 = 3 days, unused days rolled back');

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b7a1111-0000-0000-0000-000000000001","role":"receptionist","aal":"aal2"}';
set local request.jwt.claim.sub = '3b7a1111-0000-0000-0000-000000000001';
select suite_results.check_ok('C05', 'renewal after the unfreeze verifies against the derived expiry',
  $s$select public.verify_payment('3b7e0502-0000-0000-0000-000000000502'::uuid)$s$);
commit;

select suite_results.check_true('C06', 'R14 renewal start = stored end + 3 frozen days + 1',
  (select start_date from public.membership_periods
    where created_by_payment = '3b7e0502-0000-0000-0000-000000000502')
  = public.app_gym_date() + 34,
  'B1 pure-pause arithmetic in verify_payment');

select suite_results.check_true('C07', 'future approved freeze contributes 0 frozen days',
  (select effective_expiry::date from public.v_member_status
    where member_id = '3b7b0606-0000-0000-0000-000000000606')
  = public.app_gym_date() + 20,
  'a window that has not begun must not pause anything');

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b7a1111-0000-0000-0000-000000000001","role":"receptionist","aal":"aal2"}';
set local request.jwt.claim.sub = '3b7a1111-0000-0000-0000-000000000001';
select suite_results.check_ok('C08', 'renewal with a future freeze verifies',
  $s$select public.verify_payment('3b7e0602-0000-0000-0000-000000000602'::uuid)$s$);
commit;

select suite_results.check_true('C09', 'future-freeze renewal starts stored end + 1',
  (select start_date from public.membership_periods
    where created_by_payment = '3b7e0602-0000-0000-0000-000000000602')
  = public.app_gym_date() + 21,
  'no premature pause');

select suite_results.check_true('C10', 'pending freeze contributes 0 frozen days',
  (select effective_expiry::date from public.v_member_status
    where member_id = '3b7b0707-0000-0000-0000-000000000707')
  = public.app_gym_date() + 20,
  'only approved/ended rows count');

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b7a1111-0000-0000-0000-000000000001","role":"receptionist","aal":"aal2"}';
set local request.jwt.claim.sub = '3b7a1111-0000-0000-0000-000000000001';
select suite_results.check_ok('C11', 'renewal with a pending freeze verifies',
  $s$select public.verify_payment('3b7e0702-0000-0000-0000-000000000702'::uuid)$s$);
commit;

select suite_results.check_true('C12', 'pending-freeze renewal starts stored end + 1',
  (select start_date from public.membership_periods
    where created_by_payment = '3b7e0702-0000-0000-0000-000000000702')
  = public.app_gym_date() + 21,
  'pending windows are inert');

select suite_results.check_true('C13', 'freeze ended yesterday credits 4 days (G-5..G-2)',
  (select effective_expiry::date from public.v_member_status
    where member_id = '3b7b0808-0000-0000-0000-000000000808')
  = public.app_gym_date() + 24,
  'ended_at local date G-1, so the range stops at G-2');

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b7a1111-0000-0000-0000-000000000001","role":"receptionist","aal":"aal2"}';
set local request.jwt.claim.sub = '3b7a1111-0000-0000-0000-000000000001';
select suite_results.check_ok('C14', 'renewal after an early unfreeze verifies',
  $s$select public.verify_payment('3b7e0802-0000-0000-0000-000000000802'::uuid)$s$);
commit;

select suite_results.check_true('C15', 'early-unfreeze renewal start = stored end + 4 + 1',
  (select start_date from public.membership_periods
    where created_by_payment = '3b7e0802-0000-0000-0000-000000000802')
  = public.app_gym_date() + 25,
  'the unfreeze day itself is active');

select suite_results.check_true('C16', 'overlapping ended windows are union-deduped: 8 days',
  (select effective_expiry::date from public.v_member_status
    where member_id = '3b7b0909-0000-0000-0000-000000000909')
  = public.app_gym_date() + 28,
  '6 + 5 overlapping days -> 8 distinct days (G-10..G-3)');

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b7a1111-0000-0000-0000-000000000001","role":"receptionist","aal":"aal2"}';
set local request.jwt.claim.sub = '3b7a1111-0000-0000-0000-000000000001';
select suite_results.check_ok('C17', 'renewal after overlapping ended windows verifies',
  $s$select public.verify_payment('3b7e0902-0000-0000-0000-000000000902'::uuid)$s$);
commit;

select suite_results.check_true('C18', 'overlap renewal start = stored end + 8 + 1',
  (select start_date from public.membership_periods
    where created_by_payment = '3b7e0902-0000-0000-0000-000000000902')
  = public.app_gym_date() + 29,
  'no double credit for the overlapping days');

-- DEFECT REGRESSION: late unfreeze must be clamped to the approved window.
select suite_results.check_true('C19', 'late unfreeze is clamped to the planned window: 5 days, not 9',
  (select effective_expiry::date from public.v_member_status
    where member_id = '3b7b1010-0000-0000-0000-000000000a10')
  = public.app_gym_date() + 25,
  'window G-10..G-6 ended on G-2 must credit [G-10,G-6] only');

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b7a1111-0000-0000-0000-000000000001","role":"receptionist","aal":"aal2"}';
set local request.jwt.claim.sub = '3b7a1111-0000-0000-0000-000000000001';
select suite_results.check_ok('C20', 'renewal after a late unfreeze verifies',
  $s$select public.verify_payment('3b7e1002-0000-0000-0000-000000000a02'::uuid)$s$);
commit;

select suite_results.check_true('C21', 'R14 uses the clamped 5 frozen days (start = stored end + 6)',
  (select start_date from public.membership_periods
    where created_by_payment = '3b7e1002-0000-0000-0000-000000000a02')
  = public.app_gym_date() + 26,
  'the RPC and the view agree on the clamp');

-- timezone boundary: the same ended_at is a different gym-local date
update public.app_settings set gym_timezone = 'Asia/Kolkata' where id = 1;
select suite_results.check_true('C22', 'Kolkata sees the ended_at day as G-1: 9 frozen days',
  (select effective_expiry::date from public.v_member_status
    where member_id = '3b7b1414-0000-0000-0000-000000000e14')
  = (select d from suite_anchor) + 29,
  '20:00 UTC + 5:30 = 01:30 next day');

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b7a1111-0000-0000-0000-000000000001","role":"receptionist","aal":"aal2"}';
set local request.jwt.claim.sub = '3b7a1111-0000-0000-0000-000000000001';
select suite_results.check_ok('C23', 'Kolkata renewal verifies',
  $s$select public.verify_payment('3b7e1402-0000-0000-0000-000000000e02'::uuid)$s$);
commit;

select suite_results.check_true('C24', 'Kolkata renewal start = stored end + 9 + 1',
  (select start_date from public.membership_periods
    where created_by_payment = '3b7e1402-0000-0000-0000-000000000e02')
  = (select d from suite_anchor) + 30,
  'timezone-aware ended-day conversion');

update public.app_settings set gym_timezone = 'Etc/GMT+12' where id = 1;
select suite_results.check_true('C25', 'Etc/GMT+12 sees the same ended_at day as G-2: 8 frozen days',
  (select effective_expiry::date from public.v_member_status
    where member_id = '3b7b1515-0000-0000-0000-000000000f15')
  = (select d from suite_anchor) + 28,
  '20:00 UTC - 12 = 08:00 the same UTC date, one day earlier locally');

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b7a1111-0000-0000-0000-000000000001","role":"receptionist","aal":"aal2"}';
set local request.jwt.claim.sub = '3b7a1111-0000-0000-0000-000000000001';
select suite_results.check_ok('C26', 'Etc/GMT+12 renewal verifies',
  $s$select public.verify_payment('3b7e1502-0000-0000-0000-000000000f02'::uuid)$s$);
commit;

select suite_results.check_true('C27', 'Etc/GMT+12 renewal start is exactly one day earlier',
  (select start_date from public.membership_periods
    where created_by_payment = '3b7e1502-0000-0000-0000-000000000f02')
  = (select d from suite_anchor) + 29,
  'same instant, different gym-local calendar day');

update public.app_settings set gym_timezone = 'Asia/Kolkata' where id = 1;
select suite_results.check_true('C28', 'gym timezone restored for the remaining sections',
  (select gym_timezone from public.app_settings where id = 1) = 'Asia/Kolkata'
  and public.app_gym_date() = (now() at time zone 'Asia/Kolkata')::date,
  'test isolation');

-- =====================================================================
-- SECTION D - 30-day inactivity (B2 never-attended anchor + frozen-day
-- exclusion) and the strict > 30 boundary
-- =====================================================================

select suite_results.check_true('D01', 'never-attended, joined 40 days ago -> inactive',
  (select is_inactive and inactive_days = 40
     from public.v_inactive_members
    where member_id = '3b7b1616-0000-0000-0000-000000000616'),
  'B2: anchor is joined_on when there is no attendance');

select suite_results.check_true('D02', 'never-attended, joined 5 days ago -> not inactive',
  (select not is_inactive and inactive_days = 5
     from public.v_inactive_members
    where member_id = '3b7b1717-0000-0000-0000-000000000717'),
  'joined_on anchor prevents immediate lost-list entry');

select suite_results.check_true('D03', 'last attendance 31 days ago -> inactive',
  (select is_inactive and inactive_days = 31
     from public.v_inactive_members
    where member_id = '3b7b1818-0000-0000-0000-000000000818'),
  'inactive_days > 30');

select suite_results.check_true('D04', 'last attendance exactly 30 days ago -> NOT inactive',
  (select not is_inactive and inactive_days = 30
     from public.v_inactive_members
    where member_id = '3b7b1919-0000-0000-0000-000000000919'),
  'the boundary is strictly greater than 30');

select suite_results.check_true('D05', 'frozen days after the anchor are excluded: 40 - 10 = 30',
  (select frozen_days_between = 10 and inactive_days = 30 and not is_inactive
     from public.v_inactive_members
    where member_id = '3b7b2020-0000-0000-0000-000000000a20'),
  'G-35..G-26 freeze, last attendance G-40');

select suite_results.check_true('D06', 'overlapping frozen windows are deduped in inactivity: 10 days',
  (select frozen_days_between = 10 and inactive_days = 30 and not is_inactive
     from public.v_inactive_members
    where member_id = '3b7b2121-0000-0000-0000-000000000b21'),
  'two overlapping ended windows -> 10 distinct days');

select suite_results.check_true('D07', 'frozen days BEFORE the last attendance do not count',
  (select frozen_days_between = 0 and inactive_days = 20 and not is_inactive
     from public.v_inactive_members
    where member_id = '3b7b2222-0000-0000-0000-000000000c22'),
  'the freeze ended 20 days before the anchor');

select suite_results.check_true('D08', 'last_successful_attendance_date is the gym-local scan date',
  (select last_successful_attendance_date = public.app_gym_date() - 31
     from public.v_inactive_members
    where member_id = '3b7b1818-0000-0000-0000-000000000818'),
  'checked_in_at converted with the configured timezone');

select suite_results.check_true('D09', 'never-attended rows expose joined_on as the anchor date',
  (select bool_and(last_successful_attendance_date = joined_on)
     from public.v_inactive_members
    where member_id in ('3b7b1616-0000-0000-0000-000000000616',
                        '3b7b1717-0000-0000-0000-000000000717')),
  'coalesce(last_scan, joined_on)');

-- =====================================================================
-- SECTION E - QR scan terminates a freeze (O-10) and feeds R14
-- =====================================================================

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b7a3333-0000-0000-0000-000000000003","role":"member"}';
set local request.jwt.claim.sub = '3b7a3333-0000-0000-0000-000000000003';
select suite_results.check_ok('E01', 'frozen member scans and checks in',
  $s$select public.check_in('suite-3b7-token-scan1','main')$s$);
commit;

select suite_results.check_true('E02', 'scan ended the freeze with scan attribution',
  (select state = 'ended' and ended_via = 'scan' and ended_by is null
          and ended_at is not null
     from public.membership_freezes
    where id = '3b710808-0000-0000-0000-000000000808'),
  'conditional approved -> ended transition inside check_in');

select suite_results.check_true('E03', 'scan on G credits 2 frozen days and clears is_frozen',
  (select effective_expiry::date = public.app_gym_date() + 12 and not is_frozen
     from public.v_member_status
    where member_id = '3b7b1212-0000-0000-0000-000000000c12'),
  'window G-2..G+2, ended on G -> G-2..G-1 = 2 days');

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b7a1111-0000-0000-0000-000000000001","role":"receptionist","aal":"aal2"}';
set local request.jwt.claim.sub = '3b7a1111-0000-0000-0000-000000000001';
select suite_results.check_ok('E04', 'renewal after a scan-ended freeze verifies',
  $s$select public.verify_payment('3b7e1202-0000-0000-0000-000000000c02'::uuid)$s$);
commit;

select suite_results.check_true('E05', 'scan-ended freeze renewal start = stored end + 2 + 1',
  (select start_date from public.membership_periods
    where created_by_payment = '3b7e1202-0000-0000-0000-000000000c02')
  = public.app_gym_date() + 13,
  'O-10 and R14 agree');

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b7a4444-0000-0000-0000-000000000004","role":"member"}';
set local request.jwt.claim.sub = '3b7a4444-0000-0000-0000-000000000004';
select suite_results.check_ok('E06', 'member scans on the freeze start day',
  $s$select public.check_in('suite-3b7-token-scan2','main')$s$);
commit;

select suite_results.check_true('E07', 'scan on the start day credits 0 frozen days',
  (select effective_expiry::date = public.app_gym_date() + 10 and not is_frozen
     from public.v_member_status
    where member_id = '3b7b1313-0000-0000-0000-000000000d13'),
  'the start day is an active day; G..G-1 is empty');

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b7a1111-0000-0000-0000-000000000001","role":"receptionist","aal":"aal2"}';
set local request.jwt.claim.sub = '3b7a1111-0000-0000-0000-000000000001';
select suite_results.check_ok('E08', 'renewal after a start-day scan verifies',
  $s$select public.verify_payment('3b7e1302-0000-0000-0000-000000000d02'::uuid)$s$);
commit;

select suite_results.check_true('E09', 'start-day scan renewal start = stored end + 1',
  (select start_date from public.membership_periods
    where created_by_payment = '3b7e1302-0000-0000-0000-000000000d02')
  = public.app_gym_date() + 11,
  'zero pause');

-- =====================================================================
-- SECTION F - earned days are preserved, not absorbed, by a renewal
-- =====================================================================

select suite_results.check_true('F01', 'baseline derived expiry is stored end + 5',
  (select effective_expiry::date from public.v_member_status
    where member_id = '3b7b1111-0000-0000-0000-000000000b11')
  = public.app_gym_date() + 15,
  'ended window G-10..G-6 = 5 days');

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b7a1111-0000-0000-0000-000000000001","role":"receptionist","aal":"aal2"}';
set local request.jwt.claim.sub = '3b7a1111-0000-0000-0000-000000000001';
select suite_results.check_ok('F02', 'first renewal verifies',
  $s$select public.verify_payment('3b7e1102-0000-0000-0000-000000000b02'::uuid)$s$);
commit;

select suite_results.check_true('F03', 'first renewal start = stored end + 5 + 1',
  (select start_date from public.membership_periods
    where created_by_payment = '3b7e1102-0000-0000-0000-000000000b02')
  = public.app_gym_date() + 16,
  'R14 earned days paid out once at renewal');

begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"3b7a1111-0000-0000-0000-000000000001","role":"receptionist","aal":"aal2"}';
set local request.jwt.claim.sub = '3b7a1111-0000-0000-0000-000000000001';
select suite_results.check_ok('F04', 'second renewal (already queued) verifies',
  $s$select public.verify_payment('3b7e1103-0000-0000-0000-000000000b03'::uuid)$s$);
commit;

select suite_results.check_true('F05', 'second renewal keeps the 5 earned days: start = first end + 6',
  (select p2.start_date from public.membership_periods p2
    where p2.created_by_payment = '3b7e1103-0000-0000-0000-000000000b03')
  = (select p1.end_date + 6 from public.membership_periods p1
      where p1.created_by_payment = '3b7e1102-0000-0000-0000-000000000b02'),
  'cumulative frozen days apply to every renewal, they are never absorbed');

select suite_results.check_true('F06', 'membership_end is the second period end and the view still adds 5',
  (select membership_end from public.members
    where id = '3b7b1111-0000-0000-0000-000000000b11')
  = (select end_date from public.membership_periods
      where created_by_payment = '3b7e1103-0000-0000-0000-000000000b03')
  and (select effective_expiry::date from public.v_member_status
        where member_id = '3b7b1111-0000-0000-0000-000000000b11')
  = (select end_date + 5 from public.membership_periods
      where created_by_payment = '3b7e1103-0000-0000-0000-000000000b03'),
  'B1: earned days survive into the new era');

-- =====================================================================
-- SECTION Z - cleanup and verdict
-- =====================================================================

delete from public.audit_log_entries
 where actor::text like '3b7%' or row_id::text like '3b7%';
delete from public.attendance_events
 where id::text like '3b7%' or member_id::text like '3b7%';
delete from public.membership_freezes
 where id::text like '3b7%' or member_id::text like '3b7%';
delete from public.membership_period_voids
 where reversal_id::text like '3b7%' or period_id::text like '3b7%';
delete from public.membership_periods
 where id::text like '3b7%' or created_by_payment::text like '3b7%';
delete from public.payments where reversal_of::text like '3b7%';
delete from public.payments where id::text like '3b7%';
delete from public.members where id::text like '3b7%';
delete from public.qr_tokens where id::text like '3b7%';
delete from public.plans where id::text like '3b7%';
delete from public.profiles where id::text like '3b7%';
delete from auth.users where id::text like '3b7%';

select suite_results.check_true('Z01', 'zero 3b7 residue',
  (select count(*) from public.members where id::text like '3b7%') = 0
  and (select count(*) from public.profiles where id::text like '3b7%') = 0
  and (select count(*) from public.payments where id::text like '3b7%') = 0
  and (select count(*) from public.membership_periods where id::text like '3b7%') = 0
  and (select count(*) from public.membership_freezes where id::text like '3b7%') = 0
  and (select count(*) from public.attendance_events where id::text like '3b7%') = 0
  and (select count(*) from public.qr_tokens where id::text like '3b7%') = 0
  and (select count(*) from public.plans where id::text like '3b7%') = 0,
  'database back to the post-0006 state');

select suite_results.check_true('Z02', 'gym timezone is restored',
  (select gym_timezone from public.app_settings where id = 1) = 'Asia/Kolkata',
  'no cross-suite configuration leak');

select num, passed, label, detail
  from suite_results.t_results
 where not passed
 order by num;

do $v$
declare
  v_total integer;
  v_fail  integer;
begin
  select count(*), count(*) filter (where not passed)
    into v_total, v_fail
    from suite_results.t_results;

  raise notice '0007 date-math validation: % of % assertions passed', v_total - v_fail, v_total;

  if v_fail > 0 then
    raise exception '0007 DATE-MATH VALIDATION FAILED: % of % assertions failed', v_fail, v_total;
  end if;
end
$v$;

drop schema suite_results cascade;
