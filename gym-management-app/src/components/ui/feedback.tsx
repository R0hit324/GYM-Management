/**
 * Feedback states shared by lists and regions that load data: loading
 * (skeleton in the shape of what is coming), empty (what belongs here and
 * the action that fills it), error (what broke and what to do).
 * Motion: skeleton lines pulse quietly; empty/error states rise in with
 * the shared entrance; nothing loops forever except the loading pulse.
 */
import { RefreshControl, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { SkeletonBlock } from '@/components/ui/motion';
import { RiseIn } from '@/components/ui/rise-in';
import { useTokens } from '@/hooks/use-tokens';

/**
 * List-row skeleton in the shape of what is coming (adopted from the member
 * register's loading rows, F-30): an avatar disc and two muted lines per
 * row, quietly pulsing via the shared SkeletonBlock. `count` rows stack.
 */
export function SkeletonRow({ count = 2, style }: { count?: number; style?: StyleProp<ViewStyle> }) {
  const tokens = useTokens();
  const { colors, spacing, radius } = tokens;
  return (
    <View
      accessibilityLabel="Loading"
      accessibilityRole="progressbar"
      style={[{ gap: spacing.sm }, style]}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
          <SkeletonBlock width={40} height={40} radius={radius.pill} style={{ backgroundColor: colors.ownerPanelMuted }} />
          <View style={{ flex: 1, gap: spacing.xs }}>
            <SkeletonBlock height={12} radius={radius.xs} width="45%" style={{ backgroundColor: colors.ownerPanelMuted }} />
            <SkeletonBlock height={10} radius={radius.xs} width="70%" style={{ backgroundColor: colors.ownerPanelMuted }} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function EmptyState(props: { icon: keyof typeof Ionicons.glyphMap; title: string; hint: string; actionLabel?: string; onAction?: () => void }) {
  const tokens = useTokens();
  const { colors, spacing, radius } = tokens;
  return (
    <RiseIn>
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
    </RiseIn>
  );
}

export function ErrorState(props: {
  message: string;
  /** Optional heading; defaults to the generic one. */
  title?: string;
  onRetry?: () => void;
  retryLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const tokens = useTokens();
  const { colors, spacing, radius } = tokens;
  return (
    <RiseIn>
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
          props.style,
        ]}>
        <AppText variant="bodyStrong" style={{ color: colors.dangerOnBg }}>
          {props.title ?? 'Something is not right'}
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
    </RiseIn>
  );
}

/** Pull-to-refresh control shared by screens reading live data. */
export function DataRefreshControl(props: { refreshing: boolean; onRefresh: () => void }) {
  const tokens = useTokens();
  return (
    <RefreshControl
      refreshing={props.refreshing}
      onRefresh={props.onRefresh}
      tintColor={tokens.colors.ownerAccent}
      colors={[tokens.colors.ownerAccent]}
    />
  );
}

const styles = StyleSheet.create({
  box: {},
});
