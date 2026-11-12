/**
 * ActionTile: the dashboard quick-action tile (V5 Coach Board — audit
 * problem #8). An icon plate on a bordered surface with a short label;
 * grids of these replace rows of small text buttons. Amber is allowed here
 * because a tile IS an action — the plate tint marks intent, the label
 * carries meaning. Deep-links to existing routes only; never a new screen.
 */
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText } from '@/components/ui/text';
import { PressSurface } from '@/components/ui/press-surface';
import { useTokens } from '@/hooks/use-tokens';

export function ActionTile(props: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
  accessibilityHint?: string;
  /** Optional count pill (e.g. pending verifications) — must be real data. */
  badge?: string;
  /** `accent` adds the amber icon plate; default keeps icons quiet grey. */
  tone?: 'default' | 'accent';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const tokens = useTokens();
  const { colors, spacing, radius } = tokens;
  const accent = props.tone === 'accent';

  return (
    <PressSurface
      onPress={props.onPress}
      disabled={props.disabled}
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityHint={props.accessibilityHint}
      accessible
      style={props.style}>
      <View
        style={{
          flex: 1,
          minWidth: 0,
          backgroundColor: colors.surface,
          borderRadius: radius.sm,
          borderWidth: 1,
          borderColor: colors.rule,
          padding: spacing.md,
          gap: spacing.sm,
          alignItems: 'flex-start',
          opacity: props.disabled ? 0.55 : 1,
        }}>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: radius.xs,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: accent ? colors.accentBg : colors.surfaceAlt,
          }}>
          <Ionicons
            name={props.icon}
            size={19}
            color={accent ? colors.accentBright : colors.inkMuted}
          />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'stretch' }}>
          <AppText variant="label" tone="ink" style={styles.label} numberOfLines={1}>
            {props.label}
          </AppText>
          {props.badge && (
            <View
              accessible
              accessibilityLabel={props.badge}
              style={{
                backgroundColor: colors.accentBg,
                borderRadius: radius.pill,
                paddingHorizontal: spacing.xs,
                paddingVertical: 1,
              }}>
              <AppText variant="caption" style={{ color: colors.accentBright, fontWeight: '600' }}>
                {props.badge}
              </AppText>
            </View>
          )}
        </View>
      </View>
    </PressSurface>
  );
}

/** Row/wrap grid host for ActionTiles; tiles size themselves. */
export function ActionGrid({ children, style }: { children: React.ReactNode[]; style?: StyleProp<ViewStyle> }) {
  const tokens = useTokens();
  const { spacing } = tokens;
  return (
    <View style={[{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, style]}>{children}</View>
  );
}

const styles = StyleSheet.create({
  label: {
    flexShrink: 1,
  },
});
