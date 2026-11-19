/**
 * Authentication success (Part 2, screen 9). One honest moment: a check
 * mark pops, the user and their role are named, and the app hands off to
 * the role's workspace. For a fresh member registration the hand-off is
 * the login screen — the account exists but is not signed in.
 *
 * The navigation is never blocked by the animation: the auto hand-off
 * timer runs regardless of reduce-motion, and a visible Continue control
 * always lets the user move immediately.
 */
import { useEffect } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { SuccessPop } from '@/components/ui/motion';
import { RiseIn } from '@/components/ui/rise-in';
import { AuthPanel, AuthHeading } from '@/components/auth/auth-ui';
import { useTokens } from '@/hooks/use-tokens';
import { workspaceRoute } from '@/services/auth';
import type { Role } from '@/types/domain';

const roleLabel: Record<Role, string> = {
  owner: 'Owner',
  receptionist: 'Receptionist',
  member: 'Member',
};

export default function AuthSuccessScreen() {
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const { colors, spacing } = tokens;
  const params = useLocalSearchParams<{ mode?: string; role?: string; name?: string; email?: string }>();

  const mode = params.mode === 'signup' ? 'signup' : 'signin';
  const role = (params.role as Role | undefined) ?? 'member';

  useEffect(() => {
    if (mode === 'signup') return; // signup hands off manually to login
    const t = setTimeout(() => router.replace(workspaceRoute(role) as never), 1600);
    return () => clearTimeout(t);
  }, [mode, role]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.authTop, paddingTop: insets.top }}>
      <StatusBar style="dark" />
      <AuthPanel>
        <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: tokens.spacing.lg, gap: spacing.md }}>
          <SuccessPop size={84} style={{ alignSelf: 'center' }} />
          <RiseIn index={1}>
            <AuthHeading muted={mode === 'signup' ? 'Account ' : 'You are '} emphasis={mode === 'signup' ? 'created' : 'signed in'} />
          </RiseIn>
          <RiseIn index={2}>
            <AppText variant="label" style={{ color: colors.authInkSubtle }}>
              {mode === 'signup'
                ? `${params.email ?? 'Your account'} is registered. Sign in with the password you created.`
                : `${params.name ?? roleLabel[role]} · ${roleLabel[role]} workspace`}
            </AppText>
          </RiseIn>
          <RiseIn index={3}>
            <View style={{ marginTop: spacing.sm }}>
              <Button
                label={mode === 'signup' ? 'Go to sign in' : 'Continue'}
                icon={mode === 'signup' ? 'log-in-outline' : 'arrow-forward'}
                fullWidth
                variant="primarySoft"
                onPress={() =>
                  mode === 'signup'
                    ? router.replace((`/login?email=${encodeURIComponent(params.email ?? '')}`) as never)
                    : router.replace(workspaceRoute(role) as never)
                }
              />
            </View>
          </RiseIn>
        </View>
      </AuthPanel>
    </View>
  );
}
