/**
 * Owner dashboard — Overview ("Fino for Pulse").
 *
 * Charcoal ground; header with greeting, gym name and a bell whose dot
 * reflects real open attention items; hero Total Revenue (verified-only,
 * with a month-over-month comparison when the previous month has data);
 * five compact attendance cards from the recorded week (the most recent
 * recorded day carries the restrained pastel gradient); and the white
 * rounded "Needs your attention" panel whose items come only from real
 * sources and link only to modules that exist.
 *
 * Demo mode reads the approved sample data and labels it; live mode reads
 * the authorised views/tables (v_month_revenue, payments, v_member_status,
 * v_inactive_members, join_applications, attendance_events). No
 * notification system or application-review screen exists — those are
 * omitted or plainly labelled rather than fabricated.
 */
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText } from '@/components/ui/text';
import { ButtonSurfaceContext } from '@/components/ui/button';
import { ModalSheet } from '@/components/ui/modal-sheet';
import { RiseIn } from '@/components/ui/rise-in';
import { DemoBadge } from '@/components/ui/demo-badge';
import {
  OwnerHeader,
  PrimaryMetricCard,
  AttendanceWeekStrip,
  AttentionPanel,
  AttentionItemRow,
  AttentionDivider,
  OwnerBottomNavigation,
  deltaPct,
  type AttentionItem,
} from '@/components/owner/owner-ui';
import { useTokens } from '@/hooks/use-tokens';
import { demoAttendanceTrend } from '@/data/demo';
import {
  useAttendance,
  useDailyReport,
  useInactiveMembers,
  useMembers,
  useMonthlyRevenue,
  usePayments,
  usePendingApplications,
} from '@/services/data';
import { DataRefreshControl, ErrorState, SkeletonRow } from '@/components/ui/feedback';
import { displayMembershipStatus } from '@/utils/membership';
import { formatCurrency, formatDate, daysBetween } from '@/utils/format';
import type { TrendPoint } from '@/types/domain';

export default function OwnerDashboardScreen() {
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const { colors, spacing } = tokens;

  const [notificationsOpen, setNotificationsOpen] = useState(false);

  // -- Authorised sources — demo fallbacks or live reads -------------------
  const monthlyResource = useMonthlyRevenue();
  const paymentsResource = usePayments();
  const membersResource = useMembers();
  const inactiveResource = useInactiveMembers();
  const attendanceResource = useAttendance();
  const dailyResource = useDailyReport();
  const applicationsResource = usePendingApplications();
  const live = monthlyResource.isLive;

  const monthly = monthlyResource.data;
  const monthRevenue = monthly?.current.net ?? 0;
  const revenueDelta = monthly?.previous ? deltaPct(monthly.current.net, monthly.previous.net) : undefined;
  const verificationQueue = paymentsResource.data.filter((p) => p.state === 'awaitingVerification');
  const queuedAmount = verificationQueue.reduce((s, p) => s + p.payable, 0);
  const expiring = membersResource.data.filter((m) => displayMembershipStatus(m) === 'expiring');
  // v_inactive_members returns every member with its inactivity metrics, so
  // the owner overview applies the same 30-day/expiry rule the lost screen
  // uses instead of treating the whole view as a lost list.
  const lostMembers = inactiveResource.data.filter((m) => {
    if (m.followUp.status === 'won' || m.followUp.status === 'lost') return false;
    const last = m.lastAttendance ? daysBetween(m.lastAttendance) : null;
    const end = m.membershipEnd ? daysBetween(m.membershipEnd) : null;
    return last === null || last >= 30 || (end !== null && end < 0);
  });
  const notContacted = lostMembers.filter((m) => m.followUp.status === 'none').length;
  const pendingApplications = applicationsResource.data;

  const liveLoading =
    monthlyResource.status === 'loading' ||
    paymentsResource.status === 'loading' ||
    membersResource.status === 'loading' ||
    inactiveResource.status === 'loading' ||
    attendanceResource.status === 'loading' ||
    dailyResource.status === 'loading' ||
    applicationsResource.status === 'loading';
  const hasError =
    monthlyResource.status === 'error' ||
    paymentsResource.status === 'error' ||
    membersResource.status === 'error' ||
    inactiveResource.status === 'error' ||
    attendanceResource.status === 'error' ||
    dailyResource.status === 'error' ||
    applicationsResource.status === 'error';
  const refreshAll = () => {
    monthlyResource.refresh();
    paymentsResource.refresh();
    membersResource.refresh();
    inactiveResource.refresh();
    attendanceResource.refresh();
    dailyResource.refresh();
    applicationsResource.refresh();
  };

  // Last five recorded days: the approved demo trend in demo mode, or the
  // distinct days present in the authorised attendance rows in live mode.
  const weekPoints = useMemo<TrendPoint[]>(() => {
    if (!live) return demoAttendanceTrend.slice(-5);
    const byDay = new Map<string, number>();
    for (const e of attendanceResource.data) {
      if (e.status === 'failed') continue;
      const d = new Date(e.checkedInAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      byDay.set(key, (byDay.get(key) ?? 0) + 1);
    }
    return [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-5)
      .map(([key, value]) => {
        const d = new Date(`${key}T12:00:00`);
        return { label: d.toLocaleDateString('en-IN', { weekday: 'short' }), fullLabel: formatDate(d), value };
      });
  }, [live, attendanceResource.data]);

  const attentionItems: AttentionItem[] = [
    {
      key: 'expiring',
      icon: 'time-outline',
      tint: '#FFF1DE',
      title: 'Memberships expiring soon',
      statusLabel: `${expiring.length} member${expiring.length === 1 ? '' : 's'}`,
      description: 'Renewal window is open. Lock their current price before expiry.',
      href: '/(owner)/members',
      hrefLabel: 'Memberships expiring soon, open the members list',
    },
    {
      key: 'verification',
      icon: 'receipt-outline',
      tint: '#EDF1FE',
      title: 'Verification queue',
      statusLabel: `${formatCurrency(queuedAmount)}`,
      description: `${verificationQueue.length} UPI ${verificationQueue.length === 1 ? 'entry' : 'entries'} awaiting your check. Nothing counts until it passes.`,
      href: '/(owner)/report',
      hrefLabel: 'Verification queue, open the everyday report',
    },
    {
      key: 'applications',
      icon: 'person-add-outline',
      tint: '#F5F5F7',
      title: 'Registration requests',
      statusLabel: `${pendingApplications}`,
      description: 'Member applications completed online are waiting for review.',
    },
    {
      key: 'lost',
      icon: 'person-outline',
      tint: '#FDEDEC',
      title: 'Lost or inactive members',
      statusLabel: `${lostMembers.length}`,
      description: `${notContacted} not yet contacted. 30 days without a visit, or expiry without a return.`,
      href: '/(owner)/lost',
      hrefLabel: 'Lost or inactive members, open the follow-up list',
    },
  ];

  const openItems = attentionItems.filter(
    (i) => (i.statusLabel ?? '').replace(/\D/g, '') !== '0' && i.statusLabel !== undefined,
  );
  const attentionCount = openItems.length;
  const allClear = attentionItems.every((i) => {
    const n = Number((i.statusLabel ?? '0').replace(/\D/g, ''));
    return Number.isNaN(n) ? true : n === 0;
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.ownerBg, paddingTop: insets.top }}>
      <StatusBar style="light" />
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 118 }}
        refreshControl={<DataRefreshControl refreshing={liveLoading} onRefresh={refreshAll} />}
        keyboardShouldPersistTaps="handled">
        {/* Dark upper zone: page title, header, hero, week strip — staggered entrance */}
        <View style={{ paddingHorizontal: spacing.lg }}>
          <RiseIn>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingTop: spacing.sm, paddingBottom: spacing['3xs'] }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <AppText variant="display" style={{ color: colors.ownerHeroInk }}>
                  Overview
                </AppText>
                {/* Short accent rule — the shared header signature. */}
                <View
                  style={{
                    width: 30,
                    height: 3,
                    borderRadius: tokens.radius.pill,
                    backgroundColor: colors.ownerAccent,
                    marginTop: spacing.xs,
                    marginBottom: spacing['3xs'],
                  }}
                />
                <AppText variant="caption" style={{ color: colors.ownerHeroMuted }}>
                  {live ? 'Pulse Gym · owner console · live data' : 'Pulse Gym · owner console · demo data'}
                </AppText>
              </View>
              {!live && <DemoBadge small label="Demo data" />}
            </View>
          </RiseIn>
          <RiseIn index={1}>
            <OwnerHeader attentionCount={attentionCount} onPressBell={() => setNotificationsOpen(true)} />
          </RiseIn>

          {hasError && (
            <RiseIn index={1}>
              <ErrorState
                title="Some owner data could not load"
                message={
                  monthlyResource.error ??
                  paymentsResource.error ??
                  membersResource.error ??
                  inactiveResource.error ??
                  attendanceResource.error ??
                  'The owner overview is partially unavailable right now.'
                }
                onRetry={refreshAll}
                style={{ marginBottom: spacing.md }}
              />
            </RiseIn>
          )}
          {live && liveLoading && !monthly ? (
            <RiseIn index={1}>
              <SkeletonRow count={3} style={{ marginBottom: spacing.md }} />
            </RiseIn>
          ) : null}

          <RiseIn index={2}>
            <PrimaryMetricCard
              caption="Revenue this month · verified only"
              value={formatCurrency(monthRevenue)}
              countValue={monthRevenue}
              deltaPct={revenueDelta}
              deltaUnit="WoW"
              supporting={
                live
                  ? `Today: ${formatCurrency(dailyResource.data?.verifiedCollections ?? 0)} verified · ${formatCurrency(queuedAmount)} in the verification queue`
                  : `Sample ledger: ${formatCurrency(dailyResource.data?.verifiedCollections ?? 0)} for the day · ${formatCurrency(queuedAmount)} in the verification queue`
              }
            />
          </RiseIn>

          <RiseIn index={3}>
            <View style={{ marginBottom: spacing.xs }}>
              <AppText variant="label" style={{ color: colors.ownerHeroMuted }}>
                Attendance · last recorded week
              </AppText>
            </View>
          </RiseIn>
          <RiseIn index={4}>
            <AttendanceWeekStrip points={weekPoints} />
          </RiseIn>
        </View>

        {/* White rounded panel: needs your attention. The panel is a LIGHT
            button surface (same provider the other scaffolds use). */}
        <RiseIn index={5}>
          <ButtonSurfaceContext.Provider value="light">
            <AttentionPanel
          title="Needs your attention"
          subtitle={
            allClear
              ? 'Nothing is waiting on you today.'
              : `${attentionItems.length} kinds of open items · from your gym data`
          }>
          {allClear ? (
            <View style={{ alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.xs }}>
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  borderWidth: 2,
                  borderColor: colors.ownerSuccessDeep,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                <Ionicons name="checkmark" size={30} color={colors.ownerSuccessDeep} />
              </View>
              <AppText variant="bodyStrong" style={{ color: colors.ownerInk }}>
                You&apos;re all caught up
              </AppText>
              <AppText variant="caption" align="center" style={{ color: colors.ownerInkMuted }}>
                No expiring memberships, an empty verification queue and everyone followed up.
              </AppText>
            </View>
          ) : (
            attentionItems.map((item, i) => (
              <View key={item.key}>
                {i > 0 && <AttentionDivider />}
                <AttentionItemRow
                  item={item}
                  onPress={item.href ? () => router.navigate(item.href as never) : undefined}
                />
              </View>
            ))
          )}
          <AppText variant="caption" style={{ color: colors.ownerInkSubtle, marginTop: spacing.md }}>
            {live
              ? 'Overdue-fee tracking is not part of the current read-only views; nothing here is invented.'
              : 'Overdue-fee alerts arrive with the payments backend (Parts 2-3). Nothing here is invented.'}
          </AppText>
            </AttentionPanel>
          </ButtonSurfaceContext.Provider>
        </RiseIn>
      </ScrollView>

      <OwnerBottomNavigation active="overview" />

      {/* Notifications: the bell lists the same real attention items */}
      <ModalSheet
        visible={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        title="Notifications"
        subtitle={live ? 'Open attention items from your gym data' : 'Open attention items from your gym data (demo)'}>
        {allClear ? (
          <AppText variant="label" style={{ color: colors.ownerInkMuted }}>
            Nothing open right now. The bell lights up when an item needs you.
          </AppText>
        ) : (
          <View style={{ gap: spacing.sm }}>
            {openItems.map((item) => (
              <View key={item.key} style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'flex-start' }}>
                <Ionicons name={item.icon} size={18} color={colors.ownerInk} style={{ marginTop: 2 }} />
                <View style={{ flex: 1 }}>
                  <AppText variant="label" style={{ color: colors.ownerInk, fontWeight: '600' }}>
                    {item.title} · {item.statusLabel}
                  </AppText>
                  <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
                    {item.description}
                  </AppText>
                </View>
              </View>
            ))}
          </View>
        )}
        <AppText variant="caption" style={{ color: colors.ownerInkSubtle, marginTop: spacing.sm }}>
          Push notifications and reminders arrive with the backend in Part 2.
        </AppText>
      </ModalSheet>
    </View>
  );
}
