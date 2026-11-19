-- =====================================================================
-- 0004_views.sql — Phase 3B.4 Stage 2
-- Four SECURITY INVOKER views: v_member_status, v_inactive_members,
-- v_daily_report, v_month_revenue
-- ---------------------------------------------------------------------
-- Security model:
--   v_member_status, v_inactive_members  — member-restricted (RLS on underlying tables filters rows)
--   v_daily_report, v_month_revenue      — staff-only (WHERE app_profile_role() IN ('owner','receptionist'))
-- All views: GRANT SELECT TO authenticated; REVOKE SELECT FROM anon, PUBLIC
-- ---------------------------------------------------------------------
-- Freeze arithmetic: pure-pause model per owner ruling 2026-11-18 (B1).
--   effective_expiry = latest non-voided period end_date
--                    + union-deduped frozen days from all begun approved/ended freezes
--   Frozen days counted per-window:
--     active (approved, begun, not ended):   [start_date, min(end_date, gym_date())] inclusive
--     ended (receptionist/scan):            [start_date, gym_local(ended_at) - 1] inclusive
--     window elapsed, no end event:         [start_date, end_date] inclusive
--     future-dated/pending/rejected:        empty
-- Inactivity anchor for never-attended members: members.joined_on (owner ruling 2026-11-18, B2).
-- Timezone: all timestamptz -> gym-local date via app_gym_date() coalesce expression.
-- Month semantics: gym-local calendar month (matches monthPaymentTotals).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helper: inline gym-local date expression (same as app_gym_date)
-- ---------------------------------------------------------------------
-- Used throughout to avoid function call overhead and keep views
-- self-contained within 0004 scope. Equivalent to app_gym_date().
-- tz = coalesce((select gym_timezone from app_settings where id = 1), 'Asia/Kolkata')
-- ---------------------------------------------------------------------

-- =====================================================================
-- 1. v_member_status — pause-aware member status
-- =====================================================================
create view public.v_member_status
with (security_invoker = true)
as
with
  tz as (
    select coalesce(
      (select gym_timezone from public.app_settings where id = 1),
      'Asia/Kolkata'
    ) as tz
  ),
  today as (
    select (now() at time zone (select tz from tz))::date as gym_date
  ),
  -- latest non-voided period per member (using ROW_NUMBER in subquery)
  latest_period as (
    select member_id, period_end
    from (
      select
        p.member_id,
        p.end_date as period_end,
        row_number() over (partition by p.member_id order by p.start_date desc, p.created_at desc) as rn
      from public.membership_periods p
      where not exists (
        select 1 from public.membership_period_voids v where v.period_id = p.id
      )
    ) s
    where rn = 1
  ),
  -- frozen-day union per member (lifetime cumulative)
  frozen_union as (
    select
      f.member_id,
      count(distinct g.d) as frozen_days
    from public.membership_freezes f
    cross join today
    cross join lateral generate_series(
      f.start_date,
      case
        when f.ended_at is not null then
          -- clamp to the approved window (§4.4 f = clamp(...))
          least(f.end_date,
                ((f.ended_at at time zone (select tz from tz))::date - 1))
        when f.state = 'ended' then
          f.end_date
        else
          least(f.end_date, today.gym_date)
      end,
      interval '1 day'
    ) as g(d)
    where f.state in ('approved', 'ended')
      and f.start_date <= today.gym_date
      and g.d <= today.gym_date
    group by f.member_id
  )
select
  m.id as member_id,
  m.full_name,
  m.phone,
  m.email,
  m.plan_id,
  pl.name as plan_name,
  pl.duration as plan_duration,
  m.price_locked,
  m.discount_pct,
  m.membership_end as stored_membership_end,
  m.joined_on,
  m.auth_user_id,
  -- freeze state: 'frozen' if an approved window covers today
  case
    when exists (
      select 1 from public.membership_freezes f
      where f.member_id = m.id
        and f.state = 'approved'
        and f.start_date <= today.gym_date
        and (
          case
            when f.ended_at is null then f.end_date >= today.gym_date
            else ((f.ended_at at time zone (select tz from tz))::date >= today.gym_date)
          end
        )
    ) then 'frozen'
    -- active/expiring/expired based on effective expiry
    when lp.period_end is null then 'expired'
    else
      case
        when (lp.period_end + (coalesce(fu.frozen_days, 0) * interval '1 day')) < today.gym_date then 'expired'
        when (lp.period_end + (coalesce(fu.frozen_days, 0) * interval '1 day')) <= (today.gym_date + interval '7 days') then 'expiring'
        else 'active'
      end
  end as status,
  -- derived effective expiry (pause-aware)
  (lp.period_end + (coalesce(fu.frozen_days, 0) * interval '1 day')) as effective_expiry,
  -- days until effective expiry (negative = past)
  (lp.period_end + (coalesce(fu.frozen_days, 0) * interval '1 day') - today.gym_date) as days_remaining,
  -- whether member is currently frozen
  exists (
    select 1 from public.membership_freezes f
    where f.member_id = m.id
      and f.state = 'approved'
      and f.start_date <= today.gym_date
      and (
        case
          when f.ended_at is null then f.end_date >= today.gym_date
          else ((f.ended_at at time zone (select tz from tz))::date >= today.gym_date)
        end
      )
  ) as is_frozen,
  -- count of active freeze windows
  (
    select count(*) from public.membership_freezes f
    where f.member_id = m.id
      and f.state = 'approved'
      and f.start_date <= today.gym_date
      and (
        case
          when f.ended_at is null then f.end_date >= today.gym_date
          else ((f.ended_at at time zone (select tz from tz))::date >= today.gym_date)
        end
      )
  ) as active_freeze_count,
  today.gym_date as gym_date
from public.members m
left join public.plans pl on pl.id = m.plan_id
left join latest_period lp on lp.member_id = m.id
left join frozen_union fu on fu.member_id = m.id
cross join today
;

-- ---------------------------------------------------------------------
-- Security grants
-- ---------------------------------------------------------------------
grant select on public.v_member_status to authenticated;
revoke select on public.v_member_status from anon, public;

-- =====================================================================
-- 2. v_inactive_members — inactivity with frozen-day exclusion
-- =====================================================================
create view public.v_inactive_members
with (security_invoker = true)
as
with
  tz as (
    select coalesce(
      (select gym_timezone from public.app_settings where id = 1),
      'Asia/Kolkata'
    ) as tz
  ),
  today as (
    select (now() at time zone (select tz from tz))::date as gym_date
  ),
  -- last successful attendance per member (verified only)
  last_attendance as (
    select
      ae.member_id,
      max((ae.checked_in_at at time zone (select tz from tz))::date) as last_scan_date
    from public.attendance_events ae
    where ae.status = 'verified'
    group by ae.member_id
  ),
  -- frozen days between L+1 and gym_date for each member
  frozen_between as (
    select
      f.member_id,
      count(distinct g.d) as frozen_days
    from public.membership_freezes f
    cross join today
    cross join lateral (
      select
        coalesce(la.last_scan_date, m.joined_on) as L,
        m.joined_on
      from public.members m
      left join last_attendance la on la.member_id = m.id
      where m.id = f.member_id
    ) anchor
    cross join lateral generate_series(
      greatest(f.start_date, anchor.L + 1),
      case
        when f.ended_at is not null then
          least(f.end_date,
                ((f.ended_at at time zone (select tz from tz))::date - 1),
                today.gym_date)
        when f.state = 'ended' then
          least(f.end_date, today.gym_date)
        else
          least(f.end_date, today.gym_date)
      end,
      interval '1 day'
    ) as g(d)
    where f.state in ('approved', 'ended')
      and g.d is not null
      and greatest(f.start_date, anchor.L + 1) <=
          case
            when f.ended_at is not null then
              least(f.end_date,
                ((f.ended_at at time zone (select tz from tz))::date - 1),
                today.gym_date)
            when f.state = 'ended' then
              least(f.end_date, today.gym_date)
            else
              least(f.end_date, today.gym_date)
          end
      and g.d <= today.gym_date
    group by f.member_id
  ),
  -- base inactivity span per member
  base as (
    select
      m.id as member_id,
      m.full_name,
      m.phone,
      m.email,
      m.plan_id,
      pl.name as plan_name,
      m.membership_end,
      m.joined_on,
      coalesce(la.last_scan_date, m.joined_on) as last_successful_attendance_date,
      today.gym_date,
      today.gym_date - coalesce(la.last_scan_date, m.joined_on) as raw_days_since_last
    from public.members m
    left join public.plans pl on pl.id = m.plan_id
    left join last_attendance la on la.member_id = m.id
    cross join today
  )
select
  b.member_id,
  b.full_name,
  b.phone,
  b.email,
  b.plan_id,
  b.plan_name,
  b.membership_end,
  b.joined_on,
  b.last_successful_attendance_date,
  b.raw_days_since_last,
  coalesce(fb.frozen_days, 0) as frozen_days_between,
  b.raw_days_since_last - coalesce(fb.frozen_days, 0) as inactive_days,
  case
    when (b.raw_days_since_last - coalesce(fb.frozen_days, 0)) > 30 then true
    else false
  end as is_inactive,
  b.gym_date
from base b
left join frozen_between fb on fb.member_id = b.member_id
;

grant select on public.v_inactive_members to authenticated;
revoke select on public.v_inactive_members from anon, public;

-- =====================================================================
-- 3. v_daily_report — daily aggregates (staff only)
-- =====================================================================
create view public.v_daily_report
with (security_invoker = true)
as
with
  tz as (
    select coalesce(
      (select gym_timezone from public.app_settings where id = 1),
      'Asia/Kolkata'
    ) as tz
  ),
  today as (
    select (now() at time zone (select tz from tz))::date as gym_date
  ),
  -- staff gate: only owner/receptionist see rows
  role_gate as (
    select public.app_profile_role() as caller_role
  ),
  -- daily revenue aggregates
  daily_rev as (
    select
      (p.recorded_at at time zone (select tz from tz))::date as report_date,
      sum(case when p.entry_type = 'payment'  and p.state = 'verified' then p.payable else 0 end) as gross,
      sum(case when p.entry_type = 'reversal' and p.state = 'verified' then p.payable else 0 end) as reversals,
      sum(case when p.state = 'verified' then p.discount_amount else 0 end) as discounts,
      sum(case when p.entry_type = 'reversal' and p.state = 'verified' then p.payable else 0 end) as refunds
    from public.payments p
    group by (p.recorded_at at time zone (select tz from tz))::date
  ),
  -- daily attendance
  daily_att as (
    select
      (ae.checked_in_at at time zone (select tz from tz))::date as report_date,
      count(*) as attendance,
      count(distinct ae.member_id) as unique_visitors
    from public.attendance_events ae
    where ae.status = 'verified'
    group by (ae.checked_in_at at time zone (select tz from tz))::date
  ),
  -- daily new members (period starts)
  daily_new as (
    select
      mp.start_date as report_date,
      count(*) as new_members
    from public.membership_periods mp
    where not exists (
      select 1 from public.membership_period_voids v where v.period_id = mp.id
    )
    group by mp.start_date
  ),
  -- daily renewals (period starts after the first)
  daily_renewals as (
    select
      mp.start_date as report_date,
      count(*) as renewals
    from public.membership_periods mp
    where not exists (
      select 1 from public.membership_period_voids v where v.period_id = mp.id
    )
      and mp.start_date <> (
        select min(start_date) from public.membership_periods mp2
        where mp2.member_id = mp.member_id
          and not exists (
            select 1 from public.membership_period_voids v where v.period_id = mp2.id
          )
      )
    group by mp.start_date
  )
select
  d.report_date,
  d.gym_date as today,
  coalesce(r.gross, 0) as gross,
  coalesce(r.reversals, 0) as reversals,
  (coalesce(r.gross, 0) - coalesce(r.reversals, 0)) as net,
  coalesce(a.attendance, 0) as attendance,
  coalesce(a.unique_visitors, 0) as unique_visitors,
  coalesce(n.new_members, 0) as new_members,
  coalesce(ren.renewals, 0) as renewals,
  coalesce(r.discounts, 0) as discounts,
  coalesce(r.refunds, 0) as refunds
from (
  select report_date, gym_date
  from daily_rev
  cross join today
  union
  select report_date, gym_date
  from daily_att
  cross join today
  union
  select report_date, gym_date
  from daily_new
  cross join today
  union
  select report_date, gym_date
  from daily_renewals
  cross join today
) d
left join daily_rev r on r.report_date = d.report_date
left join daily_att a on a.report_date = d.report_date
left join daily_new n on n.report_date = d.report_date
left join daily_renewals ren on ren.report_date = d.report_date
where (select caller_role from role_gate) in ('owner', 'receptionist')
;

grant select on public.v_daily_report to authenticated;
revoke select on public.v_daily_report from anon, public;

-- =====================================================================
-- 4. v_month_revenue — monthly aggregates (staff only)
-- =====================================================================
create view public.v_month_revenue
with (security_invoker = true)
as
with
  tz as (
    select coalesce(
      (select gym_timezone from public.app_settings where id = 1),
      'Asia/Kolkata'
    ) as tz
  ),
  today as (
    select (now() at time zone (select tz from tz))::date as gym_date
  ),
  role_gate as (
    select public.app_profile_role() as caller_role
  ),
  -- monthly revenue aggregates
  monthly_rev as (
    select
      date_trunc('month', (p.recorded_at at time zone (select tz from tz))::date)::date as report_month,
      sum(case when p.entry_type = 'payment'  and p.state = 'verified' then p.payable else 0 end) as gross,
      sum(case when p.entry_type = 'reversal' and p.state = 'verified' then p.payable else 0 end) as reversals,
      sum(case when p.state = 'verified' then p.discount_amount else 0 end) as discounts,
      sum(case when p.entry_type = 'reversal' and p.state = 'verified' then p.payable else 0 end) as refunds
    from public.payments p
    group by date_trunc('month', (p.recorded_at at time zone (select tz from tz))::date)::date
  ),
  -- monthly attendance
  monthly_att as (
    select
      date_trunc('month', (ae.checked_in_at at time zone (select tz from tz))::date)::date as report_month,
      count(*) as attendance,
      count(distinct ae.member_id) as unique_visitors
    from public.attendance_events ae
    where ae.status = 'verified'
    group by date_trunc('month', (ae.checked_in_at at time zone (select tz from tz))::date)::date
  ),
  -- monthly new members
  monthly_new as (
    select
      date_trunc('month', mp.start_date)::date as report_month,
      count(*) as new_members
    from public.membership_periods mp
    where not exists (
      select 1 from public.membership_period_voids v where v.period_id = mp.id
    )
    group by date_trunc('month', mp.start_date)::date
  ),
  -- monthly renewals
  monthly_renewals as (
    select
      date_trunc('month', mp.start_date)::date as report_month,
      count(*) as renewals
    from public.membership_periods mp
    where not exists (
      select 1 from public.membership_period_voids v where v.period_id = mp.id
    )
      and mp.start_date <> (
        select min(start_date) from public.membership_periods mp2
        where mp2.member_id = mp.member_id
          and not exists (
            select 1 from public.membership_period_voids v where v.period_id = mp2.id
          )
      )
    group by date_trunc('month', mp.start_date)::date
  )
select
  m.report_month,
  m.gym_date as today,
  coalesce(r.gross, 0) as gross,
  coalesce(r.reversals, 0) as reversals,
  (coalesce(r.gross, 0) - coalesce(r.reversals, 0)) as net,
  coalesce(a.attendance, 0) as attendance,
  coalesce(a.unique_visitors, 0) as unique_visitors,
  coalesce(n.new_members, 0) as new_members,
  coalesce(ren.renewals, 0) as renewals,
  coalesce(r.discounts, 0) as discounts,
  coalesce(r.refunds, 0) as refunds
from (
  select report_month, gym_date
  from monthly_rev
  cross join today
  union
  select report_month, gym_date
  from monthly_att
  cross join today
  union
  select report_month, gym_date
  from monthly_new
  cross join today
  union
  select report_month, gym_date
  from monthly_renewals
  cross join today
) m
left join monthly_rev r on r.report_month = m.report_month
left join monthly_att a on a.report_month = m.report_month
left join monthly_new n on n.report_month = m.report_month
left join monthly_renewals ren on ren.report_month = m.report_month
where (select caller_role from role_gate) in ('owner', 'receptionist')
;

grant select on public.v_month_revenue to authenticated;
revoke select on public.v_month_revenue from anon, public;

-- =====================================================================
-- End of 0004_views.sql
-- =====================================================================