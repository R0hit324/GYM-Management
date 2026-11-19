/**
 * Screen 6 — Renewal list (receptionist).
 *
 * Expiring and expired memberships with contact and follow-up actions.
 * Freeze requests are visible here too: freezes extend validity only when
 * approved (business rule, enforced server-side in later parts).
 *
 * Theme unification: shared Fino workspace chrome + Owner light-panel
 * primitives; KPI tiles carry semantic accents (amber = expiring, red =
 * expired, cyan = frozen) with moderate count-ups.
 */
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { router } from 'expo-router';

import { AppText } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { StatRow } from '@/components/ui/stat-tile';
import { StatusBadge } from '@/components/ui/status-badge';
import { SegmentedTabs } from '@/components/ui/segmented-tabs';
import { SearchBar } from '@/components/ui/search-bar';
import { ModalSheet } from '@/components/ui/modal-sheet';
import { RiseIn } from '@/components/ui/rise-in';
import { SignOut } from '@/components/workspace-meta';
import {
  WorkspaceScreen,
  WorkspaceBottomNavigation,
  WorkspaceSection,
  WorkspaceRowDivider,
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
import { useMembers } from '@/services/data';
import { DataRefreshControl, ErrorState, SkeletonRow } from '@/components/ui/feedback';
import { formatDate, daysBetween, memberDisplayId } from '@/utils/format';
import type { Member } from '@/types/domain';

const filters = [
  { value: 'expiring', label: 'Expiring' },
  { value: 'expired', label: 'Expired' },
  { value: 'frozen', label: 'Frozen' },
  { value: 'all', label: 'All' },
];

const navItems = [
  { key: 'home', label: 'Home', icon: 'home-outline', href: '/(reception)/home' },
  { key: 'members', label: 'Members', icon: 'people-outline', href: '/(reception)/members' },
  { key: 'more', label: 'More', icon: 'apps-outline', href: '/(reception)/more' },
] as const;

export default function RenewalsScreen() {
  const tokens = useTokens();
  const { colors, spacing } = tokens;

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('expiring');
  const [selected, setSelected] = useState<Member | null>(null);
  const [contactOpen, setContactOpen] = useState(false);

  const membersResource = useMembers();
  const sessionMembers = useSessionMembers();
  // Demo mode keeps the session store so contact edits remain visible.
  const members = membersResource.isLive ? membersResource.data : sessionMembers;

  // Bucket counts for the KPI row — computed from the member records,
  // same rules as the list filters below. Never asserted.
  const buckets = useMemo(() => {
    let expiring = 0;
    let expired = 0;
    let frozen = 0;
    for (const m of members) {
      if (m.status === 'frozen') frozen++;
      const end = m.membershipEnd ? daysBetween(m.membershipEnd) : null;
      if (end !== null && end >= 0 && end <= 7) expiring++;
      else if (end !== null && end < 0) expired++;
    }
    return { expiring, expired, frozen };
  }, [members]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members
      .filter((m) => {
        if (filter === 'all') return true;
        if (filter === 'frozen') return m.status === 'frozen';
        // Expiring: ends within 7 days. Expired: end date in the past.
        const end = m.membershipEnd ? daysBetween(m.membershipEnd) : null;
        if (filter === 'expiring') return end !== null && end >= 0 && end <= 7;
        return end !== null && end < 0;
      })
      .filter((m) => !q || m.name.toLowerCase().includes(q) || m.id.includes(q));
  }, [members, query, filter]);

  return (
    <View style={{ flex: 1 }}>
      <WorkspaceScreen
        title="Renewals"
        eyebrow="Memberships"
        subtitle="Who is running out, and who is already out"
        demo={!membersResource.isLive}
        actions={<SignOut />}
        refreshControl={
          <DataRefreshControl
            refreshing={membersResource.status === 'loading'}
            onRefresh={membersResource.refresh}
          />
        }>
        {membersResource.status === 'error' && (
          <RiseIn>
            <ErrorState
              title="Renewals could not load"
              message={membersResource.error ?? 'The membership register is unavailable right now.'}
              onRetry={membersResource.refresh}
            />
          </RiseIn>
        )}
        {/* KPI row: bucket sizes, computed from the member records (audit #7) */}
        <RiseIn>
          <StatRow>
            <OwnerStatTile label="Expiring in 7 days" value={String(buckets.expiring)} count={buckets.expiring} tone="amber" icon="time-outline" />
            <OwnerStatTile label="Expired" value={String(buckets.expired)} count={buckets.expired} tone="red" icon="alert-circle-outline" />
            <OwnerStatTile label="Frozen" value={String(buckets.frozen)} count={buckets.frozen} tone="cyan" icon="snow-outline" />
          </StatRow>
        </RiseIn>

        <RiseIn style={{ marginTop: spacing.sm }}>
          <SearchBar label="Search renewal members" value={query} onChange={setQuery} placeholder="Name or member ID" />
          <View style={{ marginTop: spacing.xs }}>
            <SegmentedTabs variant="owner" size="small" options={filters} value={filter} onChange={setFilter} />
          </View>
        </RiseIn>

        {membersResource.status === 'loading' && members.length === 0 ? (
          <RiseIn style={{ marginTop: spacing.sm }}>
            <SkeletonRow count={4} />
          </RiseIn>
        ) : rows.length === 0 ? (
          <OwnerEmptyState
            icon="calendar-clear-outline"
            title={query ? 'No one matches' : 'Nothing in this bucket'}
            hint={
              query
                ? 'Try a shorter name or the member number.'
                : 'No membership ends in this window. Switch the filter to review other buckets.'
            }
            actionLabel={query ? 'Clear search' : 'Show all'}
            onAction={() => {
              setQuery('');
              setFilter('all');
            }}
          />
        ) : (
          <RiseIn index={1}>
            <WorkspaceSection title={`${rows.length} ${rows.length === 1 ? 'membership' : 'memberships'}`}>
              <OwnerListGroup label="Renewal list">
                {rows.map((m, i) => {
                  const end = m.membershipEnd ? daysBetween(m.membershipEnd) : null;
                  const expired = end !== null && end < 0;
                  return (
                    <View key={m.id}>
                      {i > 0 && <WorkspaceRowDivider />}
                      <OwnerListRow
                        leading={<OwnerMemberAvatar name={m.name} />}
                        title={m.name}
                        detail={
                          m.membershipEnd
                            ? expired
                              ? `Expired ${formatDate(m.membershipEnd)} · ${memberDisplayId(m.id)}`
                              : `Ends ${formatDate(m.membershipEnd)} · ${end} day${end === 1 ? '' : 's'} left · ${memberDisplayId(m.id)}`
                            : `No active validity · ${memberDisplayId(m.id)}`
                        }
                        status={
                          <OwnerStatusText
                            label={expired ? 'Expired' : m.status === 'frozen' ? 'Frozen' : 'Expiring soon'}
                            tone={expired ? 'down' : m.status === 'frozen' ? 'neutral' : 'warning'}
                          />
                        }
                        chevron
                        onPress={() => setSelected(m)}
                      />
                    </View>
                  );
                })}
              </OwnerListGroup>
            </WorkspaceSection>
          </RiseIn>
        )}

        <RiseIn index={2}>
          <WorkspaceSection title="Working the list">
            <View style={{ gap: spacing.xs }}>
              <RowLine
                tone="warning"
                title="Expiring bucket"
                body="Contact early: renewals agreed before the end date keep the member's locked price."
              />
              <RowLine
                tone="danger"
                title="Expired bucket"
                body="Membership stops; attendance shows it. A renewal reactivates after full payment verification."
              />
              <RowLine
                tone="info"
                title="Freeze requests"
                body="The desk submits freeze requests; the Owner approves or rejects them. Only approved freezes extend validity, within limits the Owner sets."
              />
            </View>
            <AppText variant="caption" style={{ color: colors.ownerInkSubtle, marginTop: spacing.xs }}>
              The list refreshes from the membership register; search and bucket filters apply locally. Pull down to reload the latest rows.
            </AppText>
          </WorkspaceSection>
        </RiseIn>

        {/* Member detail sheet */}
        <ModalSheet
          visible={!!selected}
          onClose={() => setSelected(null)}
          title={selected?.name ?? ''}
          subtitle={selected ? memberDisplayId(selected.id) : undefined}
          toneBadge={
            selected ? (
              <StatusBadge
                label={selected.status === 'expired' ? 'Expired' : selected.status}
                tone={selected.status === 'expired' ? 'danger' : selected.status === 'expiring' ? 'warning' : 'success'}
                small
              />
            ) : undefined
          }>
          {selected && (
            <View style={{ gap: spacing.xs }}>
              <DetailLine label="Plan" value={selected.planId.replace('plan-', '')} />
              <DetailLine label="Membership end" value={selected.membershipEnd ? formatDate(selected.membershipEnd) : 'None'} />
              <DetailLine label="Last visit" value={selected.lastAttendance ? formatDate(selected.lastAttendance) : 'None recorded'} />
              <DetailLine label="Locked price" value={`₹${selected.priceLocked.toLocaleString('en-IN')}${selected.discountPct ? ` (${selected.discountPct}% off)` : ''}`} />
              <DetailLine
                label="Follow-up"
                value={
                  selected.followUp.status === 'none'
                    ? 'Not contacted yet'
                    : `${selected.followUp.status}${selected.followUp.updatedAt ? ` · ${formatDate(selected.followUp.updatedAt)}` : ''}`
                }
              />
              {selected.followUp.note && (
                <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
                  Note: {selected.followUp.note}
                </AppText>
              )}
              <View style={{ flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm }}>
                <Button label="Call member" size="small" icon="call-outline" onPress={() => setContactOpen(true)} />
                <Button label="Open fees entry" size="small" variant="secondary" onPress={() => router.push('/(reception)/fees')} />
              </View>
              <AppText variant="caption" style={{ color: colors.ownerInkSubtle, marginTop: spacing.xs }}>
                Contact and follow-up writes are audited staff actions in the real backend.
              </AppText>
            </View>
          )}
        </ModalSheet>

        <ModalSheet
          visible={contactOpen}
          onClose={() => setContactOpen(false)}
          title="Contact member"
          subtitle="Demo: no call or message is placed">
          <AppText variant="label" style={{ color: colors.ownerInkMuted }}>
            In production this opens the phone with the member&apos;s number prefilled and records a follow-up entry with the authenticated receptionist as actor. Clients cannot forge staff follow-ups because the actor always comes from the session.
          </AppText>
        </ModalSheet>

        <AppText variant="caption" style={{ color: colors.ownerInkSubtle, textAlign: 'center', marginTop: spacing.lg }}>
          A member inactive for 30 straight days without attendance is flagged on the owner&apos;s lost-member list, not silently dropped from this one.
        </AppText>
      </WorkspaceScreen>

      <WorkspaceBottomNavigation active="more" items={navItems} />
    </View>
  );
}

function RowLine(props: { tone: 'warning' | 'danger' | 'info'; title: string; body: string }) {
  const tokens = useTokens();
  const { colors } = tokens;
  const color = {
    warning: colors.ownerWarningDeep,
    danger: colors.ownerErrorDeep,
    info: colors.ownerCyanDeep,
  }[props.tone];
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: tokens.spacing.sm,
        padding: tokens.spacing.sm,
        borderRadius: tokens.radius.sm,
        backgroundColor: colors.ownerPanel,
        borderWidth: 1,
        borderColor: colors.ownerRule,
      }}>
      <View style={{ width: 3, borderRadius: 2, backgroundColor: color }} />
      <View style={{ flex: 1 }}>
        <AppText variant="bodyStrong" style={{ color: colors.ownerInk }}>
          {props.title}
        </AppText>
        <AppText variant="label" style={{ color: colors.ownerInkMuted, marginTop: tokens.spacing['3xs'] }}>
          {props.body}
        </AppText>
      </View>
    </View>
  );
}

function DetailLine(props: { label: string; value: string }) {
  const tokens = useTokens();
  const { colors } = tokens;
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', minHeight: 30, alignItems: 'center' }}>
      <AppText variant="label" style={{ color: colors.ownerInkMuted }}>
        {props.label}
      </AppText>
      <AppText variant="label" style={{ color: colors.ownerInk, fontWeight: '600', textAlign: 'right', flexShrink: 1 }}>
        {props.value}
      </AppText>
    </View>
  );
}
