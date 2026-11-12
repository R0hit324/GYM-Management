/**
 * List row: the register/list unit shared by attendance, renewals, fees and
 * lost-member lists. Name column and status stay visible; the action column
 * is always tappable at 44px or more.
 */
import { StyleSheet, View } from 'react-native';
import type { ReactNode } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText } from '@/components/ui/text';
import { PressSurface } from '@/components/ui/press-surface';
import { useTokens } from '@/hooks/use-tokens';

export function ListRow(props: {
  title: string;
  meta?: ReactNode;
  detail?: string;
  status?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  leading?: ReactNode;
}) {
  const tokens = useTokens();
  const { colors, spacing } = tokens;

  const content = (
    <>
      {props.leading}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'baseline' }}>
          <AppText variant="bodyStrong" style={{ flexShrink: 1 }}>
            {props.title}
          </AppText>
          {props.status}
        </View>
        {props.detail && (
          <AppText variant="label" tone="muted" style={{ marginTop: 2 }} numberOfLines={1}>
            {props.detail}
          </AppText>
        )}
        {props.meta}
      </View>
      {props.chevron && (
        <Ionicons name="chevron-forward" size={16} color={colors.inkSubtle} />
      )}
    </>
  );

  if (props.onPress) {
    return (
      <PressSurface
        accessibilityRole="button"
        onPress={props.onPress}
        scaleOnPress={false}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
          minHeight: 60,
        }}>
        {content}
      </PressSurface>
    );
  }

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        minHeight: 60,
      }}>
      {content}
    </View>
  );
}

export function ListGroup(props: { children: ReactNode; label?: string }) {
  const tokens = useTokens();
  const { colors, radius } = tokens;
  return (
    <View
      accessibilityRole="summary"
      accessibilityLabel={props.label}
      style={{
        backgroundColor: colors.surface,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.rule,
        overflow: 'hidden',
      }}>
      {props.children}
    </View>
  );
}

export function RowDivider() {
  const tokens = useTokens();
  return <View style={[styles.hairline, { backgroundColor: tokens.colors.rule }]} />;
}

export function MemberAvatar({ name }: { name: string }) {
  const tokens = useTokens();
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <View
      accessibilityLabel={`${name}, initials ${initials || '?'}`}
      style={{
        width: 40,
        height: 40,
        borderRadius: tokens.radius.pill,
        backgroundColor: tokens.colors.surfaceAlt,
        borderWidth: 1,
        borderColor: tokens.colors.rule,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <AppText variant="bodyStrong" style={{ color: tokens.colors.inkMuted, fontSize: 14 }}>
        {initials || '?'}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  hairline: {
    height: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    marginLeft: 24,
  },
});
