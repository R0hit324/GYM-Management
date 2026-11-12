/**
 * Feedback states shared by lists and regions that load data: loading
 * (skeleton in the shape of what is coming), empty (what belongs here and
 * the action that fills it), error (what broke and what to do).
 */
import { ActivityIndicator, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';

import { AppText } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { useTokens } from '@/hooks/use-tokens';

/**
 * Loading shows after DELAY_MS so near-instant work never flashes a
 * spinner. Minimum visible time keeps it readable.
 */
export const Loading = {
  delay: 250,
  minVisible: 400,
};

export function useDelayedVisible(active: boolean): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    const settle = (v: boolean) => {
      if (!cancelled) setVisible(v);
    };
    if (active) {
      const show = setTimeout(() => {
        settle(true);
        hideTimer = setTimeout(() => settle(false), Loading.minVisible);
      }, Loading.delay);
      return () => {
        cancelled = true;
        clearTimeout(show);
        if (hideTimer) clearTimeout(hideTimer);
      };
    }
    // Hide one tick later so the effect body stays free of synchronous setState.
    const hide = setTimeout(() => settle(false), 0);
    return () => {
      cancelled = true;
      clearTimeout(hide);
    };
  }, [active]);
  return visible;
}

export function SkeletonRow({ lines = 2, style }: { lines?: number; style?: StyleProp<ViewStyle> }) {
  const tokens = useTokens();
  const { colors, spacing, radius } = tokens;
  return (
    <View
      accessibilityLabel="Loading"
      accessibilityRole="progressbar"
      style={[{ gap: spacing.xs, paddingVertical: spacing.xs }, style]}>
      {Array.from({ length: lines }).map((_, i) => (
        <View
          key={i}
          style={{
            height: 12,
            borderRadius: radius.xs,
            backgroundColor: colors.surfaceAlt,
            width: i === 0 ? '70%' : '90%',
          }}
        />
      ))}
    </View>
  );
}

export function EmptyState(props: { icon: keyof typeof Ionicons.glyphMap; title: string; hint: string; actionLabel?: string; onAction?: () => void }) {
  const tokens = useTokens();
  const { colors, spacing, radius } = tokens;
  return (
    <View
      accessibilityRole="summary"
      style={[
        styles.box,
        {
          backgroundColor: colors.surfaceAlt,
          borderRadius: radius.md,
          padding: spacing.lg,
          gap: spacing.xs,
          alignItems: 'center',
        },
      ]}>
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: radius.pill,
          backgroundColor: colors.surface,
          borderColor: colors.rule,
          borderWidth: 1,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: spacing.xxs,
        }}>
        <Ionicons name={props.icon} size={22} color={colors.inkSubtle} />
      </View>
      <AppText variant="bodyStrong" align="center">
        {props.title}
      </AppText>
      <AppText variant="label" tone="muted" align="center">
        {props.hint}
      </AppText>
      {props.actionLabel && props.onAction && (
        <Button label={props.actionLabel} size="small" variant="secondary" onPress={props.onAction} />
      )}
    </View>
  );
}

export function ErrorState(props: { message: string; onRetry?: () => void; retryLabel?: string }) {
  const tokens = useTokens();
  const { colors, spacing, radius } = tokens;
  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.box,
        {
          backgroundColor: colors.dangerBg,
          borderRadius: radius.md,
          padding: spacing.md,
          gap: spacing.xs,
        },
      ]}>
      <AppText variant="bodyStrong" style={{ color: colors.dangerOnBg }}>
        Something is not right
      </AppText>
      <AppText variant="label" style={{ color: colors.dangerOnBg }}>
        {props.message}
      </AppText>
      {props.onRetry && (
        <Button
          label={props.retryLabel ?? 'Try again'}
          size="small"
          variant="secondary"
          onPress={props.onRetry}
          style={{ alignSelf: 'flex-start' }}
        />
      )}
    </View>
  );
}

export function InlineSpinner({ label }: { label?: string }) {
  const tokens = useTokens();
  return (
    <View style={styles.loadingRow}>
      <ActivityIndicator size="small" color={tokens.colors.accent} />
      {label && (
        <AppText variant="label" tone="muted">
          {label}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {},
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
});
