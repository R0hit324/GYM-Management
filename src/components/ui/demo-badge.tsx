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
