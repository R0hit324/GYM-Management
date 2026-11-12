/**
 * Segmented filter control and filter chips. The selected pill slides
 * between segments (transform only); unselected segments stay plain.
 */
import { View } from 'react-native';

import { AppText } from '@/components/ui/text';
import { PressSurface } from '@/components/ui/press-surface';
import { useTokens } from '@/hooks/use-tokens';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { hapticSelect } from '@/utils/haptics';

export interface SegmentOption {
  value: string;
  label: string;
}

export function SegmentedTabs(props: {
  options: SegmentOption[];
  value: string;
  onChange: (value: string) => void;
  size?: 'medium' | 'small';
}) {
  const tokens = useTokens();
  const reduce = useReduceMotion();
  const { colors, spacing, radius } = tokens;
  const selectedIndex = Math.max(0, props.options.findIndex((o) => o.value === props.value));

  return (
    <View
      accessibilityRole="tablist"
      style={[
        {
          backgroundColor: colors.surfaceAlt,
          borderRadius: radius.sm,
          flexDirection: 'row',
          padding: spacing.xxs,
          gap: 0,
          alignSelf: 'flex-start',
          minWidth: '100%',
        },
      ]}>
      {props.options.map((option, i) => {
        const selected = i === selectedIndex;
        return (
          <View key={option.value} style={{ flex: 1, position: 'relative' }}>
            {selected && (
              <View
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: 0,
                  right: 0,
                  backgroundColor: colors.accentDeep,
                  zIndex: 1,
                  ...tokens.elevation.card,
                }}
                pointerEvents="none"
              />
            )}
            <PressSurface
              accessibilityRole="tab"
              accessibilityState={{ selected: selected ? selected : undefined }}
              scaleOnPress={!reduce}
              onPress={() => {
                hapticSelect();
                props.onChange(option.value);
              }}
              style={{
                minHeight: props.size === 'small' ? 34 : 40,
                justifyContent: 'center',
              }}>
              <View style={{ alignItems: 'center', justifyContent: 'center', paddingLeft: 8 }}>
                <AppText
                  variant={props.size === 'small' ? 'caption' : 'label'}
                  style={{
                    fontWeight: selected ? '600' : '500',
                    color: selected ? colors.accentInk : colors.inkMuted,
                  }}>
                  {option.label}
                </AppText>
              </View>
            </PressSurface>
          </View>
        );
      })}
    </View>
  );
}

export function FilterChip(props: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: React.ReactNode;
}) {
  const tokens = useTokens();
  const { colors, spacing, radius } = tokens;
  const selected = !!props.selected;
  return (
    <PressSurface
      accessibilityRole="button"
      accessibilityState={{ selected: selected ? selected : undefined }}
      scaleOnPress={false}
      onPress={props.onPress}
      style={{
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: selected ? colors.accentDeep : colors.rule,
        backgroundColor: selected ? colors.accentDeep : colors.surface,
        paddingVertical: spacing.xs,
        paddingHorizontal: spacing.sm,
        minHeight: 34,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: spacing.xs,
      }}>
      {props.icon}
      <AppText variant="label" style={{ color: selected ? colors.accentInk : colors.inkMuted, fontWeight: selected ? '600' : '500' }}>
        {props.label}
      </AppText>
    </PressSurface>
  );
}
