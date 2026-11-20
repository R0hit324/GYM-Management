/**
 * Receipt view model + eligibility rules (Production Readiness Stage 2B, WS-4).
 *
 * A receipt is presentation over a SERVER-VERIFIED payment record. This
 * module never decides whether money is valid — it only refuses to present
 * a receipt for anything the server has not already verified, for reversal
 * entries, or for fully reversed payments. Membership/payment arithmetic is
 * never recomputed here; amounts come from the stored rows.
 */
import type { Member, MembershipPlan, PaymentRecord } from '@/types/domain';
import { memberDisplayId } from '@/utils/format';

export const RECEIPT_GYM = {
  name: 'Pulse Gym',
  tagline: 'Membership and daily operations',
} as const;

export type ReceiptStatus = 'verified' | 'partially_reversed';

export interface ReceiptViewModel {
  receiptNumber: string;
  issuedAt: string;
  status: ReceiptStatus;
  statusLabel: string;
  gym: { name: string; tagline: string };
  member: { name: string; memberId: string };
  plan: { name: string; validity: string };
  payment: {
    method: string;
    verifiedOn: string;
    reference: string;
    originalAmount: string;
    discount: string;
    amountPaid: string;
    reversedAmount: string | null;
    netAmount: string;
  };
}

export type ReceiptEligibilityFailure =
  | 'not_verified'
  | 'reversal_entry'
  | 'fully_reversed';

export type ReceiptBuildResult =
  | { ok: true; view: ReceiptViewModel }
  | { ok: false; code: ReceiptEligibilityFailure; error: string };

export interface ReceiptSource {
  payment: PaymentRecord;
  member: Member;
  plan: MembershipPlan | null;
  /** Sum of verified reversals against this payment (0 when none). */
  reversedAmount?: number;
  /** When the PDF is produced; defaults to now. */
  issuedAt?: string;
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/** Deterministic receipt number: RCPT-<verified yyyymmdd>-<payment prefix>. */
export function receiptNumberFor(payment: PaymentRecord): string {
  const stamp = isoDateStamp(payment.verifiedAt ?? payment.createdAt);
  return `RCPT-${stamp}-${payment.id.slice(0, 8).toUpperCase()}`;
}

function isoDateStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '00000000';
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(
    d.getUTCDate(),
  ).padStart(2, '0')}`;
}

/** DD MMM YYYY in UTC (server dates are stored as ISO timestamps). */
export function formatReceiptDate(iso: string | null | undefined): string {
  if (!iso) return 'Not recorded';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/**
 * INR formatting with en-IN grouping, no locale dependency in tests.
 * The rupee glyph is safe here because receipts are rendered as HTML by
 * expo-print; every produced PDF is therefore Unicode-capable.
 */
export function formatReceiptMoney(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const negative = safe < 0;
  const fixed = Math.abs(safe).toFixed(2);
  const [whole, fraction] = fixed.split('.');
  const lastThree = whole.slice(-3);
  const rest = whole.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${lastThree}` : lastThree;
  return `${negative ? '-' : ''}\u20B9${grouped}.${fraction}`;
}

/**
 * The single eligibility gate shared by PDF generation and storage
 * orchestration. It intentionally inspects only server-authored fields.
 */
export function receiptEligibility(
  payment: PaymentRecord,
  reversedAmount = 0,
): { ok: true; reversedAmount: number } | { ok: false; code: ReceiptEligibilityFailure; error: string } {
  if (payment.entryType === 'reversal') {
    return {
      ok: false,
      code: 'reversal_entry',
      error: 'A reversal entry is a correction record, not a payment receipt.',
    };
  }
  if (payment.state !== 'verified') {
    return {
      ok: false,
      code: 'not_verified',
      error: 'Only server-verified payments can produce a receipt.',
    };
  }
  const reversed = Number.isFinite(reversedAmount) && reversedAmount > 0 ? reversedAmount : 0;
  if (payment.payable > 0 && reversed >= payment.payable) {
    return {
      ok: false,
      code: 'fully_reversed',
      error: 'A fully reversed payment can never be presented as paid.',
    };
  }
  return { ok: true, reversedAmount: reversed };
}

/** Build the printable view model, or explain why no receipt may exist. */
export function buildReceiptView(source: ReceiptSource): ReceiptBuildResult {
  const eligibility = receiptEligibility(source.payment, source.reversedAmount ?? 0);
  if (!eligibility.ok) return eligibility;

  const { payment, member, plan } = source;
  const reversed = eligibility.reversedAmount;
  const net = payment.payable - reversed;
  const discountParts: string[] = [];
  if (payment.discountPct > 0) discountParts.push(`${payment.discountPct}%`);
  if (payment.originalPrice !== payment.payable) {
    discountParts.push(formatReceiptMoney(payment.originalPrice - payment.payable));
  }

  return {
    ok: true,
    view: {
      receiptNumber: receiptNumberFor(payment),
      issuedAt: formatReceiptDate(source.issuedAt ?? new Date().toISOString()),
      status: reversed > 0 ? 'partially_reversed' : 'verified',
      statusLabel: reversed > 0 ? 'VERIFIED · PARTIALLY REVERSED' : 'VERIFIED PAYMENT',
      gym: { name: RECEIPT_GYM.name, tagline: RECEIPT_GYM.tagline },
      member: {
        name: member.name,
        memberId: memberDisplayId(member.id),
      },
      plan: {
        name: plan?.name ?? 'Plan not on record',
        validity: member.membershipEnd
          ? `Valid until ${formatReceiptDate(member.membershipEnd)}`
          : 'Validity pending verification',
      },
      payment: {
        method: payment.method === 'upi' ? 'UPI' : 'Cash',
        verifiedOn: formatReceiptDate(payment.verifiedAt),
        reference: payment.utr?.trim() ? payment.utr : 'No reference on record',
        originalAmount: formatReceiptMoney(payment.originalPrice),
        discount: discountParts.length > 0 ? discountParts.join(' · ') : 'None',
        amountPaid: formatReceiptMoney(payment.payable),
        reversedAmount: reversed > 0 ? formatReceiptMoney(reversed) : null,
        netAmount: formatReceiptMoney(net),
      },
    },
  };
}
