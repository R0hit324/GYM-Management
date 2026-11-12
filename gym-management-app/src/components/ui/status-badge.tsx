/**
 * Status indicators with reusable tones. Status is never communicated by
 * colour alone: each badge pairs a labelled word with its tint.
 */
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/text';
import { useTokens } from '@/hooks/use-tokens';
import { Radius } from '@/constants/theme';

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent' | 'member' | 'reception' | 'owner';

const toneMap = {
  success: { bg: 'successBg', fg: 'successOnBg' },
  warning: { bg: 'warningBg', fg: 'warningOnBg' },
  danger: { bg: 'dangerBg', fg: 'dangerOnBg' },
  info: { bg: 'infoBg', fg: 'infoOnBg' },
  neutral: { bg: 'surfaceAlt', fg: 'inkMuted' },
  accent: { bg: 'accentBg', fg: 'accentBright' },
  member: { bg: 'roleMemberBg', fg: 'roleMemberOnBg' },
  reception: { bg: 'roleReceptionBg', fg: 'roleReceptionOnBg' },
  owner: { bg: 'roleOwnerBg', fg: 'roleOwnerOnBg' },
} as const;

export function StatusBadge(props: { label: string; tone: StatusTone; small?: boolean }) {
  const tokens = useTokens();
  const { colors, spacing } = tokens;
  const pair = toneMap[props.tone];
  const bg = colors[pair.bg];
  const fg = colors[pair.fg];

  return (
    <View
      accessibilityLabel={props.label}
      style={[
        styles.badge,
        {
          backgroundColor: bg,
          borderRadius: Radius.pill,
          paddingVertical: props.small ? 2 : 4,
          paddingHorizontal: props.small ? spacing.xs : spacing.sm,
          alignSelf: 'flex-start',
        },
      ]}>
      <AppText variant={props.small ? 'caption' : 'label'} tone="ink" style={{ color: fg, fontWeight: '600' }}>
        {props.label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {},
});
