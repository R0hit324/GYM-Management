/**
 * Segmented filter control and filter chips.
 *
 * The selected segment is a sliding highlight (transform-only animation,
 * reduce-motion aware) — never a blank rectangle covering the label. The
 * default variant keeps the Coach Board amber identity for non-owner
 * workspaces; the `owner` variant switches to the Fino owner palette:
 * light track on the light panel, pastel blue→violet selected fill with
 * dark ink (AA-verified), readable secondary text for unselected options.
 */
import { useEffect, useState } from 'react';
import { Animated, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { AppText } from '@/components/ui/text';
import { PressSurface } from '@/components/ui/press-surface';
import { useTokens } from '@/hooks/use-tokens';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { hapticSelect } from '@/utils/haptics';

export interface SegmentOption {
  value: string;
  label: string;
}

/** Pastel blue→violet fill for the owner selected segment (restrained). */
function OwnerSelectionFill({ radius }: { radius: number }) {
  const tokens = useTokens();
  return (
    <Svg style={{ width: '100%', height: '100%' }} pointerEvents="none">
      <Defs>
        <LinearGradient id="owner-segment-grad" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={tokens.colors.ownerGradA} />
          <Stop offset="1" stopColor={tokens.colors.ownerGradB} />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" rx={radius} fill="url(#owner-segment-grad)" />
    </Svg>
  );
}

export function SegmentedTabs(props: {
  options: SegmentOption[];
  value: string;
  onChange: (value: string) => void;
  size?: 'medium' | 'small';
  variant?: 'default' | 'owner';
}) {
  const tokens = useTokens();
  const reduce = useReduceMotion();
  const { colors, spacing, radius } = tokens;
  const owner = props.variant === 'owner';
  const selectedIndex = Math.max(0, props.options.findIndex((o) => o.value === props.value));

  // Sliding highlight: one animated pill behind the selected option.
  // Created via a lazy useState initializer (stable instance, no ref read
  // during render).
  const [trackWidth, setTrackWidth] = useState(0);
  const [position] = useState(() => new Animated.Value(selectedIndex));
  const segWidth = props.options.length > 0 && trackWidth > 0 ? trackWidth / props.options.length : 0;

  useEffect(() => {
    if (segWidth <= 0) return;
    const toValue = selectedIndex * segWidth;
    if (reduce) {
      position.setValue(toValue);
      return;
    }
    Animated.timing(position, {
      toValue,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [selectedIndex, segWidth, reduce, position]);

  const trackBg = owner ? colors.ownerPanelMuted : colors.surfaceAlt;
  const trackRadius = owner ? tokens.radius.md : radius.sm;
  const unselectedInk = owner ? colors.ownerInkMuted : colors.inkMuted;

  return (
    <View
      accessibilityRole="tablist"
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
      style={{
        backgroundColor: trackBg,
        borderRadius: trackRadius,
        flexDirection: 'row',
        padding: spacing.xxs,
        gap: 0,
        alignSelf: 'flex-start',
        minWidth: '100%',
        overflow: 'hidden',
      }}>
      {segWidth > 0 && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: spacing.xxs,
            bottom: spacing.xxs,
            left: 0,
            width: segWidth,
            transform: [{ translateX: position }],
            borderRadius: owner ? tokens.radius.sm : radius.sm - 2 >= 0 ? radius.sm - 2 : 0,
            overflow: 'hidden',
            zIndex: 1,
            ...tokens.elevation.card,
          }}>
          {owner ? (
            <OwnerSelectionFill radius={owner ? tokens.radius.sm : radius.sm - 2 >= 0 ? radius.sm - 2 : 0} />
          ) : (
            <View
              style={{
                flex: 1,
                backgroundColor: colors.accentDeep,
                borderRadius: radius.sm - 2 >= 0 ? radius.sm - 2 : 0,
              }}
            />
          )}
        </Animated.View>
      )}
      {props.options.map((option, i) => {
        const selected = i === selectedIndex;
        return (
          <View key={option.value} style={{ flex: 1, minWidth: 0 }}>
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
                alignItems: 'center',
                zIndex: 2,
              }}>
              <AppText
                variant={props.size === 'small' ? 'caption' : 'label'}
                numberOfLines={1}
                style={{
                  fontWeight: selected ? '700' : '500',
                  textAlign: 'center',
                  // Selected label always sits on the highlight fill; the
                  // owner highlight is the pastel gradient (dark ink), the
                  // default highlight is deep amber (dark ink).
                  color: selected ? (owner ? colors.ownerGradInk : colors.accentInk) : unselectedInk,
                }}>
                {option.label}
              </AppText>
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
  variant?: 'default' | 'owner';
}) {
  const tokens = useTokens();
  const { colors, spacing, radius } = tokens;
  const owner = props.variant === 'owner';
  const selected = !!props.selected;
  const bg = owner
    ? (selected ? colors.ownerAccentTint : colors.ownerPanel)
    : (selected ? colors.accentDeep : colors.surface);
  const border = owner
    ? (selected ? colors.ownerAccentDeep : colors.ownerRule)
    : (selected ? colors.accentDeep : colors.rule);
  const ink = owner
    ? (selected ? colors.ownerAccentDeep : colors.ownerInkMuted)
    : (selected ? colors.accentInk : colors.inkMuted);
  return (
    <PressSurface
      accessibilityRole="button"
      accessibilityState={{ selected: selected ? selected : undefined }}
      scaleOnPress={false}
      onPress={props.onPress}
      style={{
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: border,
        backgroundColor: bg,
        paddingVertical: spacing.xs,
        paddingHorizontal: spacing.sm,
        minHeight: 34,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: spacing.xs,
      }}>
      {props.icon}
      <AppText variant="label" style={{ color: ink, fontWeight: selected ? '600' : '500' }}>
        {props.label}
      </AppText>
    </PressSurface>
  );
}
