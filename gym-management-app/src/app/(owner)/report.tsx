/**
 * Screen 7 — Everyday report (owner).
 *
 * Fino-style owner theme: dark charcoal ground, white rounded panel.
 * Daily ledger: collections (UPI/cash, verification-queue exclusion),
 * membership KPIs, attendance trend, weekly collections bar chart,
 * adjustments audit trail, "Attention today" list.
 * All numbers are demo-labelled sample data; no backend exists in Part 1.
 */
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppText } from '@/components/ui/text';
import { SegmentedTabs } from '@/components/ui/segmented-tabs';
import { ModalSheet } from '@/components/ui/modal-sheet';
import { RiseIn } from '@/components/ui/rise-in';
import { LineChart } from '@/components/charts/line-chart';
import { BarChart } from '@/components/charts/bar-chart';
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
} from '@/components/owner/owner-ui';
import { useTokens } from '@/hooks/use-tokens';
import { demoOwnershipReport, demoAttendanceTrend, demoCollectionsTrend, demoMembers, demoPayments } from '@/data/demo';
import { formatCurrency } from '@/utils/format';

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

  const wip = useMemo(() => demoPayments.filter((p) => p.state === 'awaitingVerification'), []);

  const collections = demoOwnershipReport.verifiedCollections;
  const pendingAmount = wip.reduce((s, p) => s + p.payable, 0);

  // Membership KPIs — computed from the demo member records.
  const totalMembers = demoMembers.length;
  const activeMembers = demoMembers.filter((m) => m.status === 'active').length;

  // Measured deltas, from the demo trends: collections week-over-week, and
  // the week's attendance shape (last day vs first).
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
        subtitle="Everyday ledger · verified numbers only"
        demo>
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
                  <AppText variant="displayXL" numberOfLines={1} adjustsFontSizeToFit style={{ color: colors.ownerAccentDeep }}>
                    {formatCurrency(collections)}
                  </AppText>
                  <AppText variant="label" style={{ color: colors.ownerInkMuted, marginTop: spacing['3xs'] }}>
                    {report === 'daily' ? 'verified today' : 'for the month window'}
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
                <OwnerStatTile label="UPI" tone="mint" value={formatCurrency(demoOwnershipReport.upi)} hint="Statement-checked" icon="phone-portrait-outline" />
                <OwnerStatTile label="Cash" tone="softBlue" value={formatCurrency(demoOwnershipReport.cash)} hint="Counted at the desk" icon="cash-outline" />
              </OwnerStatRow>
            </View>
            <OwnerWell style={{ marginTop: spacing.sm }}>
              <AppText variant="caption" style={{ color: colors.ownerInk }}>
                <AppText variant="caption" style={{ color: colors.ownerWarningDeep, fontWeight: '700' }}>
                  {formatCurrency(pendingAmount)}
                </AppText>
                {' '}is in the verification queue. It is deliberately excluded from the total: a submitted screenshot or UTR is not money until the check passes, and every correction lands as a reversal record in the audit trail.
              </AppText>
            </OwnerWell>
          </OwnerSection>
        </RiseIn>

        <RiseIn index={2}>
          <OwnerSection title="Membership and floor">
            <OwnerStatRow>
              <OwnerStatTile label="Total members" tone="blue" value={String(totalMembers)} icon="people-outline" />
              <OwnerStatTile label="Active members" tone="violet" value={String(activeMembers)} icon="person-outline" />
            </OwnerStatRow>
            <OwnerStatRow>
              <OwnerStatTile label="Attendance" tone="cyan" value={String(demoOwnershipReport.attendance)} hint="All recorded sessions" icon="barbell-outline" />
              <OwnerStatTile label="Unique visitors" value={String(demoOwnershipReport.uniqueVisitors)} hint="Different members" icon="footsteps-outline" />
            </OwnerStatRow>
            <OwnerStatRow>
              <OwnerStatTile label="New members" tone="violet" value={String(demoOwnershipReport.newMembers)} icon="person-add-outline" />
              <OwnerStatTile label="Renewals" tone="mint" value={String(demoOwnershipReport.renewals)} icon="refresh-outline" />
              <OwnerStatTile label="Applications pending" tone="amber" value={String(demoOwnershipReport.pendingApplications)} hint="Awaiting checks" icon="hourglass-outline" />
            </OwnerStatRow>
          </OwnerSection>
        </RiseIn>

        <RiseIn index={3}>
          <OwnerSection style={{ marginTop: spacing.md }}>
            <OwnerChartCard title="Attendance, last 7 days" delta={attendanceDelta ? { label: attendanceDelta.label, direction: attendanceDelta.direction } : undefined}>
              <LineChart
                points={demoAttendanceTrend}
                accent={colors.ownerCyanDeep}
                valueColor={colors.ownerCyanDeep}
                labelColor={colors.ownerInkMuted}
                gridColor={colors.ownerRule}
                captionColor={colors.ownerInk}
                subCaptionColor={colors.ownerInkSubtle}
                dotFill={colors.ownerPanel}
              />
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

        <RiseIn index={5}>
          <OwnerSection title="Adjustments, with their audit trail">
            <OwnerCard>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', minHeight: 34, alignItems: 'center' }}>
                <AppText variant="label" style={{ color: colors.ownerInkMuted }}>
                  Discounts authorised
                </AppText>
                <AppText variant="bodyStrong" style={{ color: colors.ownerInk }}>
                  {formatCurrency(demoOwnershipReport.discounts)}
                </AppText>
              </View>
              <OwnerRowDivider />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', minHeight: 34, alignItems: 'center' }}>
                <AppText variant="label" style={{ color: colors.ownerInkMuted }}>
                  Refunds (reversals)
                </AppText>
                <AppText variant="bodyStrong" style={{ color: colors.ownerErrorDeep }}>
                  {formatCurrency(demoOwnershipReport.refunds)}
                </AppText>
              </View>
              <OwnerRowDivider />
              <ListRowChevron
                label="Who authorised today"
                value="3 entries"
                onPress={() => setExplainOpen('adjustments')}
              />
            </OwnerCard>
          </OwnerSection>
        </RiseIn>

        <RiseIn index={6}>
          <OwnerSection title="Attention today">
            <OwnerListGroup label="Memberships ending soon">
              {demoMembers
                .filter((m) => m.status === 'expiring')
                .slice(0, 2)
                .map((m, i) => (
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
              <OwnerRowDivider />
              <OwnerListRow
                title="Verification queue"
                detail={`${wip.length} UPI ${wip.length === 1 ? 'entry' : 'entries'} · ${formatCurrency(pendingAmount)}`}
                status={<OwnerStatusText label="Action needed" tone="warning" />}
              />
            </OwnerListGroup>
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