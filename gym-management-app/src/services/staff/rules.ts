/**
 * Pure staff-administration rules.
 *
 * These are UI guards, not authority. The same invariants are enforced
 * server-side by `admin_register_staff`, `admin_set_staff_active` and the
 * `staff-admin` Edge Function:
 *   * the created role is always `receptionist` — there is no role field;
 *   * an owner is never created, promoted, deactivated or modified here;
 *   * an owner cannot change their own account status;
 *   * only receptionists are activatable/deactivatable.
 *
 * Keeping the rules pure makes them testable without a network or a
 * database, and keeps the screen from inventing a second policy.
 */
import type { StaffAccount } from '@/types/domain';
import { isEmail, isPhone, passwordIssues } from '@/utils/format';

export interface StaffDraft {
  displayName: string;
  email: string;
  phone: string;
  password: string;
}

export type StaffDraftErrors = Partial<Record<keyof StaffDraft, string>>;

export const STAFF_NAME_MIN = 2;
export const STAFF_NAME_MAX = 120;
export const STAFF_PHONE_MAX = 32;

/** Normalise the form exactly once, before validation or submission. */
export function normaliseStaffDraft(draft: StaffDraft): StaffDraft {
  return {
    displayName: draft.displayName.trim().replace(/\s+/g, ' '),
    email: draft.email.trim().toLowerCase(),
    phone: draft.phone.trim(),
    // Passwords are never trimmed: leading/trailing spaces are significant.
    password: draft.password,
  };
}

export function validateStaffDraft(draft: StaffDraft): StaffDraftErrors {
  const value = normaliseStaffDraft(draft);
  const errors: StaffDraftErrors = {};

  if (value.displayName.length < STAFF_NAME_MIN) {
    errors.displayName = 'Enter the staff member’s full name.';
  } else if (value.displayName.length > STAFF_NAME_MAX) {
    errors.displayName = `Keep the name under ${STAFF_NAME_MAX} characters.`;
  }

  if (!isEmail(value.email)) {
    errors.email = 'Enter a valid email address.';
  }

  if (value.phone) {
    if (value.phone.length > STAFF_PHONE_MAX) {
      errors.phone = 'That phone number is too long.';
    } else if (!isPhone(value.phone)) {
      errors.phone = 'Enter a valid phone number, or leave it blank.';
    }
  }

  const issues = passwordIssues(value.password);
  if (issues.length > 0) {
    errors.password = `Use ${issues.join(', ')}.`;
  }

  return errors;
}

export function hasStaffDraftErrors(errors: StaffDraftErrors): boolean {
  return Object.keys(errors).length > 0;
}

/**
 * Why an account cannot be managed from this screen, or null when it can.
 * Called with the signed-in owner's id so self-targeting is refused in the
 * UI before the server refuses it independently.
 */
export function staffManageRefusal(account: StaffAccount, actorId: string | null): string | null {
  if (!actorId) return 'Your session is not available. Sign in again.';
  if (account.userId === actorId) {
    return 'You cannot change the status of your own account.';
  }
  if (account.role !== 'receptionist') {
    return 'Owner accounts are not managed from staff administration.';
  }
  return null;
}

export function canDeactivateStaff(account: StaffAccount, actorId: string | null): boolean {
  return account.isActive && staffManageRefusal(account, actorId) === null;
}

export function canActivateStaff(account: StaffAccount, actorId: string | null): boolean {
  return !account.isActive && staffManageRefusal(account, actorId) === null;
}

/**
 * There is no role input anywhere in this flow. This guard exists so a
 * future caller cannot quietly add one to the Edge payload.
 */
export function payloadHasRoleField(payload: Record<string, unknown>): boolean {
  return Object.prototype.hasOwnProperty.call(payload, 'role');
}

export function staffRoleLabel(role: StaffAccount['role']): string {
  return role === 'owner' ? 'Owner' : 'Receptionist';
}

/** Honest, non-PII directory line: role plus access state. */
export function staffAccessLabel(account: StaffAccount): string {
  if (!account.isActive) return 'Deactivated · access denied';
  return account.role === 'owner' ? 'Owner · full administration' : 'Active · reception access';
}
