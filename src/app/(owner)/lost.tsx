/**
 * Screen 8 — Lost member list (owner).
 *
 * Expired and inactive memberships. Inactivity is 30 consecutive days
 * without a successful check-in (business rule, computed server-side in
 * production; the demo rows are labelled samples). Follow-up status is
 * tracked per member with the actor recorded.
 */
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { Screen } from '@/components/scaffold';
import { AppText } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { Section, Well } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { SegmentedTabs, FilterChip } from '@/components/ui/segmented-tabs';
import { SearchBar } from '@/components/ui/search-bar';
import { ListGroup, ListRow, RowDivider, MemberAvatar } from '@/components/ui/list-row';
import { EmptyState } from '@/components/ui/feedback';
import { ModalSheet } from '@/components/ui/modal-sheet';
import { RiseIn } from '@/components/ui/rise-in';
import { WorkspaceMeta, SignOut } from '@/components/workspace-meta';
import { useTokens } from '@/hooks/use-tokens';
import { demoMembers } from '@/data/demo';
import { formatDate, daysBetween } from '@/utils/format';
import type { Member } from '@/types/domain';

const buckets = [
  { value: 'inactive', label: 'Inactive' },
  { value: 'expired', label: 'Expired' },
  { value: 'all', label: 'Both' },
];

const followUpLabels: Record<string, string> = {
  none: 'Not contacted',
  called: 'Called',
  messaged: 'Messaged',
  visited: 'Visited',
  won: 'Returned',
  lost: 'Closed as lost',
};

export default function LostMembersScreen() {
  const tokens = useTokens();
  const { spacing } = tokens;

  const [query, setQuery] = useState('');
  const [bucket, setBucket] = useState('inactive');
  const [onlyUntouched, setOnlyUntouched] = useState(false);
  const [selected, setSelected] = useState<Member | null>(null);
  const [logOpen, setLogOpen] = useState(false);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return demoMembers
      .filter((m) => {
        const end = m.membershipEnd ? daysBetween(m.membershipEnd) : null;
        const last = m.lastAttendance ? daysBetween(m.lastAttendance) : null;
        const inactive = last === null || last >= 30;
        const expired = end !== null && end < 0;
        if (bucket === 'inactive') return inactive && !expired;
        if (bucket === 'expired') return expired;
        return inactive || expired;
      })
      .filter((m) => m.followUp.status !== 'won' && m.followUp.status !== 'lost')
      .filter((m) => (onlyUntouched ? m.followUp.status === 'none' : true))
      .filter((m) => !q || m.name.toLowerCase().includes(q) || m.id.includes(q));
  }, [query, bucket, onlyUntouched]);

  return (
    <Screen
      title="Lost members"
      subtitle="30 days without a visit, or expiry without a return"
      demo
      roleTag="owner"
      actions={<SignOut />}>
      <WorkspaceMeta role="owner" demo />

      <RiseIn style={{ marginTop: spacing.md }}>
        <SearchBar label="Search lost members" value={query} onChange={setQuery} placeholder="Name or member ID" />
        <View style={{ marginTop: spacing.xs }}>
          <SegmentedTabs size="small" options={buckets} value={bucket} onChange={setBucket} />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm }}>
          <FilterChip label="Not contacted yet" selected={onlyUntouched} onPress={() => setOnlyUntouched((v) => !v)} />
        </View>
      </RiseIn>

      {rows.length === 0 ? (
        <EmptyState
          icon="people-outline"
          title={query ? 'No one matches' : 'Nothing here'}
          hint={
            query
              ? 'Try a shorter search or clear it.'
              : 'No member sits in this bucket today. The list fills as inactivity and expiry are detected.'
          }
          actionLabel="Clear search"
          onAction={() => setQuery('')}
        />
      ) : (
        <RiseIn index={1}>
          <Section title={`${rows.length} ${rows.length === 1 ? 'member' : 'members'} to follow up`}>
            <ListGroup label="Lost member list">
              {rows.map((m, i) => {
                const end = m.membershipEnd ? daysBetween(m.membershipEnd) : null;
                const last = m.lastAttendance ? daysBetween(m.lastAttendance) : null;
                return (
                  <View key={m.id}>
                    {i > 0 && <RowDivider />}
                    <ListRow
                      leading={<MemberAvatar name={m.name} />}
                      title={m.name}
                      detail={`${last !== null ? `${last} day${Math.abs(last) === 1 ? '' : 's'} since a visit` : 'No visits recorded'} · ${end !== null && end < 0 ? `expired ${formatDate(m.membershipEnd as string)}` : `ends ${formatDate(m.membershipEnd as string)}`}`}
                      status={
                        <StatusBadge
                          label={followUpLabels[m.followUp.status] ?? m.followUp.status}
                          tone={m.followUp.status === 'none' ? 'neutral' : m.followUp.status === 'won' ? 'success' : 'info'}
                          small
                        />
                      }
                      chevron
                      onPress={() => setSelected(m)}
                    />
                  </View>
                );
              })}
            </ListGroup>
          </Section>
        </RiseIn>
      )}

      <RiseIn index={2}>
        <Section title="How the list works">
          <Well>
            <AppText variant="caption" tone="muted">
              Inactivity is 30 consecutive days without a successful check-in. Expiry and inactivity are computed server-side from the attendance register; the owner sees the result but cannot hand-edit it. Follow-ups leave an audit trail naming who acted and when.
            </AppText>
          </Well>
        </Section>
      </RiseIn>

      <ModalSheet
        visible={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.name ?? ''}
        subtitle={selected ? selected.id.replace('m-', 'GB-') : undefined}
        toneBadge={selected ? <StatusBadge label={followUpLabels[selected.followUp.status] ?? 'Not contacted'} tone="neutral" small /> : undefined}>
        {selected && (
          <View style={{ gap: spacing.xs }}>
            <LineJustified label="Membership end" value={selected.membershipEnd ? formatDate(selected.membershipEnd) : 'None'} />
            <LineJustified label="Last attendance" value={selected.lastAttendance ? formatDate(selected.lastAttendance) : 'None recorded'} />
            <LineJustified label="Plan" value={selected.planId.replace('plan-', '')} />
            <LineJustified label="Follow-up" value={followUpLabels[selected.followUp.status] ?? selected.followUp.status} />
            {selected.followUp.note && (
              <AppText variant="caption" tone="muted">
                Note: {selected.followUp.note}
              </AppText>
            )}
            <View style={{ flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm, flexWrap: 'wrap' }}>
              <Button label="Mark called" size="small" icon="call-outline" variant="secondary" onPress={() => undefined} />
              <Button label="Mark messaged" size="small" icon="chatbubble-ellipses-outline" variant="secondary" onPress={() => undefined} />
              <Button label="Add follow-up note" size="small" variant="ghost" icon="create-outline" onPress={() => setLogOpen(true)} />
            </View>
            <AppText variant="caption" tone="subtle" style={{ marginTop: spacing.xs }}>
              Buttons are UI in this preview; writes land in the audit-logged backend (Part 9-10 polish).
            </AppText>
          </View>
        )}
      </ModalSheet>

      <ModalSheet
        visible={logOpen}
        onClose={() => setLogOpen(false)}
        title="Follow-up note"
        subtitle="Recorded with your name and time">
        <AppText variant="label" tone="muted">
          The real form writes an audit row: actor, member, note, timestamp. It cannot be edited or deleted afterwards — corrections are new rows.
        </AppText>
      </ModalSheet>

      <AppText variant="caption" tone="subtle" align="center" style={{ marginTop: spacing.lg }}>
        Won-backs move out of this list the day their renewal is verified, expiry or not.
      </AppText>
    </Screen>
  );
}

function LineJustified(props: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', minHeight: 30, alignItems: 'center' }}>
      <AppText variant="label" tone="muted">
        {props.label}
      </AppText>
      <AppText variant="label" style={{ fontWeight: '600', textAlign: 'right', flexShrink: 1 }}>
        {props.value}
      </AppText>
    </View>
  );
}
