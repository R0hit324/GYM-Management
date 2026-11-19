// Pure month-totals tests for the Transaction History register (Stage 5):
// verified-only revenue, the UPI/cash split, pending never counted as
// revenue, month scoping across months/years, and all-zero empty months.
import { monthPaymentTotals } from '@/utils/payment';
import type { PaymentRecord } from '@/types/domain';

/** Builds a payment record at a local date/time, serialised the same way
 * the demo data does (ISO string), so tests cover the app's parse path. */
function payment(overrides: Partial<PaymentRecord> & { date: Date }): PaymentRecord {
  const { date, ...rest } = overrides;
  return {
    id: 'pay-test',
    memberId: 'm-test',
    memberName: 'Test Member',
    planId: 'plan-monthly',
    originalPrice: 1000,
    discountPct: 0,
    payable: 1000,
    method: 'upi',
    state: 'verified',
    receiptIssued: false,
    createdAt: date.toISOString(),
    ...rest,
  };
}

describe('monthPaymentTotals', () => {
  const nov2026 = { year: 2026, month: 10 };

  it('counts only verified entries as collected revenue', () => {
    const totals = monthPaymentTotals(
      [
        payment({ date: new Date(2026, 10, 2, 9, 0), payable: 3000, state: 'verified' }),
        payment({ date: new Date(2026, 10, 3, 9, 0), payable: 1200, state: 'awaitingVerification' }),
      ],
      nov2026.year,
      nov2026.month,
    );
    expect(totals.totalVerified).toBe(3000); // pending ₹1,200 is never revenue
    expect(totals.pendingAmount).toBe(1200);
    expect(totals.pendingCount).toBe(1);
    expect(totals.totalCount).toBe(2);
  });

  it('splits verified revenue by method', () => {
    const totals = monthPaymentTotals(
      [
        payment({ date: new Date(2026, 10, 2), payable: 3000, method: 'upi', state: 'verified' }),
        payment({ date: new Date(2026, 10, 4), payable: 2500, method: 'cash', state: 'verified' }),
        payment({ date: new Date(2026, 10, 5), payable: 1000, method: 'cash', state: 'verified' }),
      ],
      nov2026.year,
      nov2026.month,
    );
    expect(totals.verifiedUpi).toBe(3000);
    expect(totals.verifiedCash).toBe(3500);
    expect(totals.totalVerified).toBe(6500); // one sum, no double-counting
  });

  it('never treats a UTR as verification — state decides', () => {
    const totals = monthPaymentTotals(
      [payment({ date: new Date(2026, 10, 6), payable: 1200, utr: 'UTR 12345678', state: 'awaitingVerification' })],
      nov2026.year,
      nov2026.month,
    );
    expect(totals.totalVerified).toBe(0);
    expect(totals.pendingAmount).toBe(1200);
  });

  it('scopes strictly to the selected month, across year boundaries', () => {
    const totals = monthPaymentTotals(
      [
        payment({ date: new Date(2026, 10, 30, 23, 59), payable: 1000 }), // Nov 2026
        payment({ date: new Date(2026, 11, 1, 0, 1), payable: 2000 }), // Dec 2026
        payment({ date: new Date(2025, 10, 15), payable: 4000 }), // Nov 2025
      ],
      nov2026.year,
      nov2026.month,
    );
    expect(totals.totalVerified).toBe(1000);
    expect(totals.totalCount).toBe(1);
  });

  it('returns all zeros for a month without records — nothing fabricated', () => {
    const totals = monthPaymentTotals(
      [payment({ date: new Date(2026, 10, 2), payable: 3000 })],
      2026,
      5,
    );
    expect(totals).toEqual({
      verifiedUpi: 0,
      verifiedCash: 0,
      totalVerified: 0,
      reversalAmount: 0,
      reversalCount: 0,
      pendingAmount: 0,
      pendingCount: 0,
      totalCount: 0,
    });
  });

  it('counts rejected entries in totalCount only — never revenue, never pending', () => {
    const totals = monthPaymentTotals(
      [payment({ date: new Date(2026, 10, 7), payable: 900, state: 'rejected' })],
      nov2026.year,
      nov2026.month,
    );
    expect(totals.totalCount).toBe(1);
    expect(totals.totalVerified).toBe(0);
    expect(totals.pendingCount).toBe(0);
  });

  it('treats a verified reversal as a deduction in its own month, never revenue', () => {
    const totals = monthPaymentTotals(
      [
        payment({ date: new Date(2026, 10, 2), payable: 3000, method: 'upi' }),
        payment({ date: new Date(2026, 10, 10), payable: 1000, method: 'cash' }),
        payment({
          date: new Date(2026, 10, 12),
          payable: 500,
          method: 'upi',
          entryType: 'reversal',
          reversalOf: 'pay-original',
        }),
      ],
      nov2026.year,
      nov2026.month,
    );
    expect(totals.verifiedUpi).toBe(2500); // 3000 − 500 reversal
    expect(totals.verifiedCash).toBe(1000);
    expect(totals.totalVerified).toBe(3500);
    expect(totals.reversalAmount).toBe(500);
    expect(totals.reversalCount).toBe(1);
    expect(totals.totalCount).toBe(3);
    expect(totals.pendingAmount).toBe(0);
  });

  it('does not count an awaiting reversal as a deduction until it is verified', () => {
    const totals = monthPaymentTotals(
      [
        payment({
          date: new Date(2026, 10, 12),
          payable: 500,
          entryType: 'reversal',
          state: 'awaitingVerification',
        }),
      ],
      nov2026.year,
      nov2026.month,
    );
    expect(totals.totalVerified).toBe(0);
    expect(totals.reversalAmount).toBe(0);
    expect(totals.pendingAmount).toBe(500);
  });
});
