/**
 * Attendance & Door QR — the dedicated attendance-QR-only screen.
 *
 * Live mode mints a real token with `mint_attendance_token` (receptionist +
 * AAL2, server-enforced), shows the returned plaintext once as a QR, counts
 * down the same validity the server applied, and mints a replacement when it
 * expires. The server stores only the SHA-256 hash; this screen never has
 * access to it. Every scan is still validated server-side by `check_in`.
 *
 * Demo mode keeps the approved inert payload and says so. Separation stays
 * structural: no UPI content, no payment QR, no transaction history here —
 * UPI QR ≠ attendance QR.
 */
import { View } from 'react-native';

import { AppText } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { QrDisplay } from '@/components/ui/qr-display';
import { RiseIn } from '@/components/ui/rise-in';
import { ErrorState, SkeletonRow } from '@/components/ui/feedback';
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
import { useAttendanceToken } from '@/hooks/use-attendance-token';
import { demoAttendanceQrPayload } from '@/data/demo';
import { useGymSettings } from '@/services/data';

const navItems = [
  { key: 'home', label: 'Home', icon: 'home-outline', href: '/(reception)/home' },
  { key: 'members', label: 'Members', icon: 'people-outline', href: '/(reception)/members' },
  { key: 'more', label: 'More', icon: 'apps-outline', href: '/(reception)/more' },
] as const;

const DEFAULT_TOKEN_VALIDITY_SECONDS = 60;

export default function DoorQrScreen() {
  const tokens = useTokens();
  const { colors, spacing } = tokens;

  const settings = useGymSettings();
  const live = settings.isLive;
  const validity =
    settings.data?.attendanceTokenValiditySeconds ?? DEFAULT_TOKEN_VALIDITY_SECONDS;
  const attendanceToken = useAttendanceToken({ enabled: live, validitySeconds: validity });

  const tokenReady = live && attendanceToken.status === 'ready' && attendanceToken.token !== null;
  const token = tokenReady ? attendanceToken.token : null;
  const tokenLoading = live && attendanceToken.status === 'loading';
  const tokenFailed = live && attendanceToken.status === 'error';

  return (
    <View style={{ flex: 1 }}>
      <WorkspaceScreen
        title="Attendance & Door QR"
        eyebrow="Attendance"
        subtitle={
          live
            ? 'Live entrance code — minted and validated server-side'
            : 'The code the entrance displays'
        }
        demo={!live}
        actions={<SignOut />}
        refreshControl={undefined}>
        {/* Entrance display — one job: the attendance QR, large enough to
            scan across a desk. */}
        <RiseIn>
          <WorkspaceSection
            title="Attendance QR"
            action={
              live ? (
                tokenReady ? (
                  <StatusBadge
                    label={`Live · ${attendanceToken.secondsRemaining}s`}
                    tone={attendanceToken.secondsRemaining <= 10 ? 'warning' : 'success'}
                    small
                  />
                ) : tokenLoading ? (
                  <StatusBadge label="Minting…" tone="info" small />
                ) : (
                  <StatusBadge label="Unavailable" tone="warning" small />
                )
              ) : (
                <StatusBadge label="Demo payload — not a live token" tone="warning" small />
              )
            }>
            {live ? (
              tokenFailed ? (
                <ErrorState
                  title="The attendance code could not be minted"
                  message={
                    attendanceToken.error ??
                    'The server did not issue a token. Check the connection and try again.'
                  }
                  onRetry={() => {
                    settings.refresh();
                    attendanceToken.refresh();
                  }}
                />
              ) : tokenReady && token ? (
                <WorkspaceCard>
                  <QrDisplay
                    payload={token}
                    size={248}
                    caption="Server-minted attendance token. Only its hash is stored; the code expires automatically."
                  />
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: spacing.sm,
                      marginTop: spacing.sm,
                    }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <AppText variant="bodyStrong" style={{ color: colors.ownerInk }}>
                        {attendanceToken.secondsRemaining > 0
                          ? `Expires in ${attendanceToken.secondsRemaining}s`
                          : 'Rotating the code…'}
                      </AppText>
                      <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
                        A fresh token is minted automatically at expiry; expired codes are refused
                        by the server.
                      </AppText>
                    </View>
                    <Button
                      label="Refresh now"
                      size="small"
                      variant="secondary"
                      icon="refresh-outline"
                      onPress={attendanceToken.refresh}
                    />
                  </View>
                </WorkspaceCard>
              ) : (
                <WorkspaceCard>
                  <SkeletonRow count={2} />
                  <AppText variant="caption" style={{ color: colors.ownerInkMuted, marginTop: spacing.xs }}>
                    Requesting a one-time attendance token from the server.
                  </AppText>
                </WorkspaceCard>
              )
            ) : demoAttendanceQrPayload ? (
              <WorkspaceCard>
                <QrDisplay
                  payload={demoAttendanceQrPayload}
                  size={248}
                  caption="Deliberately inert demo payload — replaced by a server-minted token in live mode."
                />
                <AppText variant="caption" align="center" style={{ color: colors.ownerInkSubtle, marginTop: spacing.xs }}>
                  Real attendance codes are hashed, generated server-side and expire automatically. This demo payload does not change.
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
                detail="One successful scan records one event; repeat visits use the current code"
              />
              <OwnerListRow
                title="Failed or unreadable scans"
                detail="Failed scans are never stored as attendance — send the member to the desk"
              />
              <OwnerListRow
                title="Refreshing the code"
                detail={
                  live
                    ? `A new token is minted when this one expires (${validity}s); Refresh now mints one immediately`
                    : 'Production codes refresh automatically at the server-set expiry; this demo payload does not change'
                }
              />
              <OwnerListRow
                title="Frozen memberships"
                detail="A frozen member's scan ends the freeze and records the visit — the server does this atomically"
              />
            </OwnerListGroup>
          </WorkspaceSection>
        </RiseIn>

        <RiseIn index={2} style={{ marginTop: spacing.sm }}>
          <WorkspaceSection title="Door setup">
            <CheckLine text="Screen at eye level, brightness up" />
            <CheckLine text="Keep this screen open at the entrance — the register has its own screen" />
            <CheckLine text="Expired or replayed codes are refused; ask the member to scan the current code" />
          </WorkspaceSection>
        </RiseIn>

        <RiseIn index={3} style={{ marginTop: spacing.md }}>
          <WorkspaceWell>
            <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
              {live
                ? 'Minting requires a receptionist session at AAL2 (multi-factor). The server stores only the token hash and refuses expired or replayed scans. This screen is only for attendance scanning; every payment surface lives in the Payments group.'
                : 'This screen is only for attendance scanning. Every payment surface lives in the Payments group.'}
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
