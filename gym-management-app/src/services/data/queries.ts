/**
 * Read-only SELECT queries for Phase 4, Stage 2.
 *
 * Every query uses the ONE shared Supabase client (never a second client)
 * and an explicit column list. There are no inserts, updates, deletes or
 * RPC calls here: the server's RLS/role rules decide what each authenticated
 * session may read, and this layer only selects.
 */
import { getSupabaseClient, type AppSupabaseClient } from '@/services/supabase/client';

import type {
  AttendanceRow,
  DailyReportRow,
  FollowUpRow,
  FreezeRow,
  GymSettingsRow,
  InactiveMemberRow,
  JoinApplicationRow,
  MemberStatusRow,
  MonthRevenueRow,
  PaymentRow,
  PlanRow,
} from './rows';

async function requireClient(): Promise<AppSupabaseClient> {
  const client = await getSupabaseClient();
  if (!client) throw new Error('Supabase is not configured for this build.');
  return client;
}

function messageOf(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return 'The request could not be completed.';
}

const MEMBER_STATUS_COLUMNS = [
  'member_id',
  'full_name',
  'phone',
  'email',
  'plan_id',
  'plan_name',
  'plan_duration',
  'price_locked',
  'discount_pct',
  'stored_membership_end',
  'joined_on',
  'auth_user_id',
  'status',
  'effective_expiry',
  'days_remaining',
  'is_frozen',
  'active_freeze_count',
  'gym_date',
].join(',');

const INACTIVE_COLUMNS = [
  'member_id',
  'full_name',
  'phone',
  'email',
  'plan_id',
  'plan_name',
  'membership_end',
  'joined_on',
  'last_successful_attendance_date',
  'raw_days_since_last',
  'frozen_days_between',
  'inactive_days',
  'is_inactive',
  'gym_date',
].join(',');

const REPORT_COLUMNS = [
  'report_date',
  'today',
  'gross',
  'reversals',
  'net',
  'attendance',
  'unique_visitors',
  'new_members',
  'renewals',
  'discounts',
  'refunds',
].join(',');

const MONTH_COLUMNS = [
  'report_month',
  'today',
  'gross',
  'reversals',
  'net',
  'attendance',
  'unique_visitors',
  'new_members',
  'renewals',
  'discounts',
  'refunds',
].join(',');

export const PAYMENT_COLUMNS = [
  'id',
  'member_id',
  'plan_id',
  'entry_type',
  'original_price',
  'discount_pct',
  'discount_amount',
  'payable',
  'method',
  'utr',
  'state',
  'receipt_issued',
  'recorded_by',
  'verified_by',
  'recorded_at',
  'verified_at',
  'reversal_of',
  'note',
].join(',');

const ATTENDANCE_COLUMNS = 'id,member_id,door,status,checked_in_at';

const PLAN_COLUMNS = 'id,name,duration,price,currency,is_active';

export async function fetchMemberStatusRows(): Promise<MemberStatusRow[]> {
  const client = await requireClient();
  const { data, error } = await client
    .from('v_member_status')
    .select(MEMBER_STATUS_COLUMNS)
    .order('full_name', { ascending: true });
  if (error) throw new Error(messageOf(error));
  return (data ?? []) as unknown as MemberStatusRow[];
}

export async function fetchInactiveMemberRows(): Promise<InactiveMemberRow[]> {
  const client = await requireClient();
  const { data, error } = await client
    .from('v_inactive_members')
    .select(INACTIVE_COLUMNS)
    .order('inactive_days', { ascending: false });
  if (error) throw new Error(messageOf(error));
  return (data ?? []) as unknown as InactiveMemberRow[];
}

export async function fetchDailyReportRow(): Promise<DailyReportRow | null> {
  const client = await requireClient();
  const { data, error } = await client
    .from('v_daily_report')
    .select(REPORT_COLUMNS)
    .order('report_date', { ascending: false })
    .limit(1);
  if (error) throw new Error(messageOf(error));
  return ((data ?? [])[0] as unknown as DailyReportRow | undefined) ?? null;
}

export async function fetchMonthRevenueRows(): Promise<MonthRevenueRow[]> {
  const client = await requireClient();
  const { data, error } = await client
    .from('v_month_revenue')
    .select(MONTH_COLUMNS)
    .order('report_month', { ascending: false })
    .limit(2);
  if (error) throw new Error(messageOf(error));
  return (data ?? []) as unknown as MonthRevenueRow[];
}

export async function fetchPaymentRows(): Promise<PaymentRow[]> {
  const client = await requireClient();
  const { data, error } = await client
    .from('payments')
    .select(PAYMENT_COLUMNS)
    .order('recorded_at', { ascending: false });
  if (error) throw new Error(messageOf(error));
  return (data ?? []) as unknown as PaymentRow[];
}

export async function fetchAttendanceRows(): Promise<AttendanceRow[]> {
  const client = await requireClient();
  const { data, error } = await client
    .from('attendance_events')
    .select(ATTENDANCE_COLUMNS)
    .order('checked_in_at', { ascending: false })
    .limit(2000);
  if (error) throw new Error(messageOf(error));
  return (data ?? []) as unknown as AttendanceRow[];
}

export async function fetchPlanRows(): Promise<PlanRow[]> {
  const client = await requireClient();
  const { data, error } = await client
    .from('plans')
    .select(PLAN_COLUMNS)
    .order('price', { ascending: true });
  if (error) throw new Error(messageOf(error));
  return (data ?? []) as unknown as PlanRow[];
}

export async function fetchFollowUpRows(): Promise<FollowUpRow[]> {
  const client = await requireClient();
  const { data, error } = await client
    .from('follow_up_events')
    .select('id,member_id,channel,outcome,note,created_at')
    .order('created_at', { ascending: false });
  if (error) throw new Error(messageOf(error));
  return (data ?? []) as unknown as FollowUpRow[];
}

export async function fetchJoinApplicationRows(): Promise<JoinApplicationRow[]> {
  const client = await requireClient();
  const { data, error } = await client
    .from('join_applications')
    .select('id,state')
    .order('created_at', { ascending: false });
  if (error) throw new Error(messageOf(error));
  return (data ?? []) as unknown as JoinApplicationRow[];
}

const FREEZE_COLUMNS = [
  'id',
  'member_id',
  'start_date',
  'end_date',
  'reason',
  'state',
  'requested_by',
  'requested_at',
  'decided_by',
  'decided_at',
  'extension_days',
  'ended_at',
  'ended_via',
  'ended_by',
].join(',');

export async function fetchFreezeRows(): Promise<FreezeRow[]> {
  const client = await requireClient();
  const { data, error } = await client
    .from('membership_freezes')
    .select(FREEZE_COLUMNS)
    .order('requested_at', { ascending: false });
  if (error) throw new Error(messageOf(error));
  return (data ?? []) as unknown as FreezeRow[];
}

export async function fetchGymSettingsRow(): Promise<GymSettingsRow | null> {
  const client = await requireClient();
  const { data, error } = await client
    .from('app_settings')
    .select('gym_timezone,upi_id,attendance_token_validity_seconds')
    .eq('id', 1)
    .limit(1);
  if (error) throw new Error(messageOf(error));
  return ((data ?? [])[0] as unknown as GymSettingsRow | undefined) ?? null;
}
