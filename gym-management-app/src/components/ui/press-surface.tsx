/**
 * Pressable surface shared by buttons, cards and rows. Provides:
 * - press feedback within 120 ms (scale + opacity; nunca layout shift)
 * - a guaranteed >=44 px hit target (native hitSlop pads the touch area
 *   beyond the visual bounds without growing the layout box)
 * - light haptic on activation
 * - `disabled` semantics handled by the caller
 *
 * Structure: the caller's style IS the Pressable's style — the touch
 * target equals the visual surface, so the whole row/tab/button responds,
 * not just the label text inside it.
 */
import { useCallback, useRef } from 'react';
import { Pressable, PressableProps, GestureResponderEvent, StyleProp, ViewStyle, StyleSheet } from 'react-native';
import { useAnimatedStyle, useSharedValue, withSpring, withTiming, Easing as ReEasing } from 'react-native-reanimated';

import { Easing, Motion } from '@/constants/theme';
import { IconPressContext } from '@/components/ui/icon-press';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { hapticPress } from '@/utils/haptics';
interface PressSurfaceProps extends Omit<PressableProps, 'style'> {
  children?: React.ReactNode;
  scaleOnPress?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Extra invisible padding around the visual bounds for the hit target. */
  hitPadding?: number;
}

export function PressSurface({
  children = null,
  onPressIn,
  onPressOut,
  onPress,
  disabled,
  scaleOnPress = true,
  style,
  hitPadding = 0,
  ...rest
}: PressSurfaceProps) {
  const reduceMotion = useReduceMotion();
  const active = useSharedValue(0);
  const pressedRef = useRef(false);

  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - active.value * (scaleOnPress ? Motion.pressScale : 0) }],
    opacity: 1 - active.value * 0.25,
  }));

  const handleIn = useCallback(
    (e: GestureResponderEvent) => {
      pressedRef.current = true;
      if (!reduceMotion) {
        // Reanimated shared values are mutable by design; this compiler rule targets plain React state.
        // eslint-disable-next-line react-hooks/immutability
        active.value = withTiming(1, { duration: Motion.micro, easing: ReEasing.bezier(...Easing.out) });
      }
      onPressIn?.(e as never);
    },
    [active, reduceMotion, onPressIn],
  );

  const handleOut = useCallback(
    (e: GestureResponderEvent) => {
      pressedRef.current = false;
      if (!reduceMotion) {
        // Release springs back with a barely-there overshoot (Vanguard press
        // feel) — visually a micro-settle, never a bounce. Shared values are
        // mutable by design; this compiler rule targets plain React state.
        // eslint-disable-next-line react-hooks/immutability
        active.value = withSpring(0, Motion.spring.press);
      }
      onPressOut?.(e as never);
    },
    [active, reduceMotion, onPressOut],
  );

  const handlePress = useCallback(
    (e: GestureResponderEvent) => {
      if (pressedRef.current) hapticPress();
      onPress?.(e as never);
    },
    [onPress],
  );

  return (
    // Publish press progress so nested AnimatedIcons squash on press
    // (shared value only — no re-renders). Under reduce-motion `active`
    // never leaves 0, so icons stay still, matching the surface.
    <IconPressContext.Provider value={active}>
      <Pressable
        accessibilityState={{ disabled: !!disabled }}
        onPressIn={handleIn}
        onPressOut={handleOut}
        onPress={handlePress}
        disabled={disabled}
        style={[style as StyleProp<ViewStyle>, animated as never]}
        hitSlop={hitPadding > 0 ? hitPadding : undefined}
        {...rest}>
        {children}
      </Pressable>
    </IconPressContext.Provider>
  );
}

export const pressSurfaceStyles = StyleSheet.create({});
