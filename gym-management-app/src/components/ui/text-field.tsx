/**
 * Labeled text field. All states designed together: default, focused,
 * error, disabled, secure with show/hide, read-only demo.
 *
 * Validation is inline on blur (UX guideline); the error slot reserves
 * height so content never jumps when the message appears.
 *
 * Motion: the focus ring crossfades between base and target colours on the
 * UI thread (no border-width shift); the helper/error line fades and rises
 * in as a keyed swap; the password eye pops gently when toggled.
 */
import { forwardRef, useContext, useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, {
  Easing as ReEasing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { ButtonSurfaceContext, IconButton } from '@/components/ui/button';
import { Pop } from '@/components/ui/motion';
import { Easing, Motion } from '@/constants/theme';
import { useTokens } from '@/hooks/use-tokens';
import { useReduceMotion } from '@/hooks/use-reduce-motion';

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
  const reduce = useReduceMotion();
  const { colors, spacing, radius, type } = tokens;
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(!secure);
  const auth = appearance === 'auth';
  // Surface-aware (Stage 8): the default appearance was styled for dark
  // grounds (dark fill, near-white ink). On the light content panel the
  // palette switches to the owner light tokens; ModalSheets re-assert the
  // dark palette. The 'auth' appearance is untouched.
  const light = useContext(ButtonSurfaceContext) === 'light';

  const borderWidth = 1; // constant width across states — never a border-shift
  const helperText = error ?? helper;

  // Focus ring: crossfades between colours on the UI thread. When the
  // target colour changes (blur, error), the previous colour becomes the
  // `from` — no snap. Reduce-motion snaps to the target.
  const baseBorder = auth ? colors.authRule : light ? colors.ownerRule : colors.rule;
  const targetBorder = error
    ? colors.dangerStrong
    : focused
      ? accentColor ?? colors.accent
      : baseBorder;
  const ringFrom = useSharedValue<string>(targetBorder);
  const ringTo = useSharedValue<string>(targetBorder);
  const ringT = useSharedValue(1);
  const prevTarget = useRef(targetBorder);
  useEffect(() => {
    if (prevTarget.current !== targetBorder) {
      ringFrom.value = prevTarget.current;
      ringTo.value = targetBorder;
      prevTarget.current = targetBorder;
      if (reduce) {
        ringT.value = 1;
      } else {
        ringT.value = 0;
        ringT.value = withTiming(1, { duration: Motion.micro, easing: ReEasing.bezier(...Easing.inOut) });
      }
    }
  }, [targetBorder, reduce, ringFrom, ringTo, ringT]);
  const ringStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(ringT.value, [0, 1], [ringFrom.value, ringTo.value]),
  }));

  // Helper/error line: a keyed swap — fades and rises in whenever the
  // message text changes, never a jump (the slot keeps its fixed height).
  const helperKey = helperText ?? '';

  return (
    <View>
      {!auth && (
        <Text style={[type.label, { color: light ? colors.ownerInkMuted : colors.inkMuted, marginBottom: spacing.xs }]}>{label}</Text>
      )}
      <Animated.View
        style={[
          styles.field,
          {
            borderWidth,
            borderRadius: radius.pill,
            backgroundColor: auth
              ? colors.authField
              : rest.editable === false
                ? light
                  ? colors.ownerPanelMuted
                  : colors.surface
                : light
                  ? colors.ownerPanel
                  : colors.surfaceAlt,
            height: tokens.control.field,
            paddingHorizontal: auth ? spacing.md : spacing.sm,
            gap: spacing.xs,
            alignItems: 'center',
            flexDirection: 'row',
          },
          ringStyle,
        ]}>
        {leadingIcon && (
          <Ionicons
            name={leadingIcon}
            size={18}
            color={auth ? colors.authInkSubtle : light ? colors.ownerInkSubtle : colors.inkSubtle}
          />
        )}
        <TextInput
          ref={ref}
          accessibilityLabel={auth ? rest.accessibilityLabel ?? label : rest.accessibilityLabel}
          placeholderTextColor={auth ? colors.authInkSubtle : light ? colors.ownerInkSubtle : colors.inkSubtle}
          style={[
            type.body,
            {
              flex: 1,
              color: auth
                ? colors.authInk
                : rest.editable === false
                  ? light
                    ? colors.ownerInkMuted
                    : colors.inkMuted
                  : light
                    ? colors.ownerInk
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
          <Pop trigger={revealed ? 'shown' : 'hidden'}>
            <IconButton
              name={revealed ? 'eye-off-outline' : 'eye-outline'}
              label={revealed ? 'Hide password' : 'Show password'}
              tone="muted"
              onPress={() => setRevealed((r) => !r)}
            />
          </Pop>
        )}
        {!secure && trailing}
      </Animated.View>
      {/* Fixed-height helper slot: no layout jump when error appears */}
      {!auth && (
        <HelperSwap text={helperText} error={!!error} helperKey={helperKey} />
      )}
      {/* Auth appearance: helper slot only when there is text (error is
          rendered inline under the pill in a reserved slot by the caller
          via `helper`; keep the same no-jump guarantee). */}
      {auth && helperText != null && (
        <HelperSwap text={helperText} error={!!error} helperKey={helperKey} auth />
      )}
    </View>
  );
});

/** Fixed-height helper/error line that fades and rises in on every message swap. */
function HelperSwap(props: { text: string | null | undefined; error: boolean; helperKey: string; auth?: boolean }) {
  const tokens = useTokens();
  const reduce = useReduceMotion();
  const { colors, spacing, type } = tokens;
  const appear = useSharedValue(reduce ? 1 : 0);

  useEffect(() => {
    if (reduce) {
      appear.value = 1;
      return;
    }
    appear.value = 0;
    const raf = requestAnimationFrame(() => {
      appear.value = withTiming(1, { duration: Motion.short, easing: ReEasing.bezier(...Easing.out) });
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.helperKey, reduce]);

  const animated = useAnimatedStyle(() => ({
    opacity: appear.value,
    transform: [{ translateY: (1 - appear.value) * -3 }],
  }));

  // Helper text must stay readable on both surfaces: the dark-surface
  // greys/reds are too faint on the light panel, so the light context
  // swaps to the owner muted ink and the deep red for errors (Stage 8).
  const light = useContext(ButtonSurfaceContext) === 'light';
  const color = props.error
    ? props.auth
      ? colors.danger
      : light
        ? colors.dangerStrong
        : colors.danger
    : props.auth
      ? colors.authInkSubtle
      : light
        ? colors.ownerInkMuted
        : colors.inkMuted;
  return (
    <Animated.Text
      accessibilityLiveRegion={props.error ? 'polite' : undefined}
      style={[
        type.caption,
        {
          color,
          marginTop: spacing['3xs'],
          ...(props.auth ? { marginLeft: spacing.md } : { minHeight: 16 }),
        },
        animated,
      ]}>
      {props.text ?? ''}
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  field: {
    minHeight: 48,
  },
});
