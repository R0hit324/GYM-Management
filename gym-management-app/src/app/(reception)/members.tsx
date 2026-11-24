/**
 * Receptionist Members — search, buckets, today's attendance and the
 * gateway to each member's full profile.
 *
 * Search matches name, phone and member ID; the buckets follow the
 * centralized 7-day date rule (utils/membership) — frozen and
 * payment-pending are record states, everything else derives from the
 * membership end date. Selecting a member opens the dedicated Full
 * Member Profile screen; contact editing lives there (the one permitted
 * write) and membership state is never edited from this screen.
 *
 * Today's attendance block keeps events and unique members distinct:
 * the count is unique members, the list shows each attendee with their
 * check-in events, and both respect the search box above.
 */
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';

import { AppText } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { StatRow } from '@/components/ui/stat-tile';
import { SearchBar } from '@/components/ui/search-bar';
import { SegmentedTabs } from '@/components/ui/segmented-tabs';
import { ModalSheet } from '@/components/ui/modal-sheet';
import { RiseIn } from '@/components/ui/rise-in';
import { SignOut } from '@/components/workspace-meta';
import {
  WorkspaceScreen,
  WorkspaceBottomNavigation,
  WorkspaceSection,
  WorkspaceRowDivider,
  WorkspaceWell,
} from '@/components/workspace/workspace-ui';
import {
  OwnerStatTile,
  OwnerListGroup,
  OwnerListRow,
  OwnerMemberAvatar,
  OwnerStatusText,
  OwnerEmptyState,
} from '@/components/owner/owner-ui';
import { useTokens } from '@/hooks/use-tokens';
import { useSessionMembers } from '@/data/session';
import { useAttendance, useMembers, usePlans } from '@/services/data';
import { DataRefreshControl, ErrorState, SkeletonRow } from '@/components/ui/feedback';
import { displayMembershipStatus } from '@/utils/membership';
import { formatCurrency, formatTime, isSameLocalDay, memberDisplayId, pluralise } from '@/utils/format';
import type { MembershipStatus } from '@/types/domain';

const filters = [
  { value: 'active', label: 'Active' },
  { value: 'expiring', label: 'Expiring' },
  { value: 'expired', label: 'Expired' },
  { value: 'frozen', label: 'Frozen' },
  { value: 'pendingPayment', label: 'Pending pay' },
] as const;

type FilterValue = (typeof filters)[number]['value'];

const statusTone: Record<MembershipStatus, 'up' | 'down' | 'neutral' | 'warning' | 'action'> = {
  active: 'up',
  expiring: 'warning',
  expired: 'down',
  frozen: 'neutral',
  pendingPayment: 'action',
};

const statusLabel: Record<MembershipStatus, string> = {
  active: 'Active',
  expiring: 'Expiring',
  expired: 'Expired',
  frozen: 'Frozen',
  pendingPayment: 'Payment pending',
};

const navItems = [
  { key: 'home', label: 'Home', icon: 'home-outline', href: '/(reception)/home' },
  { key: 'members', label: 'Members', icon: 'people-outline', href: '/(reception)/members' },
  { key: 'more', label: 'More', icon: 'apps-outline', href: '/(reception)/more' },
] as const;

export default function ReceptionMembersScreen() {
  const tokens = useTokens();
  const { colors, spacing } = tokens;

  const membersResource = useMembers();
  const attendanceResource = useAttendance();
  const plansResource = usePlans();
  const sessionMembers = useSessionMembers();
  // Demo mode keeps the session store so contact edits staged elsewhere stay
  // visible; live mode reads the member directory from v_member_status.
  const members = membersResource.isLive ? membersResource.data : sessionMembers;
  const plans = plansResource.data;
  const liveLoading =
    membersResource.status === 'loading' ||
    attendanceResource.status === 'loading' ||
    plansResource.status === 'loading';
  const refreshAll = () => {
    membersResource.refresh();
    attendanceResource.refresh();
    plansResource.refresh();
  };
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterValue>('active');
  const [registerOpen, setRegisterOpen] = useState(false);

  // Bucket counts from the centralized date rule; frozen and payment-
  // pending are record states the date rule cannot express.
  const buckets = useMemo(() => {
    const counts = { active: 0, expiring: 0, expired: 0, frozen: 0, pendingPayment: 0 };
    for (const m of members) counts[displayMembershipStatus(m)]++;
    return counts;
  }, [members]);

  const todayEvents = useMemo(
    () => attendanceResource.data.filter((e) => isSameLocalDay(e.checkedInAt) && e.status !== 'failed'),
    [attendanceResource.data],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    return members
      .filter((m) => displayMembershipStatus(m) === filter)
      .filter(
        (m) =>
          !q ||
          m.name.toLowerCase().includes(q) ||
          m.phone.replace(/\s/g, '').toLowerCase().includes(q.replace(/\s/g, '')) ||
          (digits.length > 0 && (m.id.includes(digits) || m.phone.replace(/\D/g, '').includes(digits))),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [members, query, filter]);

  // Attendees today: unique members with their events, respecting the
  // same search so a search result instantly shows today's visit.
  const attendees = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    const byMember = new Map<string, typeof todayEvents>();
    for (const e of todayEvents) {
      const list = byMember.get(e.memberId) ?? [];
      list.push(e);
      byMember.set(e.memberId, list);
    }
    return [...byMember.entries()]
      .map(([id, events]) => ({ member: members.find((m) => m.id === id), events }))
      .filter(
        (a): a is { member: (typeof members)[number]; events: typeof todayEvents } =>
          !!a.member &&
          (!q ||
            a.member.name.toLowerCase().includes(q) ||
            a.member.phone.replace(/\s/g, '').toLowerCase().includes(q.replace(/\s/g, '')) ||
            (digits.length > 0 && (a.member.id.includes(digits) || a.member.phone.replace(/\D/g, '').includes(digits)))),
      )
      .sort((a, b) => a.member.name.localeCompare(b.member.name));
  }, [members, query, todayEvents]);

  return (
    <View style={{ flex: 1 }}>
      <WorkspaceScreen
        title="Members"
        eyebrow="Member directory"
        subtitle="Search, buckets and full profiles"
        demo={!membersResource.isLive}
        actions={<SignOut />}
        refreshControl={<DataRefreshControl refreshing={liveLoading} onRefresh={refreshAll} />}>
        {membersResource.status === 'error' && (
          <RiseIn>
            <ErrorState
              title="Members could not load"
              message={membersResource.error ?? 'The member directory is unavailable right now.'}
              onRetry={refreshAll}
            />
          </RiseIn>
        )}
        {attendanceResource.status === 'error' && (
          <RiseIn>
            <ErrorState
              title="Today's attendance could not load"
              message={attendanceResource.error ?? 'The attendance register is unavailable right now.'}
              onRetry={refreshAll}
              style={{ marginTop: spacing.sm }}
            />
          </RiseIn>
        )}
        {plansResource.status === 'error' && (
          <RiseIn>
            <ErrorState
              title="Membership plans could not load"
              message={plansResource.error ?? 'The plan catalogue is unavailable right now.'}
              onRetry={refreshAll}
              style={{ marginTop: spacing.sm }}
            />
          </RiseIn>
        )}
        {/* Bucket KPIs — the date rule, not stored flags */}
        <RiseIn>
          <StatRow>
            <OwnerStatTile label="Active" value={String(buckets.active)} count={buckets.active} tone="mint" icon="person-outline" />
            <OwnerStatTile label="Expiring" value={String(buckets.expiring)} count={buckets.expiring} tone="amber" icon="time-outline" />
            <OwnerStatTile label="Expired" value={String(buckets.expired)} count={buckets.expired} tone="red" icon="alert-circle-outline" />
          </StatRow>
        </RiseIn>

        <RiseIn index={1} style={{ marginTop: spacing.sm }}>
          <StatRow>
            <OwnerStatTile label="Frozen" value={String(buckets.frozen)} count={buckets.frozen} tone="cyan" icon="snow-outline" />
            <OwnerStatTile label="Payment pending" value={String(buckets.pendingPayment)} count={buckets.pendingPayment} tone="amber" icon="hourglass-outline" />
          </StatRow>
        </RiseIn>

        {/* Search + filters + register entry */}
        <RiseIn index={2} style={{ marginTop: spacing.sm }}>
          <SearchBar
            label="Search members by name, phone or member ID"
            value={query}
            onChange={setQuery}
            placeholder="Name, phone or member number"
          />
          <View style={{ marginTop: spacing.xs }}>
            <SegmentedTabs size="small" options={[...filters]} value={filter} onChange={(v) => setFilter(v as FilterValue)} />
          </View>
          <View style={{ marginTop: spacing.sm }}>
            <Button
              label="Register a member"
              icon="person-add-outline"
              variant="secondary"
              onPress={() => setRegisterOpen(true)}
              style={{ alignSelf: 'flex-start' }}
            />
          </View>
        </RiseIn>

        {/* Member list — every row opens the full profile */}
        {membersResource.status === 'loading' && members.length === 0 ? (
          <RiseIn index={3} style={{ marginTop: spacing.sm }}>
            <SkeletonRow count={5} />
          </RiseIn>
        ) : rows.length === 0 ? (
          <RiseIn index={3} style={{ marginTop: spacing.sm }}>
            <OwnerEmptyState
              icon="search-outline"
              title={query ? 'No one matches' : `No ${statusLabel[filter].toLowerCase()} members`}
              hint={query ? 'Try a shorter name, the member number, or a phone fragment.' : 'Switch the filter to review the other buckets.'}
              actionLabel={query ? 'Clear search' : 'Show active'}
              onAction={query ? () => setQuery('') : () => setFilter('active')}
            />
          </RiseIn>
        ) : (
          <RiseIn index={3} style={{ marginTop: spacing.sm }}>
            <WorkspaceSection title={`${rows.length} ${rows.length === 1 ? 'member' : 'members'}`}>
              <OwnerListGroup label="Members">
                {rows.map((m, i) => {
                  const plan = plans.find((p) => p.id === m.planId);
                  const memberTodayEvents = todayEvents.filter((e) => e.memberId === m.id).length;
                  return (
                    <View key={m.id}>
                      {i > 0 && <WorkspaceRowDivider />}
                      <OwnerListRow
                        leading={<OwnerMemberAvatar name={m.name} />}
                        title={m.name}
                        detail={`${memberDisplayId(m.id)} · ${m.phone}`}
                        status={<OwnerStatusText label={statusLabel[displayMembershipStatus(m)]} tone={statusTone[displayMembershipStatus(m)]} />}
                        chevron
                        onPress={() => router.push(`/(reception)/member-profile?id=${m.id}` as never)}
                      />
                      <AppText variant="caption" style={{ color: colors.ownerInkSubtle, marginTop: spacing['3xs'], marginLeft: 44 }}>
                        {plan?.name ?? m.planId} · {formatCurrency(m.priceLocked)} locked
                        {memberTodayEvents > 0 ? ` · attended today (${pluralise(memberTodayEvents, 'check-in', 'check-ins')})` : ''}
                      </AppText>
                    </View>
                  );
                })}
              </OwnerListGroup>
            </WorkspaceSection>
          </RiseIn>
        )}

        {/* Today's attendance — unique members, not scans */}
        <RiseIn index={4} style={{ marginTop: spacing.md }}>
          <WorkspaceSection title="Attended today">
            <StatRow>
              <OwnerStatTile
                label="Unique members today"
                value={String(attendees.length)}
                count={attendees.length}
                hint="Members, not scans"
                icon="people-outline"
                tone="violet"
              />
              <OwnerStatTile
                label="Check-in events today"
                value={String(todayEvents.length)}
                count={todayEvents.length}
                hint="Every scan — repeat visits included"
                icon="walk-outline"
                tone="cyan"
              />
            </StatRow>
            {attendanceResource.status === 'loading' && todayEvents.length === 0 ? (
              <SkeletonRow count={2} />
            ) : todayEvents.length === 0 ? (
              <OwnerEmptyState
                icon="enter-outline"
                title="No one has checked in yet today"
                hint="Attendees appear here as scans are recorded."
              />
            ) : attendees.length === 0 ? (
              <OwnerEmptyState
                icon="search-outline"
                title="No attendee matches"
                hint="No member who attended today matches that search."
                actionLabel="Clear search"
                onAction={() => setQuery('')}
              />
            ) : (
              <OwnerListGroup label="Attended today">
                {attendees.map((a, i) => {
                  const last = a.events.reduce((latest, e) => (e.checkedInAt > latest ? e.checkedInAt : latest), a.events[0].checkedInAt);
                  return (
                    <View key={a.member.id}>
                      {i > 0 && <WorkspaceRowDivider />}
                      <OwnerListRow
                        leading={<OwnerMemberAvatar name={a.member.name} />}
                        title={a.member.name}
                        detail={`${memberDisplayId(a.member.id)} · last in ${formatTime(last)}${a.events.length > 1 ? ` · ${a.events.length} visits` : ''}`}
                        chevron
                        onPress={() => router.push(`/(reception)/member-profile?id=${a.member.id}` as never)}
                      />
                    </View>
                  );
                })}
              </OwnerListGroup>
            )}
            <AppText variant="caption" style={{ color: colors.ownerInkSubtle, marginTop: spacing.xs }}>
              The count is unique members; repeat check-ins stay separate events. The list follows the search above.
            </AppText>
          </WorkspaceSection>
        </RiseIn>

        <RiseIn index={5} style={{ marginTop: spacing.md }}>
          <WorkspaceWell>
            <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
              Opening a member shows their full profile — contact, membership, payments, attendance and quick actions. Contact edits are staged in this session; membership state is never edited here.
            </AppText>
          </WorkspaceWell>
        </RiseIn>
      </WorkspaceScreen>

      {/* Register entry */}
      <ModalSheet
        visible={registerOpen}
        onClose={() => setRegisterOpen(false)}
        title="Register a member"
        subtitle="Members join through the online application">
        <AppText variant="body" style={{ color: colors.ownerInk }}>
          New members complete the joining flow themselves — identity, plan choice and contact verification are captured there, and the gym approves the application before a membership is created. The desk does not type members in directly.
        </AppText>
        <AppText variant="label" style={{ color: colors.ownerInkMuted, marginTop: spacing.xs }}>
          Once an application is approved (Part 2 backend), the new member appears in this list automatically.
        </AppText>
        <View style={{ marginTop: spacing.sm }}>
          <Button
            label="Open the joining flow"
            icon="arrow-forward-outline"
            onPress={() => {
              setRegisterOpen(false);
              router.push('/join' as never);
            }}
          />
        </View>
      </ModalSheet>

      <WorkspaceBottomNavigation active="members" items={navItems} />
    </View>
  );
}
