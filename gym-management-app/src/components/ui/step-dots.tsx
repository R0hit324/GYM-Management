/**
 * StepDots: the numbered-step indicator (V5 Coach Board — audit problem #9).
 * Circles carry step numbers; completed steps get the tint, the current
 * step gets the fill with the dark numeral, upcoming steps stay quiet.
 * Connectors tint as they are passed. Pure presentation — state stays owned
 * by the screen. `tone: 'auth'` renders the auth screens' white set (white
 * current-step fill, dark numeral — additive; default is the Coach Board
 * amber used across the workspaces).
 */
import { View } from 'react-native';
import type { ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText } from '@/components/ui/text';
import { useTokens } from '@/hooks/use-tokens';

export function StepDots({
  steps,
  current,
  tone = 'accent',
}: {
  steps: readonly string[];
  current: number;
  tone?: 'accent' | 'auth';
}) {
  const tokens = useTokens();
  const { colors, spacing } = tokens;
  const auth = tone === 'auth';
  const currentBg = auth ? colors.authAccent : colors.accent;
  const currentNumeral = auth ? colors.authAccentInk : colors.accentInk;
  const doneBg = auth ? colors.authSelectedBg : colors.accentBg;
  const doneMark = auth ? colors.authAccent : colors.accentBright;
  const upcomingBg = auth ? colors.authSurface : colors.surfaceAlt;
  const upcomingNumeral = auth ? colors.authInkSubtle : colors.inkSubtle;
  const connectorDone = auth ? colors.authAccent : colors.accent;
  const connectorTodo = auth ? colors.authRuleStrong : colors.rule;

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
            backgroundColor: active ? currentBg : done ? doneBg : upcomingBg,
            borderWidth: 1,
            borderColor: active ? currentBg : colors.rule,
          };
          return (
            <View key={label} style={{ flexDirection: 'row', alignItems: 'center', flex: i < steps.length - 1 ? 1 : 0 }}>
              <View style={[circle, { marginRight: spacing.xs }]}>
                {done ? (
                  <Ionicons name="checkmark" size={14} color={doneMark} />
                ) : (
                  <AppText
                    variant="caption"
                    style={{
                      color: active ? currentNumeral : upcomingNumeral,
                      fontWeight: '700',
                    }}>
                    {i + 1}
                  </AppText>
                )}
              </View>
              <AppText
                variant="caption"
                style={{
                  color: active ? (auth ? colors.authInk : colors.ink) : done ? colors.inkMuted : upcomingNumeral,
                  fontWeight: active ? '600' : '400',
                  marginRight: spacing.xs,
                }}>
                {label}
              </AppText>
              {i < steps.length - 1 && (
                <View style={{ flex: 1, height: 28, justifyContent: 'center', marginRight: spacing.xs }}>
                  <View style={{ height: 2, borderRadius: tokens.radius.pill, backgroundColor: i < current ? connectorDone : connectorTodo }} />
                </View>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}
