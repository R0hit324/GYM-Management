/**
 * Screen 7 — Everyday report (owner).
 *
 * Fino-style owner theme: dark charcoal ground, white rounded panel.
 * Daily/monthly ledger: collections (UPI/cash, verification-queue exclusion),
 * membership KPIs, adjustments audit trail, "Attention today" list.
 * Demo mode shows the approved sample ledger; live mode reads v_daily_report,
 * v_month_revenue, payments, v_member_status and join_applications. Period
 * series charts have no backend source yet and are omitted in live mode
 * rather than filled with invented points.
 */
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppText } from '@/components/ui/text';
import { SegmentedTabs } from '@/components/ui/segmented-tabs';
import { ModalSheet } from '@/components/ui/modal-sheet';
import { RiseIn } from '@/components/ui/rise-in';
import { CountUp } from '@/components/ui/motion';
import { LineChart, attendanceLineColors } from '@/components/charts/line-chart';
import { BarChart } from '@/components/charts/bar-chart';
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
import {
  demoOwnershipReport,
  demoAttendanceTrend,
  demoCollectionsTrend,
} from '@/data/demo';
import {
  useDailyReport,
  useMembers,
  useMonthlyRevenue,
  usePayments,
  usePendingApplications,
} from '@/services/data';
import { displayMembershipStatus } from '@/utils/membership';
import { formatCurrency, isSameLocalDay } from '@/utils/format';

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

export default function OwnerReportScreen() {
  const tokens = useTokens();
  const { colors, spacing } = tokens;

  const [report, setReport] = useState<'daily' | 'monthly'>('daily');
  const [explainOpen, setExplainOpen] = useState<string | null>(null);

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

  // Measured deltas, from the demo trends: collections week-over-week, and
  // the week's attendance shape (last day vs first). Live mode has no
  // period-series source, so the charts are omitted instead of invented.
  const collectionsDelta = percentDelta(
    demoCollectionsTrend[demoCollectionsTrend.length - 1]?.value ?? 0,
    demoCollectionsTrend[demoCollectionsTrend.length - 2]?.value ?? 0,
    'WoW',
  );
  const attendanceDelta = percentDelta(
    demoAttendanceTrend[demoAttendanceTrend.length - 1]?.value ?? 0,
    demoAttendanceTrend[0]?.value ?? 0,
    'in week',
  );

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
        </RiseIn>

        <RiseIn index={1}>
          <OwnerSection title="Collections" style={{ marginTop: spacing.md }}>
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

        {live ? (
          <RiseIn index={3}>
            <OwnerSection style={{ marginTop: spacing.md }}>
              <OwnerWell>
                <AppText variant="caption" style={{ color: colors.ownerInk }}>
                  Period series charts are not part of the current read-only backend views, so they are omitted in live mode instead of showing sample points. The verified ledger above is real for the selected period.
                </AppText>
              </OwnerWell>
            </OwnerSection>
          </RiseIn>
        ) : (
          <>
            <RiseIn index={3}>
              <OwnerSection style={{ marginTop: spacing.md }}>
                <OwnerChartCard title="Attendance, last 7 days" delta={attendanceDelta ? { label: attendanceDelta.label, direction: attendanceDelta.direction } : undefined}>
                  <LineChart points={demoAttendanceTrend} {...attendanceLineColors(colors)} />
                </OwnerChartCard>
              </OwnerSection>
            </RiseIn>

            <RiseIn index={4}>
              <OwnerSection style={{ marginTop: spacing.md }}>
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
              </OwnerSection>
            </RiseIn>
          </>
        )}

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