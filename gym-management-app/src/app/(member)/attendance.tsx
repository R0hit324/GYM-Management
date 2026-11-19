/**
 * Screen 3 — QR attendance (member). The member's fitness home.
 *
 * Part 1 renders the scanning experience and every result state; the
 * scanner camera, cryptographically-secure tokens, replay protection and
 * server validation arrive in Part 5. The status switcher below is an
 * explicitly-labelled review control, not a simulation of a successful scan.
 *
 * Theme unification: the screen sits in the shared Fino workspace chrome
 * (dark ground, white greeting, light dot-pattern panel) with Owner
 * light-panel primitives — solid white cards, the membership status front
 * and centre, cyan/blue accents on progress figures. Everything stays
 * member-focused: no management information, just the journey. Demo mode
 * keeps the approved sample data and its disclosure; live mode reads the
 * member's own membership and attendance rows through the shared client.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { ActionGrid, ActionTile } from '@/components/ui/action-tile';
import { SegmentedTabs } from '@/components/ui/segmented-tabs';
import { RiseIn } from '@/components/ui/rise-in';
import { CountUp, Meter } from '@/components/ui/motion';
import { DataRefreshControl, ErrorState, SkeletonRow } from '@/components/ui/feedback';
import { AttendanceCalendar } from '@/components/attendance-calendar';
import { QrScanner } from '@/components/scan/qr-scanner';
import { SignOut } from '@/components/workspace-meta';
import {
  WorkspaceScreen,
  WorkspaceCard,
  WorkspaceSection,
  WorkspaceWell,
  WorkspaceRowDivider,
} from '@/components/workspace/workspace-ui';
import {
  OwnerListGroup,
  OwnerListRow,
  OwnerMemberAvatar,
  OwnerStatusText,
  OwnerEmptyState,
} from '@/components/owner/owner-ui';
import { useTokens } from '@/hooks/use-tokens';
import { demoAttendance, demoMemberHistory, demoMembers } from '@/data/demo';
import { checkIn, checkInFailureKind, useMyAttendance, useMyMembership, usePlans } from '@/services/data';
import { displayMembershipStatus } from '@/utils/membership';
import { formatTime, formatDate } from '@/utils/format';

const scanStates = [
  { value: 'ready', label: 'Ready to scan' },
  { value: 'invalid', label: 'Invalid QR' },
  { value: 'expired', label: 'Expired QR' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'success', label: 'Checked in' },
] as const;

type ScanState = (typeof scanStates)[number]['value'];

/** Shortcut tiles scroll to these content keys. */
type JumpKey = 'plan' | 'scan' | 'progress';

export default function MemberAttendanceScreen() {
  const tokens = useTokens();
  const { colors, spacing } = tokens;

  const [state, setState] = useState<ScanState>('ready');
  const [history, setHistory] = useState(true);
  const [listState, setListState] = useState<'full' | 'loading' | 'empty' | 'error'>('loading');

  useEffect(() => {
    // Demo data load simulation so the loading state is real and
    // reviewable. Nothing network-related happens.
    const t = setTimeout(() => setListState('full'), 900);
    return () => clearTimeout(t);
  }, []);

  const membershipResource = useMyMembership();
  const attendanceResource = useMyAttendance();
  const plansResource = usePlans();
  const live = membershipResource.isLive;

  const myEvents = useMemo(
    () => (live ? attendanceResource.data : demoAttendance.filter((e) => e.memberId === 'm-1042')),
    [live, attendanceResource.data],
  );
  // Live mode has no generated history: the calendar shows the member's own
  // authorised attendance rows. Demo mode keeps its approved demo history.
  const calendarEvents = useMemo(
    () => (live ? myEvents : [...demoMemberHistory, ...myEvents]),
    [live, myEvents],
  );

  // Membership summary — the member's own authorised row in live mode.
  const me = live ? membershipResource.data : demoMembers.find((m) => m.id === 'm-1042') ?? null;
  const myPlan = useMemo(
    () => plansResource.data.find((p) => p.id === me?.planId),
    [plansResource.data, me],
  );
  const firstName = me ? me.name.split(' ')[0] : 'Member';
  const membershipStatus = me ? displayMembershipStatus(me) : null;
  const statusText = membershipStatus
    ? {
        active: 'Active',
        expiring: 'Expiring',
        expired: 'Expired',
        frozen: 'Frozen',
        pendingPayment: 'Payment pending',
      }[membershipStatus]
    : 'Unknown';
  const statusTone =
    membershipStatus === 'active'
      ? 'up'
      : membershipStatus === 'frozen'
        ? 'neutral'
        : membershipStatus === 'pendingPayment'
          ? 'action'
          : membershipStatus === 'expired'
            ? 'down'
            : 'warning';
  const liveLoading =
    membershipResource.status === 'loading' ||
    attendanceResource.status === 'loading' ||
    plansResource.status === 'loading';
  const hasError = membershipResource.status === 'error' || attendanceResource.status === 'error';
  const refreshAll = () => {
    membershipResource.refresh();
    attendanceResource.refresh();
    plansResource.refresh();
  };

  // Live scan lifecycle. The backend owns every decision (validity, expiry,
  // replay, freeze auto-end, pending payment). The screen only picks the
  // result state from the server's answer and refreshes the member's own
  // status after a success.
  const [scanNotice, setScanNotice] = useState<string | null>(null);
  const [scanBusy, setScanBusy] = useState(false);
  const scanningRef = useRef(false);
  const refreshMembership = membershipResource.refresh;
  const refreshAttendance = attendanceResource.refresh;

  const handleScan = useCallback(
    async (payload: string) => {
      if (!live || scanningRef.current) return;
      scanningRef.current = true;
      setScanBusy(true);
      setScanNotice(null);
      const outcome = await checkIn(payload);
      scanningRef.current = false;
      setScanBusy(false);

      if (outcome.ok) {
        setState('success');
        setScanNotice('Attendance recorded. Enjoy your session — repeat check-ins are allowed.');
        refreshMembership();
        refreshAttendance();
        return;
      }

      const kind = checkInFailureKind(outcome);
      setState(
        kind === 'expiredToken'
          ? 'expired'
          : kind === 'pendingPayment' || kind === 'unlinked'
            ? 'inactive'
            : 'invalid',
      );
      setScanNotice(outcome.error);
    },
    [live, refreshMembership, refreshAttendance],
  );

  const scanAgain = () => {
    setScanNotice(null);
    setState('ready');
  };

  // This-week activity: verified demo check-ins since Monday, over the days
  // elapsed in the week. Computed from the demo events, never asserted.
  const weekStats = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7)); // Monday
    const days = new Set<string>();
    for (const e of calendarEvents) {
      if (e.status !== 'verified') continue;
      const d = new Date(e.checkedInAt);
      d.setHours(0, 0, 0, 0);
      if (d >= weekStart) days.add(d.toDateString());
    }
    const elapsed = Math.min(7, Math.floor((Date.now() - weekStart.getTime()) / 86400000) + 1);
    return { trained: days.size, elapsed };
  }, [calendarEvents]);

  // Visit-list states: live mode reflects the hook status honestly; demo
  // mode keeps its designed review control.
  const visitsLoading = live ? attendanceResource.status === 'loading' : listState === 'loading';
  const visitsError = live ? attendanceResource.status === 'error' : listState === 'error';
  const visitsEmpty = live ? myEvents.length === 0 : myEvents.length === 0 || listState === 'empty';

  // Scroll-to plumbing for the shortcut tiles.
  const scrollRef = useRef<ComponentRef<typeof ScrollView> | null>(null);
  const sectionY = useRef<Partial<Record<JumpKey, number>>>({});
  const jump = (key: JumpKey) => {
    scrollRef.current?.scrollTo({ y: Math.max(0, (sectionY.current[key] ?? 0) - 8), animated: true });
  };

  const frameColor = state === 'success' ? colors.ownerSuccessDeep : state === 'ready' ? colors.ownerAccentDeep : colors.ownerErrorDeep;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.ownerBg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <WorkspaceScreen
        title={`Hello, ${firstName}`}
        eyebrow="Your membership"
        subtitle={live ? 'Member workspace · live membership' : `Member · ${me?.name ?? 'Demo member'} (demo)`}
        demo={!live}
        actions={<SignOut />}
        footerPadding={24}
        refreshControl={<DataRefreshControl refreshing={liveLoading} onRefresh={refreshAll} />}
        onContentRef={(sv) => {
          scrollRef.current = sv;
        }}>
        {hasError && (
          <RiseIn>
            <ErrorState
              title="Your membership could not load"
              message={
                membershipResource.error ??
                attendanceResource.error ??
                'Your membership and visits are unavailable right now.'
              }
              onRetry={refreshAll}
            />
          </RiseIn>
        )}
        {live && membershipResource.status === 'loading' && !me ? (
          <RiseIn style={{ marginBottom: spacing.sm }}>
            <SkeletonRow count={2} />
          </RiseIn>
        ) : null}
        {/* My membership — the member's own authorised record */}
        <RiseIn>
          <View
            onLayout={(e) => {
              sectionY.current.plan = e.nativeEvent.layout.y;
            }}
            accessibilityLabel={`My membership: ${myPlan?.name ?? ''} plan, ${statusText}, valid till ${me?.membershipEnd ? formatDate(me.membershipEnd) : 'unknown'}.`}
            accessible>
            <WorkspaceCard>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <View style={{ flex: 1, minWidth: 0, gap: spacing['3xs'] }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                    <AppText variant="label" style={{ color: colors.ownerInkMuted }}>
                      My Membership
                    </AppText>
                    <OwnerStatusText label={statusText} tone={statusTone} />
                  </View>
                  <AppText variant="figureSmall" style={{ color: colors.ownerInk }}>
                    {myPlan?.name ?? '—'} Plan
                  </AppText>
                  <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
                    Valid till {me?.membershipEnd ? formatDate(me.membershipEnd) : '—'}
                    {live ? '' : ' · demo data'}
                  </AppText>
                </View>
                <Ionicons name="barbell" size={30} color={colors.ownerAccentDeep} />
              </View>
            </WorkspaceCard>
          </View>
        </RiseIn>

        {/* Quick shortcuts — ActionTile grid, scroll to the matching section */}
        <RiseIn index={1}>
          <ActionGrid style={{ marginTop: spacing.sm }}>
            {([
              { key: 'scan', icon: 'scan-outline' as const, label: 'Attendance' },
              { key: 'plan', icon: 'card-outline' as const, label: 'My Plan' },
              { key: 'progress', icon: 'stats-chart' as const, label: 'Progress' },
            ] as { key: JumpKey; icon: keyof typeof Ionicons.glyphMap; label: string }[]).map((tile) => (
              <ActionTile
                key={tile.key}
                icon={tile.icon}
                label={tile.label}
                tone="accent"
                onPress={() => jump(tile.key)}
                accessibilityHint="Scrolls to the matching section below"
                style={{ flex: 1, minWidth: 96 }}
              />
            ))}
          </ActionGrid>
        </RiseIn>

        {/* This-week activity (computed from demo check-ins) */}
        <RiseIn index={2}>
          <View
            accessibilityLabel={`This week: trained on ${weekStats.trained} of ${weekStats.elapsed} days.${live ? '' : ' Demo data.'}`}
            accessible
            style={{ marginTop: spacing.sm }}>
            <WorkspaceCard>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                <AppText variant="bodyStrong" style={{ color: colors.ownerInk }}>
                  This Week
                </AppText>
                <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
                  <CountUp value={weekStats.trained} variant="figureSmall" style={{ color: colors.ownerCyanDeep }} />
                  <AppText variant="figureSmall" style={{ color: colors.ownerCyanDeep }}>
                    /{weekStats.elapsed}
                  </AppText>
                </View>
              </View>
              <Meter
                progress={weekStats.trained / Math.max(1, weekStats.elapsed)}
                color={colors.ownerCyanDeep}
                track={colors.ownerPanelMuted}
              />
              <AppText variant="caption" style={{ color: colors.ownerInkSubtle }}>
                Counted from your check-ins; the register confirms every session.
              </AppText>
            </WorkspaceCard>
          </View>
        </RiseIn>

        {/* Scanner */}
        <RiseIn index={3}>
          <View
            onLayout={(e) => {
              sectionY.current.scan = e.nativeEvent.layout.y;
            }}
            accessibilityLabel={`Scanner, ${state === 'success' ? 'Checked in' : state === 'ready' ? 'Awaiting scan' : state}`}
            style={{
              marginTop: spacing.md,
              borderRadius: tokens.radius.lg,
              overflow: 'hidden',
              backgroundColor: colors.ownerPanel,
              borderWidth: 1,
              borderColor: colors.ownerRule,
            }}>
            {/* Scanner surface — live mode opens the camera; demo keeps the
                explicitly-labelled review preview. */}
            <View style={{ height: 210, alignItems: 'center', justifyContent: 'center' }}>
              {live && state === 'ready' ? (
                <QrScanner
                  onScanned={handleScan}
                  style={{ height: 210, width: '100%' }}
                />
              ) : (
                <View
                  style={{
                    width: 158,
                    height: 158,
                    borderRadius: tokens.radius.md,
                    borderWidth: 2,
                    borderColor: frameColor,
                    borderStyle: 'dashed',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: spacing.xs,
                  }}>
                  <Ionicons
                    name={state === 'success' ? 'checkmark-circle' : state === 'ready' ? 'scan-outline' : 'warning-outline'}
                    size={44}
                    color={frameColor}
                  />
                  <AppText variant="caption" align="center" style={{ paddingHorizontal: spacing.sm, color: colors.ownerInk }}>
                    {state === 'ready' ? 'Centre the code inside the frame' : state === 'success' ? 'Checked in' : state === 'invalid' ? 'Scan refused' : state === 'expired' ? 'Expired code' : 'Not permitted'}
                  </AppText>
                </View>
              )}
            </View>
            <View style={{ backgroundColor: colors.ownerPanelMuted, padding: spacing.md, gap: spacing.xs }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <AppText variant="bodyStrong" style={{ color: colors.ownerInk }}>
                  {state === 'ready'
                    ? 'Scan the entrance code'
                    : state === 'success'
                      ? 'Checked in'
                      : 'Attendance was not recorded'}
                </AppText>
                <OwnerStatusText
                  label={
                    live && scanBusy
                      ? 'Checking…'
                      : state === 'success'
                        ? 'Recorded'
                        : state === 'ready'
                          ? 'Ready to scan'
                          : state === 'invalid'
                            ? 'Refused'
                            : state === 'expired'
                              ? 'Expired code'
                              : 'Not permitted'
                  }
                  tone={state === 'success' ? 'up' : state === 'ready' ? 'action' : state === 'invalid' || state === 'inactive' ? 'down' : 'warning'}
                />
              </View>
              <AppText variant="label" style={{ color: colors.ownerInkMuted }}>
                {live && scanNotice
                  ? scanNotice
                  : state === 'ready'
                    ? 'Point the camera at the QR shown on the reception screen. Codes expire and rotate; an old screenshot will not work.'
                    : state === 'invalid'
                      ? 'The code scanned could not be accepted. Attendance was not recorded. Show your membership screen or ask at the desk.'
                      : state === 'expired'
                        ? 'Attendance codes expire and are replaced automatically. Ask the desk to show the current one and scan again.'
                        : state === 'inactive'
                          ? 'Attendance cannot be recorded for this membership state. The desk can take a renewal or a freeze request.'
                          : 'Enjoy the session. Multiple check-ins a day are allowed: scan again when you return.'}
              </AppText>
              {live && state !== 'ready' && (
                <View style={{ marginTop: spacing.xs }}>
                  <Button
                    label="Scan again"
                    icon="scan-outline"
                    size="small"
                    variant="secondary"
                    onPress={scanAgain}
                  />
                </View>
              )}
              {/* Demo review control: switch designed states. Live mode is
                  driven by real server answers instead. */}
              {!live && (
                <View style={{ marginTop: spacing.xs }}>
                  <AppText variant="caption" style={{ color: colors.ownerInkSubtle }}>
                    Review control, removed when the camera lands:
                  </AppText>
                  <View style={{ marginTop: spacing['3xs'] }}>
                    <SegmentedTabs
                      variant="owner"
                      size="small"
                      options={scanStates.map((s) => ({ value: s.value, label: s.label }))}
                      value={state}
                      onChange={(v) => setState(v as ScanState)}
                    />
                  </View>
                </View>
              )}
            </View>
          </View>
        </RiseIn>

        {/* Camera note — live mode states the actual permission/validation
            facts; demo mode keeps its honest preview disclosure. */}
        <RiseIn index={4}>
          <WorkspaceWell style={{ marginTop: spacing.md }}>
            <View style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'flex-start' }}>
              <Ionicons name="camera-outline" size={18} color={colors.ownerInkMuted} style={{ marginTop: spacing['3xs'] }} />
              <View style={{ flex: 1 }}>
                <AppText variant="label" style={{ color: colors.ownerInkMuted }}>
                  {live
                    ? 'The camera is used only to read the entrance QR. Nothing is recorded until the server confirms the scan. If camera access is denied, enable it in system settings.'
                    : 'Camera permission belongs to the scanner. This preview does not open the camera; the live build requests permission with a plain-language reason.'}
                </AppText>
              </View>
            </View>
          </WorkspaceWell>
        </RiseIn>

        {/* Training calendar (own authorised check-ins) */}
        <RiseIn index={5}>
          <View
            onLayout={(e) => {
              sectionY.current.progress = e.nativeEvent.layout.y;
            }}
            style={{ marginTop: spacing.xl }}>
            <WorkspaceSection title="Training calendar" style={{ marginTop: 0 }}>
              <AttendanceCalendar events={calendarEvents} />
            </WorkspaceSection>
          </View>
        </RiseIn>

        {/* Attendance history */}
        <WorkspaceSection
          title="My visits"
          style={{ marginTop: spacing.xl }}
          action={
            <Button
              label={history ? 'Hide' : 'Show'}
              size="small"
              variant="ghost"
              onPress={() => setHistory((h) => !h)}
            />
          }>
          {history &&
            (visitsLoading ? (
              <WorkspaceCard>
                <SkeletonRow count={2} />
              </WorkspaceCard>
            ) : visitsError ? (
              <ErrorState
                title="Could not load your visits"
                message={attendanceResource.error ?? 'The register did not answer. Check the connection and try again.'}
                onRetry={live ? refreshAll : () => setListState('full')}
                style={{ marginTop: spacing.sm }}
              />
            ) : visitsEmpty ? (
              <OwnerEmptyState
                icon="footsteps-outline"
                title="No visits yet"
                hint="Your first check-in will appear here. Plan a session and scan at the door."
                actionLabel="Plan your first session"
                onAction={() => undefined}
              />
            ) : (
              <RiseIn index={6}>
                <OwnerListGroup label="Attendance history">
                  {myEvents.map((e, i) => (
                    <View key={e.id}>
                      {i > 0 && <WorkspaceRowDivider />}
                      <OwnerListRow
                        leading={<OwnerMemberAvatar name={e.memberName} />}
                        title={formatTime(e.checkedInAt)}
                        detail={`${formatDate(e.checkedInAt)} · ${e.door}`}
                        status={
                          <OwnerStatusText
                            label={e.status === 'verified' ? 'Recorded' : e.status === 'frozen' ? 'Frozen' : 'Failed'}
                            tone={e.status === 'verified' ? 'up' : e.status === 'frozen' ? 'neutral' : 'down'}
                          />
                        }
                      />
                    </View>
                  ))}
                </OwnerListGroup>
              </RiseIn>
            ))}
          {!history && !visitsLoading && (
            <AppText variant="caption" style={{ color: colors.ownerInkSubtle, marginTop: spacing.xs }}>
              History hidden. Check-ins per day are allowed more than once; each scan is its own register row.
            </AppText>
          )}

          {/* List state review control (demo only: live status is real). */}
          {!live && !history && !visitsLoading && (
            <View style={{ marginTop: spacing.sm }}>
              <AppText variant="caption" style={{ color: colors.ownerInkSubtle }}>
                Review control for the visit list:
              </AppText>
              <View style={{ marginTop: spacing['3xs'] }}>
                <SegmentedTabs
                  variant="owner"
                  size="small"
                  options={[
                    { value: 'full', label: 'Full' },
                    { value: 'empty', label: 'Empty' },
                    { value: 'error', label: 'Error' },
                  ]}
                  value={listState}
                  onChange={(v) => setListState(v as typeof listState)}
                />
              </View>
            </View>
          )}

          {/* Empty state preview (demo only) */}
          {!live && !history && (
            <WorkspaceCard style={{ marginTop: spacing.md }}>
              <AppText variant="label" style={{ color: colors.ownerInkMuted }}>
                No visits on the register yet? The member list opens with an empty state and one action: plan your first session.
              </AppText>
              <EmptyRow />
            </WorkspaceCard>
          )}
        </WorkspaceSection>

        <AppText variant="caption" align="center" style={{ color: colors.ownerInkSubtle, marginTop: spacing.lg }}>
          A member is flagged inactive after 30 days without a recorded check-in. Scans, tokens and attendance writes are validated server-side.
        </AppText>
      </WorkspaceScreen>
    </KeyboardAvoidingView>
  );
}

/** Compact preview illustration (not a live feedback state): the review
 * control shows what the register's empty state looks like. The actual
 * empty state uses the shared OwnerEmptyState. */
function EmptyRow() {
  const tokens = useTokens();
  const { colors, spacing, radius } = tokens;
  return (
    <View style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'center', marginTop: spacing.sm }}>
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          gap: spacing['3xs'],
          paddingVertical: spacing.sm,
          backgroundColor: colors.ownerPanelMuted,
          borderRadius: radius.sm,
        }}>
        <AppText variant="label" style={{ color: colors.ownerInkMuted }}>
          No visits yet
        </AppText>
        <AppText variant="caption" style={{ color: colors.ownerInkSubtle }}>
          Your first check-in will appear here
        </AppText>
      </View>
    </View>
  );
}
