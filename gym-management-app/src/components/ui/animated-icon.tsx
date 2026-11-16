/**
 * AnimatedIcon — the shared animated icon system for the app.
 *
 * Reference style (Dribbble "Icon set — Website/Mobile Apps", shot
 * 27642481): icons transition between an outline rest state and a filled
 * selected state with a springy, morph-like motion — never a plain swap.
 *
 * Reproduction on Ionicons (static font glyphs, no SVG paths, so true
 * path morphing is impossible without replacing the icon library):
 * - Inactive = the `-outline` glyph, active = the filled glyph.
 * - Transition = a half-turn flip (rotateY through edge-on, so the two
 *   glyphs read as one continuous rotation) + opacity crossfade, with a
 *   barely-there spring scale settle on the whole glyph.
 * - Press = a quick squash (via the enclosing PressSurface's press
 *   progress, or its own handlers when standalone) that springs back.
 * - Reduced motion / same-state = instant final state, no animation.
 *
 * Two usage modes, no per-screen one-offs:
 * - Glyph-only (no `onPress`): drops into any existing surface — bottom
 *   nav tabs, tiles, chips, header icons. Selection animates from the
 *   `active` prop; press squash arrives automatically from an enclosing
 *   `PressSurface` through the IconPressContext.
 * - Standalone (`onPress`): its own 44px+ touch target with haptics.
 *
 * Transform/opacity only, UI thread only, no per-frame React state.
 */
import { useContext, useEffect, useMemo, useRef } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import ReAnimated, {
  Easing as ReEasing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type WithSpringConfig,
} from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Easing, HitTarget, Motion } from '@/constants/theme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { hapticPress } from '@/utils/haptics';
import { IconPressContext } from '@/components/ui/icon-press';

export type GlyphName = keyof typeof Ionicons.glyphMap;

const OUTLINE = '-outline';

/**
 * Inactive/active glyph pair for a base name. Accepts either variant as
 * input (`home` or `home-outline`). When the counterpart glyph does not
 * exist in Ionicons, `paired` is false and the icon falls back to a
 * single static glyph with colour/press feedback only.
 */
function resolvePair(name: GlyphName) {
  if (name.endsWith(OUTLINE)) {
    const filled = name.slice(0, -OUTLINE.length) as GlyphName;
    if (filled.length > 0 && Ionicons.glyphMap[filled] !== undefined) {
      return { inactive: name, active: filled, paired: true };
    }
    return { inactive: name, active: name, paired: false };
  }
  const outline = `${name}${OUTLINE}` as GlyphName;
  if (Ionicons.glyphMap[outline] !== undefined) {
    return { inactive: outline, active: name, paired: true };
  }
  return { inactive: name, active: name, paired: false };
}

export interface AnimatedIconProps {
  /** Base glyph: either variant of an Ionicons name. */
  name: GlyphName;
  /** Selected/active state — drives the outline→filled morph. */
  active?: boolean;
  /** When provided, the icon is its own touch target (with haptics). */
  onPress?: () => void;
  size?: number;
  /** Inactive tint; the active layer tints `activeColor ?? color`. */
  color?: string;
  activeColor?: string;
  /** Accessibility label (used by the standalone touch target). */
  label?: string;
  disabled?: boolean;
  /** Extra invisible hit padding for the standalone touch target. */
  hitPadding?: number;
  /**
   * Play the morph on mount when already active. Default off (mounted
   * icons sit at their current state — rerenders never replay). Used by
   * the bottom nav, where each screen renders a fresh bar: the selected
   * tab's icon flips into its active state as the screen arrives.
   */
  animateOnMount?: boolean;
  /** Motion overrides. */
  config?: {
    /** Spring for the active/inactive morph (default Motion.spring.pop). */
    spring?: WithSpringConfig;
    /** Mid-transition flip angle in degrees (default 90). */
    flip?: number;
  };
}

export function AnimatedIcon(props: AnimatedIconProps) {
  const size = props.size ?? 20;
  const reduce = useReduceMotion();
  const spring = props.config?.spring ?? Motion.spring.pop;
  const flip = props.config?.flip ?? 90;
  const pair = useMemo(() => resolvePair(props.name), [props.name]);
  const ctxPress = useContext(IconPressContext);
  const ownPress = useSharedValue(0);
  const pressedRef = useRef(false);

  const target = props.active ?? false;

  // Morph progress: 0 = inactive (outline), 1 = active (filled). Starts
  // at the current state (so mounting never animates) unless the caller
  // explicitly wants a mount-time morph for an already-active icon.
  // Reduced motion always starts settled.
  const progress = useSharedValue(target && (!props.animateOnMount || reduce) ? 1 : 0);

  useEffect(() => {
    const to = target ? 1 : 0;
    if (progress.get() === to) {
      return; // same-state guard — re-renders and repeated taps don't replay
    }
    if (reduce) {
      progress.set(to);
      return;
    }
    progress.set(withSpring(to, spring));
  }, [target, reduce, progress, spring]);

  const handleIn = () => {
    pressedRef.current = true;
    if (!reduce) {
      ownPress.set(withTiming(1, { duration: Motion.micro, easing: ReEasing.bezier(...Easing.out) }));
    }
  };
  const handleOut = () => {
    pressedRef.current = false;
    if (!reduce) {
      ownPress.set(withSpring(0, Motion.spring.press));
    }
  };
  const handlePress = () => {
    if (pressedRef.current) hapticPress();
    props.onPress?.();
  };

  // Container: a barely-there size settle between states, multiplied by
  // the press squash (own handlers when standalone, else the enclosing
  // PressSurface's press progress via context).
  const container = useAnimatedStyle(() => {
    const squash = Math.max(ownPress.get(), ctxPress?.get() ?? 0);
    return {
      transform: [{ scale: (0.96 + 0.04 * progress.get()) * (1 - 0.12 * squash) }],
    };
  });

  // The two glyph layers flip through edge-on in one continuous rotation:
  // the outline turns away while the filled glyph rotates into place.
  const back = useAnimatedStyle(() => ({
    opacity: 1 - progress.get(),
    transform: [{ perspective: 240 }, { rotateY: `${progress.get() * flip}deg` }],
  }));
  const front = useAnimatedStyle(() => ({
    opacity: progress.get(),
    transform: [{ perspective: 240 }, { rotateY: `${(1 - progress.get()) * -flip}deg` }],
  }));

  const layers = pair.paired ? (
    <>
      <ReAnimated.View pointerEvents="none" style={[styles.layer, back]}>
        <Ionicons name={pair.inactive} size={size} color={props.color} />
      </ReAnimated.View>
      <ReAnimated.View pointerEvents="none" style={[styles.layer, front]}>
        <Ionicons name={pair.active} size={size} color={props.activeColor ?? props.color} />
      </ReAnimated.View>
    </>
  ) : (
    // Fallback: no filled/outline counterpart — a single static glyph
    // that still receives colour changes and press squash.
    <ReAnimated.View pointerEvents="none" style={styles.layer}>
      <Ionicons
        name={pair.inactive}
        size={size}
        color={target ? (props.activeColor ?? props.color) : props.color}
      />
    </ReAnimated.View>
  );

  const body = (
    <ReAnimated.View style={[styles.box, { width: size, height: size }, container]}>{layers}</ReAnimated.View>
  );

  if (!props.onPress) {
    // Glyph-only mode: the enclosing pressable owns touch + accessibility.
    return body;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label ?? props.name}
      accessibilityState={props.disabled ? { disabled: true } : undefined}
      onPressIn={handleIn}
      onPressOut={handleOut}
      onPress={handlePress}
      disabled={props.disabled}
      hitSlop={props.hitPadding ?? Math.max(0, Math.ceil((HitTarget - size) / 2))}
      style={styles.target}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  layer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  target: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
