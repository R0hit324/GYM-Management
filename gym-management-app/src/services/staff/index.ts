/**
 * Staff administration service barrel. Screens import only from here.
 */
export type {
  CreatedStaffAccount,
  StaffAccessResult,
  StaffOutcome,
} from '@/services/staff/admin';
export { createStaffAccount, setStaffActive } from '@/services/staff/admin';
export type { StaffDraft, StaffDraftErrors } from '@/services/staff/rules';
export {
  canActivateStaff,
  canDeactivateStaff,
  hasStaffDraftErrors,
  normaliseStaffDraft,
  payloadHasRoleField,
  staffAccessLabel,
  staffManageRefusal,
  staffRoleLabel,
  validateStaffDraft,
  STAFF_NAME_MAX,
  STAFF_NAME_MIN,
  STAFF_PHONE_MAX,
} from '@/services/staff/rules';
