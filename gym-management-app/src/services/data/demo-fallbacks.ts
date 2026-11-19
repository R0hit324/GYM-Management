/**
 * Demo fallbacks for the read-only data hooks.
 *
 * These are derived from the existing demo sources — never new sample data —
 * so demo mode keeps its approved figures while live mode shows real rows.
 * They are module constants so the hooks can depend on stable references.
 */
import {
  demoAttendance,
  demoCollectionsTrend,
  demoMemberHistory,
  demoMembers,
  demoOwnershipReport,
  demoPayments,
  demoPlans,
  demoAttendanceTrend,
} from '@/data/demo';
import type { Member } from '@/types/domain';
import { daysBetween } from '@/utils/format';

import type { MonthlyRevenue } from './rows';

const ATTENDANCE_TOTAL = demoAttendanceTrend.reduce((sum, point) => sum + point.value, 0);

/** The demo member whose own workspace is shown. */
export const demoMyMember: Member | null =
  demoMembers.find((member) => member.id === 'm-1042') ?? null;

/** The same history the member attendance screen already rendered. */
export const demoMyAttendance = [
  ...demoMemberHistory,
  ...demoAttendance.filter((event) => event.memberId === 'm-1042'),
];

/**
 * Demo rows for the owner lost-member screen: inactive for 30+ days, or
 * expired without a return, excluding members already closed as won/lost.
 * The screen keeps its own bucket filters on top of this list.
 */
export const demoInactiveMembers: Member[] = demoMembers.filter((member) => {
  const end = member.membershipEnd ? daysBetween(member.membershipEnd) : null;
  const last = member.lastAttendance ? daysBetween(member.lastAttendance) : null;
  const inactive = last === null || last >= 30;
  const expired = end !== null && end < 0;
  return (
    (inactive || expired) &&
    member.followUp.status !== 'won' &&
    member.followUp.status !== 'lost'
  );
});

const now = new Date();
const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
const today = `${currentMonth}-${String(now.getDate()).padStart(2, '0')}`;
const monthNet = demoCollectionsTrend.reduce((sum, point) => sum + point.value, 0);
const previousNet = monthNet - (demoCollectionsTrend[demoCollectionsTrend.length - 1]?.value ?? 0);

export const demoMonthlyRevenue: MonthlyRevenue = {
  current: {
    month: currentMonth,
    today,
    gross: monthNet,
    reversals: 0,
    net: monthNet,
    attendance: ATTENDANCE_TOTAL,
    uniqueVisitors: demoOwnershipReport.uniqueVisitors,
    newMembers: demoOwnershipReport.newMembers,
    renewals: demoOwnershipReport.renewals,
    discounts: demoOwnershipReport.discounts,
    refunds: demoOwnershipReport.refunds,
  },
  previous: {
    month: 'previous',
    today,
    gross: previousNet,
    reversals: 0,
    net: previousNet,
    attendance: 0,
    uniqueVisitors: 0,
    newMembers: 0,
    renewals: 0,
    discounts: 0,
    refunds: 0,
  },
};

export const demoPendingApplications = demoOwnershipReport.pendingApplications;

/** Stable demo arrays for hooks (module references, not per-render copies). */
export const demoPaymentsList = demoPayments;
export const demoMembersList = demoMembers;
export const demoAttendanceList = demoAttendance;
export const demoPlansList = demoPlans;
