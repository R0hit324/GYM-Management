/**
 * Search bar. Debounce and filtering live in the caller (see
 * useDemoSearch). Paste is never blocked; clearing is one tap.
 */
import { StyleSheet, TextInput, TextInputProps, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { IconButton } from '@/components/ui/button';
import { useTokens } from '@/hooks/use-tokens';

export function SearchBar(props: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label: string;
}) {
  const tokens = useTokens();
  const { colors, spacing, radius, type, control } = tokens;

  const inputProps: TextInputProps = {
    value: props.value,
    onChangeText: props.onChange,
    placeholder: props.placeholder ?? 'Search',
    placeholderTextColor: colors.inkSubtle,
    returnKeyType: 'search',
    accessibilityLabel: props.label,
    style: [type.body, { flex: 1, color: colors.ink, padding: 0 }],
  };

  return (
    <View
      style={[
        styles.row,
        {
          backgroundColor: colors.surfaceAlt,
          borderColor: colors.rule,
          borderRadius: radius.sm,
          height: control.search,
          paddingHorizontal: spacing.xs,
          gap: spacing.xxs,
        },
      ]}>
      <View style={{ width: 40, alignItems: 'center' }}>
        <Ionicons name="search" size={18} color={colors.inkSubtle} />
      </View>
      <TextInput {...inputProps} />
      {props.value.length > 0 && (
        <IconButton name="close-circle" label="Clear search" tone="muted" onPress={() => props.onChange('')} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
});
