// Phase 5, Stage 3 — data-layer mappers. The mappers are the only place a
// database row becomes a screen value, so these tests pin the honest
// conversions: no invented plan name, no trusted client verification claim,
// no dropped audit JSON.
import {
  toAuditEntry,
  toJoinApplication,
  toMembershipPeriod,
} from '@/services/data/mappers';
import type { AuditLogRow, JoinApplicationRow, MembershipPeriodRow } from '@/services/data/rows';

function periodRow(overrides: Partial<MembershipPeriodRow> = {}): MembershipPeriodRow {
  return {
    id: 'period-1',
    member_id: 'member-1',
    plan_id: 'plan-1',
    start_date: '2026-01-01',
    end_date: '2026-01-31',
    price_applied: 1500,
    created_by_payment: 'payment-1',
    created_at: '2026-01-01T04:00:00.000Z',
    ...overrides,
  };
}

function applicationRow(overrides: Partial<JoinApplicationRow> = {}): JoinApplicationRow {
  return {
    id: 'app-1',
    auth_user_id: 'user-1',
    full_name: 'Applicant One',
    phone: '+919800000001',
    email: 'applicant@example.com',
    plan_id: 'plan-1',
    state: 'submitted',
    phone_verified: false,
    email_verified: false,
    created_at: '2026-02-01T04:00:00.000Z',
    decided_by: null,
    decided_at: null,
    ...overrides,
  };
}

function auditRow(overrides: Partial<AuditLogRow> = {}): AuditLogRow {
  return {
    id: 'audit-1',
    actor: 'user-2',
    actor_role: 'receptionist',
    action: 'receipt.issued',
    table_name: 'payments',
    row_id: 'payment-1',
    old_values: { receipt_issued: false },
    new_values: { receipt_issued: true },
    at: '2026-03-01T04:00:00.000Z',
    ...overrides,
  };
}

describe('toMembershipPeriod', () => {
  it('maps the applied term exactly and trims the timestamps to dates', () => {
    expect(toMembershipPeriod(periodRow(), 'Monthly')).toEqual({
      id: 'period-1',
      planId: 'plan-1',
      planName: 'Monthly',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      priceApplied: 1500,
      createdAt: '2026-01-01T04:00:00.000Z',
    });
  });

  it('never invents a plan name when the plan cannot be resolved', () => {
    expect(toMembershipPeriod(periodRow(), '').planName).toBe('Plan not on record');
  });
});

describe('toJoinApplication', () => {
  it('keeps the stored state and the staff verification flags', () => {
    const application = toJoinApplication(applicationRow());
    expect(application.state).toBe('submitted');
    expect(application.phoneVerified).toBe(false);
    expect(application.emailVerified).toBe(false);
  });

  it('does not promote an application just because a plan is present', () => {
    const application = toJoinApplication(applicationRow({ state: 'pendingVerification' }));
    expect(application.state).toBe('pendingVerification');
  });

  it('maps a null email to an empty display value', () => {
    expect(toJoinApplication(applicationRow({ email: null })).email).toBe('');
  });
});

describe('toAuditEntry', () => {
  it('preserves the recorded action, actor role and both value snapshots', () => {
    const entry = toAuditEntry(auditRow());
    expect(entry.action).toBe('receipt.issued');
    expect(entry.actorRole).toBe('receptionist');
    expect(entry.oldValues).toEqual({ receipt_issued: false });
    expect(entry.newValues).toEqual({ receipt_issued: true });
  });

  it('keeps a system row readable with a null actor', () => {
    const entry = toAuditEntry(auditRow({ actor: null, actor_role: null }));
    expect(entry.actorId).toBeNull();
    expect(entry.actorRole).toBeNull();
  });

  it('keeps null snapshots null instead of inventing an empty object', () => {
    const entry = toAuditEntry(auditRow({ old_values: null, new_values: null }));
    expect(entry.oldValues).toBeNull();
    expect(entry.newValues).toBeNull();
  });
});
