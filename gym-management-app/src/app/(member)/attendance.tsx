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
 * member-focused: no management information, just the journey. All data
 * shown is demo data and stays labelled as such.
 */
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { ActionGrid, ActionTile } from '@/components/ui/action-tile';
import { SegmentedTabs } from '@/components/ui/segmented-tabs';
import { RiseIn } from '@/components/ui/rise-in';
import { CountUp, Meter } from '@/components/ui/motion';
import { ErrorState, SkeletonRow } from '@/components/ui/feedback';
import { AttendanceCalendar } from '@/components/attendance-calendar';
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
import { demoAttendance, demoMemberHistory, demoMembers, demoPlans } from '@/data/demo';
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

  const myEvents = useMemo(() => demoAttendance.filter((e) => e.memberId === 'm-1042'), []);
  // Calendar feeds on the generated demo history plus today's demo check-ins.
  const calendarEvents = useMemo(() => [...demoMemberHistory, ...myEvents], [myEvents]);

  // Membership summary — straight from the demo member record, labelled demo.
  const me = useMemo(() => demoMembers.find((m) => m.id === 'm-1042'), []);
  const myPlan = useMemo(() => demoPlans.find((p) => p.id === me?.planId), [me]);
  const firstName = me ? me.name.split(' ')[0] : 'Member';
  const isActive = me?.status === 'active';

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
        subtitle={`Member · ${me?.name ?? 'Demo member'} (demo)`}
        demo
        actions={<SignOut />}
        footerPadding={24}
        onContentRef={(sv) => {
          scrollRef.current = sv;
        }}>
        {/* My membership — from the demo member record */}
        <RiseIn>
          <View
            onLayout={(e) => {
              sectionY.current.plan = e.nativeEvent.layout.y;
            }}
            accessibilityLabel={`My membership: ${myPlan?.name ?? ''} plan, ${isActive ? 'active' : me?.status ?? ''}, valid till ${me?.membershipEnd ? formatDate(me.membershipEnd) : 'unknown'}. Demo data.`}
            accessible>
            <WorkspaceCard>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <View style={{ flex: 1, minWidth: 0, gap: spacing['3xs'] }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                    <AppText variant="label" style={{ color: colors.ownerInkMuted }}>
                      My Membership
                    </AppText>
                    <OwnerStatusText
                      label={isActive ? 'Active' : me?.status ?? 'Unknown'}
                      tone={isActive ? 'up' : 'warning'}
                    />
                  </View>
                  <AppText variant="figureSmall" style={{ color: colors.ownerInk }}>
                    {myPlan?.name ?? '—'} Plan
                  </AppText>
                  <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
                    Valid till {me?.membershipEnd ? formatDate(me.membershipEnd) : '—'} · demo data
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
            accessibilityLabel={`This week: trained on ${weekStats.trained} of ${weekStats.elapsed} days. Demo data.`}
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
                Counted from your demo check-ins; the register confirms every session.
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
            {/* Scanner surface */}
            <View style={{ height: 210, alignItems: 'center', justifyContent: 'center' }}>
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
                  {state === 'ready' ? 'Centre the code inside the frame' : state === 'success' ? 'Checked in' : state === 'invalid' ? 'Invalid code' : state === 'expired' ? 'Expired code' : 'Membership inactive'}
                </AppText>
              </View>
            </View>
            <View style={{ backgroundColor: colors.ownerPanelMuted, padding: spacing.md, gap: spacing.xs }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <AppText variant="bodyStrong" style={{ color: colors.ownerInk }}>
                  {state === 'ready'
                    ? 'Hold your QR at the entrance'
                    : state === 'invalid'
                      ? 'That QR is not an attendance code'
                      : state === 'expired'
                        ? 'This code has expired'
                        : state === 'inactive'
                          ? 'Membership is not active'
                          : 'Checked in'}
                </AppText>
                <OwnerStatusText
                  label={state === 'success' ? 'Recorded' : state === 'ready' ? 'Awaiting scan' : state === 'invalid' ? 'Invalid code' : state === 'expired' ? 'Expired code' : 'Inactive'}
                  tone={state === 'success' ? 'up' : state === 'ready' ? 'action' : state === 'invalid' || state === 'inactive' ? 'down' : 'warning'}
                />
              </View>
              <AppText variant="label" style={{ color: colors.ownerInkMuted }}>
                {state === 'ready'
                  ? 'Point the camera at the QR shown on the reception screen. Tokens refresh automatically; an old screenshot will not work.'
                  : state === 'invalid'
                    ? 'The code scanned does not belong to this gym. Attendance was not recorded. Show your membership screen or ask at the desk.'
                    : state === 'expired'
                      ? 'Attendance codes expire and are replaced automatically. Ask the desk to show the current one and scan again.'
                      : state === 'inactive'
                        ? 'Attendance cannot be recorded while membership is expired or frozen. The desk can take a renewal or freeze request.'
                        : 'Enjoy the session. Multiple check-ins a day are allowed: scan again when you return.'}
              </AppText>
              {/* Review control: switch designed states. Removed in Part 5 when
                  the real scanner drives these outcomes. */}
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
            </View>
          </View>
        </RiseIn>

        {/* Camera permission note (state designed; request happens in Part 5) */}
        <RiseIn index={4}>
          <WorkspaceWell style={{ marginTop: spacing.md }}>
            <View style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'flex-start' }}>
              <Ionicons name="camera-outline" size={18} color={colors.ownerInkMuted} style={{ marginTop: spacing['3xs'] }} />
              <View style={{ flex: 1 }}>
                <AppText variant="label" style={{ color: colors.ownerInkMuted }}>
                  Camera permission belongs to the scanner. This preview does not open the camera; Part 5 requests permission with a plain-language reason.
                </AppText>
              </View>
            </View>
          </WorkspaceWell>
        </RiseIn>

        {/* Training calendar (demo history + today's demo check-ins) */}
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
            (listState === 'loading' ? (
              <WorkspaceCard>
                <SkeletonRow count={2} />
              </WorkspaceCard>
            ) : listState === 'error' ? (
              <ErrorState
                title="Could not load your visits"
                message="The register did not answer. Check the connection and try again."
                onRetry={() => setListState('full')}
                style={{ marginTop: spacing.sm }}
              />
            ) : myEvents.length === 0 || listState === 'empty' ? (
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
          {!history && listState !== 'loading' && (
            <AppText variant="caption" style={{ color: colors.ownerInkSubtle, marginTop: spacing.xs }}>
              History hidden. Check-ins per day are allowed more than once; each scan is its own register row.
            </AppText>
          )}

          {/* List state review control (loading, empty, error are designed). */}
          {!history && listState !== 'loading' && (
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

          {/* Empty state preview */}
          {!history && (
            <WorkspaceCard style={{ marginTop: spacing.md }}>
              <AppText variant="label" style={{ color: colors.ownerInkMuted }}>
                No visits on the register yet? The member list opens with an empty state and one action: plan your first session.
              </AppText>
              <EmptyRow />
            </WorkspaceCard>
          )}
        </WorkspaceSection>

        <AppText variant="caption" align="center" style={{ color: colors.ownerInkSubtle, marginTop: spacing.lg }}>
          A member is flagged inactive after 30 days without a recorded check-in. Scans, tokens and attendance writes are server-side (Part 5).
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
