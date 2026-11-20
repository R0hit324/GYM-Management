/**
 * WS-8 — explicit consent control.
 *
 * Unchecked by default at every call site. The whole row is the touch
 * target; the accessibility role/state expose a real checkbox, not a
 * styled label. No checkbox is preselected.
 */
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText } from '@/components/ui/text';
import { useTokens } from '@/hooks/use-tokens';

export function ConsentCheckbox(props: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  /** 'auth' matches the black join panel; 'light' matches workspace cards. */
  tone?: 'auth' | 'light';
  disabled?: boolean;
  /** Optional links rendered beneath the row (e.g. the two legal documents). */
  links?: ReactNode;
}) {
  const tokens = useTokens();
  const { colors, spacing, radius } = tokens;
  const auth = props.tone === 'auth';
  const ink = auth ? colors.authInk : colors.ownerInk;
  const muted = auth ? colors.authInkMuted : colors.ownerInkMuted;
  const border = auth ? colors.authRuleStrong : colors.ownerRule;
  const accent = auth ? colors.authAccent : colors.ownerAccentDeep;
  const accentInk = auth ? colors.authAccentInk : '#FFFFFF';

  return (
    <View style={{ gap: spacing['3xs'] }}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: props.checked, disabled: props.disabled }}
        accessibilityLabel={props.label}
        disabled={props.disabled}
        onPress={() => props.onChange(!props.checked)}
        style={({ pressed }) => ({
          minHeight: 44,
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: spacing.xs,
          opacity: props.disabled ? 0.55 : pressed ? 0.8 : 1,
          paddingVertical: spacing['3xs'],
        })}>
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: radius.sm,
            borderWidth: 1.5,
            borderColor: props.checked ? accent : border,
            backgroundColor: props.checked ? accent : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: 1,
          }}>
          {props.checked && <Ionicons name="checkmark" size={15} color={accentInk} />}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <AppText variant="label" style={{ color: ink }}>
            {props.label}
          </AppText>
          {props.description && (
            <AppText variant="caption" style={{ color: muted, marginTop: 2 }}>
              {props.description}
            </AppText>
          )}
        </View>
      </Pressable>
      {props.links && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, paddingLeft: 30 }}>
          {props.links}
        </View>
      )}
    </View>
  );
}
