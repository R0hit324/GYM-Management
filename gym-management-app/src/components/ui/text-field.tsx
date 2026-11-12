/**
 * Labeled text field. All states designed together: default, focused,
 * error, disabled, secure with show/hide, read-only demo.
 *
 * Validation is inline on blur (UX guideline); the error slot reserves
 * height so content never jumps when the message appears.
 */
import { forwardRef, useState, type ComponentRef, type ReactNode } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { IconButton } from '@/components/ui/button';
import { useTokens } from '@/hooks/use-tokens';

export interface TextFieldProps extends Omit<TextInputProps, 'secureTextEntry'> {
  label: string;
  error?: string | null;
  helper?: string | null;
  secure?: boolean;
  leadingIcon?: keyof typeof Ionicons.glyphMap;
  trailing?: ReactNode;
  /** Focus-ring colour override (additive). Auth screens pass the white accent. */
  accentColor?: string;
  /**
   * Additive: 'auth' renders the reference's pill field — charcoal surface,
   * grey border, white focus border, pill radius — with no label above
   * (the reference uses placeholders only) and an auth-toned helper slot.
   */
  appearance?: 'default' | 'auth';
}

export const TextField = forwardRef<ComponentRef<typeof TextInput>, TextFieldProps>(function TextField(
  { label, error, helper, secure = false, leadingIcon, trailing, accentColor, appearance = 'default', style, ...rest },
  ref,
) {
  const tokens = useTokens();
  const { colors, spacing, radius, type } = tokens;
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(!secure);
  const auth = appearance === 'auth';

  const borderColor = error
    ? colors.dangerStrong
    : focused
      ? accentColor ?? colors.accent
      : auth
        ? colors.authRule
        : colors.rule;
  const borderWidth = 1; // constant width across states — never a border-shift
  const helperText = error ?? helper;

  return (
    <View>
      {!auth && (
        <Text style={[type.label, { color: colors.inkMuted, marginBottom: spacing.xs }]}>{label}</Text>
      )}
      <View
        style={[
          styles.field,
          {
            borderColor,
            borderWidth,
            borderRadius: auth ? radius.pill : radius.sm,
            backgroundColor: auth
              ? colors.authField
              : rest.editable === false
                ? colors.surface
                : colors.surfaceAlt,
            height: tokens.control.field,
            paddingHorizontal: auth ? spacing.md : spacing.sm,
            gap: spacing.xs,
            alignItems: 'center',
            flexDirection: 'row',
          },
        ]}>
        {leadingIcon && (
          <Ionicons name={leadingIcon} size={18} color={auth ? colors.authInkSubtle : colors.inkSubtle} />
        )}
        <TextInput
          ref={ref}
          accessibilityLabel={auth ? rest.accessibilityLabel ?? label : rest.accessibilityLabel}
          placeholderTextColor={auth ? colors.authInkSubtle : colors.inkSubtle}
          style={[
            type.body,
            {
              flex: 1,
              color: auth
                ? colors.authInk
                : rest.editable === false
                  ? colors.inkMuted
                  : colors.ink,
            },
            style,
          ]}
          secureTextEntry={secure && !revealed}
          onFocus={() => setFocused(true)}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          {...rest}
        />
        {secure && (
          <IconButton
            name={revealed ? 'eye-off-outline' : 'eye-outline'}
            label={revealed ? 'Hide password' : 'Show password'}
            tone="muted"
            onPress={() => setRevealed((r) => !r)}
          />
        )}
        {!secure && trailing}
      </View>
      {/* Fixed-height helper slot: no layout jump when error appears */}
      {!auth && (
        <Text
          style={[
            type.caption,
            {
              color: error ? colors.danger : colors.inkMuted,
              marginTop: spacing['3xs'],
              minHeight: 16,
            },
          ]}
          accessibilityLiveRegion={error ? 'polite' : undefined}>
          {helperText ?? ''}
        </Text>
      )}
      {/* Auth appearance: helper slot only when there is text (error is
          rendered inline under the pill in a reserved slot by the caller
          via `helper`; keep the same no-jump guarantee). */}
      {auth && helperText != null && (
        <Text
          style={[
            type.caption,
            {
              color: error ? colors.danger : colors.authInkSubtle,
              marginTop: spacing['3xs'],
              marginLeft: spacing.md,
            },
          ]}
          accessibilityLiveRegion={error ? 'polite' : undefined}>
          {helperText}
        </Text>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  field: {
    minHeight: 48,
  },
});
