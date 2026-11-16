/**
 * Motion kit — the Vanguard-style motion system shared across workspaces.
 *
 * - CountUp: a number that settles into its real value with an eased count
 *   (Vanguard dashboards). Honesty rule: the accessibility label and the
 *   final displayed value are always the exact figure — the count is only
 *   ever a transient approach to it, never a different number.
 * - SkeletonBlock / SkeletonCard: quietly pulsing loading placeholders.
 * - Reveal: skeleton in, content rises in when the data lands (uses the
 *   shared RiseIn entrance, reduce-motion aware end to end).
 *
 * Everything rides Reanimated (transform/opacity only), consults the OS
 * reduce-motion setting and collapses to the end state when it asks.
 */
import { ReactNode, useEffect, useRef, useState } from 'react';
import { StyleProp, TextStyle, View, ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import ReAnimated, {
  Easing as ReEasing,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { AppText, type TextVariant } from '@/components/ui/text';
import { RiseIn } from '@/components/ui/rise-in';
import { Easing, Motion } from '@/constants/theme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useTokens } from '@/hooks/use-tokens';

/* ------------------------------------------------------------------ */
/* CountUp                                                             */
/* ------------------------------------------------------------------ */

/**
 * Counts toward `value` with a strong ease-out curve (~1.6s — moderate,
 * never abrupt). Honesty and smoothness rules:
 * - On mount it counts from zero up to the real figure; when the value
 *   later CHANGES it animates from the previous value to the new one
 *   (never a reset to zero).
 * - The displayed number is step-throttled (~48 visible increments) so
 *   there is no rapid intermediate flickering; large values land smoothly.
 * - The final displayed string and the accessibility label are always the
 *   EXACT real figure — the count is only ever a transient approach to it.
 * - Reduce-motion renders the exact final value immediately.
 * - Stack screens stay mounted on back-navigation, so counts do not
 *   replay when returning to a screen.
 */
export function CountUp(props: {
  value: number;
  format?: (n: number) => string;
  duration?: number;
  delay?: number;
  variant?: TextVariant;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  adjustsFontSizeToFit?: boolean;
}) {
  const reduce = useReduceMotion();
  const format = props.format ?? String;
  const duration = props.duration ?? Motion.count;

  // From/to live as shared values so the UI-thread reaction can interpolate
  // without bridge traffic. `shown` is throttled React state.
  const from = useSharedValue(0);
  const to = useSharedValue(props.value);
  const progress = useSharedValue(reduce ? 1 : 0);
  const lastTarget = useRef(0);
  const [shown, setShown] = useState(() => (reduce ? props.value : 0));
  const last = useSharedValue(-1);

  useEffect(() => {
    if (lastTarget.current !== props.value) {
      // Animate from the PREVIOUS value to the new one — never reset to 0.
      from.value = lastTarget.current;
      lastTarget.current = props.value;
      to.value = props.value;
    }
    last.value = -1;
    if (reduce) {
      progress.value = 1;
      return;
    }
    progress.value = 0;
    const raf = requestAnimationFrame(() => {
      const animation = withTiming(1, { duration, easing: ReEasing.bezier(...Easing.out) });
      progress.value = props.delay ? withDelay(props.delay, animation) : animation;
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce, props.value, props.delay, duration]);

  useAnimatedReaction(
    () => progress.value,
    (p) => {
      // Strong ease-out: fast approach, gentle settle — the number grows
      // progressively instead of jumping. Step-throttled to ~48 visible
      // increments so intermediate values never flicker.
      const span = Math.abs(to.value - from.value) || Math.abs(to.value);
      const step = Math.max(1, Math.round(span / 48) || 1);
      const raw = from.value + (to.value - from.value) * p;
      const v = Math.round(raw / step) * step;
      if (v !== last.value) {
        // Reanimated shared values are mutable by design; this compiler rule
        // targets plain React state.
        // eslint-disable-next-line react-hooks/immutability
        last.value = v;
        scheduleOnRN(setShown, v);
      }
    },
  );

  // Clamp to the real value (floating point can overshoot by a step).
  const display = Math.abs(props.value - shown) < Math.max(1, Math.round(Math.abs(props.value) / 96)) ? props.value : Math.min(shown, Math.max(props.value, 0));
  const final = format(props.value);

  return (
    <AppText
      variant={props.variant}
      accessibilityLabel={final}
      numberOfLines={props.numberOfLines}
      adjustsFontSizeToFit={props.adjustsFontSizeToFit}
      style={props.style}>
      {display === props.value ? final : format(display)}
    </AppText>
  );
}

/* ------------------------------------------------------------------ */
/* Skeletons                                                           */
/* ------------------------------------------------------------------ */

/**
 * One quiet pulsing block. Opacity only (no blur/shimmer filters on the UI
 * thread); reduce-motion renders a static block. Shapes a region in the
 * silhouette of the content that will replace it.
 */
export function SkeletonBlock(props: { width?: number | string; height?: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const tokens = useTokens();
  const reduce = useReduceMotion();
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (reduce) return;
    pulse.value = withRepeat(withTiming(1, { duration: 900, easing: ReEasing.bezier(...Easing.inOut) }), -1, true);
    return () => {
      pulse.value = 0;
    };
  }, [reduce, pulse]);

  const animated = useAnimatedStyle(() => ({
    opacity: 0.55 + 0.45 * pulse.value,
  }));

  return (
    <ReAnimated.View
      accessibilityLabel="Loading"
      accessibilityRole="progressbar"
      style={[
        {
          width: props.width ?? '100%',
          height: props.height ?? 12,
          borderRadius: props.radius ?? tokens.radius.xs,
          backgroundColor: tokens.colors.surfaceAlt,
        },
        animated,
        props.style,
      ]}
    />
  );
}

/** Card-shaped skeleton: the silhouette of a stat card or list card. */
export function SkeletonCard(props: { style?: StyleProp<ViewStyle>; lines?: number }) {
  const tokens = useTokens();
  const { colors, spacing, radius } = tokens;
  return (
    <View
      accessibilityLabel="Loading"
      accessibilityRole="progressbar"
      style={[
        {
          backgroundColor: colors.ownerPanel ?? colors.surface,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.ownerRule ?? colors.rule,
          padding: spacing.md,
          gap: spacing.xs,
        },
        props.style,
      ]}>
      <SkeletonBlock width="42%" height={10} />
      <SkeletonBlock width="78%" height={22} />
      {Array.from({ length: (props.lines ?? 1) - 1 }).map((_, i) => (
        <SkeletonBlock key={i} width={i % 2 ? '62%' : '84%'} height={10} />
      ))}
    </View>
  );
}

/**
 * Skeleton → content: while `loading`, the skeleton stands in the region;
 * the moment data lands the content performs the shared rise-in entrance.
 * No fake timers, no fabricated spinners — the caller owns the loading flag.
 */
export function Reveal(props: { loading: boolean; skeleton?: ReactNode; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  if (props.loading) {
    return (
      <View style={props.style}>
        {props.skeleton ?? <SkeletonCard />}
      </View>
    );
  }
  return <RiseIn style={props.style}>{props.children}</RiseIn>;
}

/* ------------------------------------------------------------------ */
/* Pop                                                                 */
/* ------------------------------------------------------------------ */

/**
 * Small tactile pop: when `trigger` changes (a digit lands, the password
 * eye flips, a confirmation appears) the child springs from slightly
 * compressed to full size. Transform-only; reduce-motion renders the child
 * at rest with no animation.
 */
export function Pop(props: { children: ReactNode; trigger: string | number | boolean; style?: StyleProp<ViewStyle> }) {
  const reduce = useReduceMotion();
  const spring = useSharedValue(1);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (reduce) return;
    spring.value = 0.86;
    const raf = requestAnimationFrame(() => {
      spring.value = withSpring(1, Motion.spring.pop);
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.trigger, reduce]);

  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: spring.value }],
  }));

  return (
    <ReAnimated.View style={[props.style, animated]}>
      {props.children}
    </ReAnimated.View>
  );
}

/**
 * Confirmation mark: a check circle that pops in once (success states,
 * recorded receipts). Rendered where the caller shows its success surface —
 * no fabricated submissions, purely the presentation of an existing state.
 */
export function SuccessPop(props: { style?: StyleProp<ViewStyle>; size?: number; color?: string }) {
  const tokens = useTokens();
  const reduce = useReduceMotion();
  const spring = useSharedValue(reduce ? 1 : 0.5);
  const ring = useSharedValue(reduce ? 1 : 0);

  useEffect(() => {
    if (reduce) return;
    const raf = requestAnimationFrame(() => {
      spring.value = withSpring(1, Motion.spring.pop);
      ring.value = withTiming(1, { duration: Motion.long, easing: ReEasing.bezier(...Easing.out) });
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce]);

  const mark = useAnimatedStyle(() => ({
    transform: [{ scale: spring.value }],
    opacity: 0.4 + 0.6 * ring.value,
  }));

  const size = props.size ?? 64;
  return (
    <ReAnimated.View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 2,
          borderColor: props.color ?? tokens.colors.success,
          alignItems: 'center',
          justifyContent: 'center',
        },
        props.style,
        mark,
      ]}>
      <Ionicons name="checkmark" size={size * 0.47} color={props.color ?? tokens.colors.success} />
    </ReAnimated.View>
  );
}

/**
 * Data swap: when `swapKey` changes (search query, filter, period) the
 * region dips briefly and recovers — a smooth content update with no
 * remount, no layout shift and no full entrance replay. Reduce-motion
 * leaves the content static.
 */
export function Swap(props: { swapKey: string | number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const reduce = useReduceMotion();
  const fade = useSharedValue(1);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (reduce) return;
    fade.value = 0.35;
    const raf = requestAnimationFrame(() => {
      fade.value = withTiming(1, { duration: Motion.swap, easing: ReEasing.bezier(...Easing.out) });
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.swapKey, reduce]);

  const animated = useAnimatedStyle(() => ({ opacity: fade.value }));
  return <ReAnimated.View style={[props.style, animated]}>{props.children}</ReAnimated.View>;
}

/* ------------------------------------------------------------------ */
/* Meter                                                               */
/* ------------------------------------------------------------------ */

/**
 * Progress meter: the fill grows from the left with the arrival easing
 * (transform-only scaleX — no per-frame layout). Re-runs when the target
 * fraction changes (e.g. a refresh recalculates the week). Reduce-motion
 * shows the final fill immediately. The fraction shown is the caller's real
 * value; the animation only approaches it.
 */
export function Meter(props: { progress: number; color: string; track?: string; height?: number; delay?: number; style?: StyleProp<ViewStyle> }) {
  const tokens = useTokens();
  const reduce = useReduceMotion();
  const clamped = Math.max(0, Math.min(1, props.progress || 0));
  const anim = useSharedValue(reduce ? clamped : 0);

  useEffect(() => {
    if (reduce) {
      anim.value = clamped;
      return;
    }
    anim.value = 0;
    const raf = requestAnimationFrame(() => {
      const grow = withTiming(clamped, { duration: Motion.long + 120, easing: ReEasing.bezier(...Easing.out) });
      anim.value = props.delay ? withDelay(props.delay, grow) : grow;
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clamped, reduce, props.delay]);

  const animated = useAnimatedStyle(() => ({
    transform: [{ scaleX: anim.value === 0 ? 0.001 : anim.value }],
  }));

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${Math.round(clamped * 100)}% complete`}
      style={[
        {
          height: props.height ?? 6,
          borderRadius: tokens.radius.pill,
          backgroundColor: props.track ?? tokens.colors.surfaceAlt,
          overflow: 'hidden',
        },
        props.style,
      ]}>
      <ReAnimated.View
        style={[
          {
            flex: 1,
            backgroundColor: props.color,
            borderRadius: tokens.radius.pill,
            transformOrigin: '0% 50%',
          },
          animated,
        ]}
      />
    </View>
  );
}
