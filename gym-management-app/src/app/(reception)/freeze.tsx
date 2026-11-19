/**
 * Freeze / Unfreeze — the desk's freeze book (Stage 3 live wiring).
 *
 * The server owns every freeze decision:
 * - `request_freeze` records a request (dates, reason) after checking the
 *   membership and refusing overlaps.
 * - `decide_freeze` approves or rejects a pending request (receptionist +
 *   AAL2) and writes the extension days; it never edits a membership date.
 * - `end_freeze` ends an approved freeze early (receptionist); the views
 *   return the unused days automatically. A frozen member's entrance scan
 *   also ends the freeze and records attendance.
 *
 * The Owner has no freeze write path — the server refuses the role. This
 * screen therefore offers decisions only to the signed-in receptionist and
 * shows every refusal verbatim.
 *
 * Demo mode keeps the session-only request book: requests are recorded and
 * never approved, and no expiry date is ever edited.
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
import { DataRefreshControl, ErrorState, SkeletonRow } from '@/components/ui/feedback';
import { useTokens } from '@/hooks/use-tokens';
import { demoMembers, demoPlans } from '@/data/demo';
import {
  decideFreeze,
  endFreeze,
  requestFreeze,
  useFreezes,
  useMembers,
  usePlans,
} from '@/services/data';
import { displayMembershipStatus } from '@/utils/membership';
import { formatCurrency, formatDate, daysBetween } from '@/utils/format';
import type { Member, MembershipStatus } from '@/types/domain';

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
  state: 'pending' | 'approved' | 'rejected' | 'ended';
  requestedAt: string;
  extensionDays?: number | null;
  endedVia?: 'scan' | 'receptionist';
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

export default function ReceptionFreezeScreen() {
  const tokens = useTokens();
  const { colors, spacing } = tokens;

  // Demo mode keeps the session request book; live mode reads the authorised
  // freeze rows and the server-derived member status.
  const freezesResource = useFreezes();
  const membersResource = useMembers();
  const plansResource = usePlans();
  const live = membersResource.isLive;
  const members = live ? membersResource.data : demoMembers;
  const plans = live ? plansResource.data : demoPlans;
  const liveLoading =
    freezesResource.status === 'loading' ||
    membersResource.status === 'loading' ||
    plansResource.status === 'loading';
  const hasError =
    freezesResource.status === 'error' ||
    membersResource.status === 'error' ||
    plansResource.status === 'error';
  const refreshAll = () => {
    freezesResource.refresh();
    membersResource.refresh();
    plansResource.refresh();
  };

  const [demoRequests, setDemoRequests] = useState<FreezeRequest[]>(seedRequests);
  const [query, setQuery] = useState('');
  const [memberId, setMemberId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState<string>('Medical');
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [saving, setSaving] = useState(false);
  const [requestedOpen, setRequestedOpen] = useState(false);
  const [historyFilter, setHistoryFilter] = useState('all');
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const requests = useMemo<FreezeRequest[]>(() => {
    if (!live) return demoRequests;
    return freezesResource.data.map((freeze) => ({
      id: freeze.id,
      memberId: freeze.memberId,
      memberName: freeze.memberName,
      start: freeze.startDate,
      end: freeze.endDate,
      reason: freeze.reason,
      state: freeze.state,
      requestedAt: freeze.requestedAt,
      extensionDays: freeze.extensionDays,
      endedVia: freeze.endedVia,
    }));
  }, [live, demoRequests, freezesResource.data]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const digits = q.replace(/\D/g, '');
    return members.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        (digits.length > 0 && m.id.replace(/\D/g, '').includes(digits)),
    );
  }, [members, query]);

  const member: Member | null = memberId ? (members.find((m) => m.id === memberId) ?? null) : null;
  const plan = member ? (plans.find((p) => p.id === member.planId) ?? null) : null;
  const memberEnd = member?.membershipEnd ? daysBetween(member.membershipEnd) : null;

  const frozenMembers = members.filter((m) => displayMembershipStatus(m) === 'frozen');
  const activeRequests = requests.filter((r) => r.state === 'pending' || r.state === 'approved');
  const pendingCount = requests.filter((r) => r.state === 'pending').length;

  const historyRows = useMemo(() => {
    if (historyFilter === 'all') return requests;
    return requests.filter((r) => r.state === historyFilter);
  }, [requests, historyFilter]);

  const clearMessages = () => {
    setActionError(null);
    setActionNotice(null);
  };

  const resetForm = () => {
    setStartDate('');
    setEndDate('');
    setMemberId(null);
    setQuery('');
  };

  const submit = async () => {
    if (saving) return;
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
    // Demo-only eligibility checks. Live eligibility is a server decision:
    // the view has no "payment pending" state and the server re-checks the
    // membership and overlaps when the request is recorded and decided.
    if (!live && member && !next.start && !next.end) {
      const status = displayMembershipStatus(member);
      if (status === 'expired') {
        next.member = `${member.name}'s membership expired ${memberEnd !== null ? Math.abs(memberEnd) : '?'} days ago. Frozen memberships are not possible.`;
      } else if (status === 'pendingPayment') {
        next.member = `${member.name} has a payment pending. Freeze becomes possible once the membership is active.`;
      } else if (status === 'frozen') {
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
    if (Object.keys(next).length > 0 || !member) return;
    clearMessages();

    if (live) {
      setSaving(true);
      const outcome = await requestFreeze(member.id, startDate, endDate, reason);
      setSaving(false);
      if (!outcome.ok) {
        setErrors({ server: outcome.error });
        return;
      }
      refreshAll();
      resetForm();
      setRequestedOpen(true);
      return;
    }

    setDemoRequests((prev) => [
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
    resetForm();
    setRequestedOpen(true);
  };

  const decide = async (request: FreezeRequest, approve: boolean) => {
    if (!live || actionBusy !== null) return;
    clearMessages();
    setActionBusy(request.id);
    const outcome = await decideFreeze(request.id, approve);
    setActionBusy(null);
    if (!outcome.ok) {
      setActionError(outcome.error);
      return;
    }
    setActionNotice(
      approve
        ? `${request.memberName}'s freeze was approved. The server stored the extension days; validity is derived from approved pauses, never edited directly.`
        : `${request.memberName}'s freeze request was rejected. The membership is unchanged.`,
    );
    refreshAll();
  };

  const end = async (request: FreezeRequest) => {
    if (!live || actionBusy !== null) return;
    clearMessages();
    setActionBusy(request.id);
    const outcome = await endFreeze(request.id);
    setActionBusy(null);
    if (!outcome.ok) {
      setActionError(outcome.error);
      return;
    }
    setActionNotice(
      `${request.memberName}'s freeze was ended early. The unused days return to their validity automatically — no date was edited.`,
    );
    refreshAll();
  };

  const stateBadge = (request: FreezeRequest) => {
    if (request.state === 'pending') return <OwnerStatusText label="Pending decision" tone="warning" />;
    if (request.state === 'approved') return <OwnerStatusText label="Approved" tone="up" />;
    if (request.state === 'rejected') return <OwnerStatusText label="Rejected" tone="down" />;
    return <OwnerStatusText label="Ended" tone="neutral" />;
  };

  return (
    <View style={{ flex: 1 }}>
      <WorkspaceScreen
        title="Freeze / Unfreeze"
        eyebrow="Memberships"
        subtitle={live ? 'Requests, decisions and server-derived validity' : 'Requests, frozen list and history'}
        demo={!live}
        actions={<SignOut />}
        refreshControl={<DataRefreshControl refreshing={liveLoading} onRefresh={refreshAll} />}>
        {hasError && (
          <RiseIn>
            <ErrorState
              title="Freeze records could not load"
              message={
                freezesResource.error ??
                membersResource.error ??
                plansResource.error ??
                'The freeze book is unavailable right now.'
              }
              onRetry={refreshAll}
            />
          </RiseIn>
        )}
        {live && liveLoading && requests.length === 0 ? (
          <RiseIn style={{ marginTop: spacing.sm }}>
            <SkeletonRow count={3} />
          </RiseIn>
        ) : null}

        {/* Policy honesty up front */}
        <RiseIn>
          <WorkspaceWell>
            <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
              {live
                ? 'Approved freezes pause validity server-side: the extension is end − start + 1 whole days, and ending early returns the unused days automatically. Only a receptionist may request, approve, reject or end a freeze — the Owner has no freeze write path. The server refuses overlaps, lapsed memberships and decisions on an already-decided request.'
                : 'Freezes extend validity only when approved. This demo records requests for the session and never approves them or edits an expiry date; the server computes the extension and derives validity in live mode.'}
            </AppText>
          </WorkspaceWell>
        </RiseIn>

        {/* Counters */}
        <RiseIn index={1} style={{ marginTop: spacing.sm }}>
          <StatRow>
            <OwnerStatTile label="Frozen memberships" value={String(frozenMembers.length)} count={frozenMembers.length} tone="cyan" icon="snow-outline" />
            <OwnerStatTile
              label="Requests pending"
              value={String(pendingCount)}
              count={pendingCount}
              hint={live ? 'Waiting for a receptionist decision' : 'Session demo requests'}
              icon="hourglass-outline"
              tone="amber"
            />
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
                        label={statusLabel[displayMembershipStatus(member)]}
                        tone={statusTone[displayMembershipStatus(member)]}
                      />
                    </View>
                    <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
                      {plan?.name ?? member.planId} · {formatCurrency(member.priceLocked)} locked
                    </AppText>
                    <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
                      {member.membershipEnd
                        ? `Validity ends ${formatDate(member.membershipEnd)}${
                            memberEnd !== null
                              ? memberEnd < 0
                                ? ` · expired ${Math.abs(memberEnd)} days ago`
                                : ` · ${memberEnd} days remaining`
                              : ''
                          }`
                        : 'No membership period on record yet'}
                    </AppText>
                    <AppText variant="caption" style={{ color: colors.ownerInkSubtle }}>
                      {live ? 'Derived by the server from verified payments and approved pauses.' : 'Demo profile value.'}
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
                          clearMessages();
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
                  <Button
                    label={saving ? 'Submitting…' : 'Submit freeze request'}
                    icon="snow-outline"
                    fullWidth
                    disabled={saving}
                    onPress={() => {
                      void submit();
                    }}
                  />
                </View>
                {errors.server ? (
                  <AppText variant="caption" style={{ color: colors.dangerStrong }}>
                    The server refused the request: {errors.server}
                  </AppText>
                ) : null}
                <AppText variant="caption" style={{ color: colors.ownerInkSubtle }}>
                  {live
                    ? 'The request is recorded on the server and waits for a receptionist decision. Overlapping dates are refused by the server even if this list is stale.'
                    : 'This demo request waits in the session book. Nothing is sent to a server and no freeze is approved here.'}
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
                title="No membership is frozen today"
                hint="Freeze state is derived by the server from approved windows covering today. Approved future freezes appear in the history below."
              />
            ) : (
              <OwnerListGroup label="Frozen memberships">
                {frozenMembers.map((m, i) => (
                  <View key={m.id}>
                    {i > 0 && <WorkspaceRowDivider />}
                    <OwnerListRow
                      leading={<OwnerMemberAvatar name={m.name} />}
                      title={m.name}
                      detail={`${m.id.replace('m-', 'GB-').toUpperCase()}${
                        m.membershipEnd ? ` · validity ends ${formatDate(m.membershipEnd)}` : ''
                      }`}
                      status={<OwnerStatusText label="Frozen" tone="neutral" />}
                    />
                  </View>
                ))}
              </OwnerListGroup>
            )}
            <AppText variant="caption" style={{ color: colors.ownerInkMuted, marginTop: spacing.xs }}>
              {live
                ? "A frozen member's entrance scan ends the freeze automatically and records attendance. The desk can also end an approved freeze early below; the server returns the unused days."
                : 'The frozen list is read-only in demo mode. In live mode a receptionist ends an approved freeze — the Owner has no freeze write path.'}
            </AppText>
          </WorkspaceSection>
        </RiseIn>

        {/* History */}
        <RiseIn index={4} style={{ marginTop: spacing.sm }}>
          <WorkspaceSection title="Freeze history">
            {live && (actionError || actionNotice) ? (
              <View style={{ marginBottom: spacing.sm }}>
                {actionError ? (
                  <AppText variant="label" style={{ color: colors.dangerStrong }}>
                    The server refused the action: {actionError}
                  </AppText>
                ) : null}
                {actionNotice ? (
                  <AppText variant="label" style={{ color: colors.ownerSuccessDeep }}>
                    {actionNotice}
                  </AppText>
                ) : null}
              </View>
            ) : null}
            <SegmentedTabs
              size="small"
              options={[
                { value: 'all', label: 'All' },
                { value: 'pending', label: 'Pending' },
                { value: 'approved', label: 'Approved' },
                { value: 'rejected', label: 'Rejected' },
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
                        title={`${r.memberName} · ${formatDate(r.start)} → ${formatDate(r.end)}`}
                        detail={`${r.reason} · requested ${formatDate(r.requestedAt)}${
                          r.extensionDays != null ? ` · ${r.extensionDays} extension days` : ''
                        }${r.endedVia ? ` · ended via ${r.endedVia === 'scan' ? 'entrance scan' : 'receptionist'}` : ''}`}
                        status={stateBadge(r)}
                      />
                      {/* Decision controls — server-authoritative, receptionist
                          only. Nothing is offered for already-decided rows. */}
                      {live && r.state === 'pending' && (
                        <View style={{ flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs, marginBottom: spacing.sm }}>
                          <Button
                            label={actionBusy === r.id ? 'Approving…' : 'Approve freeze'}
                            icon="checkmark-circle-outline"
                            size="small"
                            disabled={actionBusy !== null}
                            onPress={() => {
                              void decide(r, true);
                            }}
                          />
                          <Button
                            label={actionBusy === r.id ? 'Rejecting…' : 'Reject'}
                            variant="secondary"
                            size="small"
                            disabled={actionBusy !== null}
                            onPress={() => {
                              void decide(r, false);
                            }}
                          />
                        </View>
                      )}
                      {live && r.state === 'approved' && (
                        <View style={{ flexDirection: 'row', marginTop: spacing.xs, marginBottom: spacing.sm }}>
                          <Button
                            label={actionBusy === r.id ? 'Ending…' : 'End freeze early'}
                            icon="stop-circle-outline"
                            size="small"
                            variant="secondary"
                            disabled={actionBusy !== null}
                            onPress={() => {
                              void end(r);
                            }}
                          />
                        </View>
                      )}
                    </View>
                  ))}
                </OwnerListGroup>
              )}
            </View>
            <AppText variant="caption" style={{ color: colors.ownerInkMuted, marginTop: spacing.xs }}>
              {live
                ? 'Approval writes the extension days and requires a multi-factor (AAL2) session. Rejection and early ending leave the original request on record; nothing is deleted or edited.'
                : 'Demo requests stay in this session and reset when the app restarts. Decisions are server-side in live mode.'}
            </AppText>
          </WorkspaceSection>
        </RiseIn>

        {/* Request confirmation */}
        <ModalSheet
          visible={requestedOpen}
          onClose={() => setRequestedOpen(false)}
          title="Freeze requested"
          subtitle={live ? 'Recorded on the server' : 'Session demo request'}
          toneBadge={<StatusBadge label="Pending" tone="warning" small />}>
          <View style={{ alignItems: 'center', marginBottom: spacing.sm }}>
            <SuccessPop size={54} color={colors.warning} />
          </View>
          <AppText variant="body" style={{ color: colors.ink }}>
            {live
              ? 'The request is recorded with the member, dates and reason. A receptionist approves or rejects it (the decision requires AAL2). On approval the server stores the extension days; membership validity everywhere is derived from verified payments plus approved pauses — expiry dates are never edited silently.'
              : 'The request is recorded for this session only — nothing is sent to a server and no freeze is approved here. In live mode the server computes the extension on approval and derives validity; expiry dates are never edited directly.'}
          </AppText>
          <View style={{ marginTop: spacing.sm }}>
            <Button label="Close" variant="secondary" fullWidth onPress={() => setRequestedOpen(false)} />
          </View>
        </ModalSheet>

        <AppText variant="caption" style={{ color: colors.ownerInkSubtle, textAlign: 'center', marginTop: spacing.lg }}>
          {live
            ? 'Freeze extension, overlap and eligibility are server rules. This screen displays returned values and server refusals without re-implementing them.'
            : 'Demo mode: requests are session-only. Server rules for extension, overlap and eligibility apply in live mode.'}
        </AppText>
      </WorkspaceScreen>

      <WorkspaceBottomNavigation active="more" items={navItems} />
    </View>
  );
}
