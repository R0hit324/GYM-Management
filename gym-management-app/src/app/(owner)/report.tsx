/**
 * Screen 7 — Everyday report (owner).
 *
 * Fino-style owner theme: dark charcoal ground, white rounded panel.
 * Daily/monthly ledger: collections (UPI/cash, verification-queue exclusion),
 * membership KPIs, adjustments audit trail, "Attention today" list.
 * Demo mode shows the approved sample ledger; live mode reads v_daily_report,
 * v_month_revenue, payments, v_member_status and join_applications. Live mode
 * builds period series from the bounded range reads — verified check-ins per
 * local day for the attendance trend, verified net collections per day/week
 * for the collections trend — so charts render only from real rows. The demo
 * keeps its approved sample series. The current view's rows can be exported as
 * CSV text through the platform share sheet, with explicit confirmation and a
 * row cap; no PDF or Excel output is produced in this stage.
 */
import { useCallback, useMemo, useState } from 'react';
import { Share, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppText } from '@/components/ui/text';
import { SegmentedTabs } from '@/components/ui/segmented-tabs';
import { ModalSheet } from '@/components/ui/modal-sheet';
import { RiseIn } from '@/components/ui/rise-in';
import { CountUp } from '@/components/ui/motion';
import { LineChart, attendanceLineColors } from '@/components/charts/line-chart';
import { BarChart } from '@/components/charts/bar-chart';
import { Button } from '@/components/ui/button';
import { DataRefreshControl, ErrorState, SkeletonRow } from '@/components/ui/feedback';
import {
  OwnerScreen,
  OwnerBottomNavigation,
  OwnerStatTile,
  OwnerStatRow,
  OwnerChartCard,
  OwnerDeltaPill,
  OwnerStatusText,
  OwnerSection,
  OwnerCard,
  OwnerWell,
  OwnerListGroup,
  OwnerListRow,
  OwnerRowDivider,
  OwnerMemberAvatar,
  OwnerEmptyState,
} from '@/components/owner/owner-ui';
import { useTokens } from '@/hooks/use-tokens';
import { demoOwnershipReport, demoAttendanceTrend, demoCollectionsTrend } from '@/data/demo';
import {
  useAttendanceInRange,
  useDailyReport,
  useMembers,
  useMonthlyRevenue,
  usePayments,
  usePaymentsInRange,
  usePendingApplications,
} from '@/services/data';
import { displayMembershipStatus } from '@/utils/membership';
import { formatCurrency, isSameLocalDay } from '@/utils/format';
import type { AttendanceEvent, PaymentRecord, TrendPoint } from '@/types/domain';

/** Deltas are computed from the demo trends — never asserted. */
type StatDelta = { label: string; direction: 'up' | 'down' };

function percentDelta(now: number, before: number, unit: string): StatDelta | undefined {
  if (before <= 0) return undefined;
  const pct = Math.round(((now - before) / before) * 100);
  return {
    label: `${pct >= 0 ? '+' : ''}${pct}% ${unit}`,
    direction: pct >= 0 ? 'up' : 'down',
  };
}

/** Local-calendar-day start (`YYYY-MM-DDTHH:MM:SS`) for half-open range bounds. */
function dayStartIso(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}T00:00:00`;
}

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Local calendar-day key (`YYYY-M-D` by local parts, never UTC-shifted). */
function dayKeyOf(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function trendPoint(date: Date, value: number, label = WEEKDAY_SHORT[date.getDay()]): TrendPoint {
  return {
    label,
    fullLabel: `${WEEKDAY_SHORT[date.getDay()]}, ${date.getDate()} ${MONTH_SHORT[date.getMonth()]} ${date.getFullYear()}`,
    value,
  };
}

/** Verified net collections (a reversal subtracts) keyed by local day. */
function verifiedSumsFor(payments: PaymentRecord[]): Map<string, number> {
  const sums = new Map<string, number>();
  for (const payment of payments) {
    if (payment.state !== 'verified') continue;
    const d = new Date(payment.createdAt);
    const key = dayKeyOf(d);
    const signed = payment.entryType === 'reversal' ? -payment.payable : payment.payable;
    sums.set(key, (sums.get(key) ?? 0) + signed);
  }
  return sums;
}

/** Verified check-in count for one local calendar day. */
function countByDay(events: AttendanceEvent[], day: Date): number {
  const key = dayKeyOf(day);
  let n = 0;
  for (const event of events) {
    if (event.status !== 'verified') continue;
    if (dayKeyOf(new Date(event.checkedInAt)) !== key) continue;
    n += 1;
  }
  return n;
}

/** Cap for the CSV export so the share payload stays a review, not a bulk dump. */
const EXPORT_ROW_CAP = 500;

export default function OwnerReportScreen() {
  const tokens = useTokens();
  const { colors, spacing } = tokens;

  const [report, setReport] = useState<'daily' | 'monthly'>('daily');
  const [explainOpen, setExplainOpen] = useState<string | null>(null);
  const [rangeDays, setRangeDays] = useState<number>(7);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const dailyResource = useDailyReport();
  const monthlyResource = useMonthlyRevenue();
  const paymentsResource = usePayments();
  const membersResource = useMembers();
  const applicationsResource = usePendingApplications();
  const live = dailyResource.isLive;

  const daily = dailyResource.data;
  const month = monthlyResource.data?.current ?? null;
  const members = membersResource.data;

  const liveLoading =
    dailyResource.status === 'loading' ||
    monthlyResource.status === 'loading' ||
    paymentsResource.status === 'loading' ||
    membersResource.status === 'loading' ||
    applicationsResource.status === 'loading';
  const hasError =
    dailyResource.status === 'error' ||
    monthlyResource.status === 'error' ||
    paymentsResource.status === 'error' ||
    membersResource.status === 'error' ||
    applicationsResource.status === 'error';
  const refreshAll = () => {
    dailyResource.refresh();
    monthlyResource.refresh();
    paymentsResource.refresh();
    membersResource.refresh();
    applicationsResource.refresh();
  };

  // Stage 8 — live period windows: the selected window (last `rangeDays`
  // days) and the immediately previous window of the same length, both as
  // half-open [from, to) local-day ranges for the bounded reads.
  const rangeWindow = useMemo(() => {
    const start = new Date();
    start.setDate(start.getDate() - (rangeDays - 1));
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + rangeDays);
    return {
      start,
      days: Array.from(
        { length: rangeDays },
        (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i),
      ),
      from: dayStartIso(start),
      to: dayStartIso(end),
    };
  }, [rangeDays]);

  const previousWindow = useMemo(() => {
    const start = new Date(rangeWindow.start);
    start.setDate(start.getDate() - rangeDays);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + rangeDays);
    return {
      start,
      days: Array.from(
        { length: rangeDays },
        (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i),
      ),
      from: dayStartIso(start),
      to: dayStartIso(end),
    };
  }, [rangeWindow, rangeDays]);

  const rangePaymentsResource = usePaymentsInRange(rangeWindow.from, rangeWindow.to);
  const rangeAttendanceResource = useAttendanceInRange(rangeWindow.from, rangeWindow.to);
  const previousPaymentsResource = usePaymentsInRange(previousWindow.from, previousWindow.to);
  const previousAttendanceResource = useAttendanceInRange(previousWindow.from, previousWindow.to);
  const rangePayments = useMemo<PaymentRecord[]>(() => (live ? rangePaymentsResource.data : []), [live, rangePaymentsResource.data]);
  const previousPayments = useMemo<PaymentRecord[]>(() => (live ? previousPaymentsResource.data : []), [live, previousPaymentsResource.data]);
  const rangeAttendance = useMemo<AttendanceEvent[]>(() => (live ? rangeAttendanceResource.data : []), [live, rangeAttendanceResource.data]);
  const previousAttendance = useMemo<AttendanceEvent[]>(() => (live ? previousAttendanceResource.data : []), [live, previousAttendanceResource.data]);

  // Verified net collections per local day for the current and previous windows.
  const verifiedSums = useMemo(() => verifiedSumsFor(rangePayments), [rangePayments]);
  const previousVerifiedSums = useMemo(() => verifiedSumsFor(previousPayments), [previousPayments]);
  const daySum = useCallback(
    (d: Date) => Math.round(verifiedSums.get(dayKeyOf(d)) ?? 0),
    [verifiedSums],
  );
  const previousDaySum = useCallback(
    (d: Date) => Math.round(previousVerifiedSums.get(dayKeyOf(d)) ?? 0),
    [previousVerifiedSums],
  );
  const collectionsWindowTotal = useMemo(
    () => rangeWindow.days.reduce((sum, d) => sum + daySum(d), 0),
    [rangeWindow, daySum],
  );
  const previousCollectionsWindowTotal = useMemo(
    () => previousWindow.days.reduce((sum, d) => sum + previousDaySum(d), 0),
    [previousWindow, previousDaySum],
  );

  // Period payments: today for the daily ledger, the current month for the
  // monthly ledger. Demo mode keeps its approved sample splits below.
  const periodPayments = useMemo(() => {
    const now = new Date();
    return paymentsResource.data.filter((p) => {
      const d = new Date(p.createdAt);
      return report === 'daily'
        ? isSameLocalDay(p.createdAt, now)
        : d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    });
  }, [paymentsResource.data, report]);

  const verifiedPeriod = periodPayments.filter((p) => p.state === 'verified');
  // Queue: the selected period in live mode; demo keeps its full sample queue.
  const queue = live
    ? periodPayments.filter((p) => p.state === 'awaitingVerification')
    : paymentsResource.data.filter((p) => p.state === 'awaitingVerification');

  const collections = report === 'daily' ? (daily?.verifiedCollections ?? 0) : (month?.net ?? 0);
  const pendingAmount = queue.reduce((s, p) => s + p.payable, 0);
  const upi = live
    ? verifiedPeriod.filter((p) => p.method === 'upi').reduce((s, p) => s + p.payable, 0)
    : demoOwnershipReport.upi;
  const cash = live
    ? verifiedPeriod.filter((p) => p.method === 'cash').reduce((s, p) => s + p.payable, 0)
    : demoOwnershipReport.cash;

  // Membership KPIs — computed from the authorised member records.
  const totalMembers = members.length;
  const activeMembers = members.filter((m) => displayMembershipStatus(m) === 'active').length;

  const period = report === 'daily' ? daily : month;
  const attendance = period?.attendance ?? 0;
  const uniqueVisitors = period?.uniqueVisitors ?? 0;
  const newMembers = period?.newMembers ?? 0;
  const renewals = period?.renewals ?? 0;
  const discounts = period?.discounts ?? 0;
  const refunds = period?.refunds ?? 0;
  const applicationsPending = applicationsResource.data;
  const expiringMembers = members
    .filter((m) => displayMembershipStatus(m) === 'expiring')
    .slice(0, 2);

  // Measured deltas. Demo mode keeps reading the approved sample trends;
  // live mode compares the selected window with the previous window of the
  // same length, both from real bounded reads.
  const collectionsDelta = useMemo<StatDelta | undefined>(() => {
    if (live) return percentDelta(collectionsWindowTotal, previousCollectionsWindowTotal, 'WoW');
    const last = demoCollectionsTrend[demoCollectionsTrend.length - 1]?.value ?? 0;
    const before = demoCollectionsTrend[demoCollectionsTrend.length - 2]?.value ?? 0;
    return percentDelta(last, before, 'WoW');
  }, [live, collectionsWindowTotal, previousCollectionsWindowTotal]);

  const attendanceDelta = useMemo<StatDelta | undefined>(() => {
    if (live) {
      const lastDay = rangeWindow.days[rangeWindow.days.length - 1];
      const previousLastDay = previousWindow.days[previousWindow.days.length - 1];
      const now = countByDay(rangeAttendance, lastDay);
      const before = countByDay(previousAttendance, previousLastDay);
      return percentDelta(now, before, 'in window');
    }
    const last = demoAttendanceTrend[demoAttendanceTrend.length - 1]?.value ?? 0;
    const before = demoAttendanceTrend[0]?.value ?? 0;
    return percentDelta(last, before, 'in week');
  }, [live, rangeWindow, previousWindow, rangeAttendance, previousAttendance]);

  // Live period series: one point per local day of the selected window.
  const attendancePoints = useMemo<TrendPoint[]>(() => {
    if (!live) return demoAttendanceTrend;
    const points: TrendPoint[] = [];
    for (const d of rangeWindow.days) {
      points.push(trendPoint(d, countByDay(rangeAttendance, d)));
    }
    return points;
  }, [live, rangeWindow, rangeAttendance]);

  // Live collections series: per day when the window is a week, per Mon-start
  // week when it is longer. Only verified (net of reversals) rows feed it.
  const collectionsPoints = useMemo<TrendPoint[]>(() => {
    if (!live) return demoCollectionsTrend;
    const points: TrendPoint[] = [];
    if (rangeDays <= 7) {
      for (const d of rangeWindow.days) {
        points.push(trendPoint(d, daySum(d)));
      }
    } else {
      const weeks = new Map<string, { start: Date; total: number }>();
      for (const d of rangeWindow.days) {
        const weekStartOffset = (d.getDay() + 6) % 7;
        const ws = new Date(d.getFullYear(), d.getMonth(), d.getDate() - weekStartOffset);
        const weekKey = dayKeyOf(ws);
        const bucket = weeks.get(weekKey) ?? { start: ws, total: 0 };
        bucket.total += daySum(d);
        weeks.set(weekKey, bucket);
      }
      const sorted = [...weeks.values()].sort((a, b) => a.start.getTime() - b.start.getTime());
      for (const week of sorted) {
        points.push(
          trendPoint(week.start, week.total, `${WEEKDAY_SHORT[week.start.getDay()]} ${week.start.getDate()}`),
        );
      }
    }
    return points;
  }, [live, rangeWindow, rangeDays, daySum]);

  // Stage 8 — export: the current view's rows as CSV text (capped), then
  // shared through the platform share sheet after explicit confirmation.
  const exportRows = live ? rangePayments : periodPayments;
  const exportableRows = exportRows.slice(0, EXPORT_ROW_CAP);
  const exportCsv = (): string => {
    const lines = [['Date', 'Member', 'Type', 'Method', 'Amount', 'UTR', 'State', 'Receipt issued'].join(',')];
    for (const payment of exportableRows) {
      const d = new Date(payment.createdAt);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const type = payment.entryType === 'reversal' ? 'reversal' : 'payment';
      const cells = [
        dateStr,
        payment.memberName,
        type,
        payment.method,
        String(Math.round(payment.payable)),
        payment.utr ?? '',
        payment.state,
        payment.receiptIssued ? 'yes' : 'no',
      ];
      lines.push(
        cells
          .map((cell) => (/[",\n\r]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell))
          .join(','),
      );
    }
    return lines.join('\n');
  };

  const confirmExport = async () => {
    setExportBusy(true);
    setExportError(null);
    try {
      await Share.share({ message: exportCsv() });
      setExportOpen(false);
      setExportNotice(`Exported ${exportableRows.length} rows as CSV text through the device share sheet.`);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'The export could not be shared.');
    } finally {
      setExportBusy(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="light" />
      <Stack.Screen options={{ headerShown: false }} />
      <OwnerScreen
        title="Reports"
        eyebrow="Analytics"
        subtitle="Everyday ledger · verified numbers only"
        demo={!live}
        refreshControl={<DataRefreshControl refreshing={liveLoading} onRefresh={refreshAll} />}>
        {hasError && (
          <RiseIn style={{ marginTop: spacing.xs }}>
            <ErrorState
              title="Report data could not load"
              message={
                dailyResource.error ??
                monthlyResource.error ??
                paymentsResource.error ??
                membersResource.error ??
                'The report ledger is partially unavailable right now.'
              }
              onRetry={refreshAll}
            />
          </RiseIn>
        )}
        {live && liveLoading && !daily && !month ? (
          <RiseIn style={{ marginTop: spacing.xs }}>
            <SkeletonRow count={4} />
          </RiseIn>
        ) : null}
        <RiseIn style={{ marginTop: spacing.xs }}>
          <SegmentedTabs
            variant="owner"
            options={[
              { value: 'daily', label: 'Daily' },
              { value: 'monthly', label: 'Monthly' },
            ]}
            value={report}
            onChange={(v) => setReport(v as typeof report)}
          />
          <AppText variant="caption" style={{ color: colors.ownerInkMuted, marginTop: spacing.xs, fontWeight: '500' }}>
            {report === 'daily' ? 'Showing today’s verified ledger' : 'Showing the full month’s ledger'}
          </AppText>
          {live && (
            <View style={{ marginTop: spacing.xs }}>
              <SegmentedTabs
                variant="owner"
                size="small"
                options={[
                  { value: '7', label: '7 days' },
                  { value: '30', label: '30 days' },
                  { value: '90', label: '90 days' },
                ]}
                value={String(rangeDays)}
                onChange={(v) => setRangeDays(Number(v))}
              />
              <AppText variant="caption" style={{ color: colors.ownerInkSubtle, marginTop: spacing['3xs'] }}>
                Trend windows compare the selected period with the previous period of the same length; the ledger totals above stay on the Daily/Monthly view.
              </AppText>
            </View>
          )}
        </RiseIn>

        <RiseIn index={1}>
          <OwnerSection
            title="Collections"
            style={{ marginTop: spacing.md }}
            action={
              <Button
                label="Export CSV"
                icon="download-outline"
                size="small"
                variant="secondary"
                onPress={() => setExportOpen(true)}
              />
            }>
            <OwnerCard>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <AppText variant="caption" style={{ color: colors.ownerInkMuted, fontWeight: '600' }}>
                    Verified collection
                  </AppText>
                  <CountUp
                    value={collections}
                    format={formatCurrency}
                    variant="displayXL"
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    style={{ color: colors.ownerAccentDeep }}
                  />
                  <AppText variant="label" style={{ color: colors.ownerInkMuted, marginTop: spacing['3xs'] }}>
                    {live
                      ? report === 'daily'
                        ? 'Today · verified entries only'
                        : 'This month · verified entries only'
                      : report === 'daily'
                        ? 'sample ledger · not the demo payment records’ total'
                        : 'sample ledger · month window'}
                  </AppText>
                </View>
                <View style={{ alignItems: 'flex-end', gap: spacing.xs }}>
                  <OwnerStatusText label="Verified only" tone="up" />
                  {collectionsDelta && <OwnerDeltaPill delta={{ label: collectionsDelta.label, direction: collectionsDelta.direction }} surface="light" />}
                </View>
              </View>
            </OwnerCard>
            <View style={{ marginTop: spacing.sm }}>
              <OwnerStatRow>
                <OwnerStatTile label="UPI" tone="mint" value={formatCurrency(upi)} count={upi} countCurrency hint="Verified entries only" icon="phone-portrait-outline" />
                <OwnerStatTile label="Cash" tone="softBlue" value={formatCurrency(cash)} count={cash} countCurrency hint="Verified entries only" icon="cash-outline" />
              </OwnerStatRow>
            </View>
            <OwnerWell style={{ marginTop: spacing.sm }}>
              <AppText variant="caption" style={{ color: colors.ownerInk }}>
                <AppText variant="caption" style={{ color: colors.ownerWarningDeep, fontWeight: '700' }}>
                  {formatCurrency(pendingAmount)}
                </AppText>
                {' '}is in the verification queue. It is deliberately excluded from the ledger total: a submitted screenshot or UTR is not money until the check passes, and every correction lands as a reversal record in the audit trail.
              </AppText>
            </OwnerWell>
          </OwnerSection>
        </RiseIn>

        <RiseIn index={2}>
          <OwnerSection title="Membership and floor">
            <OwnerStatRow>
              <OwnerStatTile label="Total members" tone="blue" value={String(totalMembers)} count={totalMembers} icon="people-outline" />
              <OwnerStatTile label="Active members" tone="violet" value={String(activeMembers)} count={activeMembers} icon="person-outline" />
            </OwnerStatRow>
            <OwnerStatRow>
              <OwnerStatTile label="Attendance" tone="cyan" value={String(attendance)} count={attendance} hint={report === 'daily' ? 'Today’s recorded sessions' : 'Month’s recorded sessions'} icon="barbell-outline" />
              <OwnerStatTile label="Unique visitors" value={String(uniqueVisitors)} count={uniqueVisitors} hint="Different members" icon="footsteps-outline" />
            </OwnerStatRow>
            <OwnerStatRow>
              <OwnerStatTile label="New members" tone="violet" value={String(newMembers)} count={newMembers} icon="person-add-outline" />
              <OwnerStatTile label="Renewals" tone="mint" value={String(renewals)} count={renewals} icon="refresh-outline" />
              <OwnerStatTile label="Applications pending" tone="amber" value={String(applicationsPending)} count={applicationsPending} hint="Awaiting checks" icon="hourglass-outline" />
            </OwnerStatRow>
          </OwnerSection>
        </RiseIn>

        <RiseIn index={3}>
          <OwnerSection style={{ marginTop: spacing.md }}>
            {live ? (
              <>
                <OwnerChartCard
                  title={`Attendance, last ${rangeDays} days`}
                  delta={attendanceDelta ?? undefined}
                  caption="Verified check-ins per local day, from the selected window">
                  <LineChart points={attendancePoints} {...attendanceLineColors(colors)} />
                </OwnerChartCard>
                <View style={{ marginTop: spacing.sm }}>
                  <OwnerChartCard
                    title={`Collections, last ${rangeDays} days`}
                    delta={collectionsDelta ?? undefined}
                    caption="Verified net collections (reversals subtracted), from the selected window">
                    <BarChart
                      points={collectionsPoints}
                      accent={colors.ownerAccentDeep}
                      valueColor={colors.ownerInk}
                      labelColor={colors.ownerInkMuted}
                      gridColor={colors.ownerRule}
                      captionColor={colors.ownerInk}
                      subCaptionColor={colors.ownerInkSubtle}
                    />
                  </OwnerChartCard>
                </View>
              </>
            ) : (
              <>
                <OwnerChartCard title="Attendance, last 7 days" delta={attendanceDelta ? { label: attendanceDelta.label, direction: attendanceDelta.direction } : undefined}>
                  <LineChart points={demoAttendanceTrend} {...attendanceLineColors(colors)} />
                </OwnerChartCard>
                <View style={{ marginTop: spacing.sm }}>
                  <OwnerChartCard title="Collections by week" delta={collectionsDelta ? { label: collectionsDelta.label, direction: collectionsDelta.direction } : undefined}>
                    <BarChart
                      points={demoCollectionsTrend}
                      accent={colors.ownerAccentDeep}
                      valueColor={colors.ownerInk}
                      labelColor={colors.ownerInkMuted}
                      gridColor={colors.ownerRule}
                      captionColor={colors.ownerInk}
                      subCaptionColor={colors.ownerInkSubtle}
                    />
                  </OwnerChartCard>
                </View>
              </>
            )}
          </OwnerSection>
        </RiseIn>

        <RiseIn index={5}>
          <OwnerSection title="Adjustments, with their audit trail">
            <OwnerCard>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', minHeight: 34, alignItems: 'center' }}>
                <AppText variant="label" style={{ color: colors.ownerInkMuted }}>
                  Discounts authorised
                </AppText>
                <AppText variant="bodyStrong" style={{ color: colors.ownerInk }}>
                  {formatCurrency(discounts)}
                </AppText>
              </View>
              <OwnerRowDivider />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', minHeight: 34, alignItems: 'center' }}>
                <AppText variant="label" style={{ color: colors.ownerInkMuted }}>
                  Refunds (reversals)
                </AppText>
                <AppText variant="bodyStrong" style={{ color: colors.ownerErrorDeep }}>
                  {formatCurrency(refunds)}
                </AppText>
              </View>
              <OwnerRowDivider />
              {live ? (
                <AppText variant="caption" style={{ color: colors.ownerInkSubtle, paddingVertical: spacing.xs }}>
                  Actor-level authorisation details are not exposed by the current read-only views; the ledger totals above are derived from stored payment rows.
                </AppText>
              ) : (
                <ListRowChevron
                  label="Who authorised today"
                  value="3 entries"
                  onPress={() => setExplainOpen('adjustments')}
                />
              )}
            </OwnerCard>
          </OwnerSection>
        </RiseIn>

        <RiseIn index={6}>
          <OwnerSection title="Attention today">
            {expiringMembers.length === 0 && queue.length === 0 ? (
              <OwnerEmptyState
                icon="checkmark-circle-outline"
                title="Nothing needs attention"
                hint="No membership is in the renewal window and the verification queue is empty."
              />
            ) : (
              <OwnerListGroup label="Memberships ending soon">
                {expiringMembers.map((m, i) => (
                  <View key={m.id}>
                    {i > 0 && <OwnerRowDivider />}
                    <OwnerListRow
                      leading={<OwnerMemberAvatar name={m.name} />}
                      title={m.name}
                      detail="Renewal window open"
                      status={<OwnerStatusText label="Expiring" tone="warning" />}
                    />
                  </View>
                ))}
                {expiringMembers.length > 0 && <OwnerRowDivider />}
                <OwnerListRow
                  title="Verification queue"
                  detail={`${queue.length} ${queue.length === 1 ? 'entry' : 'entries'} · ${formatCurrency(pendingAmount)}`}
                  status={
                    queue.length > 0 ? (
                      <OwnerStatusText label="Action needed" tone="warning" />
                    ) : (
                      <OwnerStatusText label="Clear" tone="up" />
                    )
                  }
                />
              </OwnerListGroup>
            )}
          </OwnerSection>
        </RiseIn>

        <ModalSheet
          visible={explainOpen === 'adjustments'}
          onClose={() => setExplainOpen(null)}
          title="Discounts and reversals"
          subtitle="Every change names its actor">
          <AppText variant="label" style={{ color: colors.ownerInkMuted }}>
            Discounts carry the authoriser, the member, and the amount. Refunds are never edits: they are reversal records written as their own immutable rows, so the running total can always be replayed from the audit trail.
          </AppText>
          <AppText variant="caption" style={{ color: colors.ownerInkMuted, marginTop: spacing.xs }}>
            Staff and members cannot edit audit records; even the owner reads them rather than touches them.
          </AppText>
        </ModalSheet>

        <ModalSheet
          visible={exportOpen}
          onClose={() => {
            if (!exportBusy) setExportOpen(false);
          }}
          title="Export report rows"
          subtitle="Current view · CSV text">
          <AppText variant="body" style={{ color: colors.ownerInk }}>
            The export is CSV text built from the rows in this report view — date, member, type, method, amount, UTR, state and the receipt flag. Nothing is uploaded automatically; the text is handed to the device share sheet only after you confirm.
          </AppText>
          <AppText variant="caption" style={{ color: colors.ownerInkMuted, marginTop: spacing.xs }}>
            {exportRows.length} {exportRows.length === 1 ? 'row' : 'rows'} in the current view
            {exportRows.length > EXPORT_ROW_CAP ? ` · capped at ${EXPORT_ROW_CAP} rows for this export` : ''}. Credentials, raw JSON payloads and rows outside the selected scope are never included.
          </AppText>
          {exportError ? (
            <AppText variant="caption" style={{ color: colors.dangerStrong, marginTop: spacing.xs }}>
              The export failed: {exportError}
            </AppText>
          ) : null}
          {exportNotice ? (
            <AppText variant="caption" style={{ color: colors.ownerSuccessDeep, marginTop: spacing.xs }}>
              {exportNotice}
            </AppText>
          ) : null}
          <View style={{ height: spacing.xs }} />
          <Button
            label={exportBusy ? 'Preparing…' : 'Export CSV'}
            fullWidth
            disabled={exportBusy}
            onPress={() => void confirmExport()}
          />
          <View style={{ height: spacing.xs }} />
          <Button label="Cancel" variant="secondary" fullWidth disabled={exportBusy} onPress={() => setExportOpen(false)} />
        </ModalSheet>

        <AppText variant="caption" style={{ color: colors.ownerInkSubtle, marginTop: spacing.lg }} align="center">
          Monthly view reads the same ledger over the month window; the period choice never changes which rows are allowed to count.
        </AppText>
      </OwnerScreen>

      <OwnerBottomNavigation active="reports" />
    </View>
  );
}

function ListRowChevron(props: { label: string; value: string; onPress: () => void }) {
  return (
    <OwnerListRow
      title={props.label}
      detail={props.value}
      chevron
      onPress={props.onPress}
    />
  );
}
