/**
 * Row → domain mappers for the read-only Supabase layer.
 *
 * Every displayed value comes from a verified view/table column. Where the
 * backend has no value (e.g. `price_locked` before the first verified
 * payment) the mapper keeps an honest neutral instead of inventing one.
 * Follow-up state is derived from the latest audited follow-up row.
 */
import type {
  AttendanceEvent,
  AuditLogEntry,
  DailyReportNumbers,
  FreezeRecord,
  GymSettings,
  JoinApplication,
  Member,
  MembershipPeriodRecord,
  MembershipPlan,
  MembershipStatus,
  PaymentRecord,
  StaffAccount,
} from '@/types/domain';
import { memberDisplayId } from '@/utils/format';

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
  MonthlyRevenue,
  MonthRevenueSummary,
  PaymentRow,
  PlanRow,
  StaffDirectoryRow,
} from './rows';

export interface FollowUpSummary {
  status: Member['followUp']['status'];
  note?: string;
  updatedAt?: string;
}

/** Latest follow-up event per member (rows should be newest first). */
export function latestFollowUps(rows: FollowUpRow[]): Map<string, FollowUpSummary> {
  const map = new Map<string, FollowUpSummary>();
  for (const row of rows) {
    if (map.has(row.member_id)) continue;
    const status: Member['followUp']['status'] =
      row.outcome === 'won'
        ? 'won'
        : row.outcome === 'lost'
          ? 'lost'
          : row.channel;
    map.set(row.member_id, {
      status,
      note: row.note ?? undefined,
      updatedAt: row.created_at,
    });
  }
  return map;
}

function statusFromView(row: MemberStatusRow): MembershipStatus {
  if (row.is_frozen || row.status === 'frozen') return 'frozen';
  if (row.status === 'expired') return 'expired';
  if (row.status === 'expiring') return 'expiring';
  return 'active';
}

function dateOnly(value: string | null): string | null {
  return value ? value.slice(0, 10) : null;
}

export function toMemberStatus(row: MemberStatusRow, followUp?: FollowUpSummary): Member {
  return {
    id: row.member_id,
    name: row.full_name,
    phone: row.phone,
    email: row.email ?? '',
    planId: row.plan_id ?? '',
    status: statusFromView(row),
    // The view's effective expiry already includes approved freeze days.
    // Screens still apply the shared 7-day date rule for display.
    membershipEnd: dateOnly(row.effective_expiry) ?? dateOnly(row.stored_membership_end),
    priceLocked: row.price_locked ?? 0,
    discountPct: row.discount_pct ?? 0,
    lastAttendance: null,
    joinedOn: dateOnly(row.joined_on) ?? row.joined_on,
    followUp: followUp ?? { status: 'none' },
  };
}

export function toInactiveMember(row: InactiveMemberRow, followUp?: FollowUpSummary): Member {
  const expired = row.membership_end !== null && row.membership_end < row.gym_date;
  return {
    id: row.member_id,
    name: row.full_name,
    phone: row.phone,
    email: row.email ?? '',
    planId: row.plan_id ?? '',
    status: expired ? 'expired' : 'active',
    membershipEnd: row.membership_end,
    priceLocked: 0,
    discountPct: 0,
    lastAttendance: row.last_successful_attendance_date,
    joinedOn: row.joined_on,
    followUp: followUp ?? { status: 'none' },
  };
}

function zeroDaily(date: string): DailyReportNumbers {
  return {
    date,
    attendance: 0,
    uniqueVisitors: 0,
    checkInEvents: 0,
    newMembers: 0,
    renewals: 0,
    verifiedCollections: 0,
    upi: 0,
    cash: 0,
    pendingApplications: 0,
    discounts: 0,
    refunds: 0,
  };
}

export function toDailyReport(row: DailyReportRow | null, fallbackDate: string): DailyReportNumbers {
  if (!row) return zeroDaily(fallbackDate);
  // A stale latest row is not today's report. The view supplies the current
  // gym date, so a day without activity is reported as honest zeros.
  if (row.report_date !== row.today) return zeroDaily(row.today);
  return {
    date: row.report_date,
    attendance: row.attendance,
    uniqueVisitors: row.unique_visitors,
    checkInEvents: row.attendance,
    newMembers: row.new_members,
    renewals: row.renewals,
    verifiedCollections: row.net,
    // The view has no method split; screens that need it derive it from
    // authorised payment rows instead of guessing here.
    upi: 0,
    cash: 0,
    pendingApplications: 0,
    discounts: row.discounts,
    refunds: row.refunds,
  };
}

function emptyMonth(month: string, today: string): MonthRevenueSummary {
  return {
    month,
    today,
    gross: 0,
    reversals: 0,
    net: 0,
    attendance: 0,
    uniqueVisitors: 0,
    newMembers: 0,
    renewals: 0,
    discounts: 0,
    refunds: 0,
  };
}

function toMonthSummary(row: MonthRevenueRow): MonthRevenueSummary {
  return {
    month: row.report_month,
    today: row.today,
    gross: row.gross,
    reversals: row.reversals,
    net: row.net,
    attendance: row.attendance,
    uniqueVisitors: row.unique_visitors,
    newMembers: row.new_members,
    renewals: row.renewals,
    discounts: row.discounts,
    refunds: row.refunds,
  };
}

/**
 * The latest row is only "this month" when its month matches the gym date
 * the view computed. A month with no activity is an honest zero month, not
 * last month's figures relabelled.
 */
export function toMonthlyRevenue(rows: MonthRevenueRow[], fallbackDate: string): MonthlyRevenue {
  const latest = rows[0];
  const today = latest?.today ?? fallbackDate;
  const currentMonth = today.slice(0, 7);
  if (!latest) {
    return { current: emptyMonth(currentMonth, today), previous: null };
  }
  if (latest.report_month.slice(0, 7) !== currentMonth) {
    return {
      current: emptyMonth(currentMonth, today),
      previous: toMonthSummary(latest),
    };
  }
  return {
    current: toMonthSummary(latest),
    previous: rows[1] ? toMonthSummary(rows[1]) : null,
  };
}

export function toPayment(row: PaymentRow, memberName: string): PaymentRecord {
  return {
    id: row.id,
    memberId: row.member_id,
    memberName,
    planId: row.plan_id,
    originalPrice: row.original_price,
    discountPct: row.discount_pct,
    payable: row.payable,
    method: row.method,
    utr: row.utr ?? undefined,
    state: row.state,
    receiptIssued: row.receipt_issued,
    receiptPath: row.receipt_path ?? undefined,
    createdAt: row.recorded_at,
    note: row.note ?? undefined,
    entryType: row.entry_type,
    reversalOf: row.reversal_of ?? undefined,
    recordedBy: row.recorded_by,
    // The id is for the segregation-of-duties check only; screens never
    // present a raw profile id as a person's name.
    verifiedById: row.verified_by ?? undefined,
    verifiedAt: row.verified_at ?? undefined,
  };
}

export function toFreeze(row: FreezeRow, memberName: string): FreezeRecord {
  return {
    id: row.id,
    memberId: row.member_id,
    memberName,
    startDate: row.start_date.slice(0, 10),
    endDate: row.end_date.slice(0, 10),
    reason: row.reason,
    state: row.state,
    requestedAt: row.requested_at,
    decidedAt: row.decided_at ?? undefined,
    extensionDays: row.extension_days,
    endedAt: row.ended_at ?? undefined,
    endedVia: row.ended_via ?? undefined,
  };
}

export function toGymSettings(row: GymSettingsRow): GymSettings {
  return {
    gymTimezone: row.gym_timezone,
    upiId: row.upi_id,
    attendanceTokenValiditySeconds: row.attendance_token_validity_seconds,
  };
}

export function toAttendance(row: AttendanceRow, memberName: string): AttendanceEvent {
  return {
    id: row.id,
    memberId: row.member_id,
    memberName,
    memberIdDisplay: memberDisplayId(row.member_id),
    checkedInAt: row.checked_in_at,
    door: row.door,
    status: row.status,
  };
}

export function toPlan(row: PlanRow): MembershipPlan {
  const duration = row.duration as MembershipPlan['duration'];
  return {
    id: row.id,
    name: row.name,
    duration,
    price: row.price,
    currency: row.currency,
    isActive: row.is_active,
  };
}

/**
 * Applied membership term. `planName` comes from the current plan row when it
 * still exists; an archived/unresolvable plan keeps an honest empty label.
 */
export function toMembershipPeriod(row: MembershipPeriodRow, planName: string): MembershipPeriodRecord {
  return {
    id: row.id,
    planId: row.plan_id,
    planName: planName || 'Plan not on record',
    startDate: row.start_date.slice(0, 10),
    endDate: row.end_date.slice(0, 10),
    priceApplied: row.price_applied,
    createdAt: row.created_at,
  };
}

/**
 * Join application exactly as stored. Verification flags are the staff's
 * manual checks — the client never claims a phone/email was verified.
 */
export function toJoinApplication(row: JoinApplicationRow): JoinApplication {
  return {
    id: row.id,
    fullName: row.full_name,
    phone: row.phone,
    email: row.email ?? '',
    planId: row.plan_id ?? '',
    state: row.state as JoinApplication['state'],
    phoneVerified: row.phone_verified,
    emailVerified: row.email_verified,
    createdAt: row.created_at,
  };
}

/** Append-only audit row; raw JSON is preserved, never reinterpreted. */
export function toAuditEntry(row: AuditLogRow): AuditLogEntry {
  return {
    id: row.id,
    actorId: row.actor,
    actorRole: row.actor_role,
    action: row.action,
    tableName: row.table_name,
    rowId: row.row_id,
    oldValues: row.old_values ?? null,
    newValues: row.new_values ?? null,
    at: row.at,
  };
}

/**
 * Staff directory row. The role is narrowed by the database function; the
 * mapper keeps the value as returned and never invents a third staff role.
 */
export function toStaffAccount(row: StaffDirectoryRow): StaffAccount {
  return {
    userId: row.user_id,
    displayName: row.display_name,
    role: row.role === 'owner' ? 'owner' : 'receptionist',
    email: row.email,
    phone: row.phone,
    isActive: row.is_active,
    createdAt: row.created_at,
    lastSignInAt: row.last_sign_in_at,
  };
}
