/**
 * Card and section primitives. Surface ladder: whitespace > hairline >
 * tinted well > card. Cards carry either a hairline or a shadow, never both
 * at the value seam.
 */
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import type { ReactNode } from 'react';

import { AppText } from '@/components/ui/text';
import { useTokens } from '@/hooks/use-tokens';

export function Section(props: { title?: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const tokens = useTokens();
  const { spacing } = tokens;
  return (
    <View style={[{ marginTop: spacing.lg, gap: spacing.sm }, props.style]}>
      {props.title && <AppText variant="heading">{props.title}</AppText>}
      {props.children}
    </View>
  );
}

export function Card(props: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  interactive?: boolean;
  elevated?: boolean;
  padded?: boolean;
}) {
  const tokens = useTokens();
  const { colors, spacing, radius, elevation } = tokens;
  return (
    <View
      style={[
        {
          // Ember Night: charcoal surface with a subtle border and controlled
          // shadow; `elevated` opts into the deeper shadow.
          backgroundColor: colors.surface,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.rule,
          padding: props.padded === false ? 0 : spacing.md,
          ...(props.elevated ? elevation.card : {}),
        },
        props.style,
      ]}>
      {props.children}
    </View>
  );
}

export function Well(props: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const tokens = useTokens();
  const { colors, spacing, radius } = tokens;
  return (
    <View
      style={[
        {
          backgroundColor: colors.surfaceAlt,
          borderRadius: radius.md,
          padding: spacing.md,
        },
        props.style,
      ]}>
      {props.children}
    </View>
  );
}

export function Divider() {
  const tokens = useTokens();
  return <View style={[styles.rule, { backgroundColor: tokens.colors.rule }]} />;
}

const styles = StyleSheet.create({
  rule: {
    height: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
  },
});
