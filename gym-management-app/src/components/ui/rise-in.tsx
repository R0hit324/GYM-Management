/**
 * Entrance wrapper — a subtle fade-and-rise, once, on mount.
 *
 * Coach Board motion: smooth and subtle, never showy. Children fade in and
 * rise a few pixels (transform/opacity only, no layout shift) with a small
 * stagger by index. Reduce-motion collapses it to instant (no animation,
 * final state immediately). Kept as a wrapper so call sites stay stable.
 */
import { useEffect } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import ReAnimated, { Easing as ReEasing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { Easing, Motion } from '@/constants/theme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';

export function RiseIn(props: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Stagger index; each step delays 40ms. */
  index?: number;
}) {
  const reduce = useReduceMotion();
  const progress = useSharedValue(0);

  useEffect(() => {
    // Mount a frame later so the effect body never calls a shared value
    // synchronously with the first render.
    const raf = requestAnimationFrame(() => {
      progress.value = reduce
        ? 1
        : withDelay((props.index ?? 0) * 40, withTiming(1, { duration: Motion.short + 120, easing: ReEasing.bezier(...Easing.out) }));
    });
    return () => cancelAnimationFrame(raf);
  }, [reduce, progress, props.index]);

  const animated = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * Motion.riseDistance }],
  }));

  return (
    <ReAnimated.View style={[props.style, animated]}>{props.children}</ReAnimated.View>
  );
}
