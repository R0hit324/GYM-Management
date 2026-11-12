/**
 * Pure formatting and small date helpers. No business decisions are made
 * here; rules that matter later (membership windows, inactivity windows)
 * will be enforced server-side in later parts. These exist only so the demo
 * UI renders consistently.
 */

export function formatCurrency(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  let h = d.getHours();
  const suffix = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m} ${suffix}`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')} ${d.toLocaleString('en-IN', { month: 'short' })} ${d.getFullYear()}`;
}

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

export function isPhone(value: string, locale = 'IN'): boolean {
  const digits = value.replace(/\D/g, '');
  if (locale === 'IN') {
    return /^[6-9]\d{9}$/.test(digits.slice(-10)) && digits.length >= 10;
  }
  return digits.length >= 7 && digits.length <= 15;
}

export function passwordIssues(value: string): string[] {
  const issues: string[] = [];
  if (value.length < 8) issues.push('at least 8 characters');
  if (!/[a-z]/.test(value)) issues.push('a lowercase letter');
  if (!/[A-Z0-9]/.test(value)) issues.push('an uppercase letter or a number');
  return issues;
}

export function daysBetween(iso: string, now = new Date()): number {
  const d = new Date(iso);
  return Math.round((d.getTime() - now.getTime()) / 86400000);
}

/** Rendering intent only: the real "expired" rule is membershipEnd < today
 * as judged by the server. Kept in sync with BUSINESS_RULES.md. */
export function membershipEndsIn(days: number | null): 'active' | 'soon' | 'expired' | 'none' {
  if (days === null) return 'none';
  if (days < 0) return 'expired';
  if (days <= 7) return 'soon';
  return 'active';
}

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

export function pluralise(n: number, one: string, many: string): string {
  return n === 1 ? `${n} ${one}` : `${n} ${many}`;
}
