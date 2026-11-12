/**
 * StepDots: the numbered-step indicator (V5 Coach Board — audit problem #9).
 * Circles carry step numbers; completed steps get the amber tint, the current
 * step gets the amber fill with the dark numeral, upcoming steps stay quiet.
 * Connectors tint as they are passed. Pure presentation — state stays owned
 * by the screen.
 */
import { View } from 'react-native';
import type { ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText } from '@/components/ui/text';
import { useTokens } from '@/hooks/use-tokens';

export function StepDots({ steps, current }: { steps: readonly string[]; current: number }) {
  const tokens = useTokens();
  const { colors, spacing } = tokens;

  return (
    <View
      accessibilityLabel={`Step ${current + 1} of ${steps.length}: ${steps[current]}. ${steps.map((s, i) => `${s}${i < current ? ' done' : i === current ? ' current' : ''}`).join(', ')}.`}
      accessible>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {steps.map((label, i) => {
          const done = i < current;
          const active = i === current;
          const circle: ViewStyle = {
            width: 28,
            height: 28,
            borderRadius: tokens.radius.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: active ? colors.accent : done ? colors.accentBg : colors.surfaceAlt,
            borderWidth: 1,
            borderColor: active ? colors.accent : colors.rule,
          };
          return (
            <View key={label} style={{ flexDirection: 'row', alignItems: 'center', flex: i < steps.length - 1 ? 1 : 0 }}>
              <View style={[circle, { marginRight: spacing.xs }]}>
                {done ? (
                  <Ionicons name="checkmark" size={14} color={colors.accentBright} />
                ) : (
                  <AppText
                    variant="caption"
                    style={{
                      color: active ? colors.accentInk : colors.inkSubtle,
                      fontWeight: '700',
                    }}>
                    {i + 1}
                  </AppText>
                )}
              </View>
              <AppText
                variant="caption"
                style={{
                  color: active ? colors.ink : done ? colors.inkMuted : colors.inkSubtle,
                  fontWeight: active ? '600' : '400',
                  marginRight: spacing.xs,
                }}>
                {label}
              </AppText>
              {i < steps.length - 1 && (
                <View style={{ flex: 1, height: 28, justifyContent: 'center', marginRight: spacing.xs }}>
                  <View style={{ height: 2, borderRadius: tokens.radius.pill, backgroundColor: i < current ? colors.accent : colors.rule }} />
                </View>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}
