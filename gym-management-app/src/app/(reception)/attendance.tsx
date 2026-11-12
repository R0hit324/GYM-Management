/**
 * Screen 4 — Today's attendance (receptionist).
 *
 * The operations register: totals at the top, one row per check-in event
 * (members may check in more than once a day, each scan is its own row),
 * search and status filters, plus the attendance QR display the door shows.
 * Data is demo-only; real records arrive with the backend in Part 5.
 */
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { Screen } from '@/components/scaffold';
import { AppText } from '@/components/ui/text';
import { Card, Section } from '@/components/ui/card';
import { StatRow, StatTile } from '@/components/ui/stat-tile';
import { ActionGrid, ActionTile } from '@/components/ui/action-tile';
import { StatusBadge } from '@/components/ui/status-badge';
import { SegmentedTabs } from '@/components/ui/segmented-tabs';
import { SearchBar } from '@/components/ui/search-bar';
import { ListGroup, ListRow, RowDivider, MemberAvatar } from '@/components/ui/list-row';
import { ModalSheet } from '@/components/ui/modal-sheet';
import { QrDisplay } from '@/components/ui/qr-display';
import { EmptyState } from '@/components/ui/feedback';
import { RiseIn } from '@/components/ui/rise-in';
import { WorkspaceMeta, SignOut } from '@/components/workspace-meta';
import { useTokens } from '@/hooks/use-tokens';
import { router } from 'expo-router';
import { demoAttendance, demoAttendanceTrend, demoAttendanceQrPayload, demoPayments } from '@/data/demo';
import { formatTime, pluralise } from '@/utils/format';

const filters = [
  { value: 'all', label: 'All' },
  { value: 'verified', label: 'Recorded' },
  { value: 'failed', label: 'Failed' },
  { value: 'frozen', label: 'Frozen' },
];

export default function ReceptionAttendanceScreen() {
  const tokens = useTokens();
  const { spacing } = tokens;

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [qrOpen, setQrOpen] = useState(false);

  const rows = useMemo(() => {
    const today = demoAttendance;
    const q = query.trim().toLowerCase();
    return today.filter((e) => {
      const matchesQuery = !q || e.memberName.toLowerCase().includes(q) || e.memberIdDisplay.toLowerCase().includes(q);
      const matchesFilter = filter === 'all' || e.status === filter;
      return matchesQuery && matchesFilter;
    });
  }, [query, filter]);

  const checkIns = demoAttendance.filter((e) => e.status !== 'failed').length;
  const unique = new Set(demoAttendance.filter((e) => e.status !== 'failed').map((e) => e.memberId)).size;
  // Real count from the demo payment queue — drives the Fees tile badge.
  const pendingFees = demoPayments.filter((p) => p.state === 'awaitingVerification').length;

  return (
    <Screen
      title="Today's attendance"
      subtitle="Live register from the entrance"
      demo
      roleTag="reception"
      actions={<SignOut />}>
      <WorkspaceMeta role="reception" demo />

      <RiseIn style={{ marginTop: spacing.md }}>
        <StatRow>
          <StatTile label="Check-in events" value={String(checkIns)} hint="Multiple per member allowed" />
          <StatTile label="Unique visitors" value={String(unique)} hint="Members, not scans" />
        </StatRow>
      </RiseIn>

      <RiseIn index={1} style={{ marginTop: spacing.sm }}>
        {/* Coach Board quick actions: the door QR plus deep-links into the
            two sibling workspaces (existing routes, no new screens). */}
        <ActionGrid>
          <ActionTile
            icon="qr-code-outline"
            label="Attendance QR"
            tone="accent"
            badge="Door"
            onPress={() => setQrOpen(true)}
            accessibilityHint="Opens the demo attendance QR the door displays"
            style={{ flex: 1, minWidth: 104 }}
          />
          <ActionTile
            icon="cash-outline"
            label="Fees entry"
            badge={pendingFees > 0 ? String(pendingFees) : undefined}
            onPress={() => router.push('/(reception)/fees')}
            accessibilityHint="Opens the fees entry workspace tab"
            style={{ flex: 1, minWidth: 104 }}
          />
          <ActionTile
            icon="calendar-clear-outline"
            label="Renewals"
            onPress={() => router.push('/(reception)/renewals')}
            accessibilityHint="Opens the renewals workspace tab"
            style={{ flex: 1, minWidth: 104 }}
          />
        </ActionGrid>
        <AppText variant="caption" tone="muted" style={{ marginTop: spacing.xs }}>
          The QR is displayed at the door; it rotates every 45 seconds in production.
        </AppText>
      </RiseIn>

      <RiseIn index={2}>
        <Section title="Search and filter">
          <SearchBar label="Search members in the register" value={query} onChange={setQuery} placeholder="Name or member ID" />
          <View style={{ marginTop: spacing.xs }}>
            <SegmentedTabs
              size="small"
              options={filters}
              value={filter}
              onChange={setFilter}
            />
          </View>
        </Section>
      </RiseIn>

      <Section title={rows.length > 0 ? `${pluralise(rows.length, 'event', 'events')} shown` : 'Register'}>
        {rows.length === 0 && !query && filter === 'all' ? (
          <EmptyState
            icon="enter-outline"
            title="The register is empty"
            hint="Scans appear here as members check in."
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon="search-outline"
            title="No matching events"
            hint="No check-in matches that search or filter. Clear them to see the full register."
            actionLabel="Clear search and filters"
            onAction={() => {
              setQuery('');
              setFilter('all');
            }}
          />
        ) : (
          <RiseIn index={3}>
            <ListGroup label="Today's check-in events">
              {rows.map((e, i) => (
                <View key={e.id}>
                  {i > 0 && <RowDivider />}
                  <ListRow
                    leading={<MemberAvatar name={e.memberName} />}
                    title={e.memberName}
                    detail={`${e.memberIdDisplay} · ${formatTime(e.checkedInAt)} · ${e.door}`}
                    status={
                      <StatusBadge
                        label={e.status === 'verified' ? 'Recorded' : e.status === 'frozen' ? 'Frozen' : 'Failed'}
                        tone={e.status === 'verified' ? 'success' : e.status === 'frozen' ? 'info' : 'danger'}
                        small
                      />
                    }
                  />
                </View>
              ))}
            </ListGroup>
          </RiseIn>
        )}
      </Section>

      <Section title="Last week's shape">
        <RiseIn index={4}>
          <Card padded>
            <SimpleSparkline values={demoAttendanceTrend.map((t) => t.value)} labels={demoAttendanceTrend.map((t) => t.label)} />
            <AppText variant="caption" tone="muted" style={{ marginTop: spacing.xs }}>
              Sessions per day, last 7 days, demo data.
            </AppText>
          </Card>
        </RiseIn>
      </Section>

      <ModalSheet
        visible={qrOpen}
        onClose={() => setQrOpen(false)}
        title="Attendance QR"
        subtitle="Show this at the entrance for members to scan"
        toneBadge={<StatusBadge label="Demo payload" tone="warning" small />}>
        <QrDisplay
          payload={demoAttendanceQrPayload}
          caption="Real attendance codes are generated server-side, hash-stored and expire in 45 seconds (Part 5). This one is deliberately inert."
        />
        <View style={{ marginTop: spacing.md, gap: spacing.xs }}>
          <AppText variant="label" tone="muted">
            Door checklist
          </AppText>
          <CheckLine text="Screen at eye level, brightness up" />
          <CheckLine text="Fresh token every 45 seconds in production" />
          <CheckLine text="Failed or expired scans send the member to the desk" />
        </View>
      </ModalSheet>

      <AppText variant="caption" tone="subtle" align="center" style={{ marginTop: spacing.lg }}>
        Every row is one check-in event. Frozen memberships record visits as frozen, never as attendance.
      </AppText>
    </Screen>
  );
}

function CheckLine(props: { text: string }) {
  const tokens = useTokens();
  const { spacing } = tokens;
  return (
    <View style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'flex-start' }}>
      <AppText variant="label" tone="accent" style={{ marginTop: spacing['3xs'] * -1 }}>
        ·
      </AppText>
      <AppText variant="label" tone="muted" style={{ flex: 1 }}>
        {props.text}
      </AppText>
    </View>
  );
}

/** Tiny inline bar strip (not a formal chart; labels carry the values). */
function SimpleSparkline({ values, labels }: { values: number[]; labels: string[] }) {
  const tokens = useTokens();
  const { colors, spacing } = tokens;
  const max = Math.max(...values, 1);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.xxs, height: 64 }}>
      {values.map((v, i) => (
        <View key={i} style={{ flex: 1, alignItems: 'center', gap: spacing['3xs'] }}>
          <AppText variant="caption" tone="muted" style={{ fontSize: 10 }}>
            {v}
          </AppText>
          <View
            style={{
              width: '100%',
              backgroundColor: i === values.length - 1 ? colors.chartPrimary : colors.surfaceAlt,
              height: Math.max(6, Math.round((v / max) * 44)),
            }}
          />
          <AppText variant="caption" tone="subtle" style={{ fontSize: 10 }}>
            {labels[i]}
          </AppText>
        </View>
      ))}
    </View>
  );
}
