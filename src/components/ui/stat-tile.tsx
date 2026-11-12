/**
 * Stat tile: a figure and its label, in tabular-style condensed numerals.
 * No icon coins, no gradient, no trend arrow nobody measured.
 */
import { StyleSheet, View } from 'react-native';
import { Children } from 'react';

import { AppText } from '@/components/ui/text';
import { useTokens } from '@/hooks/use-tokens';

export function StatTile(props: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'ink' | 'accent' | 'success' | 'danger' | 'info' | 'muted';
}) {
  const tokens = useTokens();
  const { colors, spacing, radius } = tokens;
  const toneColor = {
    ink: colors.ink,
    // Ember accent for emphasised figures; semantic tones keep their hues.
    accent: colors.accent,
    success: colors.success,
    danger: colors.danger,
    info: colors.info,
    muted: colors.inkMuted,
  }[props.tone ?? 'ink'];

  return (
    <View
      accessibilityLabel={`${props.label}: ${props.value}${props.hint ? `, ${props.hint}` : ''}`}
      accessible
      style={{
        flexBasis: 'auto',
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.rule,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        gap: 2,
      }}>
      <AppText variant="figure" style={{ color: toneColor }}>
        {props.value}
      </AppText>
      <AppText variant="caption" tone="muted">
        {props.label}
      </AppText>
      {props.hint && (
        <AppText variant="caption" tone="subtle">
          {props.hint}
        </AppText>
      )}
    </View>
  );
}

/** Sibling tiles share one bordered card and part with hairlines. */
export function StatRow({ children }: { children: React.ReactNode[] }) {
  const tokens = useTokens();
  const { colors, spacing } = tokens;
  return (
    <View
      style={[
        styles.statRow,
        {
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.rule,
          borderRadius: tokens.radius.md,
          paddingVertical: spacing.sm,
        },
      ]}>
      {Children.map(children, (child, i) => (
        <>
          {i > 0 && <View style={{ width: StyleSheet.hairlineWidth, backgroundColor: colors.rule }} />}
          <View style={{ flex: 1, paddingHorizontal: spacing.sm }}>{child}</View>
        </>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  statRow: {
    flexDirection: 'row',
  },
});
