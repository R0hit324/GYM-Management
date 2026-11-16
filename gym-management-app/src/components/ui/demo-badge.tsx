/**
 * Demo badge — required wherever sample numbers appear. It is the app's own
 * honesty marker: nothing in Part 1 is real gym data and no screen is
 * allowed to imply otherwise.
 */
import { View } from 'react-native';

import { AppText } from '@/components/ui/text';
import { useTokens } from '@/hooks/use-tokens';

export function DemoBadge(props: { label?: string; small?: boolean }) {
  const tokens = useTokens();
  const { colors, radius } = tokens;
  return (
    <View
      accessibilityLabel={props.label ?? 'Demo data'}
      style={{
        backgroundColor: colors.surfaceAlt,
        borderColor: colors.ruleStrong,
        borderWidth: 1,
        borderRadius: radius.pill,
        paddingVertical: 2,
        paddingHorizontal: 8,
        alignSelf: 'flex-start',
      }}>
      <AppText variant="caption" tone="muted" style={{ fontWeight: '500' }}>
        {props.label ?? 'Demo data'}
      </AppText>
    </View>
  );
}

/**
 * The standard demo disclosure caption under a workspace/owner page title —
 * one wording everywhere (F-26): "Demo session — all numbers are sample
 * data". WorkspaceScreen and OwnerScreen render the same line; it lives
 * here so the wording can never drift apart again.
 */
export function DemoDisclosure() {
  const tokens = useTokens();
  return (
    <AppText variant="caption" style={{ color: tokens.colors.ownerHeroMuted, marginTop: tokens.spacing.xs }}>
      Demo session — all numbers are sample data
    </AppText>
  );
}
