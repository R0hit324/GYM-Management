/**
 * Attendance & Door QR — the dedicated attendance-QR-only screen.
 *
 * Inspection result (Stage 3): no token generation, rotation, expiry
 * timer or scan validation exists anywhere in this client — the payload
 * is the inert demo string from src/data/demo.ts and the register rules
 * are server-side in Part 5. This screen therefore asserts none of it: it
 * shows the QR the entrance displays at a scanner-friendly size, labels
 * its demo status clearly, gives attendance-only instructions, and states
 * the actual supported refresh/expiry facts (server-generated tokens with
 * a server-set expiry in Part 5; no duration is defined yet).
 *
 * Separation is structural, not just visual: no UPI content, no payment
 * QR, no transaction history is rendered here — the payment QR has its
 * own screen by design (UPI QR ≠ attendance QR).
 *
 * States: the payload is a static string, so there is no loading state
 * to fake — if a payload were ever missing, the screen shows an honest
 * unavailable state instead of an empty frame.
 */
import { View } from 'react-native';

import { AppText } from '@/components/ui/text';
import { StatusBadge } from '@/components/ui/status-badge';
import { QrDisplay } from '@/components/ui/qr-display';
import { RiseIn } from '@/components/ui/rise-in';
import { SignOut } from '@/components/workspace-meta';
import {
  WorkspaceScreen,
  WorkspaceBottomNavigation,
  WorkspaceSection,
  WorkspaceCard,
  WorkspaceWell,
} from '@/components/workspace/workspace-ui';
import {
  OwnerListGroup,
  OwnerListRow,
  OwnerEmptyState,
} from '@/components/owner/owner-ui';
import { useTokens } from '@/hooks/use-tokens';
import { demoAttendanceQrPayload } from '@/data/demo';

const navItems = [
  { key: 'home', label: 'Home', icon: 'home-outline', href: '/(reception)/home' },
  { key: 'members', label: 'Members', icon: 'people-outline', href: '/(reception)/members' },
  { key: 'more', label: 'More', icon: 'apps-outline', href: '/(reception)/more' },
] as const;

export default function DoorQrScreen() {
  const tokens = useTokens();
  const { colors, spacing } = tokens;

  return (
    <View style={{ flex: 1 }}>
      <WorkspaceScreen
        title="Attendance & Door QR"
        eyebrow="Attendance"
        subtitle="The code the entrance displays"
        demo
        actions={<SignOut />}>
        {/* Entrance display — one job: the attendance QR, large enough to
            scan across a desk. Unavailable state when there is no payload. */}
        <RiseIn>
          <WorkspaceSection
            title="Attendance QR"
            action={<StatusBadge label="Demo payload — not a live token" tone="warning" small />}>
            {demoAttendanceQrPayload ? (
              <WorkspaceCard>
                <QrDisplay
                  payload={demoAttendanceQrPayload}
                  size={248}
                  caption="Deliberately inert demo payload — replaced by server-generated tokens in Part 5."
                />
                <AppText variant="caption" align="center" style={{ color: colors.ownerInkSubtle, marginTop: spacing.xs }}>
                  Real attendance codes are hashed, generated server-side and expire automatically; Part 5 sets that expiry, and no duration is asserted in this demo.
                </AppText>
              </WorkspaceCard>
            ) : (
              <OwnerEmptyState
                icon="qr-code-outline"
                title="Attendance QR unavailable"
                hint="No attendance payload is configured. The entrance cannot display a code until one is set."
              />
            )}
          </WorkspaceSection>
        </RiseIn>

        {/* Attendance-only instructions — nothing payment-related here */}
        <RiseIn index={1} style={{ marginTop: spacing.sm }}>
          <WorkspaceSection title="How scanning works">
            <OwnerListGroup label="At the entrance">
              <OwnerListRow
                title="Members scan this code to check in"
                detail="One scan, one check-in event — repeat visits are separate events"
              />
              <OwnerListRow
                title="Failed or unreadable scans"
                detail="Send the member to the desk to be checked in manually"
              />
              <OwnerListRow
                title="Refreshing the code"
                detail="Production codes refresh automatically on the server-set expiry; this demo payload does not change"
              />
            </OwnerListGroup>
          </WorkspaceSection>
        </RiseIn>

        <RiseIn index={2} style={{ marginTop: spacing.sm }}>
          <WorkspaceSection title="Door setup">
            <CheckLine text="Screen at eye level, brightness up" />
            <CheckLine text="Keep this screen open at the entrance — the register has its own screen" />
            <CheckLine text="Frozen memberships record visits as frozen, never as attendance" />
          </WorkspaceSection>
        </RiseIn>

        <RiseIn index={3} style={{ marginTop: spacing.md }}>
          <WorkspaceWell>
            <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
              This screen is only for attendance scanning. Every payment surface lives in the Payments group.
            </AppText>
          </WorkspaceWell>
        </RiseIn>
      </WorkspaceScreen>

      <WorkspaceBottomNavigation active="more" items={navItems} />
    </View>
  );
}

function CheckLine(props: { text: string }) {
  const tokens = useTokens();
  const { spacing } = tokens;
  return (
    <View style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'flex-start' }}>
      <AppText variant="label" style={{ color: tokens.colors.ownerAccentDeep, marginTop: spacing['3xs'] * -1 }}>
        ·
      </AppText>
      <AppText variant="label" style={{ flex: 1, color: tokens.colors.ownerInkMuted }}>
        {props.text}
      </AppText>
    </View>
  );
}
