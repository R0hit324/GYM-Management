/**
 * Text primitive. Every Text in the app goes through a type token; raw
 * fontSize/fontFamily literals are not used outside this file.
 */
import { Text, TextProps, StyleSheet } from 'react-native';

import { useTokens } from '@/hooks/use-tokens';
import type { TypeToken } from '@/constants/theme';

const colorMap = {
  ink: 'ink',
  muted: 'inkMuted',
  subtle: 'inkSubtle',
  inverse: 'inkInverse',
  accent: 'accent',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
  info: 'info',
  reception: 'roleReception',
  owner: 'roleOwner',
} as const;

export type TextVariant = TypeToken;
export type TextTone = keyof typeof colorMap;

interface AppTextProps extends TextProps {
  variant?: TextVariant;
  tone?: TextTone;
  align?: 'left' | 'center' | 'right';
}

export function AppText({ variant = 'body', tone = 'ink', align, style, ...rest }: AppTextProps) {
  const { type, colors, spacing } = useTokens();
  return (
    <Text
      style={[
        type[variant],
        { color: colors[colorMap[tone]] },
        align !== undefined && { textAlign: align },
        align === 'center' && { marginTop: spacing['3xs'] }, // optical baseline centre for condensed numerals
        style,
      ]}
      {...rest}
    />
  );
}

export const textStyles = StyleSheet.create({});
