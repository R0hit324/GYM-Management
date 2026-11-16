/**
 * Shared payment presentation helpers — the single source for the payable
 * calculation and payment-status wording used by every payment surface
 * (audit F-09/F-15 consolidation).
 *
 * Pending is never presented as verified, no screen keeps its own copy of
 * the money math, and no defaults are invented here.
 */
import type { PaymentRecord } from '@/types/domain';

/**
 * Payable for a locked subscription price and a discount percentage.
 * Pure math, no clamping: callers validate their own input first (the desk
 * discount input in Fees is clamped to 0-50 before calling; a member's
 * recorded discount flows through as-is, as before).
 */
export function computePayable(priceLocked: number, discountPct: number): number {
  return Math.round(priceLocked * (1 - discountPct / 100));
}

/**
 * Validates and parses a typed plan price (Stage 7). Format-strict so
 * accidental formatting errors are caught: digits with an optional single
 * decimal point and at most two decimals — no separators, signs or other
 * characters. Empty, zero, negative and malformed input return null; a
 * valid value is returned exactly as typed, never rounded or altered.
 */
export function parsePlanPrice(value: string): number | null {
  const v = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/**
 * One status wording and tone for every payment row. An awaiting entry is
 * never labelled verified and never coloured as success.
 */
export function paymentStatusInfo(
  state: PaymentRecord['state'],
): { label: string; tone: 'up' | 'warning' | 'down' } {
  if (state === 'verified') return { label: 'Verified', tone: 'up' };
  if (state === 'awaitingVerification') return { label: 'Awaiting check', tone: 'warning' };
  return { label: 'Rejected', tone: 'down' };
}

/**
 * Month-level financial totals from actual records (Stage 5). Pure and
 * double-count-safe: each record contributes to exactly one bucket, judged
 * in LOCAL time (never toISOString, which shifts dates across offsets).
 *
 * Only `verified` entries count as collected revenue, split by method;
 * `awaitingVerification` is reported separately and is never revenue; a
 * recorded UTR changes nothing here — verification status decides.
 * `rejected` entries count only in `totalCount`. Months without records
 * return all zeros — nothing is fabricated.
 */
export interface MonthPaymentTotals {
  /** Verified UPI collections for the month. */
  verifiedUpi: number;
  /** Verified cash collections for the month. */
  verifiedCash: number;
  /** Verified UPI + verified cash — the month's collected revenue. */
  totalVerified: number;
  /** Sum of pending (awaiting verification) amounts — never revenue. */
  pendingAmount: number;
  /** Number of pending entries. */
  pendingCount: number;
  /** Every record in the month, any state. */
  totalCount: number;
}

export function monthPaymentTotals(
  records: PaymentRecord[],
  year: number,
  /** 0-based month. */
  month: number,
): MonthPaymentTotals {
  const totals: MonthPaymentTotals = {
    verifiedUpi: 0,
    verifiedCash: 0,
    totalVerified: 0,
    pendingAmount: 0,
    pendingCount: 0,
    totalCount: 0,
  };
  for (const p of records) {
    const d = new Date(p.createdAt);
    if (d.getFullYear() !== year || d.getMonth() !== month) continue;
    totals.totalCount += 1;
    if (p.state === 'verified') {
      if (p.method === 'upi') totals.verifiedUpi += p.payable;
      else totals.verifiedCash += p.payable;
      totals.totalVerified += p.payable;
    } else if (p.state === 'awaitingVerification') {
      totals.pendingAmount += p.payable;
      totals.pendingCount += 1;
    }
  }
  return totals;
}
