/**
 * Screen 8 — Lost member list (owner).
 *
 * Fino-style owner theme: dark charcoal ground, white rounded panel.
 * Expired and inactive memberships. Inactivity is 30 consecutive days
 * without a successful check-in (business rule, computed server-side).
 * Demo mode reads the approved demo records; live mode reads
 * v_inactive_members, which supplies the server-computed inactivity days.
 * Follow-up status is tracked per member with the actor recorded.
 */
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppText } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { SegmentedTabs, FilterChip } from '@/components/ui/segmented-tabs';
import { SearchBar } from '@/components/ui/search-bar';
import { ModalSheet } from '@/components/ui/modal-sheet';
import { RiseIn } from '@/components/ui/rise-in';
import { TextField } from '@/components/ui/text-field';
import { SignOut } from '@/components/workspace-meta';
import {
  OwnerScreen,
  OwnerBottomNavigation,
  OwnerStatusText,
  OwnerSection,
  OwnerWell,
  OwnerListGroup,
  OwnerListRow,
  OwnerRowDivider,
  OwnerMemberAvatar,
  OwnerEmptyState,
} from '@/components/owner/owner-ui';
import { useTokens } from '@/hooks/use-tokens';
import { useAuth } from '@/services/auth';
import {
  useInactiveMembers,
  usePlans,
  recordFollowUp,
} from '@/services/data';
import { DataRefreshControl, ErrorState, SkeletonRow } from '@/components/ui/feedback';
import { formatDate, daysBetween, memberDisplayId } from '@/utils/format';
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
  const { colors, spacing } = tokens;

  const [query, setQuery] = useState('');
  const [bucket, setBucket] = useState<'inactive' | 'expired' | 'all'>('inactive');
  const [onlyUntouched, setOnlyUntouched] = useState(false);
  const [selected, setSelected] = useState<Member | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [followUpChannel, setFollowUpChannel] = useState<'called' | 'messaged' | 'visited'>('called');
  const [followUpOutcome, setFollowUpOutcome] = useState<'won' | 'lost' | 'open'>('open');
  const [followUpNote, setFollowUpNote] = useState('');
  const [followUpSaving, setFollowUpSaving] = useState(false);
  const [followUpError, setFollowUpError] = useState<string | null>(null);
  const [followUpSuccess, setFollowUpSuccess] = useState(false);

  const inactiveResource = useInactiveMembers();
  const plansResource = usePlans();
  const inactiveMembers = inactiveResource.data;
  const live = inactiveResource.isLive;
  const { session } = useAuth();

  const recordFollowUpNow = async (member: Member) => {
    if (!live) {
      // Demo mode keeps its approved demo follow-ups; the server write path
      // (follow_up_events) is live-only.
      setFollowUpError('Demo mode cannot record follow-ups.');
      return;
    }
    const outcome =
      followUpOutcome === 'won'
        ? 'won'
        : followUpOutcome === 'lost'
          ? 'lost'
          : 'open';
    const channel: 'called' | 'messaged' | 'visited' =
      followUpChannel === 'called' ? 'called' : followUpChannel === 'messaged' ? 'messaged' : 'visited';
    setFollowUpSaving(true);
    setFollowUpError(null);
    setFollowUpSuccess(false);
    const result = await recordFollowUp({
      actor: session?.userId ?? '',
      memberId: member.id,
      channel,
      outcome,
      note: followUpNote,
    });
    setFollowUpSaving(false);
    if (!result.ok) {
      setFollowUpError(result.error);
      return;
    }
    setFollowUpSuccess(true);
    // Refresh the list so the new follow-up state is reflected.
    inactiveResource.refresh();
  };

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return inactiveMembers
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
  }, [inactiveMembers, query, bucket, onlyUntouched]);

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="light" />
      <Stack.Screen options={{ headerShown: false }} />
      <OwnerScreen
        title="Lost Members"
        eyebrow="Retention"
        subtitle="30 days without a visit, or expiry without a return"
        demo={!live}
        actions={<SignOut />}
        refreshControl={<DataRefreshControl refreshing={inactiveResource.status === 'loading'} onRefresh={inactiveResource.refresh} />}>
        {inactiveResource.status === 'error' && (
          <RiseIn style={{ marginTop: spacing.xs }}>
            <ErrorState
              title="Lost members could not load"
              message={inactiveResource.error ?? 'The inactivity list is unavailable right now.'}
              onRetry={inactiveResource.refresh}
            />
          </RiseIn>
        )}
        <RiseIn style={{ marginTop: spacing.xs }}>
          <SearchBar label="Search lost members" value={query} onChange={setQuery} placeholder="Name or member ID" />
          <View style={{ marginTop: spacing.xs }}>
            <SegmentedTabs size="small" variant="owner" options={buckets} value={bucket} onChange={(v) => setBucket(v as typeof bucket)} />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm }}>
            <FilterChip variant="owner" label="Not contacted yet" selected={onlyUntouched} onPress={() => setOnlyUntouched((v) => !v)} />
          </View>
          <AppText variant="caption" style={{ color: colors.ownerInkMuted, marginTop: spacing.xs, fontWeight: '500' }}>
            {bucket === 'inactive' ? 'Showing inactive members' : bucket === 'expired' ? 'Showing expired memberships' : 'Showing inactive and expired'}
          </AppText>
        </RiseIn>

        {inactiveResource.status === 'loading' && inactiveMembers.length === 0 ? (
          <RiseIn style={{ marginTop: spacing.sm }}>
            <SkeletonRow count={4} />
          </RiseIn>
        ) : rows.length === 0 ? (
          <OwnerEmptyState
            icon="people-outline"
            title={query ? 'No one matches' : 'Nothing to follow up'}
            hint={
              query
                ? 'Try a shorter search or clear it.'
                : 'No member sits in this bucket today. The list fills as inactivity and expiry are detected.'
            }
            actionLabel={query ? 'Clear search' : undefined}
            onAction={query ? () => setQuery('') : undefined}
          />
        ) : (
          <RiseIn index={1}>
            <OwnerSection title={`${rows.length} ${rows.length === 1 ? 'member' : 'members'} to follow up`}>
              <OwnerListGroup label="Lost member list">
                {rows.map((m, i) => {
                  const end = m.membershipEnd ? daysBetween(m.membershipEnd) : null;
                  const last = m.lastAttendance ? daysBetween(m.lastAttendance) : null;
                  return (
                    <View key={m.id}>
                      {i > 0 && <OwnerRowDivider />}
                      <OwnerListRow
                        leading={<OwnerMemberAvatar name={m.name} />}
                        title={m.name}
                        detail={`${memberDisplayId(m.id)} · ${last !== null ? `${last} day${Math.abs(last) === 1 ? '' : 's'} since a visit` : 'No visits recorded'} · ${m.membershipEnd ? (end !== null && end < 0 ? `expired ${formatDate(m.membershipEnd)}` : `ends ${formatDate(m.membershipEnd)}`) : 'no end date recorded'}`}
                        status={
                          <OwnerStatusText
                            label={followUpLabels[m.followUp.status] ?? m.followUp.status}
                            tone={m.followUp.status === 'none' ? 'neutral' : m.followUp.status === 'won' ? 'up' : 'action'}
                          />
                        }
                        chevron
                        onPress={() => setSelected(m)}
                      />
                    </View>
                  );
                })}
              </OwnerListGroup>
            </OwnerSection>
          </RiseIn>
        )}

        <RiseIn index={2}>
          <OwnerSection title="How the list works">
            <OwnerWell>
              <AppText variant="caption" style={{ color: colors.ownerInk }}>
                Inactivity is 30 consecutive days without a successful check-in. Expiry and inactivity are computed server-side from the attendance register; the owner sees the result but cannot hand-edit it. Follow-ups leave an audit trail naming who acted and when.
              </AppText>
            </OwnerWell>
          </OwnerSection>
        </RiseIn>

        <ModalSheet
          visible={!!selected}
          onClose={() => setSelected(null)}
          title={selected?.name ?? ''}
          subtitle={selected ? memberDisplayId(selected.id) : undefined}
          toneBadge={selected ? <OwnerStatusText label={followUpLabels[selected.followUp.status] ?? 'Not contacted'} tone="neutral" /> : undefined}>
          {selected && (
            <View style={{ gap: spacing.xs }}>
              <LineJustified label="Membership end" value={selected.membershipEnd ? formatDate(selected.membershipEnd) : 'None'} />
              <LineJustified label="Last attendance" value={selected.lastAttendance ? formatDate(selected.lastAttendance) : 'None recorded'} />
              <LineJustified label="Plan" value={plansResource.data.find((p) => p.id === selected.planId)?.name ?? (selected.planId ? 'Plan not in the current list' : 'Not recorded')} />
              <LineJustified label="Follow-up" value={followUpLabels[selected.followUp.status] ?? selected.followUp.status} />
              {selected.followUp.note && (
                <AppText variant="caption" style={{ color: tokens.colors.ownerInkMuted }}>
                  Note: {selected.followUp.note}
                </AppText>
              )}
              <View style={{ flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm, flexWrap: 'wrap' }}>
                <Button label={followUpSaving ? 'Recording…' : 'Mark called'} size="small" icon="call-outline" variant="secondary" disabled={followUpSaving} onPress={() => void recordFollowUpNow(selected)} />
                <Button label={followUpSaving ? 'Recording…' : 'Mark messaged'} size="small" icon="chatbubble-ellipses-outline" variant="secondary" disabled={followUpSaving} onPress={() => void recordFollowUpNow(selected)} />
                <Button label={followUpSaving ? 'Recording…' : 'Add follow-up note'} size="small" variant="ghost" icon="create-outline" disabled={followUpSaving} onPress={() => { setLogOpen(true); setFollowUpNote(''); }} />
              </View>
              {followUpError ? (
                <AppText variant="caption" style={{ color: tokens.colors.ownerErrorDeep, marginTop: spacing.xs }}>
                  The server refused the follow-up: {followUpError}
                </AppText>
              ) : null}
              {followUpSuccess ? (
                <AppText variant="caption" style={{ color: tokens.colors.ownerSuccessDeep, marginTop: spacing.xs }}>
                  The follow-up was recorded and appears in the list.
                </AppText>
              ) : null}
            </View>
          )}
        </ModalSheet>

        <ModalSheet
          visible={logOpen}
          onClose={() => setLogOpen(false)}
          title="Follow-up note"
          subtitle="Recorded with your name and time">
          <View style={{ gap: spacing.xs }}>
            <AppText variant="label" style={{ color: tokens.colors.ownerInkMuted }}>
              Record the follow-up against this member. The server writes the actor and timestamp; corrections are new rows, never edits.
            </AppText>
            <TextField label="Channel" value={followUpChannel} onChangeText={(v) => setFollowUpChannel(v as 'called' | 'messaged' | 'visited')} />
            <TextField label="Outcome" value={followUpOutcome} onChangeText={(v) => setFollowUpOutcome(v as 'won' | 'lost' | 'open')} />
            <TextField label="Note" value={followUpNote} onChangeText={setFollowUpNote} />
            <Button
              label={followUpSaving ? 'Saving…' : 'Save follow-up'}
              fullWidth
              disabled={followUpSaving}
              onPress={() => {
                if (selected) {
                  void recordFollowUpNow(selected);
                }
              }}
            />
            {followUpError ? (
              <AppText variant="caption" style={{ color: tokens.colors.ownerErrorDeep }}>
                The server refused the follow-up: {followUpError}
              </AppText>
            ) : null}
          </View>
        </ModalSheet>

        <AppText variant="caption" style={{ color: tokens.colors.ownerInkSubtle, marginTop: spacing.lg }} align="center">
          Won-backs move out of this list the day their renewal is verified, expiry or not.
        </AppText>
      </OwnerScreen>

      <OwnerBottomNavigation active="more" />
    </View>
  );
}

function LineJustified(props: { label: string; value: string }) {
  const tokens = useTokens();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', minHeight: 30, alignItems: 'center' }}>
      <AppText variant="label" style={{ color: tokens.colors.ownerInkMuted }}>
        {props.label}
      </AppText>
      <AppText variant="label" style={{ fontWeight: '600', textAlign: 'right', flexShrink: 1, color: tokens.colors.ownerInk }}>
        {props.value}
      </AppText>
    </View>
  );
}