/**
 * Row shapes for the read-only Supabase layer (Phase 4, Stage 2).
 *
 * These mirror the verified views and SELECT-able tables exactly as
 * PostgREST returns them. They are deliberately separate from the UI
 * domain types: the mappers in `mappers.ts` are the only place a database
 * row becomes a screen value, so a missing column can never be silently
 * invented by a screen.
 *
 * No write shape, RPC argument or service-role field lives here.
 */

export type ViewMembershipStatus = 'active' | 'expiring' | 'expired' | 'frozen';

export interface MemberStatusRow {
  member_id: string;
  full_name: string;
  phone: string;
  email: string | null;
  plan_id: string | null;
  plan_name: string | null;
  plan_duration: string | null;
  price_locked: number | null;
  discount_pct: number | null;
  stored_membership_end: string | null;
  joined_on: string;
  auth_user_id: string | null;
  status: ViewMembershipStatus;
  effective_expiry: string | null;
  days_remaining: number | null;
  is_frozen: boolean;
  active_freeze_count: number;
  gym_date: string;
}

export interface InactiveMemberRow {
  member_id: string;
  full_name: string;
  phone: string;
  email: string | null;
  plan_id: string | null;
  plan_name: string | null;
  membership_end: string | null;
  joined_on: string;
  last_successful_attendance_date: string | null;
  raw_days_since_last: number | null;
  frozen_days_between: number | null;
  inactive_days: number | null;
  is_inactive: boolean;
  gym_date: string;
}

export interface DailyReportRow {
  report_date: string;
  today: string;
  gross: number;
  reversals: number;
  net: number;
  attendance: number;
  unique_visitors: number;
  new_members: number;
  renewals: number;
  discounts: number;
  refunds: number;
}

export interface MonthRevenueRow {
  report_month: string;
  today: string;
  gross: number;
  reversals: number;
  net: number;
  attendance: number;
  unique_visitors: number;
  new_members: number;
  renewals: number;
  discounts: number;
  refunds: number;
}

export type PaymentEntryType = 'payment' | 'reversal';
export type PaymentState = 'awaitingVerification' | 'verified' | 'rejected';

export interface PaymentRow {
  id: string;
  member_id: string;
  plan_id: string;
  entry_type: PaymentEntryType;
  original_price: number;
  discount_pct: number;
  discount_amount: number;
  payable: number;
  method: 'upi' | 'cash';
  utr: string | null;
  state: PaymentState;
  receipt_issued: boolean;
  recorded_by: string;
  verified_by: string | null;
  recorded_at: string;
  verified_at: string | null;
  reversal_of: string | null;
  note: string | null;
}

export interface AttendanceRow {
  id: string;
  member_id: string;
  door: string;
  status: 'verified';
  checked_in_at: string;
}

export interface PlanRow {
  id: string;
  name: string;
  duration: string;
  price: number;
  currency: string;
  is_active: boolean;
}

export type FollowUpChannel = 'called' | 'messaged' | 'visited';
export type FollowUpOutcome = 'won' | 'lost' | 'open';

export interface FollowUpRow {
  id: string;
  member_id: string;
  channel: FollowUpChannel;
  outcome: FollowUpOutcome;
  note: string | null;
  created_at: string;
}

export interface JoinApplicationRow {
  id: string;
  state: string;
}

export type FreezeState = 'pending' | 'approved' | 'rejected' | 'ended';
export type FreezeEndedVia = 'scan' | 'receptionist' | null;

/** Exact `membership_freezes` row shape (Stage 3 reads; writes use RPCs). */
export interface FreezeRow {
  id: string;
  member_id: string;
  start_date: string;
  end_date: string;
  reason: string;
  state: FreezeState;
  requested_by: string;
  requested_at: string;
  decided_by: string | null;
  decided_at: string | null;
  extension_days: number | null;
  ended_at: string | null;
  ended_via: FreezeEndedVia;
  ended_by: string | null;
}

/** Singleton `app_settings` row (no secrets are stored in this table). */
export interface GymSettingsRow {
  gym_timezone: string;
  upi_id: string | null;
  attendance_token_validity_seconds: number;
}

/** A month aggregate ready for the owner revenue card. */
export interface MonthRevenueSummary {
  month: string;
  today: string;
  gross: number;
  reversals: number;
  net: number;
  attendance: number;
  uniqueVisitors: number;
  newMembers: number;
  renewals: number;
  discounts: number;
  refunds: number;
}

export interface MonthlyRevenue {
  current: MonthRevenueSummary;
  previous: MonthRevenueSummary | null;
}
