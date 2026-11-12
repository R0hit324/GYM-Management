/**
 * Splash. Brand entry per the Coach Board direction: the ONE amber plate —
 * dark dumbbell mark on the accent fill — above the Pulse Gym wordmark and
 * tagline on the graphite ground. It holds briefly and hands off to the
 * login screen — with no backend, login remains the only real destination
 * (role routing arrives with auth in Part 2). The delay is a brand hold,
 * not a fake loading claim.
 */
import { useEffect } from 'react';
import { View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';

import { AppText } from '@/components/ui/text';
import { RiseIn } from '@/components/ui/rise-in';
import { useTokens } from '@/hooks/use-tokens';

export default function Index() {
  const tokens = useTokens();
  const { colors, spacing, radius } = tokens;
  const router = useRouter();

  useEffect(() => {
    const t = setTimeout(() => router.replace('/login'), 1500);
    return () => clearTimeout(t);
  }, [router]);

  return (
    <View
      accessibilityLabel="Pulse Gym — Membership and Daily Operations"
      style={{
        flex: 1,
        backgroundColor: colors.paper,
        paddingTop: 0,
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.lg,
      }}>
      {/* Coach Board hero: the one amber plate, dark mark on the accent fill */}
      <RiseIn>
        <View
          style={{
            width: 84,
            height: 84,
            borderRadius: radius.lg,
            backgroundColor: colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Ionicons name="barbell" size={44} color={colors.accentInk} />
        </View>
      </RiseIn>
      <RiseIn index={2}>
        <View style={{ alignItems: 'center', gap: spacing.xs }}>
          <AppText variant="displayXL">
            Pulse <AppText variant="displayXL" style={{ color: colors.accent }}>Gym</AppText>
          </AppText>
          <AppText variant="label" tone="muted">
            Membership and Daily Operations
          </AppText>
        </View>
      </RiseIn>
    </View>
  );
}
