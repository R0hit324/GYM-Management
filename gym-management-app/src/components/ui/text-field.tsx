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
  /** Focus-ring colour override (additive). Auth screens pass the soft blue. */
  accentColor?: string;
}

export const TextField = forwardRef<ComponentRef<typeof TextInput>, TextFieldProps>(function TextField(
  { label, error, helper, secure = false, leadingIcon, trailing, accentColor, style, ...rest },
  ref,
) {
  const tokens = useTokens();
  const { colors, spacing, radius, type } = tokens;
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(!secure);

  const borderColor = error ? colors.dangerStrong : focused ? accentColor ?? colors.accent : colors.rule;
  const borderWidth = 1; // constant width across states — never a border-shift
  const helperText = error ?? helper;

  return (
    <View>
      <Text style={[type.label, { color: colors.inkMuted, marginBottom: spacing.xs }]}>{label}</Text>
      <View
        style={[
          styles.field,
          {
            borderColor,
            borderWidth,
            borderRadius: radius.sm,
            backgroundColor: rest.editable === false ? colors.surface : colors.surfaceAlt,
            height: tokens.control.field,
            paddingHorizontal: spacing.sm,
            gap: spacing.xs,
            alignItems: 'center',
            flexDirection: 'row',
          },
        ]}>
        {leadingIcon && <Ionicons name={leadingIcon} size={18} color={colors.inkSubtle} />}
        <TextInput
          ref={ref}
          style={[
            type.body,
            { flex: 1, color: rest.editable === false ? colors.inkMuted : colors.ink },
            style,
          ]}
          secureTextEntry={secure && !revealed}
          placeholderTextColor={colors.inkSubtle}
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
    </View>
  );
});

const styles = StyleSheet.create({
  field: {
    minHeight: 48,
  },
});
