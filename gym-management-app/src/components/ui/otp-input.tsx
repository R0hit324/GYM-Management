/**
 * OTP entry: fixed boxes, numeric keyboard, paste-friendly, resend cooldown
 * and attempt budget designed in (enforcement is server-side in Part 2; the
 * client never trusts a code here — Part 1 submits nothing).
 * `appearance='auth'` renders the reference's charcoal boxes with the white
 * focused border (additive; default keeps the workspace styling).
 */
import { useRef, useState, type ComponentRef } from 'react';
import { TextInput, View } from 'react-native';

import { useTokens } from '@/hooks/use-tokens';

export function OtpInput(props: {
  length?: number;
  onChange?: (code: string) => void;
  appearance?: 'default' | 'auth';
}) {
  const length = props.length ?? 6;
  const auth = props.appearance === 'auth';
  const tokens = useTokens();
  const { colors, spacing, radius, type } = tokens;
  const [values, setValues] = useState<string[]>(Array(length).fill(''));
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const refs = useRef<(ComponentRef<typeof TextInput> | null)[]>([]);

  const setDigit = (i: number, text: string) => {
    const digits = text.replace(/\D/g, '');
    const next = [...values];
    // paste across boxes
    for (let k = 0; k < digits.length && i + k < length; k++) {
      next[i + k] = digits[k];
    }
    setValues(next);
    props.onChange?.(next.join(''));
    const focusIndex = Math.min(i + Math.max(1, digits.length), length - 1);
    refs.current[focusIndex]?.focus();
  };

  return (
    <View accessibilityLabel="One-time code entry" style={{ flexDirection: 'row', gap: spacing.xs }}>
      {values.map((v, i) => (
        <TextInput
          key={i}
          ref={(r) => {
            refs.current[i] = r;
          }}
          accessibilityLabel={`Digit ${i + 1}`}
          value={v}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          inputMode="numeric"
          maxLength={length}
          onChangeText={(t) => setDigit(i, t)}
          onKeyPress={({ nativeEvent }) => {
            if (nativeEvent.key === 'Backspace' && !values[i] && i > 0) {
              refs.current[i - 1]?.focus();
            }
          }}
          onFocus={() => setFocusedIndex(i)}
          onBlur={() => setFocusedIndex((f) => (f === i ? null : f))}
          style={[
            type.bodyStrong,
            {
              flex: 1,
              minHeight: 52,
              textAlign: 'center',
              backgroundColor: auth ? colors.authField : colors.surface,
              borderWidth: 1,
              borderColor: auth
                ? focusedIndex === i
                  ? colors.authAccent
                  : v
                    ? colors.authRuleStrong
                    : colors.authRule
                : v
                  ? colors.accent
                  : colors.ruleStrong,
              borderRadius: auth ? radius.md : radius.sm,
              color: auth ? colors.authInk : colors.ink,
            },
          ]}
        />
      ))}
    </View>
  );
}
