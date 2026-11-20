/**
 * Shared domain types. These mirror the entities the Supabase backend will
 * expose in later parts; they are UI contracts only in Part 1 — no
 * permission or price decision may ever be made from client data.
 */

export type Role = 'owner' | 'receptionist' | 'member';

export type PlanDuration = 'monthly' | 'quarterly' | 'halfYearly' | 'yearly';

export interface MembershipPlan {
  id: string;
  name: string;
  duration: PlanDuration;
  price: number; // display-only in Part 1; prices are server-authoritative later
  currency: string;
  /** Live rows: false once the owner deactivates the plan. Demo rows omit it. */
  isActive?: boolean;
  /** Demo-labelled plan description lines (additive, Part 1 demo content). */
  highlights?: string[];
}

export type MembershipStatus = 'active' | 'expiring' | 'expired' | 'frozen' | 'pendingPayment';

export interface Member {
  id: string;
  name: string;
  phone: string;
  email: string;
  planId: string;
  status: MembershipStatus;
  /** ISO date string of membership end. Null while pendingPayment. */
  membershipEnd: string | null;
  priceLocked: number; // subscribed price retained even if plan price changes
  discountPct: number;
  lastAttendance: string | null;
  joinedOn: string;
  /**
   * Demo only: staff follow-up state for lost-member tracking. In production
   * this is written by receptionists/owner through audited server actions.
   */
  followUp: {
    status: 'none' | 'called' | 'messaged' | 'visited' | 'won' | 'lost';
    note?: string;
    updatedAt?: string;
  };
}

export interface AttendanceEvent {
  id: string;
  memberId: string;
  memberName: string;
  memberIdDisplay: string;
  checkedInAt: string; // ISO
  door: string;
  status: 'verified' | 'failed' | 'frozen';
}

export type PaymentMethod = 'upi' | 'cash';
export type PaymentState = 'awaitingVerification' | 'verified' | 'rejected';

export interface PaymentRecord {
  id: string;
  memberId: string;
  memberName: string;
  planId: string;
  originalPrice: number;
  discountPct: number;
  payable: number; // full payment only — partials are never representable
  method: PaymentMethod;
  utr?: string;
  state: PaymentState;
  receiptIssued: boolean;
  /** Private Storage object path once a PDF receipt has been stored. */
  receiptPath?: string;
  createdAt: string;
  verifiedBy?: string;
  note?: string;
  /** Present on live rows: a reversal is a separate, never-edited record. */
  entryType?: 'payment' | 'reversal';
  /** Live reversal rows point at the payment they refund. */
  reversalOf?: string;
  /** Live rows: who recorded / verified, used only for segregation-of-duties UI. */
  recordedBy?: string;
  verifiedById?: string;
  verifiedAt?: string;
}

/** One in-app notification derived from rows the session may already read. */
export interface InAppNotification {
  id: string;
  title: string;
  detail: string;
  href: string;
  tone: 'warning' | 'info' | 'danger' | 'success';
  count: number;
}

export type FreezeState = 'pending' | 'approved' | 'rejected' | 'ended';

/**
 * A membership freeze as read from `membership_freezes`. Validity is derived
 * by the server views from approved/ended windows; this record never carries
 * an edited membership expiry.
 */
export interface FreezeRecord {
  id: string;
  memberId: string;
  memberName: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  reason: string;
  state: FreezeState;
  requestedAt: string;
  decidedAt?: string;
  extensionDays: number | null;
  endedAt?: string;
  endedVia?: 'scan' | 'receptionist';
}

/** Server-owned gym settings the client may read (never secrets). */
export interface GymSettings {
  gymTimezone: string;
  upiId: string | null;
  attendanceTokenValiditySeconds: number;
}

export type ApplicationState = 'draft' | 'pendingVerification' | 'submitted' | 'approved' | 'rejected';

/** One applied membership term, read from `membership_periods` (never edited). */
export interface MembershipPeriodRecord {
  id: string;
  planId: string;
  planName: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  priceApplied: number;
  createdAt: string;
}

/**
 * One append-only audit row. `oldValues`/`newValues` are the raw JSON the
 * server recorded; screens show a short summary and never invent a value.
 */
export interface AuditLogEntry {
  id: string;
  actorId: string | null;
  actorRole: string | null;
  action: string;
  tableName: string;
  rowId: string | null;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  at: string;
}

export interface JoinApplication {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  planId: string;
  state: ApplicationState;
  phoneVerified: boolean;
  emailVerified: boolean;
  createdAt: string;
}

/**
 * A staff account as returned by the owner-only `admin_staff_directory()`
 * function. Roles are limited to the two staff roles; an inactive account
 * is denied by the database on its next request.
 */
export interface StaffAccount {
  userId: string;
  displayName: string;
  role: 'owner' | 'receptionist';
  email: string;
  phone: string | null;
  isActive: boolean;
  createdAt: string;
  lastSignInAt: string | null;
}

export interface DailyReportNumbers {
  date: string;
  attendance: number;
  uniqueVisitors: number;
  checkInEvents: number;
  newMembers: number;
  renewals: number;
  verifiedCollections: number;
  upi: number;
  cash: number;
  pendingApplications: number;
  discounts: number;
  refunds: number;
}

/** A trend point for charts; series never rely on hue alone (labels shown). */
export interface TrendPoint {
  label: string;
  fullLabel: string;
  value: number;
}

export type ScreenState = 'loading' | 'empty' | 'error' | 'full';
