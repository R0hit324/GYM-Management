/**
 * Authentication surface components — light-top + black-panel reference
 * (login, join, recovery). Pixel-referenced to the supplied Travel-App
 * screenshot: light dotted upper zone with the centered grey Pulse logo,
 * then a large black panel with rounded top corners holding all auth
 * content. Scoped to the auth screens; the workspaces keep the Coach Board
 * system. Reuses shared tokens and primitives (PressSurface, AppText) —
 * nothing duplicated, no screenshot-as-background (the dots are a real
 * lightweight SVG pattern component).
 *
 * Security stance carried over unchanged: the selected account category is
 * only the user's EXPECTED type — authorisation is verified by the backend
 * against the session, never by this selection.
 */
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Pattern, Rect } from 'react-native-svg';
import type { ReactNode } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText } from '@/components/ui/text';
import { PressSurface } from '@/components/ui/press-surface';
import { useTokens } from '@/hooks/use-tokens';

/**
 * Subtle dot grid for the light upper zone (reference detail). A real
 * <Pattern> fill — cheap to render, tileable, no image asset.
 */
export function DotPattern({ dot = '#CDCDCD', gap = 16 }: { dot?: string; gap?: number }) {
  const id = `auth-dots-${gap}`;
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <Pattern id={id} patternUnits="userSpaceOnUse" width={gap} height={gap}>
          <Circle cx={2} cy={2} r={1.2} fill={dot} />
        </Pattern>
      </Defs>
      <Rect width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

/**
 * The light upper zone: `#F3F3F3` ground, dot pattern, centered grey Pulse
 * Gym logo. flex-weight and minHeight are set by the caller so the zone
 * keeps roughly the reference's ~45% share on tall screens and yields
 * gracefully when the keyboard opens.
 */
export function AuthHeader(props: { topRow?: ReactNode; style?: StyleProp<ViewStyle> }) {
  const tokens = useTokens();
  const { colors, spacing, radius } = tokens;

  return (
    <View style={[{ flex: 0.42, minHeight: 148, backgroundColor: colors.authTop }, props.style]}>
      <DotPattern />
      {props.topRow && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: spacing.sm,
            paddingTop: spacing.sm,
          }}>
          {props.topRow}
        </View>
      )}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <View
          accessible
          accessibilityLabel="Pulse Gym"
          style={{ alignItems: 'center', gap: spacing.xs }}>
          <View
            style={{
              width: 46,
              height: 46,
              borderRadius: radius.pill,
              backgroundColor: colors.authBg,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Ionicons name="barbell" size={24} color={colors.authInk} />
          </View>
          <AppText
            variant="label"
            style={{ color: colors.authTopInk, letterSpacing: 4, fontWeight: '600' }}>
            PULSE GYM
          </AppText>
        </View>
      </View>
    </View>
  );
}

/**
 * The black authentication panel: large rounded top corners (reference ≈30),
 * extends to the bottom of the screen. All auth content sits inside it.
 */
export function AuthPanel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const tokens = useTokens();
  const { colors, radius } = tokens;
  return (
    <View
      style={[
        {
          flex: 1,
          backgroundColor: colors.authBg,
          borderTopLeftRadius: radius.authPanel,
          borderTopRightRadius: radius.authPanel,
        },
        style,
      ]}>
      {children}
    </View>
  );
}

/**
 * Reference typography: large light-weight two-tone heading — muted grey
 * lead, white emphasis ("Welcome" + "back,"). Rendered as one Text so it
 * wraps as a single sentence.
 */
export function AuthHeading({ muted, emphasis }: { muted: string; emphasis: string }) {
  const tokens = useTokens();
  const { colors } = tokens;
  return (
    <AppText variant="authHeading" style={{ color: colors.authHeadingMuted }}>
      {muted}
      <AppText variant="authHeading" style={{ color: colors.authInk }}>
        {emphasis}
      </AppText>
    </AppText>
  );
}

const categoryIcons = {
  owner: 'shield-checkmark-outline',
  receptionist: 'people-outline',
  member: 'person-outline',
} as const;

export type AuthCategory = 'owner' | 'receptionist' | 'member';

/**
 * Compact selectable category pills (reference-minimal): unselected =
 * charcoal surface + grey border + muted label; selected = white border,
 * white label and icon on the slightly lifted tint. All three roles stay
 * individually available — never merged.
 */
export function CategorySelector(props: {
  categories: { id: AuthCategory; label: string; blurb: string }[];
  value: AuthCategory;
  onChange: (id: AuthCategory) => void;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const tokens = useTokens();
  const { colors, spacing, radius } = tokens;

  return (
    <View
      accessibilityLabel={props.accessibilityHint ?? 'Account category'}
      style={[{ flexDirection: 'row', gap: spacing.xs }, props.style]}>
      {props.categories.map((c) => {
        const selected = props.value === c.id;
        return (
          <PressSurface
            key={c.id}
            accessibilityRole="button"
            accessibilityState={{ selected: selected ? selected : undefined }}
            accessibilityLabel={`${c.label}, ${c.blurb}`}
            onPress={() => props.onChange(c.id)}
            style={{ flex: 1, minWidth: 0 }}>
            <View
              style={{
                minHeight: 44,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: spacing.xxs,
                paddingVertical: spacing.xs,
                paddingHorizontal: spacing.xxs,
                borderRadius: radius.pill,
                borderWidth: 1,
                backgroundColor: selected ? colors.authSelectedBg : colors.authField,
                borderColor: selected ? colors.authAccent : colors.authRule,
              }}>
              <Ionicons
                name={categoryIcons[c.id]}
                size={15}
                color={selected ? colors.authInk : colors.authInkSubtle}
              />
              <AppText
                variant="label"
                numberOfLines={1}
                style={{
                  color: selected ? colors.authInk : colors.authInkMuted,
                  fontWeight: selected ? '600' : '500',
                }}>
                {c.label}
              </AppText>
            </View>
          </PressSurface>
        );
      })}
    </View>
  );
}

/** Error banner for auth forms; reuses the shared semantic danger tokens. */
export function AuthErrorMessage({ message }: { message: string }) {
  const tokens = useTokens();
  const { colors, spacing, radius } = tokens;
  return (
    <View
      accessibilityRole="alert"
      style={{
        flexDirection: 'row',
        gap: spacing.xs,
        alignItems: 'flex-start',
        backgroundColor: colors.dangerBg,
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: colors.rule,
        padding: spacing.sm,
      }}>
      <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
      <AppText variant="label" style={{ color: colors.dangerOnBg, flex: 1 }}>
        {message}
      </AppText>
    </View>
  );
}

/** Membership plan card for signup; data comes from demoPlans (demo-labelled). */
export function AuthPlanCard(props: {
  name: string;
  duration: string;
  price: string;
  highlights: string[];
  selected: boolean;
  onPress: () => void;
}) {
  const tokens = useTokens();
  const { colors, spacing, radius } = tokens;
  const selected = props.selected;

  return (
    <PressSurface
      accessibilityRole="button"
      accessibilityState={{ selected: selected ? selected : undefined }}
      accessibilityLabel={`${props.name} plan, ${props.duration}, ${props.price}. ${props.highlights.join(', ')}.`}
      onPress={props.onPress}
      scaleOnPress={false}>
      <View
        style={{
          padding: spacing.md,
          borderRadius: radius.sm,
          borderWidth: 1,
          backgroundColor: selected ? colors.authSelectedBg : colors.authField,
          borderColor: selected ? colors.authAccent : colors.authRule,
          gap: spacing['3xs'],
        }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexShrink: 1 }}>
            <Ionicons
              name={selected ? 'checkmark-circle' : 'ellipse-outline'}
              size={20}
              color={selected ? colors.authInk : colors.authInkSubtle}
            />
            <AppText variant="bodyStrong" style={{ color: selected ? colors.authInk : colors.authInkMuted }}>
              {props.name}
            </AppText>
          </View>
          <AppText variant="figureSmall" style={{ color: selected ? colors.authInk : colors.authInkMuted }}>
            {props.price}
          </AppText>
        </View>
        <AppText variant="caption" style={{ color: colors.authInkSubtle }}>
          {props.duration} · billed at today&apos;s listed price
        </AppText>
        <View style={{ gap: spacing['3xs'], marginTop: spacing['3xs'] }}>
          {props.highlights.map((h) => (
            <View key={h} style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'flex-start' }}>
              <AppText variant="caption" style={{ color: colors.authInk }}>
                ·
              </AppText>
              <AppText variant="caption" style={{ color: colors.authInkMuted, flex: 1 }}>
                {h}
              </AppText>
            </View>
          ))}
        </View>
      </View>
    </PressSurface>
  );
}
