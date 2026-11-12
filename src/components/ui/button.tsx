/**
 * Buttons. One filled primary recipe per screen (styles: 'primary'),
 * secondaries are outlined ('secondary') or text ('ghost'); 'danger' is
 * reserved for destructive intent only.
 */
import {
  ActivityIndicator,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { PressSurface } from '@/components/ui/press-surface';
import { useTokens } from '@/hooks/use-tokens';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'onAccent';
export type ButtonSize = 'medium' | 'small';

interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  fullWidth?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}

export function Button(
  {
    label,
    onPress,
    variant = 'primary',
    size = 'medium',
    disabled = false,
    loading = false,
    icon,
    fullWidth = false,
    accessibilityHint,
    style,
  }: ButtonProps) {
  const tokens = useTokens();
  const { colors, spacing, radius } = tokens;

  const palette: Record<ButtonVariant, { bg?: string; fg: string; border?: string; borderWidth?: number }> = {
    // Ember Night: the medium primary is the vibrant ember fill (its label is
    // large text — 19px condensed 800 — so white passes at 3:1); small filled
    // buttons use the deeper ember to pass 4.5:1 at any size.
    primary: { bg: size === 'medium' ? colors.accent : colors.accentDeep, fg: colors.accentInk },
    secondary: { fg: colors.ink, border: colors.ruleStrong, borderWidth: 1 },
    ghost: { fg: colors.accentBright },
    danger: { bg: colors.dangerStrong, fg: colors.accentInk },
    onAccent: { fg: colors.accentInk, border: colors.accentInk },
  };

  const v = palette[variant];
  const height = size === 'medium' ? tokens.control.button : tokens.control.buttonSmall;
  const ph = size === 'medium' ? spacing.lg : spacing.md;

  const shell: StyleProp<ViewStyle> = {
    backgroundColor: v.bg ?? 'transparent',
    borderWidth: v.borderWidth ?? (v.border ? 1 : 0),
    borderColor: v.border,
    borderRadius: radius.sm,
    minHeight: height,
    paddingHorizontal: ph,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    opacity: disabled || loading ? 0.55 : 1,
  };

  const rootStyle: StyleProp<ViewStyle> = [fullWidth && { alignSelf: 'stretch' }, style];
  // Piste buttons: Barlow Condensed 800 in capitals, untracked.
  const typeToken = size === 'medium' ? tokens.type.button : tokens.type.buttonSmall;
  const textSizeStyle: StyleProp<TextStyle> = {
    ...typeToken,
    color: v.fg,
  };

  return (
    <View style={rootStyle}>
      <PressSurface
        onPress={loading || disabled ? undefined : onPress}
        accessibilityRole="button"
        accessibilityLabel={loading ? `${label}, loading` : label}
        accessibilityHint={accessibilityHint}
        accessible
        disabled={disabled || loading}
        style={shell}>
        {loading ? (
          <ActivityIndicator size="small" color={v.fg} />
        ) : (
          <>
            {icon && <Ionicons name={icon} size={size === 'medium' ? 19 : 16} color={v.fg} />}
            <Text style={textSizeStyle}>{label}</Text>
          </>
        )}
      </PressSurface>
    </View>
  );
}

/** Icon-only action (header close, contact). Visual 24px; hit target 44. */
export function IconButton(props: {
  name: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  tone?: 'ink' | 'muted' | 'accent' | 'inverse' | 'danger';
  label: string;
  style?: StyleProp<ViewStyle>;
}) {
  const tokens = useTokens();
  const { colors, spacing } = tokens;
  const color = {
    ink: colors.ink,
    muted: colors.inkMuted,
    accent: colors.accent,
    inverse: colors.accentInk,
    danger: colors.danger,
  }[props.tone ?? 'muted'];

  return (
    <PressSurface
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityLabel={props.label}
      hitPadding={spacing.xs}
      scaleOnPress={false}
      style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={props.name} size={22} color={color} />
    </PressSurface>
  );
}

export const buttonStyles = StyleSheet.create({});
