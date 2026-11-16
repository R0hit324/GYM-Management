/**
 * Receptionist More — all operational tools, exactly three sections.
 *
 * Daily Operations (Attendance Register, Attendance & Door QR), Payments
 * (Collect Payment, Payment QR, Transaction History) and Membership
 * Management (Membership Plans, Renewals, Freeze / Unfreeze). Every row
 * points at its own dedicated screen — no duplicate rows to the same
 * destination, no "Other" bucket.
 */
import { View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText } from '@/components/ui/text';
import { PressSurface } from '@/components/ui/press-surface';
import { RiseIn } from '@/components/ui/rise-in';
import { SignOut } from '@/components/workspace-meta';
import {
  WorkspaceScreen,
  WorkspaceBottomNavigation,
  WorkspaceSection,
  WorkspaceWell,
} from '@/components/workspace/workspace-ui';
import { useTokens } from '@/hooks/use-tokens';
import { useSessionPayments } from '@/data/session';

const navItems = [
  { key: 'home', label: 'Home', icon: 'home-outline', href: '/(reception)/home' },
  { key: 'members', label: 'Members', icon: 'people-outline', href: '/(reception)/members' },
  { key: 'more', label: 'More', icon: 'apps-outline', href: '/(reception)/more' },
] as const;

interface MoreAction {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  hint?: string;
  badge?: string;
  href: string;
}

interface MoreSection {
  key: string;
  title: string;
  tone: 'cyan' | 'amber' | 'blue' | 'mint';
  actions: MoreAction[];
}

export default function ReceptionMoreScreen() {
  const tokens = useTokens();
  const { colors, spacing, radius } = tokens;

  const records = useSessionPayments();
  const pendingCount = records.filter((p) => p.state === 'awaitingVerification').length;

  const sections: MoreSection[] = [
    {
      key: 'daily',
      title: 'Daily Operations',
      tone: 'cyan',
      actions: [
        { key: 'attendance', label: 'Attendance Register', icon: 'walk-outline', hint: "Any member's month-by-month attendance", href: '/(reception)/attendance' },
        { key: 'checkinout', label: 'Attendance & Door QR', icon: 'swap-horizontal-outline', hint: 'The QR the entrance displays', href: '/(reception)/door-qr' },
      ],
    },
    {
      key: 'payments',
      title: 'Payments',
      tone: 'amber',
      actions: [
        { key: 'collect', label: 'Collect Payment', icon: 'cash-outline', badge: pendingCount > 0 ? String(pendingCount) : undefined, hint: 'Member, plan, discount, UPI or cash', href: '/(reception)/fees' },
        { key: 'qr', label: 'Payment QR', icon: 'qr-code-outline', hint: "The gym's UPI code and its configuration", href: '/(reception)/payment-qr' },
        { key: 'history', label: 'Transaction History', icon: 'time-outline', hint: 'Pending and verified payment records', href: '/(reception)/transaction-history' },
      ],
    },
    {
      key: 'membership',
      title: 'Membership Management',
      tone: 'blue',
      actions: [
        { key: 'plans', label: 'Membership Plans', icon: 'card-outline', hint: 'Plans, durations and prices', href: '/(reception)/plans' },
        { key: 'renewals', label: 'Renewals', icon: 'calendar-clear-outline', hint: 'Expiring and expired memberships', href: '/(reception)/renewals' },
        { key: 'freeze', label: 'Freeze / Unfreeze', icon: 'snow-outline', hint: 'Requests, frozen list and history', href: '/(reception)/freeze' },
      ],
    },
  ];

  const toneColor = (tone: MoreSection['tone']) =>
    tone === 'cyan'
      ? colors.ownerCyanDeep
      : tone === 'amber'
        ? colors.ownerWarningDeep
        : tone === 'blue'
          ? colors.ownerAccentDeep
          : colors.ownerSuccessDeep;

  return (
    <View style={{ flex: 1 }}>
      <WorkspaceScreen
        title="More"
        eyebrow="Reception desk"
        subtitle="All desk operations, organised"
        demo
        actions={<SignOut />}>
        {sections.map((section, si) => (
          <RiseIn key={section.key} index={si} style={{ marginTop: si === 0 ? 0 : spacing.md }}>
            <WorkspaceSection title={section.title}>
              <View
                accessibilityRole="tablist"
                style={{
                  backgroundColor: colors.ownerPanel,
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: colors.ownerRule,
                }}>
                {section.actions.map((action, ai) => (
                  <View key={action.key}>
                    {ai > 0 && <View style={{ height: 1, backgroundColor: colors.ownerRule }} />}
                    <PressSurface
                      accessibilityRole="button"
                      accessibilityLabel={`${action.label}. ${action.hint ?? ''}`}
                      onPress={() => router.navigate(action.href as never)}
                      scaleOnPress={false}
                      style={{
                        minHeight: 56,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: spacing.sm,
                        paddingHorizontal: spacing.md,
                        paddingVertical: spacing.xs,
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
                        <Ionicons name={action.icon} size={18} color={toneColor(section.tone)} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                          <AppText variant="bodyStrong" numberOfLines={1} style={{ color: colors.ownerInk }}>
                            {action.label}
                          </AppText>
                          {action.badge && (
                            <View
                              style={{
                                backgroundColor: colors.ownerPanelMuted,
                                borderRadius: radius.pill,
                                paddingHorizontal: spacing.xs,
                                minHeight: 20,
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}>
                              <AppText variant="caption" style={{ color: colors.ownerWarningDeep, fontWeight: '700' }}>
                                {action.badge}
                              </AppText>
                            </View>
                          )}
                        </View>
                        {action.hint && (
                          <AppText variant="caption" numberOfLines={1} style={{ color: colors.ownerInkMuted }}>
                            {action.hint}
                          </AppText>
                        )}
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={colors.ownerInkMuted} />
                    </PressSurface>
                  </View>
                ))}
              </View>
            </WorkspaceSection>
          </RiseIn>
        ))}

        <RiseIn index={sections.length} style={{ marginTop: spacing.md }}>
          <WorkspaceWell>
            <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
              Receptionists collect payments, record references, request freezes and assign plans. Payment verification, plan prices and freeze approvals stay with the Owner — enforced by the backend in Part 2, never by this screen.
            </AppText>
          </WorkspaceWell>
        </RiseIn>
      </WorkspaceScreen>

      <WorkspaceBottomNavigation active="more" items={navItems} />
    </View>
  );
}
