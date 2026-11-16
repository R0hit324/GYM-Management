/**
 * Search bar. Debounce and filtering live in the caller (see
 * useDemoSearch). Paste is never blocked; clearing is one tap.
 *
 * Redesigned (Stage 8 rework): an independent pill control — white
 * surface, clearly visible border, leading search icon in a tinted
 * well, readable placeholder/ink, and a clear focus state (border and
 * well switch to the accent while editing). Press feedback and the
 * clear action keep their existing behaviour. Dark-surface styling is
 * preserved by default; Owner screens render outside the light provider
 * and keep today's look.
 */
import { useContext, useRef, useState, type ComponentRef } from 'react';
import { Pressable, StyleSheet, TextInput, TextInputProps, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { ButtonSurfaceContext, IconButton } from '@/components/ui/button';
import { useTokens } from '@/hooks/use-tokens';

export function SearchBar(props: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label: string;
}) {
  const tokens = useTokens();
  const { colors, spacing, radius, type, control } = tokens;
  const light = useContext(ButtonSurfaceContext) === 'light';
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);

  const inputProps: TextInputProps = {
    value: props.value,
    onChangeText: props.onChange,
    placeholder: props.placeholder ?? 'Search',
    placeholderTextColor: light ? colors.ownerInkSubtle : colors.inkSubtle,
    returnKeyType: 'search',
    accessibilityLabel: props.label,
    style: [type.body, { flex: 1, color: light ? colors.ownerInk : colors.ink, padding: 0 }],
  };

  // Light surface: white pill, accent border on focus. Focus is a style
  // swap (no layout shift); the tinted icon well echoes the accent.
  const borderColor =
    light ? (focused ? colors.ownerAccentDeep : colors.ownerDot) : colors.rule;

  return (
    // The whole pill is tappable to focus: on Android the TextInput's own
    // touch area is only its text box, so taps on the pill's padding or
    // the icon well previously did nothing. The input keeps its own
    // handlers — a direct tap on the text still focuses it normally, and
    // the clear button (a nested Pressable) wins its own touch.
    <Pressable
      accessibilityLabel={props.label}
      accessibilityRole="search"
      onPress={() => inputRef.current?.focus()}
      style={[
        styles.row,
        {
          backgroundColor: light ? colors.ownerPanel : colors.surfaceAlt,
          borderColor,
          borderRadius: radius.pill,
          height: control.search,
          paddingHorizontal: spacing.xs,
          gap: spacing.xxs,
        },
        focused && light ? tokens.elevation.lightCard : null,
      ]}>
      {light ? (
        <View
          pointerEvents="none"
          style={{
            width: 36,
            height: 36,
            borderRadius: radius.pill,
            backgroundColor: focused ? colors.ownerAccentTint : colors.ownerPanelMuted,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <Ionicons name="search" size={17} color={focused ? colors.ownerAccentDeep : colors.ownerInkMuted} />
        </View>
      ) : (
        <View pointerEvents="none" style={{ width: 40, alignItems: 'center' }}>
          <Ionicons name="search" size={18} color={colors.inkSubtle} />
        </View>
      )}
      <TextInput
        ref={inputRef}
        {...inputProps}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {props.value.length > 0 && (
        <IconButton name="close-circle" label="Clear search" tone="muted" onPress={() => props.onChange('')} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
});
