-- =====================================================================
-- tests/0001_core_schema_validation.sql
-- Phase 3B.1 structural validation for 0001_core_schema.sql (corrected).
--
-- Prerequisites: local Supabase stack running, database freshly reset
-- with ONLY migration 0001 applied (npx supabase db reset).
-- Runs as the postgres superuser (RLS/policies arrive in 0002 — out of
-- scope here by design; behavioral authority rules live in 0003).
--
-- Helpers use pg_temp schema functions (valid PostgreSQL) and verify the
-- EXPECTED SQLSTATE class and constraint name for every negative test —
-- an unrelated error is counted as a failure, not a pass.
-- Every executed assertion is recorded and reported individually; the
-- pass count is computed from actual executed assertions.
-- =====================================================================

create temp table t_results (
  num    text,
  label  text,
  passed boolean,
  detail text
);

-- negative-test helper: statement MUST fail with the wanted SQLSTATE
-- class and (optionally) a constraint name fragment in the message.
create function pg_temp.check_fail(
  p_num text, p_label text, p_stmt text, p_want_sqlstate text, p_want_err text default null
) returns void language plpgsql as $$
declare
  v_ok boolean;
  v_detail text;
  v_state text;
  v_msg text;
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
  insert into t_results values (p_num, p_label, v_ok, v_detail);
end $$;

-- positive-test helper: statement MUST succeed.
create function pg_temp.check_ok(p_num text, p_label text, p_stmt text)
returns void language plpgsql as $$
declare
  v_ok   boolean;
  v_detail text;
  v_msg  text;
  v_rows bigint;
begin
  begin
    execute p_stmt;
    get diagnostics v_rows = ROW_COUNT;
    if v_rows = 0 then
      -- a "successful" insert that inserted nothing proves nothing
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
  insert into t_results values (p_num, p_label, v_ok, v_detail);
end $$;

-- query-based assertion helper.
create function pg_temp.check_true(p_num text, p_label text, p_ok boolean, p_detail text)
returns void language plpgsql as $$
begin
  insert into t_results values (p_num, p_label, p_ok, p_detail);
end $$;

-- ---------------------------------------------------------------------
-- setup (plain statements; failures abort loudly via ON_ERROR_STOP)
-- ---------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'owner@local.test',    'irrelevant', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'reception@local.test','irrelevant', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333', 'authenticated', 'authenticated', 'member@local.test',   'irrelevant', now(), now());

insert into public.profiles (id, display_name, role) values
  ('11111111-1111-1111-1111-111111111111', 'Owner',         'owner'),
  ('22222222-2222-2222-2222-222222222222', 'Reception One', 'receptionist'),
  ('33333333-3333-3333-3333-333333333333', 'Member Self',   'member');

-- Seed-tolerant: supabase/seed.sql may already hold these baseline plans
-- (same ids/names). Skipping identical rows keeps the suite valid both on a
-- seeded reset and on `db reset --no-seed`.
insert into public.plans (id, name, duration, price) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Monthly',   'monthly',   1500.00),
  ('aaaaaaaa-0000-0000-0000-000000000003', 'Quarterly', 'quarterly', 4000.00)
on conflict (id) do nothing;

insert into public.members (id, full_name, phone, plan_id, price_locked, joined_on) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'Arjun Rao', '9800000001',
   'aaaaaaaa-0000-0000-0000-000000000001', 1500.00, date '2026-01-10'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Priya N',   '9800000002', null, null, date '2026-02-01');

insert into public.app_settings (id) values (1)
on conflict (id) do nothing;

-- =====================================================================
-- assertion driver
-- =====================================================================
do $$
declare
  v_count int;
  v_pass  int;
  v_total int;
  v_range daterange;
  r record;
begin
  -------------------------------------------------------------------
  -- A. table inventory: exactly the 13 approved tables in public
  -------------------------------------------------------------------
  select count(*) into v_count
  from information_schema.tables
  where table_schema = 'public' and table_type = 'BASE TABLE';

  perform pg_temp.check_true('01', 'exactly 13 approved public tables exist',
    v_count = 13, format('found %s public base tables', v_count));

  -------------------------------------------------------------------
  -- M. money constraints (O-13/O-16 + approved rounding rule)
  -------------------------------------------------------------------
  perform pg_temp.check_fail('02', 'negative payable rejected', $s$
    insert into public.payments (member_id, plan_id, entry_type, original_price, payable,
                                 discount_pct, discount_amount, method, utr, state, recorded_by)
    -- payable=-1 with a self-consistent discount_amount (1501 = 1500 − (−1)):
    -- the approved rounding invariant (payable_rounding) rejects it.
    values ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
            'payment', 1500.00, -1.00, 0, 1501.00, 'cash', null, 'awaitingVerification',
            '22222222-2222-2222-2222-222222222222') $s$, '23514', 'payable_rounding');

  perform pg_temp.check_fail('03', 'zero original_price rejected', $s$
    insert into public.payments (member_id, plan_id, entry_type, original_price, payable,
                                 discount_pct, discount_amount, method, utr, state, recorded_by)
    values ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
            'payment', 0, 0, 0, 0, 'cash', null, 'awaitingVerification',
            '22222222-2222-2222-2222-222222222222') $s$, '23514', 'original_price');

  perform pg_temp.check_fail('04', 'discount_pct > 100 rejected', $s$
    insert into public.payments (member_id, plan_id, entry_type, original_price, payable,
                                 discount_pct, discount_amount, method, utr, state, recorded_by)
    values ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
            'payment', 1500.00, 1500.00, 150.00, 0, 'cash', null, 'awaitingVerification',
            '22222222-2222-2222-2222-222222222222') $s$, '23514', 'payable_rounding');
            -- NOTE: payable_rounding fires before the discount_pct bounds check
            -- (CHECK evaluation is reverse-definition order); dpct > 100 can
            -- never satisfy payable_rounding, so it is the operative guard.

  perform pg_temp.check_fail('05', 'discount_amount <> original − payable rejected', $s$
    insert into public.payments (member_id, plan_id, entry_type, original_price, payable,
                                 discount_pct, discount_amount, method, utr, state, recorded_by)
    values ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
            'payment', 1500.00, 1425.00, 5, 100.00, 'cash', null, 'awaitingVerification',
            '22222222-2222-2222-2222-222222222222') $s$, '23514', 'discount_amount_exact');

  -- rounding rule: 1500 @ 5% must be 1425; payable 1400 violates it
  perform pg_temp.check_fail('06', 'payable not equal to approved whole-rupee rounding rejected', $s$
    insert into public.payments (member_id, plan_id, entry_type, original_price, payable,
                                 discount_pct, discount_amount, method, utr, state, recorded_by)
    values ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
            'payment', 1500.00, 1400.00, 5, 100.00, 'cash', null, 'awaitingVerification',
            '22222222-2222-2222-2222-222222222222') $s$, '23514', 'payable_rounding');

  -- 100% discount: payable = 0 must be REPRESENTABLE (design §2.3)
  perform pg_temp.check_ok('07', '100% discount with payable 0 accepted', $s$
    insert into public.payments (member_id, plan_id, entry_type, original_price, payable,
                                 discount_pct, discount_amount, method, utr, state, recorded_by)
    values ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
            'payment', 1500.00, 0.00, 100.00, 1500.00, 'cash', null, 'awaitingVerification',
            '22222222-2222-2222-2222-222222222222') $s$);
  delete from public.payments
  where member_id = 'bbbbbbbb-0000-0000-0000-000000000001' and payable = 0 and entry_type = 'payment';

  perform pg_temp.check_fail('08', 'non-INR currency rejected', $s$
    insert into public.payments (member_id, plan_id, entry_type, original_price, payable,
                                 discount_pct, discount_amount, method, utr, state, recorded_by, currency)
    values ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
            'payment', 1500.00, 1500.00, 0, 0, 'cash', null, 'awaitingVerification',
            '22222222-2222-2222-2222-222222222222', 'USD') $s$, '23514', 'currency');

  -------------------------------------------------------------------
  -- S. status enums — no invented values, no "reversed" state (O-22)
  -------------------------------------------------------------------
  perform pg_temp.check_fail('09', 'payments.state ''reversed'' rejected', $s$
    insert into public.payments (member_id, plan_id, entry_type, original_price, payable,
                                 discount_pct, discount_amount, method, utr, state, recorded_by)
    values ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
            'payment', 1500.00, 1500.00, 0, 0, 'cash', null, 'reversed',
            '22222222-2222-2222-2222-222222222222') $s$, '23514', 'state');

  perform pg_temp.check_fail('10', 'invalid payment method rejected', $s$
    insert into public.payments (member_id, plan_id, entry_type, original_price, payable,
                                 discount_pct, discount_amount, method, utr, state, recorded_by)
    values ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
            'payment', 1500.00, 1500.00, 0, 0, 'card', null, 'awaitingVerification',
            '22222222-2222-2222-2222-222222222222') $s$, '23514', 'method');

  perform pg_temp.check_fail('11', 'invalid freeze state rejected', $s$
    insert into public.membership_freezes (member_id, start_date, end_date, reason, state, requested_by)
    values ('bbbbbbbb-0000-0000-0000-000000000001', date '2026-03-01', date '2026-03-10',
            'Medical', 'frozen', '22222222-2222-2222-2222-222222222222') $s$, '23514', 'state');

  -- corrected rule: attendance is verified-only (O-35, O-10)
  perform pg_temp.check_fail('12', 'attendance row with status ''failed'' rejected (failed scans are never stored)', $s$
    insert into public.attendance_events (member_id, token_id, door, status)
    values ('bbbbbbbb-0000-0000-0000-000000000001',
            'dddddddd-0000-0000-0000-000000000001', 'Main entrance', 'failed') $s$,
    '23514', 'status');

  perform pg_temp.check_fail('13', 'qr token with non-attendance purpose rejected', $s$
    insert into public.qr_tokens (token_hash, purpose, expires_at, minted_by)
    values (repeat('a', 64), 'payment', now() + interval '60 seconds',
            '22222222-2222-2222-2222-222222222222') $s$, '23514', 'purpose');

  perform pg_temp.check_fail('14', 'invalid profile role rejected', $s$
    insert into public.profiles (id, display_name, role)
    values ('11111111-1111-1111-1111-111111111111', 'Dup', 'admin') $s$, '23514', 'role');

  perform pg_temp.check_fail('15', 'invalid join application state rejected', $s$
    insert into public.join_applications (full_name, phone, plan_id, state)
    values ('Bad State', '9800000090', 'aaaaaaaa-0000-0000-0000-000000000001', 'pending') $s$,
    '23514', 'state');

  -------------------------------------------------------------------
  -- U. UTR requirement + verifier consistency
  -------------------------------------------------------------------
  perform pg_temp.check_fail('16', 'UPI payment without UTR rejected', $s$
    insert into public.payments (member_id, plan_id, entry_type, original_price, payable,
                                 discount_pct, discount_amount, method, utr, state, recorded_by)
    values ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
            'payment', 1500.00, 1500.00, 0, 0, 'upi', null, 'awaitingVerification',
            '22222222-2222-2222-2222-222222222222') $s$, '23514', 'upi_requires_utr');

  perform pg_temp.check_fail('17', 'awaitingVerification row carrying verified_by rejected', $s$
    insert into public.payments (member_id, plan_id, entry_type, original_price, payable,
                                 discount_pct, discount_amount, method, utr, state, recorded_by, verified_by)
    values ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
            'payment', 1500.00, 1500.00, 0, 0, 'cash', null, 'awaitingVerification',
            '22222222-2222-2222-2222-222222222222',
            '11111111-1111-1111-1111-111111111111') $s$, '23514', 'undecided_has_no_verifier');

  perform pg_temp.check_fail('18', 'verified row without verified_at rejected', $s$
    insert into public.payments (member_id, plan_id, entry_type, original_price, payable,
                                 discount_pct, discount_amount, method, utr, state, recorded_by, verified_by)
    values ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
            'payment', 1500.00, 1500.00, 0, 0, 'cash', null, 'verified',
            '22222222-2222-2222-2222-222222222222',
            '11111111-1111-1111-1111-111111111111') $s$, '23514', 'undecided_has_no_verify_time');

  -------------------------------------------------------------------
  -- R. reversal pairing (structural)
  -------------------------------------------------------------------
  perform pg_temp.check_fail('19', 'payment row carrying reversal_of rejected', $s$
    insert into public.payments (member_id, plan_id, entry_type, original_price, payable,
                                 discount_pct, discount_amount, method, utr, state, recorded_by, reversal_of)
    values ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
            'payment', 1500.00, 1500.00, 0, 0, 'cash', null, 'awaitingVerification',
            '22222222-2222-2222-2222-222222222222',
            'cccccccc-0000-0000-0000-000000000000') $s$, '23514', 'reversal_pairing');

  perform pg_temp.check_fail('20', 'reversal row without reversal_of rejected', $s$
    insert into public.payments (member_id, plan_id, entry_type, original_price, payable,
                                 discount_pct, discount_amount, method, utr, state, recorded_by)
    values ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
            'reversal', 500.00, 500.00, 0, 0, 'cash', null, 'verified',
            '22222222-2222-2222-2222-222222222222') $s$, '23514', 'reversal_pairing');

  -------------------------------------------------------------------
  -- P. payment lifecycle + period/void structures (O-23)
  -------------------------------------------------------------------
  perform pg_temp.check_ok('21', 'valid cash payment accepted', $s$
    insert into public.payments (member_id, plan_id, entry_type, original_price, payable,
                                 discount_pct, discount_amount, method, utr, state, recorded_by)
    values ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
            'payment', 1500.00, 1500.00, 0, 0, 'cash', null, 'awaitingVerification',
            '22222222-2222-2222-2222-222222222222') $s$);

  perform pg_temp.check_ok('22', 'valid UPI payment with UTR accepted', $s$
    insert into public.payments (member_id, plan_id, entry_type, original_price, payable,
                                 discount_pct, discount_amount, method, utr, state, recorded_by)
    values ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
            'payment', 1500.00, 1500.00, 0, 0, 'upi', 'UTRTEST0000000001', 'awaitingVerification',
            '22222222-2222-2222-2222-222222222222') $s$);

  perform pg_temp.check_fail('23', 'duplicate UTR rejected', $s$
    insert into public.payments (member_id, plan_id, entry_type, original_price, payable,
                                 discount_pct, discount_amount, method, utr, state, recorded_by)
    values ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
            'payment', 1500.00, 1500.00, 0, 0, 'upi', 'UTRTEST0000000001', 'awaitingVerification',
            '22222222-2222-2222-2222-222222222222') $s$, '23505', 'payments_utr_key');

  -- mark the UPI payment verified (direct superuser UPDATE: no 0002
  -- triggers/grants yet — behavioral transitions are 0003)
  update public.payments
  set state = 'verified', verified_by = '11111111-1111-1111-1111-111111111111', verified_at = now()
  where utr = 'UTRTEST0000000001';

  perform pg_temp.check_ok('24', 'period created by verified payment accepted', $s$
    insert into public.membership_periods (member_id, plan_id, start_date, end_date, price_applied, created_by_payment)
    select member_id, plan_id, date '2026-01-10', date '2026-04-10', 1500.00, id
    from public.payments where utr = 'UTRTEST0000000001' $s$);

  perform pg_temp.check_fail('25', 'second period from the same payment rejected (one period per payment)', $s$
    insert into public.membership_periods (member_id, plan_id, start_date, end_date, price_applied, created_by_payment)
    select member_id, plan_id, date '2026-04-11', date '2026-07-11', 1500.00, id
    from public.payments where utr = 'UTRTEST0000000001' $s$, '23505', 'one_period_per_payment');

  perform pg_temp.check_fail('26', 'period with end_date < start_date rejected', $s$
    insert into public.membership_periods (member_id, plan_id, start_date, end_date, price_applied, created_by_payment)
    select member_id, plan_id, date '2026-05-10', date '2026-05-01', 1500.00, id
    from public.payments where utr = 'UTRTEST0000000001' $s$, '23514', 'period_ordering');

  perform pg_temp.check_ok('27', 'valid reversal row (reversal → payment) accepted', $s$
    insert into public.payments (member_id, plan_id, entry_type, original_price, payable,
                                 discount_pct, discount_amount, method, utr, state, recorded_by,
                                 verified_by, verified_at, reversal_of)
    select member_id, plan_id, 'reversal', payable, payable, 0, 0, method, null, 'verified',
           '22222222-2222-2222-2222-222222222222',
           '22222222-2222-2222-2222-222222222222', now(), id
    from public.payments where utr = 'UTRTEST0000000001' $s$);

  -- correction #6: reversal → REVERSAL must be structurally impossible
  perform pg_temp.check_fail('28', 'reversal referencing another reversal rejected (composite FK)', $s$
    insert into public.payments (member_id, plan_id, entry_type, original_price, payable,
                                 discount_pct, discount_amount, method, utr, state, recorded_by,
                                 verified_by, verified_at, reversal_of)
    select member_id, plan_id, 'reversal', 100.00, 100.00, 0, 0, 'cash', null, 'verified',
           '22222222-2222-2222-2222-222222222222',
           '22222222-2222-2222-2222-222222222222', now(), r.id
    from public.payments r where r.entry_type = 'reversal' limit 1 $s$, '23503', 'reversal_targets_payment');

  perform pg_temp.check_ok('29', 'append-only period-void event accepted', $s$
    insert into public.membership_period_voids (period_id, reversal_id, voided_by)
    select p.id, r.id, '22222222-2222-2222-2222-222222222222'
    from public.membership_periods p
    join public.payments r on r.entry_type = 'reversal' and r.state = 'verified'
    where p.created_by_payment = r.reversal_of $s$);

  perform pg_temp.check_fail('30', 'second void of the same period rejected (a period voids exactly once)', $s$
    insert into public.membership_period_voids (period_id, reversal_id, voided_by)
    select p.id, r.id, '22222222-2222-2222-2222-222222222222'
    from public.membership_periods p
    join public.payments r on r.entry_type = 'reversal' and r.state = 'verified'
    where p.created_by_payment = r.reversal_of $s$, '23505', 'membership_period_voids');

  -------------------------------------------------------------------
  -- F. freeze windows: inclusive ranges + storage-level overlap ban
  -------------------------------------------------------------------
  perform pg_temp.check_ok('31', 'valid pending freeze window accepted', $s$
    insert into public.membership_freezes (member_id, start_date, end_date, reason, state, requested_by)
    values ('bbbbbbbb-0000-0000-0000-000000000001', date '2027-01-01', date '2027-01-10',
            'Medical', 'pending', '22222222-2222-2222-2222-222222222222') $s$);

  select active_range into v_range
  from public.membership_freezes
  where member_id = 'bbbbbbbb-0000-0000-0000-000000000001' and state = 'pending';

  perform pg_temp.check_true('32', 'active_range is INCLUSIVE of end_date (O-02)',
    v_range is not null
      and v_range @> date '2027-01-10' and not v_range @> date '2027-01-11',
    format('range = %s', coalesce(v_range::text, 'NULL')));

  perform pg_temp.check_fail('33', 'overlapping pending freeze rejected at the storage layer', $s$
    insert into public.membership_freezes (member_id, start_date, end_date, reason, state, requested_by)
    values ('bbbbbbbb-0000-0000-0000-000000000001', date '2027-01-10', date '2027-01-20',
            'Travel', 'pending', '22222222-2222-2222-2222-222222222222') $s$,
    '23514', 'freezes_no_overlap');

  perform pg_temp.check_ok('34', 'adjacent (non-overlapping) freeze window accepted', $s$
    insert into public.membership_freezes (member_id, start_date, end_date, reason, state, requested_by)
    values ('bbbbbbbb-0000-0000-0000-000000000001', date '2027-01-11', date '2027-01-15',
            'Travel', 'pending', '22222222-2222-2222-2222-222222222222') $s$);

  -- NOTE: the generated active_range constructor (daterange) rejects
  -- end < start during row generation, BEFORE window_ordering is reachable;
  -- the named CHECK stays as defense-in-depth (e.g. for future paths).
  perform pg_temp.check_fail('35', 'freeze window with end < start rejected', $s$
    insert into public.membership_freezes (member_id, start_date, end_date, reason, state, requested_by)
    values ('bbbbbbbb-0000-0000-0000-000000000001', date '2027-02-10', date '2027-02-01',
            'Other', 'pending', '22222222-2222-2222-2222-222222222222') $s$,
    '22000', 'range lower bound must be less than or equal to range upper bound');

  perform pg_temp.check_fail('36', 'pending freeze carrying a decision rejected', $s$
    insert into public.membership_freezes (member_id, start_date, end_date, reason, state,
                                           requested_by, decided_by, decided_at)
    values ('bbbbbbbb-0000-0000-0000-000000000001', date '2027-03-01', date '2027-03-05',
            'Other', 'pending', '22222222-2222-2222-2222-222222222222',
            '22222222-2222-2222-2222-222222222222', now()) $s$, '23514', 'pending_means_undecided');

  perform pg_temp.check_fail('37', 'approved freeze without extension_days rejected', $s$
    insert into public.membership_freezes (member_id, start_date, end_date, reason, state,
                                           requested_by, decided_by, decided_at)
    values ('bbbbbbbb-0000-0000-0000-000000000001', date '2027-04-01', date '2027-04-05',
            'Other', 'approved', '22222222-2222-2222-2222-222222222222',
            '22222222-2222-2222-2222-222222222222', now()) $s$, '23514', 'approved_has_extension');

  -- rejected freezes carry an empty range and never block re-requests
  update public.membership_freezes
  set state = 'rejected', decided_by = '22222222-2222-2222-2222-222222222222', decided_at = now()
  where member_id = 'bbbbbbbb-0000-0000-0000-000000000001' and end_date = date '2027-01-15';

  perform pg_temp.check_ok('38', 'rejected freeze no longer blocks its date range', $s$
    insert into public.membership_freezes (member_id, start_date, end_date, reason, state, requested_by)
    values ('bbbbbbbb-0000-0000-0000-000000000001', date '2027-01-11', date '2027-01-15',
            'Travel', 'pending', '22222222-2222-2222-2222-222222222222') $s$);

  -------------------------------------------------------------------
  -- T. tokens + attendance uniqueness (replay guard)
  -------------------------------------------------------------------
  perform pg_temp.check_ok('39', 'valid attendance QR token accepted', $s$
    insert into public.qr_tokens (id, token_hash, expires_at, minted_by)
    values ('dddddddd-0000-0000-0000-000000000001', repeat('a', 64),
            now() + interval '60 seconds',
            '22222222-2222-2222-2222-222222222222') $s$);

  perform pg_temp.check_fail('40', 'malformed token hash rejected (SHA-256 hex only)', $s$
    insert into public.qr_tokens (token_hash, expires_at, minted_by)
    values ('not-a-hash', now() + interval '60 seconds',
            '22222222-2222-2222-2222-222222222222') $s$, '23514', 'token_hash');

  perform pg_temp.check_fail('41', 'token expiring before creation rejected', $s$
    insert into public.qr_tokens (token_hash, expires_at, minted_by)
    values (repeat('b', 64), now() - interval '60 seconds',
            '22222222-2222-2222-2222-222222222222') $s$, '23514', 'token_expiry_positive');

  perform pg_temp.check_ok('42', 'successful scan accepted (verified-only rule)', $s$
    insert into public.attendance_events (member_id, token_id, door, status)
    values ('bbbbbbbb-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001',
            'Main entrance', 'verified') $s$);

  perform pg_temp.check_fail('43', 'same member reusing the SAME token rejected (replay guard)', $s$
    insert into public.attendance_events (member_id, token_id, door, status)
    values ('bbbbbbbb-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001',
            'Main entrance', 'verified') $s$, '23505', 'attendance_member_token_uq');

  perform pg_temp.check_ok('44', 'a DIFFERENT member sharing the live token accepted', $s$
    insert into public.attendance_events (member_id, token_id, door, status)
    values ('bbbbbbbb-0000-0000-0000-000000000002', 'dddddddd-0000-0000-0000-000000000001',
            'Main entrance', 'verified') $s$);

  perform pg_temp.check_fail('45', 'duplicate token_hash rejected', $s$
    insert into public.qr_tokens (token_hash, expires_at, minted_by)
    values (repeat('a', 64), now() + interval '60 seconds',
            '22222222-2222-2222-2222-222222222222') $s$, '23505', 'qr_tokens_token_hash_key');

  -------------------------------------------------------------------
  -- Q. singleton + unique plan names
  -------------------------------------------------------------------
  perform pg_temp.check_fail('46', 'second app_settings row rejected (singleton)', $s$
    insert into public.app_settings (id) values (2) $s$, '23514', 'app_settings_id_check');

  perform pg_temp.check_fail('47', 'duplicate plan name rejected', $s$
    insert into public.plans (name, duration, price) values ('Monthly', 'monthly', 100) $s$,
    '23505', 'plans_name_key');

  -------------------------------------------------------------------
  -- K. referential behavior: RESTRICT everywhere + auth cascades
  -------------------------------------------------------------------
  perform pg_temp.check_fail('48', 'member with payments cannot be deleted (RESTRICT)', $s$
    delete from public.members where id = 'bbbbbbbb-0000-0000-0000-000000000001' $s$,
    '23503', 'foreign key constraint');

  perform pg_temp.check_fail('49', 'plan in use cannot be deleted (RESTRICT)', $s$
    delete from public.plans where id = 'aaaaaaaa-0000-0000-0000-000000000001' $s$,
    '23503', 'foreign key constraint');

  perform pg_temp.check_fail('50', 'qr token referenced by events cannot be deleted (RESTRICT)', $s$
    delete from public.qr_tokens where id = 'dddddddd-0000-0000-0000-000000000001' $s$,
    '23503', 'foreign key constraint');

  insert into public.join_applications (id, auth_user_id, full_name, phone, plan_id, state)
  values ('eeeeeeee-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333',
          'Walk-in Wanda', '9800000003', 'aaaaaaaa-0000-0000-0000-000000000003', 'submitted');

  perform pg_temp.check_ok('51', 'auth user deletion succeeds (declared cascades)', $s$
    delete from auth.users where id = '33333333-3333-3333-3333-333333333333' $s$);

  select count(*) into v_count from public.profiles
  where id = '33333333-3333-3333-3333-333333333333';
  perform pg_temp.check_true('52', 'profile cascaded with auth user', v_count = 0,
    format('%s profiles remain for the deleted auth user', v_count));

  select count(*) into v_count from public.join_applications
  where auth_user_id = '33333333-3333-3333-3333-333333333333';
  perform pg_temp.check_true('53', 'join application cascaded with auth user', v_count = 0,
    format('%s join applications remain for the deleted auth user', v_count));

  -------------------------------------------------------------------
  -- L. member/profile structural rules
  -------------------------------------------------------------------
  perform pg_temp.check_fail('54', 'one-sided pending plan assignment rejected', $s$
    update public.members set pending_plan_id = 'aaaaaaaa-0000-0000-0000-000000000003'
    where id = 'bbbbbbbb-0000-0000-0000-000000000002' $s$, '23514', 'pending_plan_pairing');

  perform pg_temp.check_fail('55', 'zero price_locked rejected', $s$
    insert into public.members (full_name, phone, price_locked)
    values ('Bad Price', '9800000004', 0) $s$, '23514', 'price_locked');

  perform pg_temp.check_fail('56', 'profile insert without a real auth user rejected', $s$
    insert into public.profiles (id, display_name, role)
    values ('ffff0000-0000-0000-0000-000000000001', 'Ghost', 'member') $s$, '23503', 'foreign key constraint');

  -------------------------------------------------------------------
  -- report: every assertion individually, then the verdict
  -------------------------------------------------------------------
  for r in select num, label, passed, detail from t_results order by num::int loop
    if r.passed then
      raise notice 'PASS  %  %', r.num, r.label;
    else
      raise notice 'FAIL  %  %  ::  %', r.num, r.label, r.detail;
    end if;
  end loop;

  select count(*) filter (where passed), count(*) into v_pass, v_total from t_results;

  if v_pass < v_total then
    raise exception '0001 VALIDATION FAILED: % of % assertions passed — see FAIL lines above',
      v_pass, v_total;
  end if;
  raise notice '0001 VALIDATION PASSED: % of % assertions passed', v_pass, v_total;
end $$;
