/**
 * Read-only SELECT queries for Phase 4, Stage 2.
 *
 * Every query uses the ONE shared Supabase client (never a second client)
 * and an explicit column list. The only RPC read is the owner-only
 * `admin_staff_directory()`; reads otherwise select directly. There are no
 * inserts, updates or deletes here: the server's RLS/role rules decide what
 * each authenticated session may read, and this layer only reads.
 */
import { getSupabaseClient, type AppSupabaseClient } from '@/services/supabase/client';

import type {
  AttendanceRow,
  AuditLogRow,
  DailyReportRow,
  FollowUpRow,
  FreezeRow,
  GymSettingsRow,
  InactiveMemberRow,
  JoinApplicationRow,
  MemberStatusRow,
  MembershipPeriodRow,
  MonthRevenueRow,
  PaymentRow,
  PendingAssignmentRow,
  PlanRow,
  StaffDirectoryRow,
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
  'receipt_path',
  'recorded_by',
  'verified_by',
  'recorded_at',
  'verified_at',
  'reversal_of',
  'note',
].join(',');

const ATTENDANCE_COLUMNS = 'id,member_id,door,status,checked_in_at';

const PLAN_COLUMNS = 'id,name,duration,price,currency,is_active';

const PERIOD_COLUMNS = [
  'id',
  'member_id',
  'plan_id',
  'start_date',
  'end_date',
  'price_applied',
  'created_by_payment',
  'created_at',
].join(',');

const APPLICATION_COLUMNS = [
  'id',
  'auth_user_id',
  'full_name',
  'phone',
  'email',
  'plan_id',
  'state',
  'phone_verified',
  'email_verified',
  'created_at',
  'decided_by',
  'decided_at',
].join(',');

const AUDIT_COLUMNS = [
  'id',
  'actor',
  'actor_role',
  'action',
  'table_name',
  'row_id',
  'old_values',
  'new_values',
  'at',
].join(',');

/** Bounds for the scoped/range reads added in Phase 5, Stage 3. */
export const HISTORY_LIMIT = 200;
export const RANGE_LIMIT = 5000;
export const AUDIT_LIMIT = 200;
export const APPLICATION_LIMIT = 200;


export async function fetchMemberStatusRows(): Promise<MemberStatusRow[]> {
  const client = await requireClient();
  const { data, error } = await client
    .from('v_member_status')
    .select(MEMBER_STATUS_COLUMNS)
    .order('full_name', { ascending: true });
  if (error) throw new Error(messageOf(error));
  return (data ?? []) as unknown as MemberStatusRow[];
}

export async function fetchMemberStatusRow(memberId: string): Promise<MemberStatusRow | null> {
  const client = await requireClient();
  const { data, error } = await client
    .from('v_member_status')
    .select(MEMBER_STATUS_COLUMNS)
    .eq('member_id', memberId)
    .limit(1);
  if (error) throw new Error(messageOf(error));
  return ((data ?? [])[0] as unknown as MemberStatusRow | undefined) ?? null;
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

export async function fetchPaymentRowsForMember(
  memberId: string,
  limit = HISTORY_LIMIT,
): Promise<PaymentRow[]> {
  const client = await requireClient();
  const { data, error } = await client
    .from('payments')
    .select(PAYMENT_COLUMNS)
    .eq('member_id', memberId)
    .order('recorded_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(messageOf(error));
  return (data ?? []) as unknown as PaymentRow[];
}

/**
 * Bounded ledger range for analytics/export. Half-open [from, to) over
 * `recorded_at`; RLS still decides which rows the session may see.
 */
export async function fetchPaymentRowsInRange(
  fromIso: string,
  toIso: string,
  limit = RANGE_LIMIT,
): Promise<PaymentRow[]> {
  const client = await requireClient();
  const { data, error } = await client
    .from('payments')
    .select(PAYMENT_COLUMNS)
    .gte('recorded_at', fromIso)
    .lt('recorded_at', toIso)
    .order('recorded_at', { ascending: false })
    .limit(limit);
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

export async function fetchAttendanceRowsForMember(
  memberId: string,
  limit = HISTORY_LIMIT,
): Promise<AttendanceRow[]> {
  const client = await requireClient();
  const { data, error } = await client
    .from('attendance_events')
    .select(ATTENDANCE_COLUMNS)
    .eq('member_id', memberId)
    .order('checked_in_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(messageOf(error));
  return (data ?? []) as unknown as AttendanceRow[];
}

export async function fetchAttendanceRowsInRange(
  fromIso: string,
  toIso: string,
  limit = RANGE_LIMIT,
): Promise<AttendanceRow[]> {
  const client = await requireClient();
  const { data, error } = await client
    .from('attendance_events')
    .select(ATTENDANCE_COLUMNS)
    .gte('checked_in_at', fromIso)
    .lt('checked_in_at', toIso)
    .order('checked_in_at', { ascending: false })
    .limit(limit);
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

export async function fetchFollowUpRowsForMember(
  memberId: string,
  limit = HISTORY_LIMIT,
): Promise<FollowUpRow[]> {
  const client = await requireClient();
  const { data, error } = await client
    .from('follow_up_events')
    .select('id,member_id,channel,outcome,note,created_at')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(messageOf(error));
  return (data ?? []) as unknown as FollowUpRow[];
}

export async function fetchJoinApplicationRows(
  limit = APPLICATION_LIMIT,
): Promise<JoinApplicationRow[]> {
  const client = await requireClient();
  const { data, error } = await client
    .from('join_applications')
    .select(APPLICATION_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(limit);
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

export async function fetchFreezeRowsForMember(
  memberId: string,
  limit = HISTORY_LIMIT,
): Promise<FreezeRow[]> {
  const client = await requireClient();
  const { data, error } = await client
    .from('membership_freezes')
    .select(FREEZE_COLUMNS)
    .eq('member_id', memberId)
    .order('start_date', { ascending: false })
    .limit(limit);
  if (error) throw new Error(messageOf(error));
  return (data ?? []) as unknown as FreezeRow[];
}

export async function fetchMembershipPeriodRowsForMember(
  memberId: string,
  limit = HISTORY_LIMIT,
): Promise<MembershipPeriodRow[]> {
  const client = await requireClient();
  const { data, error } = await client
    .from('membership_periods')
    .select(PERIOD_COLUMNS)
    .eq('member_id', memberId)
    .order('start_date', { ascending: false })
    .limit(limit);
  if (error) throw new Error(messageOf(error));
  return (data ?? []) as unknown as MembershipPeriodRow[];
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

/**
 * Newest-first audit page. `audit_log_entries` is owner-readable only; the
 * explicit column list and bounded limit keep the read small and honest.
 */
export async function fetchAuditLogRows(limit = AUDIT_LIMIT): Promise<AuditLogRow[]> {
  const client = await requireClient();
  const { data, error } = await client
    .from('audit_log_entries')
    .select(AUDIT_COLUMNS)
    .order('at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(messageOf(error));
  return (data ?? []) as unknown as AuditLogRow[];
}

/**
 * Plan requests recorded on `members.pending_plan_id`. Staff-readable via
 * the existing `members_select_staff` policy; applies on the next verified
 * payment only.
 */
export async function fetchPendingAssignmentRows(): Promise<PendingAssignmentRow[]> {
  const client = await requireClient();
  const { data, error } = await client
    .from('members')
    .select('id,full_name,pending_plan_id,pending_plan_requested_by')
    .not('pending_plan_id', 'is', null)
    .order('full_name', { ascending: true });
  if (error) throw new Error(messageOf(error));
  return (data ?? []) as unknown as PendingAssignmentRow[];
}

/**
 * Owner-only staff directory. The function itself requires an active owner
 * at AAL2; RLS is not weakened and the caller cannot ask for a member or a
 * credential. Returns owners + receptionists only.
 */
export async function fetchStaffDirectoryRows(): Promise<StaffDirectoryRow[]> {
  const client = await requireClient();
  const { data, error } = await client.rpc('admin_staff_directory');
  if (error) throw new Error(messageOf(error));
  return (data ?? []) as unknown as StaffDirectoryRow[];
}
