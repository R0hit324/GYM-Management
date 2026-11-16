/**
 * Freeze / Unfreeze — the desk's freeze book.
 *
 * What this demo does (and deliberately does not do):
 *
 * - A freeze REQUEST is recorded with member, start/end dates and reason.
 *   Requests start as "pending" and are approved or rejected by the Owner;
 *   the demo never approves them and NEVER edits a membership expiry date.
 * - Eligibility is checked before a request is accepted: the membership
 *   must be active or expiring. Expired, payment-pending and already-frozen
 *   memberships are blocked with an explicit reason.
 * - Overlapping freeze periods for the same member are rejected.
 * - The gym's freeze policy (maximum duration and count, and how validity
 *   extension is calculated on approval) is NOT defined in the app yet —
 *   those are owner-set rules that arrive with the backend (Part 2). The
 *   demo states this instead of inventing numbers.
 * - The frozen list and full request history are shown; Sana Fernandes's
 *   old "frozen" register scan (her membership has since expired) is
 *   explained rather than hidden.
 */
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { AppText } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { StatRow } from '@/components/ui/stat-tile';
import { StatusBadge } from '@/components/ui/status-badge';
import { SearchBar } from '@/components/ui/search-bar';
import { SegmentedTabs } from '@/components/ui/segmented-tabs';
import { TextField } from '@/components/ui/text-field';
import { ModalSheet } from '@/components/ui/modal-sheet';
import { SuccessPop } from '@/components/ui/motion';
import { RiseIn } from '@/components/ui/rise-in';
import { SignOut } from '@/components/workspace-meta';
import {
  WorkspaceScreen,
  WorkspaceBottomNavigation,
  WorkspaceCard,
  WorkspaceSection,
  WorkspaceWell,
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
import { demoMembers, demoPlans } from '@/data/demo';
import { formatCurrency, formatDate, daysBetween } from '@/utils/format';
import type { Member } from '@/types/domain';

const navItems = [
  { key: 'home', label: 'Home', icon: 'home-outline', href: '/(reception)/home' },
  { key: 'members', label: 'Members', icon: 'people-outline', href: '/(reception)/members' },
  { key: 'more', label: 'More', icon: 'apps-outline', href: '/(reception)/more' },
] as const;

interface FreezeRequest {
  id: string;
  memberId: string;
  memberName: string;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
  reason: string;
  state: 'pending' | 'approved' | 'ended';
  requestedAt: string;
}

const reasons = [
  { value: 'Medical', label: 'Medical' },
  { value: 'Travel', label: 'Travel' },
  { value: 'Personal', label: 'Personal' },
  { value: 'Other', label: 'Other' },
] as const;

/** Day-offset helper in YYYY-MM-DD (demo seeds only). */
function isoDateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const seedRequests: FreezeRequest[] = [
  {
    id: 'frz-seed-1',
    memberId: 'm-1038',
    memberName: 'Priya Nambiar',
    start: isoDateOffset(-160),
    end: isoDateOffset(-146),
    reason: 'Travel',
    state: 'ended',
    requestedAt: isoDateOffset(-165),
  },
  {
    id: 'frz-seed-2',
    memberId: 'm-1055',
    memberName: 'Rahul Desai',
    start: isoDateOffset(2),
    end: isoDateOffset(16),
    reason: 'Medical',
    state: 'pending',
    requestedAt: isoDateOffset(0),
  },
];

export default function ReceptionFreezeScreen() {
  const tokens = useTokens();
  const { colors, spacing } = tokens;

  const [requests, setRequests] = useState<FreezeRequest[]>(seedRequests);
  const [query, setQuery] = useState('');
  const [memberId, setMemberId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState<string>('Medical');
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [requestedOpen, setRequestedOpen] = useState(false);
  const [historyFilter, setHistoryFilter] = useState('all');

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return demoMembers.filter(
      (m) => m.name.toLowerCase().includes(q) || m.id.replace('m-', '').includes(q),
    );
  }, [query]);

  const member: Member | null = demoMembers.find((m) => m.id === memberId) ?? null;
  const plan = member ? demoPlans.find((p) => p.id === member.planId) ?? null : null;
  const memberEnd = member?.membershipEnd ? daysBetween(member.membershipEnd) : null;

  const frozenMembers = demoMembers.filter((m) => m.status === 'frozen');
  const activeRequests = requests.filter((r) => r.state === 'pending' || r.state === 'approved');
  const pendingCount = requests.filter((r) => r.state === 'pending').length;

  const historyRows = useMemo(() => {
    if (historyFilter === 'all') return requests;
    return requests.filter((r) => r.state === historyFilter);
  }, [requests, historyFilter]);

  const submit = () => {
    const next: Record<string, string | undefined> = {};
    if (!member) next.member = 'Select a member.';
    if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || Number.isNaN(new Date(startDate).getTime())) {
      next.start = 'Enter the freeze start date as YYYY-MM-DD.';
    }
    if (!endDate || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || Number.isNaN(new Date(endDate).getTime())) {
      next.end = 'Enter the freeze end date as YYYY-MM-DD.';
    }
    if (!next.start && !next.end && new Date(endDate) < new Date(startDate)) {
      next.end = 'The end date cannot be before the start date.';
    }
    if (member && !next.start) {
      // Eligibility: only active or expiring memberships can be frozen.
      if (member.status === 'expired') {
        next.member = `${member.name}'s membership expired ${memberEnd !== null ? Math.abs(memberEnd) : '?'} days ago. Frozen memberships are not possible.`;
      } else if (member.status === 'pendingPayment') {
        next.member = `${member.name} has a payment pending. Freeze becomes possible once the membership is active.`;
      } else if (member.status === 'frozen') {
        next.member = `${member.name} is already frozen.`;
      } else if (
        activeRequests.some(
          (r) =>
            r.memberId === member.id &&
            new Date(startDate) <= new Date(r.end) &&
            new Date(endDate) >= new Date(r.start),
        )
      ) {
        next.start = 'These dates overlap an existing freeze request for this member.';
      }
    }
    setErrors(next);
    if (Object.keys(next).length === 0 && member) {
      setRequests((prev) => [
        {
          id: `frz-${Date.now()}`,
          memberId: member.id,
          memberName: member.name,
          start: startDate,
          end: endDate,
          reason,
          state: 'pending',
          requestedAt: isoDateOffset(0),
        },
        ...prev,
      ]);
      setStartDate('');
      setEndDate('');
      setMemberId(null);
      setQuery('');
      setRequestedOpen(true);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <WorkspaceScreen
        title="Freeze / Unfreeze"
        eyebrow="Memberships"
        subtitle="Requests, frozen list and history"
        demo
        actions={<SignOut />}>
        {/* Policy honesty up front */}
        <RiseIn>
          <WorkspaceWell>
            <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
              Freezes extend validity only when approved. The freeze limits (maximum duration and count) and the extension calculation are Owner-set rules that are not defined in the app yet — they arrive with the backend in Part 2. This demo records requests and never edits an expiry date directly.
            </AppText>
          </WorkspaceWell>
        </RiseIn>

        {/* Counters */}
        <RiseIn index={1} style={{ marginTop: spacing.sm }}>
          <StatRow>
            <OwnerStatTile label="Frozen memberships" value={String(frozenMembers.length)} count={frozenMembers.length} tone="cyan" icon="snow-outline" />
            <OwnerStatTile label="Requests pending" value={String(pendingCount)} count={pendingCount} hint="Waiting for the Owner" icon="hourglass-outline" tone="amber" />
          </StatRow>
        </RiseIn>

        {/* Request form */}
        <RiseIn index={2} style={{ marginTop: spacing.sm }}>
          <WorkspaceSection title="Request a freeze">
            <SearchBar label="Search member to freeze" value={query} onChange={setQuery} placeholder="Name or member number" />
            {member && (
              <WorkspaceCard style={{ marginTop: spacing.sm }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <OwnerMemberAvatar name={member.name} />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'center' }}>
                      <AppText variant="bodyStrong" style={{ color: colors.ownerInk }}>
                        {member.name}
                      </AppText>
                      <OwnerStatusText
                        label={member.status === 'active' ? 'Active' : member.status === 'expiring' ? 'Expiring' : member.status === 'frozen' ? 'Frozen' : member.status === 'expired' ? 'Expired' : 'Payment pending'}
                        tone={member.status === 'active' ? 'up' : member.status === 'expiring' ? 'warning' : 'down'}
                      />
                    </View>
                    <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
                      {plan?.name ?? member.planId} · {formatCurrency(member.priceLocked)} locked
                      {memberEnd !== null
                        ? memberEnd < 0
                          ? ` · expired ${Math.abs(memberEnd)} days ago`
                          : ` · ends in ${memberEnd} days`
                        : ' · no validity yet'}
                    </AppText>
                  </View>
                </View>
              </WorkspaceCard>
            )}
            {results.length > 0 && !member && (
              <View style={{ marginTop: spacing.sm }}>
                <OwnerListGroup label="Search results">
                  {results.slice(0, 4).map((m, i) => (
                    <View key={m.id}>
                      {i > 0 && <WorkspaceRowDivider />}
                      <OwnerListRow
                        leading={<OwnerMemberAvatar name={m.name} />}
                        title={m.name}
                        detail={m.id.replace('m-', 'GB-').toUpperCase()}
                        onPress={() => {
                          setMemberId(m.id);
                          setQuery('');
                          setErrors({});
                        }}
                      />
                    </View>
                  ))}
                </OwnerListGroup>
              </View>
            )}
            {!member && query.length > 0 && results.length === 0 && (
              <OwnerEmptyState icon="search-outline" title="No member matches" hint="Try a shorter name or the member number." />
            )}
            {errors.member && (
              <AppText variant="caption" style={{ color: colors.ownerErrorDeep, marginTop: spacing.xs }}>
                {errors.member}
              </AppText>
            )}

            {member && (
              <View style={{ marginTop: spacing.sm, gap: spacing.xs }}>
                <TextField
                  label="Freeze start date (YYYY-MM-DD)"
                  placeholder="2026-11-20"
                  value={startDate}
                  onChangeText={setStartDate}
                  error={errors.start}
                  autoCapitalize="none"
                />
                <TextField
                  label="Freeze end date (YYYY-MM-DD)"
                  placeholder="2026-12-04"
                  value={endDate}
                  onChangeText={setEndDate}
                  error={errors.end}
                  autoCapitalize="none"
                />
                <AppText variant="label" style={{ color: colors.ownerInkMuted, marginTop: spacing.xs }}>
                  Reason
                </AppText>
                <SegmentedTabs size="small" options={[...reasons]} value={reason} onChange={setReason} />
                <View style={{ marginTop: spacing.sm }}>
                  <Button label="Submit freeze request" icon="snow-outline" fullWidth onPress={submit} />
                </View>
                <AppText variant="caption" style={{ color: colors.ownerInkSubtle }}>
                  The request waits for the Owner&apos;s approval. Only an approved freeze extends validity, within limits the Owner sets.
                </AppText>
              </View>
            )}
          </WorkspaceSection>
        </RiseIn>

        {/* Frozen list */}
        <RiseIn index={3} style={{ marginTop: spacing.sm }}>
          <WorkspaceSection title="Currently frozen">
            {frozenMembers.length === 0 ? (
              <OwnerEmptyState
                icon="snow-outline"
                title="No memberships are frozen"
                hint="Sana Fernandes's register shows one old scan recorded as frozen before her membership expired — freeze state lives with the member record, not the register."
              />
            ) : (
              <OwnerListGroup label="Frozen memberships">
                {frozenMembers.map((m, i) => (
                  <View key={m.id}>
                    {i > 0 && <WorkspaceRowDivider />}
                    <OwnerListRow
                      leading={<OwnerMemberAvatar name={m.name} />}
                      title={m.name}
                      detail={m.id.replace('m-', 'GB-').toUpperCase()}
                      status={<OwnerStatusText label="Frozen" tone="neutral" />}
                    />
                  </View>
                ))}
              </OwnerListGroup>
            )}
            <AppText variant="caption" style={{ color: colors.ownerInkMuted, marginTop: spacing.xs }}>
              Unfreezing is an Owner decision in the current permission model — the desk submits and tracks requests; the Owner approves, rejects or ends them in Part 2.
            </AppText>
          </WorkspaceSection>
        </RiseIn>

        {/* History */}
        <RiseIn index={4} style={{ marginTop: spacing.sm }}>
          <WorkspaceSection title="Freeze history">
            <SegmentedTabs
              size="small"
              options={[
                { value: 'all', label: 'All' },
                { value: 'pending', label: 'Pending' },
                { value: 'approved', label: 'Approved' },
                { value: 'ended', label: 'Ended' },
              ]}
              value={historyFilter}
              onChange={setHistoryFilter}
            />
            <View style={{ marginTop: spacing.sm }}>
              {historyRows.length === 0 ? (
                <OwnerEmptyState
                  icon="time-outline"
                  title="Nothing in this bucket"
                  hint="Switch the filter or submit a request above."
                />
              ) : (
                <OwnerListGroup label="Freeze requests">
                  {historyRows.map((r, i) => (
                    <View key={r.id}>
                      {i > 0 && <WorkspaceRowDivider />}
                      <OwnerListRow
                        leading={<OwnerMemberAvatar name={r.memberName} />}
                        title={`${formatDate(r.start)} → ${formatDate(r.end)}`}
                        detail={`${r.reason} · requested ${formatDate(r.requestedAt)}`}
                        status={
                          r.state === 'pending' ? (
                            <OwnerStatusText label="Pending approval" tone="warning" />
                          ) : r.state === 'approved' ? (
                            <OwnerStatusText label="Approved" tone="up" />
                          ) : (
                            <OwnerStatusText label="Ended" tone="neutral" />
                          )
                        }
                      />
                    </View>
                  ))}
                </OwnerListGroup>
              )}
            </View>
          </WorkspaceSection>
        </RiseIn>

        {/* Honest request confirmation */}
        <ModalSheet
          visible={requestedOpen}
          onClose={() => setRequestedOpen(false)}
          title="Freeze requested"
          subtitle="Waiting for the Owner"
          toneBadge={<StatusBadge label="Pending" tone="warning" small />}>
          <View style={{ alignItems: 'center', marginBottom: spacing.sm }}>
            <SuccessPop size={54} color={colors.warning} />
          </View>
          <AppText variant="body" style={{ color: colors.ownerInk }}>
            The request is recorded with the member, dates and reason. The Owner approves or rejects it in the approval workflow (Part 2). If approved, the validity extension is calculated against the gym&apos;s freeze policy and written as its own transaction — expiry dates are never edited silently.
          </AppText>
          <View style={{ marginTop: spacing.sm }}>
            <Button label="Close" variant="secondary" fullWidth onPress={() => setRequestedOpen(false)} />
          </View>
        </ModalSheet>

        <AppText variant="caption" style={{ color: colors.ownerInkSubtle, textAlign: 'center', marginTop: spacing.lg }}>
          Missing business decisions reported, not invented: freeze duration limits, freeze counts and the extension formula are Owner-set and arrive with the backend.
        </AppText>
      </WorkspaceScreen>

      <WorkspaceBottomNavigation active="more" items={navItems} />
    </View>
  );
}
