/**
 * Owner dashboard components — "Fino for Pulse" (owner overview only).
 * Pixel-referenced to the supplied Fino fintech screenshot: dark charcoal
 * ground, large hero numeral, compact dark stat cards with a restrained
 * pastel gradient on the highlighted day, and a white content panel with
 * large rounded top corners holding the attention list. Adapted throughout
 * to gym-management data and honesty rules:
 *
 * - Every number comes from the demo-labelled data set (Part 1 has no
 *   backend); nothing is invented and no forecast is shown.
 * - The highlighted day in the week strip is the most RECORDED day, not a
 *   fabricated "today".
 * - Attention items link only to modules that exist; items without a
 *   destination say so instead of dead-linking.
 * - The bottom navigation maps to real routes only (no centre action — no
 *   existing owner action justifies one).
 *
 * Owner-scoped tokens live in theme.ts (owner* block, additive) so no
 * shared token value changes and other workspaces stay untouched.
 */
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Children, type ReactNode } from 'react';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText } from '@/components/ui/text';
import { PressSurface } from '@/components/ui/press-surface';
import { DotPattern } from '@/components/auth/auth-ui';
import { useTokens } from '@/hooks/use-tokens';
import type { TrendPoint } from '@/types/domain';

/** Percentage delta helper (same math as the report screen's percentDelta). */
export function deltaPct(now: number, before: number): number | undefined {
  if (before <= 0) return undefined;
  return Math.round(((now - before) / before) * 100);
}

/** Pastel blue→violet gradient fill, used sparingly (highlighted day only). */
function OwnerGradient({ radius = 16, id = 'owner-grad' }: { radius?: number; id?: string }) {
  const tokens = useTokens();
  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={tokens.colors.ownerGradA} />
          <Stop offset="1" stopColor={tokens.colors.ownerGradB} />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" rx={radius} fill={`url(#${id})`} />
    </Svg>
  );
}

/**
 * Dashboard header: avatar, time-of-day greeting with the (demo) owner,
 * gym name, and a notification bell whose dot reflects REAL open attention
 * items — no fake unread state. The bell opens a sheet listing them.
 */
export function OwnerHeader(props: {
  attentionCount: number;
  onPressBell: () => void;
}) {
  const tokens = useTokens();
  const { colors, spacing, radius } = tokens;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingTop: spacing.sm,
        paddingBottom: spacing.md,
      }}>
      <View
        accessible
        accessibilityLabel="Owner profile, demo session"
        style={{
          width: 46,
          height: 46,
          borderRadius: radius.pill,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <OwnerGradient radius={radius.pill} id="owner-avatar-grad" />
        <Ionicons name="person" size={22} color={colors.ownerGradInk} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText variant="label" style={{ color: colors.ownerHeroMuted }}>
          {greeting}, Owner
        </AppText>
        <AppText variant="title" style={{ color: colors.ownerHeroInk, marginTop: -2 }}>
          Pulse Gym
        </AppText>
      </View>
      <PressSurface
        accessibilityRole="button"
        accessibilityLabel={
          props.attentionCount > 0
            ? `Notifications, ${props.attentionCount} open attention items`
            : 'Notifications, nothing open'
        }
        onPress={props.onPressBell}
        hitPadding={spacing.xs}
        scaleOnPress={false}
        style={{
          width: 44,
          height: 44,
          borderRadius: radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.ownerCard,
          borderWidth: 1,
          borderColor: colors.ownerCardRule,
        }}>
        <Ionicons name="notifications-outline" size={20} color={colors.ownerHeroInk} />
        {props.attentionCount > 0 && (
          <View
            style={{
              position: 'absolute',
              top: 10,
              right: 10,
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: colors.ownerSuccess,
            }}
          />
        )}
      </PressSurface>
    </View>
  );
}

/**
 * The hero metric: Total Revenue for the month (verified collections only),
 * with a real week-over-week comparison from the collections trend.
 * "Today" and the verification queue are supporting lines — both real.
 */
export function PrimaryMetricCard(props: {
  caption: string;
  value: string;
  deltaPct?: number;
  deltaUnit: string;
  supporting: string;
}) {
  const tokens = useTokens();
  const { colors, spacing } = tokens;

  return (
    <View
      accessibilityLabel={`${props.caption}: ${props.value}`}
      style={{ paddingTop: spacing.xs, paddingBottom: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <AppText variant="label" style={{ color: colors.ownerHeroMuted }}>
          {props.caption}
        </AppText>
        {props.deltaPct !== undefined && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing['3xs'] }}>
            <Ionicons
              name={props.deltaPct >= 0 ? 'trending-up' : 'trending-down'}
              size={15}
              color={props.deltaPct >= 0 ? colors.ownerSuccess : colors.ownerError}
            />
            <AppText
              variant="label"
              style={{
                color: props.deltaPct >= 0 ? colors.ownerSuccess : colors.ownerError,
                fontWeight: '600',
              }}>
              {props.deltaPct >= 0 ? '+' : ''}
              {props.deltaPct}% {props.deltaUnit}
            </AppText>
          </View>
        )}
      </View>
      <AppText variant="displayXL" style={{ color: colors.ownerAccent, marginTop: spacing['3xs'] }}>
        {props.value}
      </AppText>
      <AppText variant="caption" style={{ color: colors.ownerHeroMuted, marginTop: spacing['3xs'] }}>
        {props.supporting}
      </AppText>
    </View>
  );
}

/**
 * Weekly attendance overview: five compact dark cards from the recorded
 * trend. The most recent recorded day carries the pastel gradient (there is
 * no "today" row in the recorded data, so nothing pretends to be one).
 * Deltas are computed against the previous recorded day.
 */
export function AttendanceWeekStrip(props: { points: TrendPoint[]; caption?: string }) {
  const tokens = useTokens();
  const { colors, spacing, radius } = tokens;

  return (
    <View style={{ paddingBottom: spacing.md }}>
      {props.caption && (
        <AppText variant="caption" style={{ color: colors.ownerHeroMuted, marginBottom: spacing.xs }}>
          {props.caption}
        </AppText>
      )}
      <View style={{ flexDirection: 'row', gap: spacing.xs }}>
        {props.points.map((p, i) => {
          const highlighted = i === props.points.length - 1;
          const prev = i > 0 ? props.points[i - 1].value : undefined;
          const pct = prev !== undefined ? deltaPct(p.value, prev) : undefined;
          return (
            <View
              key={`${p.label}-${i}`}
              accessibilityLabel={`${p.fullLabel ?? p.label}: ${p.value} attendances${pct !== undefined ? `, ${pct >= 0 ? '+' : ''}${pct}% vs the previous day` : ''}`}
              style={{
                flex: 1,
                minWidth: 0,
                borderRadius: radius.md,
                overflow: 'hidden',
                backgroundColor: highlighted ? undefined : colors.ownerCard,
                borderWidth: 1,
                borderColor: highlighted ? undefined : colors.ownerCardRule,
                alignItems: 'center',
                paddingTop: spacing.sm,
                paddingBottom: spacing.sm,
                paddingHorizontal: spacing['3xs'],
              }}>
              {highlighted && <OwnerGradient radius={radius.md} id="owner-day-grad" />}
              <AppText variant="caption" style={{ color: highlighted ? colors.ownerGradInk : colors.ownerHeroMuted }}>
                {p.label}
              </AppText>
              <AppText
                variant="figureSmall"
                style={{
                  color: highlighted ? colors.ownerGradInk : colors.ownerHeroInk,
                  marginTop: spacing['3xs'],
                }}>
                {p.value}
              </AppText>
              <AppText
                variant="caption"
                numberOfLines={1}
                style={{
                  color: highlighted
                    ? colors.ownerGradInk
                    : pct === undefined
                      ? colors.ownerHeroMuted
                      : pct >= 0
                        ? colors.ownerSuccess
                        : colors.ownerError,
                  marginTop: spacing['3xs'],
                  fontWeight: pct !== undefined && !highlighted ? '600' : '400',
                }}>
                {pct !== undefined ? `${pct >= 0 ? '+' : ''}${pct}%` : '—'}
              </AppText>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** A single attention row. No href → deliberately not navigable (honest). */
export interface AttentionItem {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  title: string;
  description: string;
  statusLabel?: string;
  href?: string;
  hrefLabel?: string;
}

export function AttentionItemRow(props: { item: AttentionItem; onPress?: () => void }) {
  const tokens = useTokens();
  const { colors, spacing, radius } = tokens;
  const navigable = !!props.item.href;

  const row = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingVertical: spacing.sm,
        minHeight: 56,
      }}>
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: radius.sm,
          backgroundColor: props.item.tint,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Ionicons name={props.item.icon} size={19} color={colors.ownerInk} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs }}>
          <AppText variant="label" numberOfLines={1} style={{ color: colors.ownerInk, fontWeight: '600', flexShrink: 1 }}>
            {props.item.title}
          </AppText>
          {props.item.statusLabel && (
            <AppText variant="caption" style={{ color: colors.ownerInkMuted, fontWeight: '600' }}>
              {props.item.statusLabel}
            </AppText>
          )}
        </View>
        <AppText variant="caption" numberOfLines={2} style={{ color: colors.ownerInkMuted, marginTop: 1 }}>
          {props.item.description}
        </AppText>
        {!navigable && (
          <AppText variant="caption" style={{ color: colors.ownerInkSubtle, marginTop: 1 }}>
            Review workspace arrives with the backend (Part 2).
          </AppText>
        )}
      </View>
      {navigable && <Ionicons name="chevron-forward" size={16} color={colors.ownerInkSubtle} />}
    </View>
  );

  if (!navigable) return row;
  return (
    <PressSurface
      accessibilityRole="button"
      accessibilityLabel={props.item.hrefLabel ?? `${props.item.title}, open`}
      onPress={props.onPress}
      scaleOnPress={false}>
      {row}
    </PressSurface>
  );
}

/**
 * The white content panel with large rounded top corners (the Fino
 * signature). Fills the remaining screen height so it always reaches the
 * bottom edge, with the floating navigation resting on top of it.
 */
export function AttentionPanel(props: { title: string; subtitle: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const tokens = useTokens();
  const { colors, spacing, radius } = tokens;

  return (
    <View
      style={[
        {
          flex: 1,
          backgroundColor: colors.ownerPanel,
          borderTopLeftRadius: radius.authPanel,
          borderTopRightRadius: radius.authPanel,
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.md,
        },
        props.style,
      ]}>
      <AppText variant="title" style={{ color: colors.ownerInk }}>
        {props.title}
      </AppText>
      <AppText variant="label" style={{ color: colors.ownerInkMuted, marginTop: spacing['3xs'] }}>
        {props.subtitle}
      </AppText>
      <View style={{ marginTop: spacing.sm, flex: 1 }}>{props.children}</View>
    </View>
  );
}

/** Dividers between attention rows (thin, on white). */
export function AttentionDivider() {
  const tokens = useTokens();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: tokens.colors.ownerRule }} />;
}

/**
 * Owner-screen scaffold used by every owner section: dark charcoal ground,
 * page title directly below the status bar (white on the dark ground —
 * always visible), and the light content panel with large rounded top
 * corners. The panel carries the same subtle dot pattern as the Login
 * screen's upper zone (reused `DotPattern`, very light grey, behind the
 * content); cards rendered on it have solid backgrounds so text stays
 * readable.
 */
export function OwnerScreen(props: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  demo?: boolean;
  actions?: ReactNode;
}) {
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const { colors, spacing } = tokens;

  return (
    <View style={{ flex: 1, backgroundColor: colors.ownerBg, paddingTop: insets.top }}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 118 }}
        keyboardShouldPersistTaps="handled">
        {/* Page header on the dark ground: white title, muted subtitle. */}
        <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <AppText variant="title" style={{ color: colors.ownerHeroInk }}>
                {props.title}
              </AppText>
              {props.subtitle && (
                <AppText variant="label" style={{ color: colors.ownerHeroMuted, marginTop: spacing['3xs'] }}>
                  {props.subtitle}
                </AppText>
              )}
            </View>
            {props.actions}
          </View>
          {props.demo && (
            <AppText variant="caption" style={{ color: colors.ownerHeroMuted, marginTop: spacing.xs }}>
              Demo session — all numbers are sample data
            </AppText>
          )}
        </View>

        {/* Light content panel with the shared subtle dot pattern. */}
        <View
          style={{
            flex: 1,
            marginTop: spacing.md,
            backgroundColor: colors.ownerPanelBg,
            borderTopLeftRadius: tokens.radius.authPanel,
            borderTopRightRadius: tokens.radius.authPanel,
            overflow: 'hidden',
          }}>
          <DotPattern dot={colors.ownerDot} gap={16} />
          <View
            style={{
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.md,
              paddingBottom: spacing.xl,
            }}>
            {props.children}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

/**
 * Fino-style floating bottom navigation. White pill, four real
 * destinations, no centre action (no existing owner action justifies one).
 * "More" opens the lost-members module, which also hosts sign-out.
 */
const navItems = [
  { key: 'overview', label: 'Overview', icon: 'home-outline', href: '/(owner)/dashboard' },
  { key: 'members', label: 'Members', icon: 'people-outline', href: '/(owner)/members' },
  { key: 'reports', label: 'Reports', icon: 'stats-chart-outline', href: '/(owner)/report' },
  { key: 'more', label: 'More', icon: 'grid-outline', href: '/(owner)/lost' },
] as const;

export type OwnerNavKey = (typeof navItems)[number]['key'];

export function OwnerBottomNavigation(props: { active: OwnerNavKey }) {
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const { colors, spacing, radius } = tokens;

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: Math.max(insets.bottom, 8) + 6 }}>
      <View
        accessibilityRole="tablist"
        style={{
          flexDirection: 'row',
          marginHorizontal: spacing.lg,
          backgroundColor: colors.ownerPanel,
          borderRadius: radius.pill,
          borderWidth: 1,
          borderColor: colors.ownerRule,
          paddingVertical: spacing['3xs'],
          shadowColor: '#000000',
          shadowOpacity: 0.18,
          shadowOffset: { width: 0, height: 6 },
          shadowRadius: 14,
          elevation: 6,
        }}>
        {navItems.map((item) => {
          const active = props.active === item.key;
          return (
            <PressSurface
              key={item.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${item.label}${active ? ', current' : ''}`}
              onPress={() => {
                if (!active) router.navigate(item.href as never);
              }}
              scaleOnPress={false}
              style={{ flex: 1, minHeight: 48, justifyContent: 'center', paddingHorizontal: spacing['3xs'] }}>
              <View
                style={{
                  alignItems: 'center',
                  gap: 1,
                  borderRadius: tokens.radius.pill,
                  paddingVertical: spacing['3xs'],
                  backgroundColor: active ? colors.ownerAccentTint : 'transparent',
                }}>
                <Ionicons
                  name={item.icon}
                  size={20}
                  color={active ? colors.ownerAccentDeep : colors.ownerInkMuted}
                />
                <AppText
                  variant="caption"
                  numberOfLines={1}
                  style={{
                    color: active ? colors.ownerInk : colors.ownerInkMuted,
                    fontWeight: active ? '700' : '500',
                  }}>
                  {item.label}
                </AppText>
              </View>
            </PressSurface>
          );
        })}
      </View>
    </View>
  );
}

/**
 * Owner-themed stat tile for the LIGHT panel: solid white card, accent-toned
 * figure (restrained semantic colour per metric — never random), muted
 * label, AA-deep trend colour, optional accent icon. Every numeral is
 * full-contrast — nothing faded.
 */
type StatTone = 'neutral' | 'blue' | 'softBlue' | 'mint' | 'violet' | 'cyan' | 'amber' | 'red';

export function OwnerStatTile(props: {
  label: string;
  value: string;
  hint?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  tone?: StatTone;
  delta?: { label: string; direction: 'up' | 'down' };
}) {
  const tokens = useTokens();
  const { colors, spacing, radius } = tokens;
  const toneMap: Record<StatTone, string> = {
    neutral: colors.ownerInk,
    blue: colors.ownerAccentDeep, // electric blue
    softBlue: colors.ownerBlueSoft,
    mint: colors.ownerSuccessDeep,
    violet: colors.ownerVioletDeep,
    cyan: colors.ownerCyanDeep,
    amber: colors.ownerWarningDeep,
    red: colors.ownerErrorDeep,
  };
  const valueColor = toneMap[props.tone ?? 'neutral'];

  return (
    <View
      accessibilityLabel={`${props.label}: ${props.value}${props.delta ? `, ${props.delta.direction === 'up' ? 'up' : 'down'} ${props.delta.label}` : ''}${props.hint ? `, ${props.hint}` : ''}`}
      accessible
      style={{
        flex: 1,
        minWidth: 0,
        backgroundColor: colors.ownerPanel,
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.ownerRule,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        gap: spacing['3xs'],
      }}>
      {props.icon && (
        <Ionicons name={props.icon} size={15} color={valueColor} />
      )}
      <AppText variant="figure" numberOfLines={1} adjustsFontSizeToFit style={{ color: valueColor }}>
        {props.value}
      </AppText>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
        <AppText variant="caption" style={{ color: colors.ownerInkMuted, flexShrink: 1 }}>
          {props.label}
        </AppText>
        {props.delta && <OwnerDeltaPill delta={props.delta} surface="light" />}
      </View>
      {props.hint && (
        <AppText variant="caption" style={{ color: colors.ownerInkSubtle }}>
          {props.hint}
        </AppText>
      )}
    </View>
  );
}

/**
 * Owner-themed delta pill. Text-only (no filled chip): the direction arrow
 * and the measured label carry the meaning, colour is secondary — restrained
 * per the Fino direction. `surface` picks AA-safe hues for the background it
 * sits on: dark charcoal cards or the light panel.
 */
export function OwnerDeltaPill(props: {
  delta: { label: string; direction: 'up' | 'down' };
  surface?: 'dark' | 'light';
}) {
  const tokens = useTokens();
  const { colors, spacing } = tokens;
  const up = props.delta.direction === 'up';
  const dark = props.surface !== 'light';
  const fg = dark
    ? (up ? colors.ownerSuccess : colors.ownerError)
    : (up ? colors.ownerSuccessDeep : colors.ownerErrorDeep);
  return (
    <View
      accessible
      accessibilityLabel={`${up ? 'Up' : 'Down'}, ${props.delta.label}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing['3xs'] }}>
      <AppText variant="caption" style={{ color: fg, fontWeight: '700' }}>
        {up ? '↑' : '↓'}
      </AppText>
      <AppText variant="caption" style={{ color: fg, fontWeight: '600' }}>
        {props.delta.label}
      </AppText>
    </View>
  );
}

/** A row of owner stat tiles on the light panel (transparent container). */
export function OwnerStatRow({ children }: { children: ReactNode[] }) {
  const tokens = useTokens();
  const { spacing } = tokens;
  return (
    <View style={{ flexDirection: 'row', gap: spacing.xs }}>
      {Children.map(children, (child) => child)}
    </View>
  );
}

/** Owner-themed chart card: solid white, dark heading, owner tokens. */
export function OwnerChartCard(props: {
  title: string;
  delta?: { label: string; direction: 'up' | 'down' };
  caption?: string;
  children: ReactNode;
}) {
  const tokens = useTokens();
  const { colors, spacing, radius } = tokens;

  return (
    <View
      style={{
        gap: spacing.sm,
        backgroundColor: colors.ownerPanel,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.ownerRule,
        padding: spacing.md,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
        <AppText variant="heading" style={{ color: colors.ownerInk }}>
          {props.title}
        </AppText>
        {props.delta && <OwnerDeltaPill delta={props.delta} surface="light" />}
      </View>
      {props.children}
      {props.caption && (
        <AppText variant="caption" style={{ color: colors.ownerInkMuted }}>
          {props.caption}
        </AppText>
      )}
    </View>
  );
}

/** Section heading on the light panel: dark charcoal, semibold. */
export function OwnerSection(props: { title?: string; action?: ReactNode; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const tokens = useTokens();
  const { spacing } = tokens;
  return (
    <View style={[{ marginTop: spacing.lg, gap: spacing.sm }, props.style]}>
      {(props.title || props.action) && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
          {props.title && (
            <AppText variant="heading" style={{ color: tokens.colors.ownerInk }}>
              {props.title}
            </AppText>
          )}
          {props.action}
        </View>
      )}
      {props.children}
    </View>
  );
}

/** Solid white card on the light panel (the Fino content card). */
export function OwnerCard(props: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const tokens = useTokens();
  const { colors, spacing, radius } = tokens;
  return (
    <View
      style={[
        {
          backgroundColor: colors.ownerPanel,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.ownerRule,
          padding: spacing.md,
        },
        props.style,
      ]}>
      {props.children}
    </View>
  );
}

/** Light tinted well on the light panel (supporting explanations). */
export function OwnerWell(props: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const tokens = useTokens();
  const { colors, spacing, radius } = tokens;
  return (
    <View
      style={[
        {
          backgroundColor: colors.ownerPanelMuted,
          borderRadius: radius.md,
          padding: spacing.md,
        },
        props.style,
      ]}>
      {props.children}
    </View>
  );
}

/** Owner-themed status text on the light panel (replaces StatusBadge). */
export function OwnerStatusText(props: { label: string; tone: 'up' | 'down' | 'neutral' | 'warning' | 'action' }) {
  const tokens = useTokens();
  const { colors } = tokens;
  const colorMap = {
    // All AA-deep hues on white/light surfaces.
    up: colors.ownerSuccessDeep,
    down: colors.ownerErrorDeep,
    neutral: colors.ownerInkMuted,
    warning: colors.ownerWarningDeep,
    action: colors.ownerAccentDeep,
  };
  return (
    <AppText variant="caption" style={{ color: colorMap[props.tone], fontWeight: '600' }}>
      {props.label}
    </AppText>
  );
}

/**
 * Owner-themed list primitives for the LIGHT panel: solid white group card,
 * dark ink titles, muted details, hairline dividers, accent-tinted avatar.
 */
export function OwnerListGroup(props: { children: ReactNode; label?: string }) {
  const tokens = useTokens();
  const { colors, radius } = tokens;
  return (
    <View
      accessibilityRole="summary"
      accessibilityLabel={props.label}
      style={{
        backgroundColor: colors.ownerPanel,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.ownerRule,
        overflow: 'hidden',
      }}>
      {props.children}
    </View>
  );
}

export function OwnerListRow(props: {
  title: string;
  detail?: string;
  status?: ReactNode;
  meta?: ReactNode;
  chevron?: boolean;
  leading?: ReactNode;
  onPress?: () => void;
}) {
  const tokens = useTokens();
  const { colors, spacing } = tokens;

  const content = (
    <>
      {props.leading}
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'baseline' }}>
          <AppText variant="bodyStrong" style={{ flexShrink: 1, color: colors.ownerInk }}>
            {props.title}
          </AppText>
          {props.status}
        </View>
        {props.detail && (
          <AppText variant="label" numberOfLines={1} style={{ marginTop: spacing['3xs'], color: colors.ownerInkMuted }}>
            {props.detail}
          </AppText>
        )}
        {props.meta}
      </View>
      {props.chevron && <Ionicons name="chevron-forward" size={16} color={colors.ownerInkSubtle} />}
    </>
  );

  if (props.onPress) {
    return (
      <PressSurface
        accessibilityRole="button"
        onPress={props.onPress}
        scaleOnPress={false}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          paddingVertical: spacing.sm,
          paddingHorizontal: spacing.md,
          minHeight: 60,
        }}>
        {content}
      </PressSurface>
    );
  }

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md,
        minHeight: 60,
      }}>
      {content}
    </View>
  );
}

export function OwnerRowDivider() {
  const tokens = useTokens();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: tokens.colors.ownerRule }} />;
}

export function OwnerMemberAvatar({ name }: { name: string }) {
  const tokens = useTokens();
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
  return (
    <View
      accessibilityLabel={`${name}, initials ${initials || '?'}`}
      style={{
        width: 40,
        height: 40,
        borderRadius: tokens.radius.pill,
        backgroundColor: tokens.colors.ownerAccentTint,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <AppText variant="bodyStrong" style={{ color: tokens.colors.ownerAccentDeep, fontSize: 14 }}>
        {initials || '?'}
      </AppText>
    </View>
  );
}

/**
 * Owner-themed empty state for the light panel: accent-tinted icon well,
 * dark heading, muted supporting text, clearly styled action.
 */
export function OwnerEmptyState(props: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  hint: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const tokens = useTokens();
  const { colors, spacing, radius } = tokens;
  return (
    <View
      accessibilityRole="summary"
      style={{
        backgroundColor: colors.ownerPanel,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.ownerRule,
        padding: spacing.xl,
        gap: spacing.xs,
        alignItems: 'center',
        marginTop: spacing.md,
      }}>
      <View
        style={{
          width: 52,
          height: 52,
          borderRadius: radius.pill,
          backgroundColor: colors.ownerAccentTint,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: spacing.xxs,
        }}>
        <Ionicons name={props.icon} size={24} color={colors.ownerAccentDeep} />
      </View>
      <AppText variant="bodyStrong" align="center" style={{ color: colors.ownerInk }}>
        {props.title}
      </AppText>
      <AppText variant="label" align="center" style={{ color: colors.ownerInkMuted }}>
        {props.hint}
      </AppText>
      {props.actionLabel && props.onAction && (
        <PressSurface
          accessibilityRole="button"
          accessibilityLabel={props.actionLabel}
          onPress={props.onAction}
          scaleOnPress={false}
          style={{
            marginTop: spacing.xs,
            borderRadius: radius.pill,
            borderWidth: 1,
            borderColor: colors.ownerAccentDeep,
            backgroundColor: colors.ownerAccentTint,
            paddingVertical: spacing.xs,
            paddingHorizontal: spacing.md,
            minHeight: 36,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <AppText variant="label" style={{ color: colors.ownerAccentDeep, fontWeight: '600' }}>
            {props.actionLabel}
          </AppText>
        </PressSurface>
      )}
    </View>
  );
}
