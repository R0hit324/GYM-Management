/**
 * Authentication surface components — "Nexa for Pulse" (login, join,
 * recovery). Minimal, premium, calm: midnight-navy ground, soft-blue
 * accent, generous spacing, hairline borders. Scoped to the auth screens;
 * the workspaces keep the Coach Board system. Reuses the shared tokens and
 * primitives (PressSurface, AppText, DemoBadge) — nothing duplicated.
 *
 * Security stance carried over unchanged: the selected account category is
 * only the user's EXPECTED type — authorisation is verified by the backend
 * against the session, never by this selection.
 */
import { StyleProp, View, ViewStyle } from 'react-native';
import type { ReactNode } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText } from '@/components/ui/text';
import { PressSurface } from '@/components/ui/press-surface';
import { useTokens } from '@/hooks/use-tokens';

/** Brand + welcome block shared by login and join. */
export function AuthHeader(props: {
  heading: string;
  subcopy: string;
  brandLabel?: string;
}) {
  const tokens = useTokens();
  const { colors, spacing, radius } = tokens;

  return (
    <View style={{ alignItems: 'center', marginTop: spacing.xl, marginBottom: spacing.xl }}>
      <View
        accessible
        accessibilityLabel="Pulse Gym"
        style={{
          width: 56,
          height: 56,
          borderRadius: radius.md,
          backgroundColor: colors.authSurface,
          borderWidth: 1,
          borderColor: colors.authRule,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: spacing.sm,
        }}>
        <Ionicons name="barbell" size={30} color={colors.authAccent} />
      </View>
      {props.brandLabel && (
        <AppText variant="label" style={{ color: colors.authInkSubtle, letterSpacing: 3 }}>
          {props.brandLabel}
        </AppText>
      )}
      <AppText variant="display" style={{ color: colors.authInk, marginTop: spacing.xs }}>
        {props.heading}
      </AppText>
      <AppText variant="label" style={{ color: colors.authInkMuted, marginTop: spacing['3xs'], textAlign: 'center' }}>
        {props.subcopy}
      </AppText>
    </View>
  );
}

const categoryIcons = {
  owner: 'shield-checkmark-outline',
  receptionist: 'people-outline',
  member: 'person-outline',
} as const;

export type AuthCategory = 'owner' | 'receptionist' | 'member';

/** Three selectable account-category cards. Selection is expectation only. */
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
                alignItems: 'center',
                gap: spacing['3xs'],
                paddingVertical: spacing.sm + spacing['3xs'],
                paddingHorizontal: spacing['3xs'],
                borderRadius: radius.sm,
                borderWidth: 1,
                minHeight: 76,
                justifyContent: 'center',
                backgroundColor: selected ? colors.authSelectedBg : colors.authField,
                borderColor: selected ? colors.authAccent : colors.authRule,
              }}>
              <Ionicons
                name={categoryIcons[c.id]}
                size={18}
                color={selected ? colors.authAccent : colors.authInkSubtle}
              />
              <AppText
                variant="label"
                numberOfLines={1}
                style={{ color: selected ? colors.authAccent : colors.authInkMuted, fontWeight: selected ? '600' : '500' }}>
                {c.label}
              </AppText>
              <AppText variant="caption" numberOfLines={2} align="center" style={{ color: colors.authInkSubtle }}>
                {c.blurb}
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

/** Membership plan card for signup step 2; data comes from demoPlans. */
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
              color={selected ? colors.authAccent : colors.authInkSubtle}
            />
            <AppText variant="bodyStrong" style={{ color: selected ? colors.authInk : colors.authInkMuted }}>
              {props.name}
            </AppText>
          </View>
          <AppText variant="figureSmall" style={{ color: selected ? colors.authAccent : colors.authInkMuted }}>
            {props.price}
          </AppText>
        </View>
        <AppText variant="caption" style={{ color: colors.authInkSubtle }}>
          {props.duration} · billed at today&apos;s listed price
        </AppText>
        <View style={{ gap: spacing['3xs'], marginTop: spacing['3xs'] }}>
          {props.highlights.map((h) => (
            <View key={h} style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'flex-start' }}>
              <AppText variant="caption" style={{ color: colors.authAccent }}>
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
