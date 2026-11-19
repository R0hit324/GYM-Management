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
  DailyReportNumbers,
  FreezeRecord,
  GymSettings,
  Member,
  MembershipPlan,
  PaymentRecord,
} from '@/types/domain';

import { demoOwnershipReport } from '@/data/demo';

import {
  demoAttendanceList,
  demoInactiveMembers,
  demoMembersList,
  demoMonthlyRevenue,
  demoMyAttendance,
  demoMyMember,
  demoPaymentsList,
  demoPendingApplications,
  demoPlansList,
} from './demo-fallbacks';
import {
  latestFollowUps,
  toAttendance,
  toDailyReport,
  toFreeze,
  toGymSettings,
  toInactiveMember,
  toMemberStatus,
  toMonthlyRevenue,
  toPayment,
  toPlan,
} from './mappers';
import {
  fetchAttendanceRows,
  fetchDailyReportRow,
  fetchFollowUpRows,
  fetchFreezeRows,
  fetchGymSettingsRow,
  fetchInactiveMemberRows,
  fetchJoinApplicationRows,
  fetchMemberStatusRows,
  fetchMonthRevenueRows,
  fetchPaymentRows,
  fetchPlanRows,
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

async function loadMyMembership(): Promise<Member | null> {
  const [statusRows, followUpRows] = await Promise.all([
    fetchMemberStatusRows(),
    fetchFollowUpRows().catch(() => []),
  ]);
  const row = statusRows[0];
  if (!row) return null;
  return toMemberStatus(row, latestFollowUps(followUpRows).get(row.member_id));
}

async function loadMyAttendance(): Promise<AttendanceEvent[]> {
  const [attendanceRows, statusRows] = await Promise.all([
    fetchAttendanceRows(),
    fetchMemberStatusRows(),
  ]);
  const names = new Map(statusRows.map((row) => [row.member_id, row.full_name] as const));
  return attendanceRows.map((row) => toAttendance(row, names.get(row.member_id) ?? 'Member'));
}

async function loadMemberProfile(memberId: string): Promise<MemberProfileData> {
  const [statusRows, paymentRows, attendanceRows, planRows, followUpRows] = await Promise.all([
    fetchMemberStatusRows(),
    fetchPaymentRows(),
    fetchAttendanceRows(),
    fetchPlanRows(),
    fetchFollowUpRows().catch(() => []),
  ]);
  const row = statusRows.find((candidate) => candidate.member_id === memberId) ?? null;
  const name = row?.full_name ?? 'Member';
  return {
    member: row ? toMemberStatus(row, latestFollowUps(followUpRows).get(row.member_id)) : null,
    payments: paymentRows
      .filter((payment) => payment.member_id === memberId)
      .map((payment) => toPayment(payment, name)),
    attendance: attendanceRows
      .filter((event) => event.member_id === memberId)
      .map((event) => toAttendance(event, name)),
    plans: planRows.map(toPlan),
  };
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
