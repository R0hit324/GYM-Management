/**
 * Owner dashboard — Overview ("Fino for Pulse").
 *
 * Charcoal ground; header with greeting, gym name and a bell whose dot
 * reflects real open attention items; hero Total Revenue (verified-only,
 * real WoW comparison from the collections trend); five compact attendance
 * cards from the recorded week (the most recent recorded day carries the
 * restrained pastel gradient — nothing pretends to be "today"); and the
 * white rounded "Needs your attention" panel whose items come only from
 * real demo-data sources and link only to modules that exist.
 *
 * Part 1 honesty: all numbers are demo-labelled sample data; there is no
 * backend, so no notification system, no overdue-fee source and no owner
 * application-review screen exist — those are omitted or plainly labelled
 * rather than fabricated.
 */
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText } from '@/components/ui/text';
import { ModalSheet } from '@/components/ui/modal-sheet';
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
import {
  demoOwnershipReport,
  demoAttendanceTrend,
  demoCollectionsTrend,
  demoMembers,
  demoPayments,
} from '@/data/demo';
import { formatCurrency, daysBetween } from '@/utils/format';

export default function OwnerDashboardScreen() {
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const { colors, spacing } = tokens;

  const [notificationsOpen, setNotificationsOpen] = useState(false);

  // -- Real (demo-labelled) sources — reused, not duplicated ---------------
  const monthRevenue = demoCollectionsTrend.reduce((s, p) => s + p.value, 0);
  const revenueDelta = deltaPct(
    demoCollectionsTrend[demoCollectionsTrend.length - 1]?.value ?? 0,
    demoCollectionsTrend[demoCollectionsTrend.length - 2]?.value ?? 0,
  );
  const verificationQueue = demoPayments.filter((p) => p.state === 'awaitingVerification');
  const queuedAmount = verificationQueue.reduce((s, p) => s + p.payable, 0);
  const expiring = demoMembers.filter((m) => m.status === 'expiring');
  const lostMembers = demoMembers.filter((m) => {
    const end = m.membershipEnd ? daysBetween(m.membershipEnd) : null;
    const last = m.lastAttendance ? daysBetween(m.lastAttendance) : null;
    const inactive = last === null || last >= 30;
    const expired = end !== null && end < 0;
    return (inactive || expired) && m.followUp.status !== 'won' && m.followUp.status !== 'lost';
  });
  const notContacted = lostMembers.filter((m) => m.followUp.status === 'none').length;

  // Last five recorded days of the week's trend.
  const weekPoints = useMemo(() => demoAttendanceTrend.slice(-5), []);

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
      statusLabel: `${demoOwnershipReport.pendingApplications}`,
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
        keyboardShouldPersistTaps="handled">
        {/* Dark upper zone: page title, header, hero, week strip */}
        <View style={{ paddingHorizontal: spacing.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingTop: spacing.sm, paddingBottom: spacing['3xs'] }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <AppText variant="title" style={{ color: colors.ownerHeroInk }}>
                Overview
              </AppText>
              <AppText variant="caption" style={{ color: colors.ownerHeroMuted, marginTop: spacing['3xs'] }}>
                Pulse Gym · owner console · demo data
              </AppText>
            </View>
            <DemoBadge small label="Demo data" />
          </View>
          <OwnerHeader attentionCount={attentionCount} onPressBell={() => setNotificationsOpen(true)} />

          <PrimaryMetricCard
            caption="Revenue this month · verified only"
            value={formatCurrency(monthRevenue)}
            deltaPct={revenueDelta}
            deltaUnit="WoW"
            supporting={`${formatCurrency(demoOwnershipReport.verifiedCollections)} collected today · ${formatCurrency(queuedAmount)} in the verification queue`}
          />

          <View style={{ marginBottom: spacing.xs }}>
            <AppText variant="label" style={{ color: colors.ownerHeroMuted }}>
              Attendance · last recorded week
            </AppText>
          </View>
          <AttendanceWeekStrip points={weekPoints} />
        </View>

        {/* White rounded panel: needs your attention */}
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
            Overdue-fee alerts arrive with the payments backend (Parts 2-3). Nothing here is invented.
          </AppText>
        </AttentionPanel>
      </ScrollView>

      <OwnerBottomNavigation active="overview" />

      {/* Notifications: the bell lists the same real attention items */}
      <ModalSheet
        visible={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        title="Notifications"
        subtitle="Open attention items from your gym data (demo)">
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
