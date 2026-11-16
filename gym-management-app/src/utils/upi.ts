/**
 * One shared builder for the gym's UPI payment deep link (audit F-06).
 *
 * `amount` is included ONLY when it is a real, validated figure — finite and
 * greater than zero. A missing amount yields the gym's plain UPI code (the
 * member keys the payable into their UPI app); an invalid amount or a missing
 * UPI ID yields null, so callers can show an honest state instead of a code
 * that implies a wrong member balance. No defaults are ever substituted.
 *
 * Display-only in Part 1: the UPI ID comes from demo configuration and no
 * payment, verification or secret handling happens here.
 */

/** Standard UPI virtual-payment-address shape: local part (letters, digits,
 * dot, hyphen, underscore) @ provider handle (letters/digits). This checks
 * FORMAT only — it never verifies that the account exists or belongs to the
 * gym; account verification happens with the payment provider at go-live. */
export function isValidUpiId(upiId: string): boolean {
  return /^[\w.\-]{2,}@[a-zA-Z][a-zA-Z0-9.\-]*$/.test(upiId.trim());
}

export function buildUpiPayload(upiId: string, amount?: number): string | null {
  if (!upiId.trim()) return null;
  if (amount !== undefined && (!Number.isFinite(amount) || amount <= 0)) return null;
  const params = [`pa=${upiId.trim()}`, 'cu=INR'];
  if (amount !== undefined) params.push(`am=${String(Math.round(amount * 100) / 100)}`);
  return `upi://pay?${params.join('&')}`;
}
