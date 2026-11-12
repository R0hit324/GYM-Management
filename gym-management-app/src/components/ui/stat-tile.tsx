/**
 * Stat tile: a figure and its label, in tabular-style condensed numerals.
 * No icon coins, no gradient. An optional delta chip renders only when the
 * caller computed a real comparison — never a decorative trend arrow.
 */
import { StyleSheet, View } from 'react-native';
import { Children } from 'react';

import { AppText } from '@/components/ui/text';
import { useTokens } from '@/hooks/use-tokens';

export type StatDelta = { label: string; direction: 'up' | 'down' };

/** Tinted delta chip: up = success tint, down = danger tint. Labelled word + direction, never hue-only. */
export function DeltaPill({ delta }: { delta: StatDelta }) {
  const tokens = useTokens();
  const { colors, spacing, radius } = tokens;
  const up = delta.direction === 'up';
  const bg = up ? colors.successBg : colors.dangerBg;
  const fg = up ? colors.success : colors.danger;
  return (
    <View
      accessible
      accessibilityLabel={`${up ? 'Up' : 'Down'}, ${delta.label}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
        backgroundColor: bg,
        borderRadius: radius.pill,
        paddingVertical: 2,
        paddingHorizontal: spacing.xs,
      }}>
      <AppText variant="caption" style={{ color: fg, fontWeight: '700' }}>
        {up ? '↑' : '↓'}
      </AppText>
      <AppText variant="caption" style={{ color: fg, fontWeight: '600' }}>
        {delta.label}
      </AppText>
    </View>
  );
}

export function StatTile(props: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'ink' | 'accent' | 'success' | 'danger' | 'info' | 'muted';
  delta?: StatDelta;
}) {
  const tokens = useTokens();
  const { colors, spacing, radius } = tokens;
  const toneColor = {
    ink: colors.ink,
    // Coach Board: amber figures for emphasised data; semantic tones keep their hues.
    accent: colors.accent,
    success: colors.success,
    danger: colors.danger,
    info: colors.info,
    muted: colors.inkMuted,
  }[props.tone ?? 'ink'];

  return (
    <View
      accessibilityLabel={`${props.label}: ${props.value}${props.delta ? `, ${props.delta.direction === 'up' ? 'up' : 'down'} ${props.delta.label}` : ''}${props.hint ? `, ${props.hint}` : ''}`}
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
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
        <AppText variant="caption" tone="muted" style={styles.metaLabel}>
          {props.label}
        </AppText>
        {props.delta && <DeltaPill delta={props.delta} />}
      </View>
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
  metaLabel: {
    flexShrink: 1,
  },
});
