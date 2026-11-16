/**
 * Central membership date rules.
 *
 * The "expiring soon" rule lives here and only here: a membership is
 * expiring when its end date falls within the next 7 calendar days
 * (inclusive of today). It is judged on local calendar DATES, not raw
 * 24-hour blocks, so a 23:59 end and a 00:01 end on the same date behave
 * identically and stay correct across timezone offsets and DST boundaries.
 *
 * In Part 1 the demo server does not exist yet; every screen derives its
 * buckets and labels from this one rule instead of a stored status flag.
 */
import type { Member, MembershipStatus } from '@/types/domain';

export const EXPIRING_SOON_DAYS = 7;

/** Local calendar-day (midnight) timestamp for a date. */
function dayStart(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Whole calendar days from today (local) to the end date: <0 past, 0 today, >0 future. */
export function daysUntil(endIso: string, now = new Date()): number {
  return Math.round((dayStart(new Date(endIso)) - dayStart(now)) / 86400000);
}

/** The date rule for one membership end: none / expired / expiring / active. */
export function membershipDayState(
  endIso: string | null,
  now = new Date(),
): 'none' | 'expired' | 'expiring' | 'active' {
  if (!endIso) return 'none';
  const d = daysUntil(endIso, now);
  if (d < 0) return 'expired';
  if (d <= EXPIRING_SOON_DAYS) return 'expiring';
  return 'active';
}

/**
 * A membership's display status: frozen and payment-pending are record
 * states that the date rule cannot express; every other membership follows
 * the centralized 7-day date rule rather than a stored status flag.
 */
export function displayMembershipStatus(member: Member, now = new Date()): MembershipStatus {
  if (member.status === 'frozen') return 'frozen';
  if (member.status === 'pendingPayment') return 'pendingPayment';
  const state = membershipDayState(member.membershipEnd, now);
  // No end date and not frozen/pending = no live validity on record, which
  // displays as expired (the demo set always carries an end date).
  return state === 'none' ? 'expired' : state;
}
