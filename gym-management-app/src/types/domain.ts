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
  createdAt: string;
  verifiedBy?: string;
  note?: string;
}

export type ApplicationState = 'draft' | 'pendingVerification' | 'submitted' | 'approved' | 'rejected';

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
