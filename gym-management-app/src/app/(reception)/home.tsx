/**
 * Receptionist Home — today's desk overview, nothing else.
 *
 * Answers the four front-desk questions in priority order (brief §2):
 * attendance today (events AND unique members, never conflated), today's
 * money (verified cash / verified UPI / verified total — only verified
 * entries count as revenue; recorded-but-pending is always shown
 * separately), new registrations and renewals today, and the day's
 * alerts. A short recent-activity preview links to the full register;
 * operational tools live in the Members and More tabs.
 *
 * Every figure derives from the records the current session is authorised
 * to read: the demo-labelled set in demo mode, or the live views/tables
 * (v_daily_report, attendance_events, v_member_status, payments) in live
 * mode. When the honest answer is ₹0 the screen says so — no number is
 * ever borrowed from the owner report's sample ledger.
 */
import { useMemo } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';

import { AppText } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { StatRow } from '@/components/ui/stat-tile';
import { ActionGrid, ActionTile } from '@/components/ui/action-tile';
import { RiseIn } from '@/components/ui/rise-in';
import { SignOut } from '@/components/workspace-meta';
import {
  WorkspaceScreen,
  WorkspaceBottomNavigation,
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
import { PressSurface } from '@/components/ui/press-surface';
import { AnimatedIcon } from '@/components/ui/animated-icon';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTokens } from '@/hooks/use-tokens';
import { useSessionPayments } from '@/data/session';
import { useAttendance, useDailyReport, useMembers, usePayments } from '@/services/data';
import { DataRefreshControl, ErrorState, SkeletonRow } from '@/components/ui/feedback';
import { displayMembershipStatus, EXPIRING_SOON_DAYS } from '@/utils/membership';
import { formatCurrency, formatTime, isSameLocalDay, pluralise } from '@/utils/format';

const navItems = [
  { key: 'home', label: 'Home', icon: 'home-outline', href: '/(reception)/home' },
  { key: 'members', label: 'Members', icon: 'people-outline', href: '/(reception)/members' },
  { key: 'more', label: 'More', icon: 'apps-outline', href: '/(reception)/more' },
] as const;

export default function ReceptionHomeScreen() {
  const tokens = useTokens();
  const { colors, spacing } = tokens;

  const dailyResource = useDailyReport();
  const attendanceResource = useAttendance();
  const membersResource = useMembers();
  const paymentsResource = usePayments();
  const sessionPayments = useSessionPayments();
  const live = dailyResource.isLive;
  // Demo mode keeps the session store so a desk-recorded entry still appears
  // here; live mode reads authorised payment rows from the backend.
  const records = live ? paymentsResource.data : sessionPayments;
  const attendance = attendanceResource.data;
  const members = membersResource.data;
  const daily = dailyResource.data;
  const liveLoading =
    dailyResource.status === 'loading' ||
    attendanceResource.status === 'loading' ||
    membersResource.status === 'loading' ||
    paymentsResource.status === 'loading';
  const hasError =
    dailyResource.status === 'error' ||
    attendanceResource.status === 'error' ||
    membersResource.status === 'error' ||
    paymentsResource.status === 'error';
  const refreshAll = () => {
    dailyResource.refresh();
    attendanceResource.refresh();
    membersResource.refresh();
    paymentsResource.refresh();
  };

  // ---- Today's metrics, all derived from the real records ----
  const metrics = useMemo(() => {
    const todayEvents = attendance.filter((e) => e.status !== 'failed' && isSameLocalDay(e.checkedInAt));
    const visitors = new Set(todayEvents.map((e) => e.memberId)).size;

    const todayRecords = records.filter((p) => isSameLocalDay(p.createdAt));
    const verifiedToday = todayRecords.filter((p) => p.state === 'verified');
    const verifiedCash = verifiedToday.filter((p) => p.method === 'cash').reduce((s, p) => s + p.payable, 0);
    const verifiedUpi = verifiedToday.filter((p) => p.method === 'upi').reduce((s, p) => s + p.payable, 0);
    const recordedToday = todayRecords.reduce((s, p) => s + p.payable, 0);

    const pending = records.filter((p) => p.state === 'awaitingVerification');

    let newRegistrations = 0;
    let expiring = 0;
    for (const m of members) {
      if (isSameLocalDay(m.joinedOn)) newRegistrations++;
      if (displayMembershipStatus(m) === 'expiring') expiring++;
    }
    // Renewals = today's payment records whose member had already joined
    // before that day; a payment on the join day itself is a registration.
    const renewals = todayRecords.filter((p) => {
      const m = members.find((dm) => dm.id === p.memberId);
      return m ? !isSameLocalDay(m.joinedOn, new Date(p.createdAt)) : false;
    }).length;

    const computed = {
      checkIns: todayEvents.length,
      visitors,
      verifiedCash,
      verifiedUpi,
      verifiedTotal: verifiedCash + verifiedUpi,
      recordedToday,
      pendingCount: pending.length,
      pendingAmount: pending.reduce((s, p) => s + p.payable, 0),
      newRegistrations,
      renewals,
      expiring,
    };

    // The verified daily view is the authoritative day count in live mode.
    if (live && daily) {
      return {
        ...computed,
        checkIns: daily.attendance,
        visitors: daily.uniqueVisitors,
        verifiedTotal: daily.verifiedCollections,
        newRegistrations: daily.newMembers,
        renewals: daily.renewals,
      };
    }
    return computed;
  }, [records, attendance, members, daily, live]);

  // Recent activity preview: today's check-in rows, newest last kept in
  // record order — a short window, never the full register.
  const recent = useMemo(
    () => attendance.filter((e) => e.status !== 'failed' && isSameLocalDay(e.checkedInAt)).slice(0, 5),
    [attendance],
  );

  const quickActions = [
    {
      key: 'collect',
      icon: 'cash-outline' as const,
      label: 'Collect Payment',
      badge: metrics.pendingCount > 0 ? String(metrics.pendingCount) : undefined,
      onPress: () => router.navigate('/(reception)/fees' as never),
    },
    {
      key: 'qr',
      icon: 'qr-code-outline' as const,
      label: 'Payment QR',
      onPress: () => router.navigate('/(reception)/payment-qr' as never),
    },
    {
      key: 'renew',
      icon: 'calendar-clear-outline' as const,
      label: 'Renewals',
      onPress: () => router.navigate('/(reception)/renewals' as never),
    },
  ];

  return (
    <View style={{ flex: 1 }}>
      <WorkspaceScreen
        title="Front desk"
        eyebrow="Reception desk"
        subtitle="Today at a glance"
        demo={!live}
        actions={<SignOut />}
        refreshControl={<DataRefreshControl refreshing={liveLoading} onRefresh={refreshAll} />}>
        {hasError && (
          <RiseIn>
            <ErrorState
              title="Today's desk data could not load"
              message={
                dailyResource.error ??
                attendanceResource.error ??
                membersResource.error ??
                paymentsResource.error ??
                'The desk overview is unavailable right now.'
              }
              onRetry={refreshAll}
              style={{ marginBottom: spacing.sm }}
            />
          </RiseIn>
        )}
        {live && liveLoading && members.length === 0 && attendance.length === 0 ? (
          <RiseIn style={{ marginBottom: spacing.md }}>
            <SkeletonRow count={4} />
          </RiseIn>
        ) : null}
        {/* 1 — Attendance summary */}
        <RiseIn>
          <StatRow>
            <OwnerStatTile
              label="Check-in events today"
              value={String(metrics.checkIns)}
              count={metrics.checkIns}
              hint="Multiple per member allowed"
              icon="walk-outline"
              tone="cyan"
            />
            <OwnerStatTile
              label="Unique members today"
              value={String(metrics.visitors)}
              count={metrics.visitors}
              hint="Members, not scans"
              icon="people-outline"
              tone="violet"
            />
          </StatRow>
        </RiseIn>

        <RiseIn index={1} style={{ marginTop: spacing.sm }}>
          <StatRow>
            <OwnerStatTile
              label="New registrations today"
              value={String(metrics.newRegistrations)}
              count={metrics.newRegistrations}
              hint="Members who joined today"
              icon="person-add-outline"
              tone="blue"
            />
            <OwnerStatTile
              label="Renewals today"
              value={String(metrics.renewals)}
              count={metrics.renewals}
              hint="Payments from existing members"
              icon="calendar-clear-outline"
              tone="mint"
            />
          </StatRow>
        </RiseIn>

        {/* 2 — Financial summary */}
        <RiseIn index={2} style={{ marginTop: spacing.md }}>
          <WorkspaceSection title="Today's money">
            <StatRow>
              <OwnerStatTile
                label="Verified cash"
                value={formatCurrency(metrics.verifiedCash)}
                count={metrics.verifiedCash}
                countCurrency
                icon="cash-outline"
                tone="mint"
              />
              <OwnerStatTile
                label="Verified UPI"
                value={formatCurrency(metrics.verifiedUpi)}
                count={metrics.verifiedUpi}
                countCurrency
                icon="phone-portrait-outline"
                tone="mint"
              />
            </StatRow>
            <View style={{ marginTop: spacing.sm }}>
              <StatRow>
                <OwnerStatTile
                  label="Total verified today"
                  value={formatCurrency(metrics.verifiedTotal)}
                  count={metrics.verifiedTotal}
                  countCurrency
                  hint="Verified entries only"
                  icon="shield-checkmark-outline"
                  tone="mint"
                />
                <OwnerStatTile
                  label="Pending verification"
                  value={formatCurrency(metrics.pendingAmount)}
                  count={metrics.pendingAmount}
                  countCurrency
                  hint={`${pluralise(metrics.pendingCount, 'entry', 'entries')} · never revenue`}
                  icon="hourglass-outline"
                  tone="amber"
                />
              </StatRow>
            </View>
            <AppText variant="caption" style={{ color: colors.ownerInkSubtle, marginTop: spacing.xs }}>
              Recorded today: {formatCurrency(metrics.recordedToday)} (pending check included). Only verified entries count as revenue.
            </AppText>
          </WorkspaceSection>
        </RiseIn>

        {/* 3 — Today's alerts */}
        <RiseIn index={3} style={{ marginTop: spacing.md }}>
          <WorkspaceSection title="Needs attention">
            {metrics.pendingCount === 0 && metrics.expiring === 0 ? (
              <WorkspaceWell>
                <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
                  Nothing needs attention right now.
                </AppText>
              </WorkspaceWell>
            ) : (
              <View
                style={{
                  backgroundColor: colors.ownerPanel,
                  borderRadius: tokens.radius.md,
                  borderWidth: 1,
                  borderColor: colors.ownerRule,
                }}>
                {metrics.pendingCount > 0 && (
                  <AlertRow
                    icon="hourglass-outline"
                    tone={colors.ownerWarningDeep}
                    title={`${pluralise(metrics.pendingCount, 'payment', 'payments')} awaiting verification`}
                    detail={`${formatCurrency(metrics.pendingAmount)} recorded — not revenue until the Owner verifies`}
                    onPress={() => router.navigate('/(reception)/transaction-history' as never)}
                  />
                )}
                {metrics.expiring > 0 && metrics.pendingCount > 0 && <WorkspaceRowDivider />}
                {metrics.expiring > 0 && (
                  <AlertRow
                    icon="time-outline"
                    tone={colors.ownerAccentDeep}
                    title={`${pluralise(metrics.expiring, 'membership', 'memberships')} expiring in ${EXPIRING_SOON_DAYS} days`}
                    detail="Reach out before the end date"
                    onPress={() => router.navigate('/(reception)/renewals' as never)}
                  />
                )}
              </View>
            )}
          </WorkspaceSection>
        </RiseIn>

        {/* 4 — Short recent-activity preview (full register in More) */}
        <RiseIn index={4} style={{ marginTop: spacing.md }}>
          <WorkspaceSection
            title="Recent activity"
            action={
              <Button
                label="Full register"
                size="small"
                variant="secondary"
                icon="enter-outline"
                onPress={() => router.navigate('/(reception)/attendance' as never)}
              />
            }>
            {recent.length === 0 ? (
              <OwnerEmptyState
                icon="enter-outline"
                title="No check-ins yet today"
                hint="Scans appear here as members check in."
              />
            ) : (
              <OwnerListGroup label="Latest check-ins">
                {recent.map((e, i) => (
                  <View key={e.id}>
                    {i > 0 && <WorkspaceRowDivider />}
                    <OwnerListRow
                      leading={<OwnerMemberAvatar name={e.memberName} />}
                      title={e.memberName}
                      detail={`${e.memberIdDisplay} · ${formatTime(e.checkedInAt)} · ${e.door}`}
                      status={<OwnerStatusText label="Recorded" tone="up" />}
                    />
                  </View>
                ))}
              </OwnerListGroup>
            )}
            <AppText variant="caption" style={{ color: colors.ownerInkSubtle, marginTop: spacing.xs }}>
              Showing the {recent.length === 1 ? 'latest event' : `${recent.length} latest events`} of {pluralise(metrics.checkIns, 'event', 'events')} today.
            </AppText>
          </WorkspaceSection>
        </RiseIn>

        {/* Shortcuts that genuinely help the desk — everything else lives
            in the Members and More tabs. */}
        <RiseIn index={5} style={{ marginTop: spacing.md }}>
          <WorkspaceSection title="Quick actions">
            <ActionGrid>
              {quickActions.map((action) => (
                <ActionTile
                  key={action.key}
                  icon={action.icon}
                  label={action.label}
                  badge={action.badge}
                  tone="accent"
                  onPress={action.onPress}
                  accessibilityHint={`Opens the ${action.label.toLowerCase()} screen`}
                  style={{ flex: 1, minWidth: 96 }}
                />
              ))}
            </ActionGrid>
          </WorkspaceSection>
        </RiseIn>

        <RiseIn index={6} style={{ marginTop: spacing.md }}>
          <WorkspaceWell>
            <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
              Member search lives on the Members tab; the register, payment QR, transaction history and membership tools are in More.
            </AppText>
          </WorkspaceWell>
        </RiseIn>
      </WorkspaceScreen>

      <WorkspaceBottomNavigation active="home" items={navItems} />
    </View>
  );
}

/** One tappable alert row inside the attention panel. */
function AlertRow(props: {
  icon: keyof typeof Ionicons.glyphMap;
  tone: string;
  title: string;
  detail: string;
  onPress: () => void;
}) {
  const tokens = useTokens();
  const { colors, spacing, radius } = tokens;
  return (
    <PressSurface
      accessibilityRole="button"
      accessibilityLabel={`${props.title}. ${props.detail}`}
      onPress={props.onPress}
      scaleOnPress={false}
      style={{
        minHeight: 56,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
        borderRadius: radius.md,
      }}>
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: radius.sm,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.ownerPanelMuted,
        }}>
        <AnimatedIcon name={props.icon} size={18} color={props.tone} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText variant="bodyStrong" numberOfLines={1} style={{ color: colors.ownerInk }}>
          {props.title}
        </AppText>
        <AppText variant="caption" numberOfLines={1} style={{ color: colors.ownerInkMuted }}>
          {props.detail}
        </AppText>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.ownerInkMuted} />
    </PressSurface>
  );
}
