/**
 * Stat primitives: the row wrapper used across the Receptionist screens and
 * the tinted delta pill shared with the chart cards. (The old unused
 * `StatTile` was removed in Phase 6 — every screen renders tiles via the
 * role-specific `OwnerStatTile`.)
 */
import { View } from 'react-native';
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
        gap: spacing['3xs'],
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

/**
 * Stat row: a TRANSPARENT layout row for stat tiles — no surface, border
 * or shadow of its own. The tiles placed inside it are complete cards;
 * giving the row its own card surface produced a card-upon-card (doubled)
 * look, so the row now behaves exactly like the owner dashboard's
 * `OwnerStatRow`: tiles sit directly on the panel with a small gap.
 */
export function StatRow({ children }: { children: React.ReactNode[] }) {
  const tokens = useTokens();
  const { spacing } = tokens;
  return (
    <View style={{ flexDirection: 'row', gap: spacing.xs }}>
      {Children.map(children, (child) => child)}
    </View>
  );
}
