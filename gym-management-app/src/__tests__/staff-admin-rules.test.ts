// WS-5 staff-administration rules. These are UI guards that mirror the
// server invariants; the database remains the authority.
import {
  canActivateStaff,
  canDeactivateStaff,
  hasStaffDraftErrors,
  normaliseStaffDraft,
  payloadHasRoleField,
  staffAccessLabel,
  staffManageRefusal,
  staffRoleLabel,
  validateStaffDraft,
} from '@/services/staff';
import type { StaffAccount } from '@/types/domain';

function account(overrides: Partial<StaffAccount> = {}): StaffAccount {
  return {
    userId: 'user-rec-1',
    displayName: 'Front Desk',
    role: 'receptionist',
    email: 'front@example.com',
    phone: '+919811000001',
    isActive: true,
    createdAt: '2026-11-01T00:00:00.000Z',
    lastSignInAt: null,
    ...overrides,
  };
}

const validDraft = {
  displayName: 'Front Desk',
  email: 'front@example.com',
  phone: '+919811000001',
  password: 'Pulse#Front1',
};

describe('normaliseStaffDraft', () => {
  it('trims the name, lowercases the email and preserves the password exactly', () => {
    const value = normaliseStaffDraft({
      displayName: '  Front   Desk  ',
      email: '  FRONT@Example.COM ',
      phone: '  +919811000001 ',
      password: '  Pulse#Front1  ',
    });
    expect(value.displayName).toBe('Front Desk');
    expect(value.email).toBe('front@example.com');
    expect(value.phone).toBe('+919811000001');
    expect(value.password).toBe('  Pulse#Front1  ');
  });
});

describe('validateStaffDraft', () => {
  it('accepts a complete receptionist draft with no phone', () => {
    expect(validateStaffDraft({ ...validDraft, phone: '' })).toEqual({});
  });

  it('refuses a blank or one-character name', () => {
    expect(validateStaffDraft({ ...validDraft, displayName: ' ' }).displayName).toBeTruthy();
    expect(validateStaffDraft({ ...validDraft, displayName: 'A' }).displayName).toBeTruthy();
  });

  it('refuses an invalid email', () => {
    expect(validateStaffDraft({ ...validDraft, email: 'not-an-email' }).email).toBeTruthy();
  });

  it('refuses a malformed phone number but accepts a blank one', () => {
    expect(validateStaffDraft({ ...validDraft, phone: '12345' }).phone).toBeTruthy();
    expect(validateStaffDraft({ ...validDraft, phone: '' }).phone).toBeUndefined();
  });

  it('refuses a short password and one without a digit', () => {
    expect(validateStaffDraft({ ...validDraft, password: 'short' }).password).toBeTruthy();
    expect(validateStaffDraft({ ...validDraft, password: 'abcdefgh' }).password).toBeTruthy();
  });

  it('reports whether any field failed', () => {
    expect(hasStaffDraftErrors({})).toBe(false);
    expect(hasStaffDraftErrors({ email: 'bad' })).toBe(true);
  });
});

describe('staffManageRefusal', () => {
  it('refuses self-management', () => {
    expect(staffManageRefusal(account({ userId: 'me' }), 'me')).toMatch(/own account/i);
  });

  it('refuses every owner target', () => {
    expect(staffManageRefusal(account({ role: 'owner' }), 'owner-1')).toMatch(/Owner accounts/i);
  });

  it('allows a receptionist target', () => {
    expect(staffManageRefusal(account(), 'owner-1')).toBeNull();
  });

  it('refuses when there is no session', () => {
    expect(staffManageRefusal(account(), null)).toMatch(/session/i);
  });
});

describe('activation and deactivation affordances', () => {
  it('offers deactivation for an active receptionist only', () => {
    expect(canDeactivateStaff(account(), 'owner-1')).toBe(true);
    expect(canDeactivateStaff(account({ isActive: false }), 'owner-1')).toBe(false);
    expect(canDeactivateStaff(account({ role: 'owner' }), 'owner-1')).toBe(false);
    expect(canDeactivateStaff(account({ userId: 'me' }), 'me')).toBe(false);
  });

  it('offers activation for an inactive receptionist only', () => {
    expect(canActivateStaff(account({ isActive: false }), 'owner-1')).toBe(true);
    expect(canActivateStaff(account(), 'owner-1')).toBe(false);
    expect(canActivateStaff(account({ isActive: false, role: 'owner' }), 'owner-1')).toBe(false);
    expect(canActivateStaff(account({ isActive: false, userId: 'me' }), 'me')).toBe(false);
  });
});

describe('role payload guard', () => {
  it('detects any attempted role field', () => {
    expect(payloadHasRoleField({ action: 'create', role: 'owner' })).toBe(true);
    expect(payloadHasRoleField({ action: 'create', displayName: 'Front' })).toBe(false);
  });
});

describe('honest labels', () => {
  it('names the two staff roles only', () => {
    expect(staffRoleLabel('owner')).toBe('Owner');
    expect(staffRoleLabel('receptionist')).toBe('Receptionist');
  });

  it('shows deactivated access as denied rather than active', () => {
    expect(staffAccessLabel(account({ isActive: false }))).toMatch(/denied/i);
    expect(staffAccessLabel(account())).toMatch(/reception access/i);
    expect(staffAccessLabel(account({ role: 'owner' }))).toMatch(/full administration/i);
  });
});
