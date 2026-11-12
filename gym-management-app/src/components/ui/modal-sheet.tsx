/**
 * Modal sheet: bottom sheet with scrim. Enter slides up (transform and
 * opacity only, 420 ms); exit slides down faster (65% of enter). Reduce
 * motion collapses both to instant. Native modal keeps focus discipline,
 * hardware back behaviour and platform semantics.
 */
import { ReactNode, useEffect, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing as ReEasing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Easing, Motion, Spacing } from '@/constants/theme';
import { IconButton } from '@/components/ui/button';
import { AppText } from '@/components/ui/text';
import { useTokens } from '@/hooks/use-tokens';
import { useReduceMotion } from '@/hooks/use-reduce-motion';

export function ModalSheet(props: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  toneBadge?: ReactNode;
  children: ReactNode;
}) {
  const tokens = useTokens();
  const reduce = useReduceMotion();
  const { colors, spacing, radius } = tokens;
  const insets = useSafeAreaInsets();
  const progress = useSharedValue(0);
  const [mounted, setMounted] = useState(props.visible);

  const unmount = () => setMounted(false);

  useEffect(() => {
    if (props.visible) {
      // Mount a frame later so the effect body never calls setState synchronously.
      const raf = requestAnimationFrame(() => setMounted(true));
      progress.value = withTiming(1, {
        duration: reduce ? 1 : Motion.long,
        easing: ReEasing.bezier(...Easing.out),
      });
      return () => cancelAnimationFrame(raf);
    } else if (progress.value > 0) {
      progress.value = withTiming(
        0,
        { duration: reduce ? 1 : Motion.long * Motion.exitFactor, easing: ReEasing.bezier(...Easing.in) },
        (finished) => {
          if (finished) runOnJS(unmount)();
        },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.visible, reduce]);

  const scrim = useAnimatedStyle(() => ({ opacity: progress.value * 0.45 }));
  const sheet = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * 320 }],
    opacity: 0.4 + 0.6 * progress.value,
  }));

  if (!props.visible && !mounted) return null;

  return (
    <Modal transparent animationType="none" onRequestClose={() => props.onClose()}>
      <View style={styles.fill}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }, scrim]}>
          {props.visible && (
            <View style={StyleSheet.absoluteFill}>
              {/* scrim tap does not close mid-animation */}
              <View style={StyleSheet.absoluteFill} />
            </View>
          )}
        </Animated.View>
        <Animated.View
          style={[styles.bottom, { paddingBottom: insets.bottom + spacing.md }, sheet]}>
          <View
            style={[
              {
                backgroundColor: colors.surface,
                borderTopLeftRadius: radius.lg,
                borderTopRightRadius: radius.lg,
                paddingTop: spacing.sm,
                paddingHorizontal: spacing.lg,
                paddingBottom: spacing.md,
                maxHeight: '86%',
              },
              tokens.elevation.floating,
            ]}>
            <View style={styles.handleContainer}>
              <View style={[styles.handle, { backgroundColor: colors.ruleStrong }]} />
            </View>
            <View style={styles.header}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'center' }}>
                  <AppText variant="title">{props.title}</AppText>
                  {props.toneBadge}
                </View>
                {props.subtitle && (
                  <AppText variant="label" tone="muted" style={{ marginTop: spacing['3xs'] }}>
                    {props.subtitle}
                  </AppText>
                )}
              </View>
              <IconButton name="close" label="Close" tone="muted" onPress={props.onClose} />
            </View>
            {props.children}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  handleContainer: {
    alignItems: 'center',
    paddingBottom: 10,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
});
