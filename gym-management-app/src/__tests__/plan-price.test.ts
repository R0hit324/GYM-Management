// Pure plan-price validation tests for the Membership Plans price editor
// (Stage 7): strict format, positive values, at most two decimals, and
// no silent rounding or alteration of what was typed.
import { parsePlanPrice } from '@/utils/payment';

describe('parsePlanPrice', () => {
  it('accepts a plain positive integer exactly as typed', () => {
    expect(parsePlanPrice('1200')).toBe(1200);
    expect(parsePlanPrice(' 3000 ')).toBe(3000); // surrounding space is not an alteration
  });

  it('accepts at most two decimal places', () => {
    expect(parsePlanPrice('1200.5')).toBe(1200.5);
    expect(parsePlanPrice('1200.50')).toBe(1200.5); // same numeric value, not rounded
    expect(parsePlanPrice('0.99')).toBe(0.99);
  });

  it('rejects empty input', () => {
    expect(parsePlanPrice('')).toBeNull();
    expect(parsePlanPrice('   ')).toBeNull();
  });

  it('rejects zero and negative values', () => {
    expect(parsePlanPrice('0')).toBeNull();
    expect(parsePlanPrice('0.00')).toBeNull();
    expect(parsePlanPrice('-1200')).toBeNull();
    expect(parsePlanPrice('-0.01')).toBeNull();
  });

  it('rejects invalid characters and separators', () => {
    expect(parsePlanPrice('1,200')).toBeNull();
    expect(parsePlanPrice('₹1200')).toBeNull();
    expect(parsePlanPrice('12a')).toBeNull();
    expect(parsePlanPrice('12.')).toBeNull();
    expect(parsePlanPrice('.5')).toBeNull();
    expect(parsePlanPrice('1.2.3')).toBeNull();
    expect(parsePlanPrice('+1200')).toBeNull();
  });

  it('rejects more than two decimal places — nothing is silently rounded', () => {
    expect(parsePlanPrice('1200.123')).toBeNull();
    expect(parsePlanPrice('1200.999')).toBeNull();
  });
});
