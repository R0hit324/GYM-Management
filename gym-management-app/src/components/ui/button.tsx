/**
 * Buttons. One filled primary recipe per screen (styles: 'primary'),
 * secondaries are outlined ('secondary') or text ('ghost'); 'danger' is
 * reserved for destructive intent only.
 *
 * Surface-aware (Stage 8): the palette also depends on the surface the
 * button sits on. Default is 'dark' (the dark sheets, dark grounds and
 * dark headers keep today's styling); WorkspaceScreen provides 'light'
 * so buttons on the light content panels get readable inks instead of
 * the dark-surface near-white label. ModalSheet re-asserts 'dark'.
 */
import { createContext, useContext } from 'react';
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
import { AnimatedIcon } from '@/components/ui/animated-icon';
import { useTokens } from '@/hooks/use-tokens';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'onAccent' | 'primarySoft';
export type ButtonSize = 'medium' | 'small';
export type ButtonSurface = 'light' | 'dark';

/**
 * Declares the surface buttons render on: 'light' = the light content
 * panel (white/near-white cards, wells), 'dark' = dark grounds, sheets
 * and headers. Default 'dark' preserves every existing dark-surface
 * usage; only WorkspaceScreen overrides it to 'light'.
 */
export const ButtonSurfaceContext = createContext<ButtonSurface>('dark');

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
  const light = useContext(ButtonSurfaceContext) === 'light';

  interface Palette {
    bg?: string;
    fg: string;
    border?: string;
    borderWidth?: number;
    lift?: boolean; // subtle elevation for filled/outlined light controls
  }

  // Coach Board: the primary is the one amber fill at every size, and its
  // label is the dark ink (verified ≥4.5:1 at any size — no more
  // deeper-shade trick for small buttons).
  const darkPalette: Record<ButtonVariant, Palette> = {
    primary: { bg: colors.accent, fg: colors.accentInk },
    secondary: { fg: colors.ink, border: colors.ruleStrong, borderWidth: 1 },
    ghost: { fg: colors.accentBright },
    // Danger fills keep a white label; the dark accentInk would fail on red.
    danger: { bg: colors.dangerStrong, fg: colors.ink },
    onAccent: { fg: colors.accentInk, border: colors.accentInk },
    // Auth-only: white pill fill, dark label — the authentication screens'
    // primary; workspaces keep the amber primary.
    primarySoft: { bg: colors.authAccent, fg: colors.authAccentInk },
  };

  // Light-panel palette (Stage 8): no transparent secondary on white
  // cards — a white fill with dark ink, a visible border and a subtle
  // lift; ghost reads as restrained blue on white; the amber primary
  // gets a subtle elevation so it reads as a raised control. Fills
  // (primary, danger, onAccent, primarySoft) keep their labels identical.
  const lightPalette: Record<ButtonVariant, Palette> = {
    primary: { bg: colors.accent, fg: colors.accentInk, lift: true },
    secondary: {
      bg: colors.ownerPanel,
      fg: colors.ownerInk,
      border: colors.ownerDot,
      borderWidth: 1,
      lift: true,
    },
    ghost: { fg: colors.ownerAccentDeep },
    danger: darkPalette.danger,
    onAccent: darkPalette.onAccent,
    primarySoft: darkPalette.primarySoft,
  };

  const v = (light ? lightPalette : darkPalette)[variant];
  const height = size === 'medium' ? tokens.control.button : tokens.control.buttonSmall;
  const ph = size === 'medium' ? spacing.lg : spacing.md;

  const shell: StyleProp<ViewStyle> = [
    {
      backgroundColor: v.bg ?? 'transparent',
      borderWidth: v.borderWidth ?? (v.border ? 1 : 0),
      borderColor: v.border,
      // Redesigned control language: every button is a fully rounded pill
      // (the auth screens' CTA shape, now the app-wide system) — height,
      // padding and label tokens unchanged.
      borderRadius: radius.pill,
      minHeight: height,
      paddingHorizontal: ph,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: spacing.xs,
      opacity: disabled || loading ? 0.55 : 1,
    },
    v.lift && !disabled && !loading ? tokens.elevation.lightCard : null,
  ];

  const rootStyle: StyleProp<ViewStyle> = [fullWidth && { alignSelf: 'stretch' }, style];
  // Coach Board buttons: Barlow Condensed 800 in title case, untracked.
  const typeToken =
    variant === 'primarySoft'
      ? { fontSize: 16, lineHeight: 20, fontFamily: 'Barlow_600' as const, letterSpacing: 0.2 }
      : size === 'medium'
        ? tokens.type.button
        : tokens.type.buttonSmall;
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
            {icon && <AnimatedIcon name={icon} size={size === 'medium' ? 19 : 16} color={v.fg} />}
            <Text style={textSizeStyle}>{label}</Text>
          </>
        )}
      </PressSurface>
    </View>
  );
}

/** Icon-only action (header close, contact). Visual: a 34px circular
 * touch surface on the light panel (clearly a control, not floating
 * text); bare icon on dark grounds/sheets as approved. Hit target 44.
 * Tone map is surface-aware: on the light panel the 'ink'/'muted' inks
 * switch to the owner palette's dark greys — the dark-surface greys
 * (#A0A6AE) are too faint on white. */
export function IconButton(props: {
  name: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  tone?: 'ink' | 'muted' | 'accent' | 'inverse' | 'danger';
  label: string;
  style?: StyleProp<ViewStyle>;
}) {
  const tokens = useTokens();
  const { colors, spacing } = tokens;
  const light = useContext(ButtonSurfaceContext) === 'light';
  const color = {
    ink: light ? colors.ownerInk : colors.ink,
    muted: light ? colors.ownerInkMuted : colors.inkMuted,
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
      {light ? (
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: tokens.radius.pill,
            backgroundColor: colors.ownerPanelMuted,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <AnimatedIcon name={props.name} size={20} color={color} />
        </View>
      ) : (
        <AnimatedIcon name={props.name} size={22} color={color} />
      )}
    </PressSurface>
  );
}

export const buttonStyles = StyleSheet.create({});
