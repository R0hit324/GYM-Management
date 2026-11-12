/**
 * Screen 7 — Everyday report (owner).
 *
 * The daily ledger: attendance, unique visitors, check-in events, new
 * members, renewals, verified collections split UPI/cash, pending
 * applications, discounts and refunds. Charts follow the researched pairings
 * (line for the week's attendance trend, bar for weekly collections).
 * Only verified money reads as collection; pending UPI entries count for
 * nothing here.
 */
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { Screen } from '@/components/scaffold';
import { AppText } from '@/components/ui/text';
import { Card, Section, Well } from '@/components/ui/card';
import { StatTile, StatRow, DeltaPill, type StatDelta } from '@/components/ui/stat-tile';
import { StatusBadge } from '@/components/ui/status-badge';
import { SegmentedTabs } from '@/components/ui/segmented-tabs';
import { ListGroup, ListRow, RowDivider, MemberAvatar } from '@/components/ui/list-row';
import { ModalSheet } from '@/components/ui/modal-sheet';
import { RiseIn } from '@/components/ui/rise-in';
import { LineChart } from '@/components/charts/line-chart';
import { BarChart } from '@/components/charts/bar-chart';
import { ChartCard } from '@/components/charts/chart-card';
import { WorkspaceMeta, SignOut } from '@/components/workspace-meta';
import { useTokens } from '@/hooks/use-tokens';
import { demoOwnershipReport, demoAttendanceTrend, demoCollectionsTrend, demoMembers, demoPayments } from '@/data/demo';
import { formatCurrency } from '@/utils/format';

/** Deltas are computed from the demo trends — never asserted. */
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
    <Screen
      title="Everyday report"
      subtitle={`${demoOwnershipReport.date} · verified numbers only`}
      demo
      roleTag="owner"
      actions={<SignOut />}>
      <WorkspaceMeta role="owner" demo />

      <RiseIn style={{ marginTop: spacing.md }}>
        <SegmentedTabs
          options={[
            { value: 'daily', label: 'Daily' },
            { value: 'monthly', label: 'Monthly' },
          ]}
          value={report}
          onChange={(v) => setReport(v as typeof report)}
        />
      </RiseIn>

      <RiseIn index={1}>
        <Section title="Collections" style={{ marginTop: spacing.md }}>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
              <View>
                <AppText variant="displayXL">{formatCurrency(collections)}</AppText>
                <AppText variant="label" tone="muted" style={{ marginTop: spacing['3xs'] }}>
                  {report === 'daily' ? 'verified today' : 'Verified collections show here before anything else counts.'}
                </AppText>
              </View>
              <View style={{ alignItems: 'flex-end', gap: spacing.xs }}>
                <StatusBadge label="Verified only" tone="success" small />
                {collectionsDelta && <DeltaPill delta={collectionsDelta} />}
              </View>
            </View>
          </Card>
          <View style={{ marginTop: spacing.sm }}>
            <StatRow>
            <StatTile label="UPI" value={formatCurrency(demoOwnershipReport.upi)} hint="Statement-checked" />
            <StatTile label="Cash" value={formatCurrency(demoOwnershipReport.cash)} hint="Counted at the desk" />
            </StatRow>
          </View>
          <Well style={{ marginTop: spacing.xs }}>
            <AppText variant="caption" tone="muted">
              {formatCurrency(pendingAmount)} is in the verification queue. It is deliberately excluded from the total: a submitted screenshot or UTR is not money until the check passes, and every correction lands as a reversal record in the audit trail.
            </AppText>
          </Well>
        </Section>
      </RiseIn>

      <RiseIn index={2}>
        <Section title="Membership and floor">
          <StatRow>
            <StatTile label="Total members" value={String(totalMembers)} />
            <StatTile label="Active members" value={String(activeMembers)} tone="success" />
          </StatRow>
          <StatRow>
            <StatTile label="Attendance" value={String(demoOwnershipReport.attendance)} hint="All recorded sessions" />
            <StatTile label="Unique visitors" value={String(demoOwnershipReport.uniqueVisitors)} hint="Different members" />
          </StatRow>
          <StatRow>
            <StatTile label="New members" value={String(demoOwnershipReport.newMembers)} tone="accent" />
            <StatTile label="Renewals" value={String(demoOwnershipReport.renewals)} />
            <StatTile label="Applications pending" value={String(demoOwnershipReport.pendingApplications)} tone="muted" hint="Awaiting checks" />
          </StatRow>
        </Section>
      </RiseIn>

      <RiseIn index={3}>
        <Section style={{ marginTop: spacing.md }}>
          <Card padded>
            <ChartCard title="Attendance, last 7 days" delta={attendanceDelta}>
              <LineChart points={demoAttendanceTrend} accent={colors.chartPrimary} />
            </ChartCard>
          </Card>
        </Section>
      </RiseIn>

      <RiseIn index={4}>
        <Section style={{ marginTop: spacing.md }}>
          <Card padded>
            <ChartCard title="Collections by week" delta={collectionsDelta}>
              <BarChart points={demoCollectionsTrend} />
            </ChartCard>
          </Card>
        </Section>
      </RiseIn>

      <RiseIn index={5}>
        <Section title="Adjustments, with their audit trail">
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', minHeight: 34, alignItems: 'center' }}>
              <AppText variant="label" tone="muted">
                Discounts authorised
              </AppText>
              <AppText variant="bodyStrong">{formatCurrency(demoOwnershipReport.discounts)}</AppText>
            </View>
            <RowDivider />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', minHeight: 34, alignItems: 'center' }}>
              <AppText variant="label" tone="muted">
                Refunds (reversals)
              </AppText>
              <AppText variant="bodyStrong">{formatCurrency(demoOwnershipReport.refunds)}</AppText>
            </View>
            <RowDivider />
            <ListRowChevron
              label="Who authorised today"
              value="3 entries"
              onPress={() => setExplainOpen('adjustments')}
            />
          </Card>
        </Section>
      </RiseIn>

      <RiseIn index={6}>
        <Section title="Attention today">
          <ListGroup label="Memberships ending soon">
            {demoMembers
              .filter((m) => m.status === 'expiring')
              .slice(0, 2)
              .map((m, i) => (
                <View key={m.id}>
                  {i > 0 && <RowDivider />}
                  <ListRow
                    leading={<MemberAvatar name={m.name} />}
                    title={m.name}
                    detail="Renewal window open"
                    status={<StatusBadge label="Expiring" tone="warning" small />}
                  />
                </View>
              ))}
            <RowDivider />
            <ListRow
              title="Verification queue"
              detail={`${wip.length} UPI ${wip.length === 1 ? 'entry' : 'entries'} · ${formatCurrency(pendingAmount)}`}
              status={<StatusBadge label="Action needed" tone="warning" small />}
            />
          </ListGroup>
        </Section>
      </RiseIn>

      <ModalSheet
        visible={explainOpen === 'adjustments'}
        onClose={() => setExplainOpen(null)}
        title="Discounts and reversals"
        subtitle="Every change names its actor">
        <AppText variant="label" tone="muted">
          Discounts carry the authoriser, the member, and the amount. Refunds are never edits: they are reversal records written as their own immutable rows, so the running total can always be replayed from the audit trail.
        </AppText>
        <AppText variant="caption" tone="muted" style={{ marginTop: spacing.xs }}>
          Staff and members cannot edit audit records; even the owner reads them rather than touches them.
        </AppText>
      </ModalSheet>

      <AppText variant="caption" tone="subtle" align="center" style={{ marginTop: spacing.lg }}>
        Monthly view reads the same ledger over the month window; the period choice never changes which rows are allowed to count.
      </AppText>
    </Screen>
  );
}

function ListRowChevron(props: { label: string; value: string; onPress: () => void }) {
  return (
    <ListRow
      title={props.label}
      detail={props.value}
      chevron
      onPress={props.onPress}
    />
  );
}
