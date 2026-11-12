/**
 * Pressable surface shared by buttons, cards and rows. Provides:
 * - press feedback within 120 ms (scale + opacity; nunca layout shift)
 * - a guaranteed >=44 px hit target (padded, never the visual bounds)
 * - light haptic on activation
 * - `disabled` semantics handled by the caller
 */
import { useCallback, useRef } from 'react';
import { Pressable, PressableProps, GestureResponderEvent, StyleProp, View, ViewStyle, StyleSheet } from 'react-native';
import { useAnimatedStyle, useSharedValue, withTiming, Easing as ReEasing } from 'react-native-reanimated';

import { Easing, Motion } from '@/constants/theme';
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
        // Reanimated shared values are mutable by design; this compiler rule targets plain React state.
        // eslint-disable-next-line react-hooks/immutability
        active.value = withTiming(0, { duration: Motion.micro * 1.4, easing: ReEasing.bezier(...Easing.out) });
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
    <View style={[hitPadding > 0 && { padding: hitPadding }, style as StyleProp<ViewStyle>]}>
      <Pressable
        accessibilityState={{ disabled: !!disabled }}
        onPressIn={handleIn}
        onPressOut={handleOut}
        onPress={handlePress}
        disabled={disabled}
        style={animated as never}
        {...rest}>
        {children}
      </Pressable>
    </View>
  );
}

export const pressSurfaceStyles = StyleSheet.create({});
