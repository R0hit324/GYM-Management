/**
 * Read-only data hooks (Phase 4, Stage 2).
 *
 * The hooks choose the data source from the SAME auth provider the app
 * already uses:
 *  - demo mode  → the existing demo records (stable module references);
 *  - live mode  → the verified views/tables through the shared client.
 *
 * Loading, error and refresh state are exposed so screens can render honest
 * skeleton/error/refresh UI. A live session that is still restoring never
 * falls back to demo data — it stays in a loading state.
 */
import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/services/auth/auth-context';
import type {
  AttendanceEvent,
  AuditLogEntry,
  DailyReportNumbers,
  FreezeRecord,
  GymSettings,
  JoinApplication,
  Member,
  MembershipPeriodRecord,
  MembershipPlan,
  PaymentRecord,
  StaffAccount,
} from '@/types/domain';

import { demoOwnershipReport } from '@/data/demo';

import {
  demoAttendanceList,
  demoInactiveMembers,
  demoMembersList,
  demoMonthlyRevenue,
  demoMyAttendance,
  demoMyMember,
  demoMyPayments,
  demoPaymentsList,
  demoPendingApplications,
  demoPlansList,
} from './demo-fallbacks';
import {
  latestFollowUps,
  toAttendance,
  toAuditEntry,
  toDailyReport,
  toFreeze,
  toGymSettings,
  toInactiveMember,
  toJoinApplication,
  toMemberStatus,
  toMembershipPeriod,
  toMonthlyRevenue,
  toPayment,
  toPlan,
  toStaffAccount,
} from './mappers';
import {
  fetchAttendanceRows,
  fetchAttendanceRowsForMember,
  fetchAttendanceRowsInRange,
  fetchAuditLogRows,
  fetchDailyReportRow,
  fetchFollowUpRows,
  fetchFollowUpRowsForMember,
  fetchFreezeRows,
  fetchFreezeRowsForMember,
  fetchGymSettingsRow,
  fetchInactiveMemberRows,
  fetchJoinApplicationRows,
  fetchMemberStatusRow,
  fetchMemberStatusRows,
  fetchMembershipPeriodRowsForMember,
  fetchMonthRevenueRows,
  fetchPaymentRows,
  fetchPaymentRowsForMember,
  fetchPaymentRowsInRange,
  fetchPendingAssignmentRows,
  fetchPlanRows,
  fetchStaffDirectoryRows,
} from './queries';
import type { MonthlyRevenue } from './rows';

export type DataStatus = 'loading' | 'ready' | 'error';

export interface DataResource<T> {
  data: T;
  status: DataStatus;
  error: string | null;
  refresh: () => void;
  /** True when the app is running the live provider (read-only stage). */
  isLive: boolean;
}

export interface MemberProfileData {
  member: Member | null;
  payments: PaymentRecord[];
  attendance: AttendanceEvent[];
  plans: MembershipPlan[];
  /** Applied terms, newest first (empty until a verified payment). */
  periods: MembershipPeriodRecord[];
  /** Freeze records, newest first; validity is still derived by the server. */
  freezes: FreezeRecord[];
}

/** A plan request waiting for the member's next verified payment. */
export interface PendingPlanAssignment {
  memberId: string;
  memberName: string;
  planId: string;
  planName: string;
}

function localDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'The request could not be completed.';
}

// ---------------------------------------------------------------------------
// Loaders (module references so hooks can depend on them safely)
// ---------------------------------------------------------------------------

async function loadMembers(): Promise<Member[]> {
  const [statusRows, followUpRows] = await Promise.all([
    fetchMemberStatusRows(),
    fetchFollowUpRows().catch(() => []),
  ]);
  const followUps = latestFollowUps(followUpRows);
  return statusRows.map((row) => toMemberStatus(row, followUps.get(row.member_id)));
}

async function loadInactiveMembers(): Promise<Member[]> {
  const [inactiveRows, followUpRows] = await Promise.all([
    fetchInactiveMemberRows(),
    fetchFollowUpRows().catch(() => []),
  ]);
  const followUps = latestFollowUps(followUpRows);
  return inactiveRows.map((row) => toInactiveMember(row, followUps.get(row.member_id)));
}

async function loadPayments(): Promise<PaymentRecord[]> {
  const [paymentRows, statusRows] = await Promise.all([
    fetchPaymentRows(),
    fetchMemberStatusRows(),
  ]);
  const names = new Map(statusRows.map((row) => [row.member_id, row.full_name] as const));
  return paymentRows.map((row) => toPayment(row, names.get(row.member_id) ?? 'Member'));
}

async function loadAttendance(): Promise<AttendanceEvent[]> {
  const [attendanceRows, statusRows] = await Promise.all([
    fetchAttendanceRows(),
    fetchMemberStatusRows(),
  ]);
  const names = new Map(statusRows.map((row) => [row.member_id, row.full_name] as const));
  return attendanceRows.map((row) => toAttendance(row, names.get(row.member_id) ?? 'Member'));
}

async function loadPlans(): Promise<MembershipPlan[]> {
  const rows = await fetchPlanRows();
  return rows.map(toPlan);
}

async function loadDailyReport(): Promise<DailyReportNumbers> {
  const row = await fetchDailyReportRow();
  return toDailyReport(row, localDate());
}

async function loadMonthlyRevenue(): Promise<MonthlyRevenue> {
  const rows = await fetchMonthRevenueRows();
  return toMonthlyRevenue(rows, localDate());
}

async function loadPendingApplications(): Promise<number> {
  const rows = await fetchJoinApplicationRows();
  return rows.filter((row) => row.state === 'submitted' || row.state === 'pendingVerification').length;
}

/** Full application rows for the reception review screen (newest first). */
async function loadJoinApplications(): Promise<JoinApplication[]> {
  const rows = await fetchJoinApplicationRows();
  return rows.map(toJoinApplication);
}

/** Owner-only audit page; RLS refuses every other role. */
async function loadAuditLog(): Promise<AuditLogEntry[]> {
  const rows = await fetchAuditLogRows();
  return rows.map(toAuditEntry);
}

/** Owner-only staff directory (owners + receptionists). */
async function loadStaffDirectory(): Promise<StaffAccount[]> {
  const rows = await fetchStaffDirectoryRows();
  return rows.map(toStaffAccount);
}

async function loadMyMembership(): Promise<Member | null> {
  const [statusRows, followUpRows] = await Promise.all([
    fetchMemberStatusRows(),
    fetchFollowUpRows().catch(() => []),
  ]);
  const row = statusRows[0];
  if (!row) return null;
  return toMemberStatus(row, latestFollowUps(followUpRows).get(row.member_id));
}

/** The member's own attendance, scoped by the caller's member id. */
async function loadMyAttendance(): Promise<AttendanceEvent[]> {
  const statusRows = await fetchMemberStatusRows();
  const row = statusRows[0];
  if (!row) return [];
  const attendanceRows = await fetchAttendanceRowsForMember(row.member_id);
  return attendanceRows.map((event) => toAttendance(event, row.full_name));
}

/** The member's own payments (read-only); receipts are metadata on the row. */
async function loadMyPayments(): Promise<PaymentRecord[]> {
  const statusRows = await fetchMemberStatusRows();
  const row = statusRows[0];
  if (!row) return [];
  const paymentRows = await fetchPaymentRowsForMember(row.member_id);
  return paymentRows.map((payment) => toPayment(payment, row.full_name));
}

/**
 * One member's complete profile. Every read is scoped by `member_id` and
 * bounded — never "fetch all and filter in JS".
 */
async function loadMemberProfile(memberId: string): Promise<MemberProfileData> {
  const [row, paymentRows, attendanceRows, planRows, periodRows, freezeRows, followUpRows] =
    await Promise.all([
      fetchMemberStatusRow(memberId),
      fetchPaymentRowsForMember(memberId),
      fetchAttendanceRowsForMember(memberId),
      fetchPlanRows(),
      fetchMembershipPeriodRowsForMember(memberId),
      fetchFreezeRowsForMember(memberId),
      fetchFollowUpRowsForMember(memberId).catch(() => []),
    ]);
  const name = row?.full_name ?? 'Member';
  const planNames = new Map(planRows.map((plan) => [plan.id, plan.name] as const));
  return {
    member: row ? toMemberStatus(row, latestFollowUps(followUpRows).get(row.member_id)) : null,
    payments: paymentRows.map((payment) => toPayment(payment, name)),
    attendance: attendanceRows.map((event) => toAttendance(event, name)),
    plans: planRows.map(toPlan),
    periods: periodRows.map((period) =>
      toMembershipPeriod(period, planNames.get(period.plan_id) ?? ''),
    ),
    freezes: freezeRows.map((freeze) => toFreeze(freeze, name)),
  };
}

/** Bounded ledger for a reporting range (used by owner analytics/export). */
async function loadPaymentsInRange(fromIso: string, toIso: string): Promise<PaymentRecord[]> {
  const [paymentRows, statusRows] = await Promise.all([
    fetchPaymentRowsInRange(fromIso, toIso),
    fetchMemberStatusRows(),
  ]);
  const names = new Map(statusRows.map((row) => [row.member_id, row.full_name] as const));
  return paymentRows.map((row) => toPayment(row, names.get(row.member_id) ?? 'Member'));
}

async function loadAttendanceInRange(
  fromIso: string,
  toIso: string,
): Promise<AttendanceEvent[]> {
  const [attendanceRows, statusRows] = await Promise.all([
    fetchAttendanceRowsInRange(fromIso, toIso),
    fetchMemberStatusRows(),
  ]);
  const names = new Map(statusRows.map((row) => [row.member_id, row.full_name] as const));
  return attendanceRows.map((row) => toAttendance(row, names.get(row.member_id) ?? 'Member'));
}

async function loadFreezes(): Promise<FreezeRecord[]> {
  const [freezeRows, statusRows] = await Promise.all([
    fetchFreezeRows(),
    fetchMemberStatusRows(),
  ]);
  const names = new Map(statusRows.map((row) => [row.member_id, row.full_name] as const));
  return freezeRows.map((row) => toFreeze(row, names.get(row.member_id) ?? 'Member'));
}

async function loadGymSettings(): Promise<GymSettings | null> {
  const row = await fetchGymSettingsRow();
  return row ? toGymSettings(row) : null;
}

/**
 * Pending plan requests are read from `members.pending_plan_id` (staff
 * policy) and the plan name resolved from the live catalogue. A request is
 * not a plan change yet — it applies on the next verified payment.
 */
async function loadPendingAssignments(): Promise<PendingPlanAssignment[]> {
  const [pendingRows, planRows] = await Promise.all([
    fetchPendingAssignmentRows(),
    fetchPlanRows(),
  ]);
  const planNames = new Map(planRows.map((plan) => [plan.id, plan.name] as const));
  return pendingRows.map((row) => ({
    memberId: row.id,
    memberName: row.full_name,
    planId: row.pending_plan_id,
    planName: planNames.get(row.pending_plan_id) ?? 'Plan not on record',
  }));
}

// ---------------------------------------------------------------------------
// Generic resource hook
// ---------------------------------------------------------------------------

function useResource<T>(
  demoValue: T,
  emptyValue: T,
  load: () => Promise<T>,
): DataResource<T> {
  const { provider, status: authStatus } = useAuth();
  const liveMode = provider.mode === 'live';
  const canLoad = liveMode && authStatus === 'authenticated';

  // Results are keyed by the loader that produced them, so changing the
  // subject (e.g. another member id) reads as "loading" without a synchronous
  // setState inside the effect. Only the async callbacks below write state.
  const [loaded, setLoaded] = useState<{
    load: () => Promise<T>;
    attempt: number;
    data: T;
  } | null>(null);
  const [failure, setFailure] = useState<{
    load: () => Promise<T>;
    attempt: number;
    error: string;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!canLoad) return;
    let cancelled = false;

    load()
      .then((value) => {
        if (cancelled) return;
        setLoaded({ load, attempt, data: value });
        setFailure(null);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setFailure({ load, attempt, error: errorMessage(cause) });
      });

    return () => {
      cancelled = true;
    };
  }, [canLoad, attempt, load]);

  const refresh = useCallback(() => setAttempt((value) => value + 1), []);

  // `success` keeps the last good data while a refresh is in flight; the
  // status only reports ready once the current attempt has settled.
  const success = canLoad && loaded && loaded.load === load ? loaded : null;
  const settled = success !== null && success.attempt === attempt;
  const error =
    canLoad &&
    failure &&
    failure.load === load &&
    failure.attempt === attempt
      ? failure.error
      : null;

  return {
    data: liveMode ? (success?.data ?? emptyValue) : demoValue,
    status: !liveMode ? 'ready' : error ? 'error' : settled ? 'ready' : 'loading',
    error: liveMode ? error : null,
    refresh,
    isLive: liveMode,
  };
}

// ---------------------------------------------------------------------------
// Screen-facing hooks
// ---------------------------------------------------------------------------

export function useMembers(): DataResource<Member[]> {
  return useResource<Member[]>(demoMembersList, [], loadMembers);
}

export function useInactiveMembers(): DataResource<Member[]> {
  return useResource<Member[]>(demoInactiveMembers, [], loadInactiveMembers);
}

export function usePayments(): DataResource<PaymentRecord[]> {
  return useResource<PaymentRecord[]>(demoPaymentsList, [], loadPayments);
}

export function useAttendance(): DataResource<AttendanceEvent[]> {
  return useResource<AttendanceEvent[]>(demoAttendanceList, [], loadAttendance);
}

export function usePlans(): DataResource<MembershipPlan[]> {
  return useResource<MembershipPlan[]>(demoPlansList, [], loadPlans);
}

export function useDailyReport(): DataResource<DailyReportNumbers | null> {
  return useResource<DailyReportNumbers | null>(demoOwnershipReport, null, loadDailyReport);
}

export function useMonthlyRevenue(): DataResource<MonthlyRevenue | null> {
  return useResource<MonthlyRevenue | null>(demoMonthlyRevenue, null, loadMonthlyRevenue);
}

export function usePendingApplications(): DataResource<number> {
  return useResource<number>(demoPendingApplications, 0, loadPendingApplications);
}

export function useMyMembership(): DataResource<Member | null> {
  return useResource<Member | null>(demoMyMember, null, loadMyMembership);
}

export function useMyAttendance(): DataResource<AttendanceEvent[]> {
  return useResource<AttendanceEvent[]>(demoMyAttendance, [], loadMyAttendance);
}

export function useMemberProfile(memberId: string | null): DataResource<MemberProfileData | null> {
  const load = useCallback(
    () =>
      memberId
        ? loadMemberProfile(memberId)
        : Promise.resolve<MemberProfileData | null>(null),
    [memberId],
  );
  return useResource<MemberProfileData | null>(null, null, load);
}

/** Live freeze rows (demo mode keeps the screen's own session freeze book). */
export function useFreezes(): DataResource<FreezeRecord[]> {
  return useResource<FreezeRecord[]>([], [], loadFreezes);
}

/** The server-owned singleton settings row (null until configured in live mode). */
export function useGymSettings(): DataResource<GymSettings | null> {
  return useResource<GymSettings | null>(null, null, loadGymSettings);
}

/** Full join applications for the reception review screen. */
export function useJoinApplications(): DataResource<JoinApplication[]> {
  return useResource<JoinApplication[]>([], [], loadJoinApplications);
}

/** Owner-only append-only audit page (newest first, bounded). */
export function useAuditLog(): DataResource<AuditLogEntry[]> {
  return useResource<AuditLogEntry[]>([], [], loadAuditLog);
}

/**
 * Staff directory for the owner console. Demo mode is honestly empty: the
 * directory is server-produced and there is no sample staff list to fake.
 */
export function useStaffDirectory(): DataResource<StaffAccount[]> {
  return useResource<StaffAccount[]>([], [], loadStaffDirectory);
}

/** The signed-in member's own payment rows. */
export function useMyPayments(): DataResource<PaymentRecord[]> {
  return useResource<PaymentRecord[]>(demoMyPayments, [], loadMyPayments);
}

/** Bounded ledger for an explicit half-open [from, to) reporting range. */
export function usePaymentsInRange(
  fromIso: string,
  toIso: string,
): DataResource<PaymentRecord[]> {
  const load = useCallback(
    () => (fromIso && toIso ? loadPaymentsInRange(fromIso, toIso) : Promise.resolve([])),
    [fromIso, toIso],
  );
  return useResource<PaymentRecord[]>([], [], load);
}

/** Bounded attendance events for an explicit half-open [from, to) range. */
export function useAttendanceInRange(
  fromIso: string,
  toIso: string,
): DataResource<AttendanceEvent[]> {
  const load = useCallback(
    () => (fromIso && toIso ? loadAttendanceInRange(fromIso, toIso) : Promise.resolve([])),
    [fromIso, toIso],
  );
  return useResource<AttendanceEvent[]>([], [], load);
}

/** Server-recorded pending plan requests (applied on next verified payment). */
export function usePendingAssignments(): DataResource<PendingPlanAssignment[]> {
  return useResource<PendingPlanAssignment[]>([], [], loadPendingAssignments);
}
