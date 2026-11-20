/**
 * WS-4 — receipt PDF content and formatting tests.
 *
 * The PDF itself is rendered on device by expo-print; the HTML template is
 * the single source of its content. These tests pin every receipt field,
 * the verified-only rules, reversal presentation and escaping.
 */
import {
  buildReceiptView,
  formatReceiptDate,
  formatReceiptMoney,
  receiptEligibility,
  receiptNumberFor,
} from '@/services/receipts';
import {
  escapeHtml,
  renderReceiptHtml,
} from '@/services/receipts/render';
import type { Member, MembershipPlan, PaymentRecord } from '@/types/domain';

const PAYMENT_ID = '11111111-1111-4111-8111-111111111111';
const MEMBER_ID = '22222222-2222-4222-8222-222222222222';
const PLAN_ID = '33333333-3333-4333-8333-333333333333';

function makeMember(overrides: Partial<Member> = {}): Member {
  return {
    id: MEMBER_ID,
    name: 'Mira Kapoor',
    phone: '+919876543210',
    email: 'mira@example.com',
    planId: PLAN_ID,
    status: 'active',
    membershipEnd: '2027-12-31',
    priceLocked: 1500,
    discountPct: 0,
    lastAttendance: '2026-11-04T07:15:00.000Z',
    joinedOn: '2026-01-10',
    followUp: { status: 'none' },
    ...overrides,
  };
}

function makePlan(overrides: Partial<MembershipPlan> = {}): MembershipPlan {
  return {
    id: PLAN_ID,
    name: 'Monthly Strength',
    duration: 'monthly',
    price: 1500,
    currency: 'INR',
    isActive: true,
    ...overrides,
  };
}

function makePayment(overrides: Partial<PaymentRecord> = {}): PaymentRecord {
  return {
    id: PAYMENT_ID,
    memberId: MEMBER_ID,
    memberName: 'Mira Kapoor',
    planId: PLAN_ID,
    originalPrice: 1500,
    discountPct: 0,
    payable: 1500,
    method: 'upi',
    utr: 'UTR-2026-0001',
    state: 'verified',
    receiptIssued: false,
    createdAt: '2026-11-05T09:00:00.000Z',
    verifiedAt: '2026-11-05T09:30:00.000Z',
    entryType: 'payment',
    ...overrides,
  };
}

describe('receipt formatting', () => {
  it('formats INR with en-IN grouping deterministically', () => {
    expect(formatReceiptMoney(1500)).toBe('\u20B91,500.00');
    expect(formatReceiptMoney(1234567.5)).toBe('\u20B912,34,567.50');
    expect(formatReceiptMoney(0)).toBe('\u20B90.00');
    expect(formatReceiptMoney(Number.NaN)).toBe('\u20B90.00');
  });

  it('formats UTC dates as DD MMM YYYY', () => {
    expect(formatReceiptDate('2026-11-05T09:30:00.000Z')).toBe('05 Nov 2026');
    expect(formatReceiptDate(null)).toBe('Not recorded');
  });

  it('derives a deterministic receipt number from the payment', () => {
    expect(receiptNumberFor(makePayment())).toBe('RCPT-20261105-11111111');
  });
});

describe('receipt eligibility', () => {
  it('accepts a server-verified payment', () => {
    expect(receiptEligibility(makePayment())).toEqual({ ok: true, reversedAmount: 0 });
  });

  it.each(['awaitingVerification', 'rejected'] as const)(
    'refuses a %s payment',
    (state) => {
      const result = receiptEligibility(makePayment({ state }));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe('not_verified');
    },
  );

  it('refuses a reversal entry', () => {
    const result = receiptEligibility(makePayment({ entryType: 'reversal', reversalOf: PAYMENT_ID }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('reversal_entry');
  });

  it('refuses a fully reversed payment but allows a partial reversal', () => {
    const full = receiptEligibility(makePayment(), 1500);
    expect(full.ok).toBe(false);
    if (!full.ok) expect(full.code).toBe('fully_reversed');

    expect(receiptEligibility(makePayment(), 500)).toEqual({ ok: true, reversedAmount: 500 });
  });

  it('does not treat a zero-value verified payment as fully reversed', () => {
    expect(receiptEligibility(makePayment({ originalPrice: 0, payable: 0 }), 0)).toEqual({
      ok: true,
      reversedAmount: 0,
    });
  });
});

describe('receipt view model', () => {
  it('includes only the necessary member identity on the receipt', () => {
    const built = buildReceiptView({
      payment: makePayment(),
      member: makeMember(),
      plan: makePlan(),
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.view.member).toEqual({ name: 'Mira Kapoor', memberId: 'GB-22222222' });
    expect(built.view.plan.name).toBe('Monthly Strength');
    expect(built.view.plan.validity).toBe('Valid until 31 Dec 2027');
    expect(built.view.payment.amountPaid).toBe('\u20B91,500.00');
    expect(built.view.payment.method).toBe('UPI');
    expect(built.view.payment.reference).toBe('UTR-2026-0001');
    expect(built.view.payment.verifiedOn).toBe('05 Nov 2026');
    expect(built.view.status).toBe('verified');
  });

  it('shows discount components and the net amount after a partial reversal', () => {
    const built = buildReceiptView({
      payment: makePayment({ originalPrice: 2000, discountPct: 10, payable: 1800 }),
      member: makeMember(),
      plan: makePlan(),
      reversedAmount: 300,
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.view.payment.discount).toBe('10% · \u20B9200.00');
    expect(built.view.payment.amountPaid).toBe('\u20B91,800.00');
    expect(built.view.payment.reversedAmount).toBe('\u20B9300.00');
    expect(built.view.payment.netAmount).toBe('\u20B91,500.00');
    expect(built.view.status).toBe('partially_reversed');
    expect(built.view.statusLabel).toContain('PARTIALLY REVERSED');
  });

  it('never presents a pending, rejected, reversal or fully reversed row', () => {
    for (const source of [
      { payment: makePayment({ state: 'awaitingVerification' }), member: makeMember(), plan: makePlan() },
      { payment: makePayment({ state: 'rejected' }), member: makeMember(), plan: makePlan() },
      {
        payment: makePayment({ entryType: 'reversal', reversalOf: PAYMENT_ID }),
        member: makeMember(),
        plan: makePlan(),
      },
      { payment: makePayment(), member: makeMember(), plan: makePlan(), reversedAmount: 1500 },
    ]) {
      const built = buildReceiptView(source);
      expect(built.ok).toBe(false);
    }
  });
});

describe('receipt HTML rendering', () => {
  function html(): string {
    const built = buildReceiptView({
      payment: makePayment({ originalPrice: 2000, discountPct: 10, payable: 1800 }),
      member: makeMember(),
      plan: makePlan(),
      reversedAmount: 300,
    });
    if (!built.ok) throw new Error(built.error);
    return renderReceiptHtml(built.view);
  }

  it('contains every required receipt field', () => {
    const doc = html();
    expect(doc).toContain('Pulse <span>Gym</span>');
    expect(doc).toContain('RCPT-20261105-11111111');
    expect(doc).toContain('Mira Kapoor');
    expect(doc).toContain('GB-22222222');
    expect(doc).toContain('Monthly Strength');
    expect(doc).toContain('Valid until 31 Dec 2027');
    expect(doc).toContain('\u20B92,000.00'); // original
    expect(doc).toContain('10% · \u20B9200.00'); // discount
    expect(doc).toContain('\u20B91,800.00'); // amount paid
    expect(doc).toContain('\u20B9300.00'); // reversal
    expect(doc).toContain('\u20B91,500.00'); // net received
    expect(doc).toContain('UPI');
    expect(doc).toContain('UTR-2026-0001');
    expect(doc).toContain('05 Nov 2026');
    expect(doc).toContain('PARTIALLY REVERSED');
  });

  it('uses a clear verified-status badge and reversal note', () => {
    const doc = html();
    expect(doc).toContain('status-partial');
    expect(doc).toContain('A verified reversal was recorded');
    expect(doc).toContain('Verified payment only');
  });

  it('escapes member-supplied text and never leaks extra personal data', () => {
    const built = buildReceiptView({
      payment: makePayment(),
      member: makeMember({ name: 'Mira & <Co> "Lift"' }),
      plan: makePlan(),
    });
    if (!built.ok) throw new Error(built.error);
    const doc = renderReceiptHtml(built.view);
    expect(doc).toContain('Mira &amp; &lt;Co&gt; &quot;Lift&quot;');
    expect(doc).not.toContain('<Co>');
    expect(doc).not.toContain('+919876543210');
    expect(doc).not.toContain('mira@example.com');
  });

  it('contains no credentials or secret-shaped values', () => {
    const doc = html();
    expect(doc).not.toMatch(/service[_ -]?role/i);
    expect(doc).not.toMatch(/SUPABASE_(SECRET|SERVICE)/i);
    expect(doc).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
  });

  it('escapeHtml handles all HTML metacharacters', () => {
    expect(escapeHtml(`<&>"'`)).toBe('&lt;&amp;&gt;&quot;&#39;');
  });
});
