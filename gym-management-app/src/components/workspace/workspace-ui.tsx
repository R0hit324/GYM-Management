/**
 * Shared workspace chrome for the Receptionist and Member workspaces —
 * "Fino for Pulse", adapted from the Owner workspace's premium language
 * (dark charcoal ground, white page title on the dark ground, light
 * content panel with the dot pattern, solid white cards, floating pill
 * navigation) to the actual needs of the desk and the member.
 *
 * The visual identity is deliberately ONE system across the three
 * workspaces: the `owner*` token block in theme.ts is the shared Pulse
 * premium palette (charcoal ground, electric blue, violet, mint, cyan,
 * amber, soft red). Workspace-specific variation happens through scoped
 * props here — the global tokens are untouched, so the Nexa authentication
 * design and the V5 Coach Board amber system are unaffected.
 *
 * Owner files are NOT modified: the Owner workspace keeps its own
 * (identically-styled) components and stays visually unchanged.
 *
 * Honesty rules carried over from the Owner system: the demo caption is
 * shown when data is demo-labelled, the navigation maps to real routes
 * only, and every number keeps its real value (CountUp settles exactly).
 */
import { ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { useContext, useEffect, type ComponentRef, type ReactElement, type ReactNode } from 'react';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import ReAnimated, { Easing as ReEasing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { AppText } from '@/components/ui/text';
import { ButtonSurfaceContext, type ButtonSurface } from '@/components/ui/button';
import { PressSurface } from '@/components/ui/press-surface';
import { AnimatedIcon } from '@/components/ui/animated-icon';
import { DemoDisclosure } from '@/components/ui/demo-badge';
import { DotPattern } from '@/components/auth/auth-ui';
import { Easing, Motion } from '@/constants/theme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useTokens } from '@/hooks/use-tokens';

/**
 * Workspace-screen scaffold used by every Receptionist and Member screen.
 * Stage-8 redesign of the page header: an optional uppercase eyebrow in
 * the electric-blue accent, a larger condensed-800 white title, a short
 * rounded accent rule and a muted contextual subtitle — one consistent
 * header family on the dark ground. The light content panel keeps the
 * shared dot pattern, and cards render as elevated white surfaces.
 * Pass `footerPadding` (default 118) so content clears the floating
 * bottom navigation.
 *
 * `surface` sets the button surface context for the light panel: 'light'
 * (default) gives Receptionist screens the readable light-panel button
 * palette; the Member attendance screen pins 'dark' to preserve its
 * exact approved appearance (the workspace is out of Stage 8's scope).
 */
export function WorkspaceScreen(props: {
  title: string;
  subtitle?: string;
  /** Optional uppercase eyebrow above the title (accent blue). */
  eyebrow?: string;
  children: ReactNode;
  demo?: boolean;
  actions?: ReactNode;
  /** Extra bottom clearance for the floating navigation overlay. */
  footerPadding?: number;
  /** Button surface for the light panel; default 'light'. */
  surface?: ButtonSurface;
  /** Optional callback receiving the content ScrollView (member shortcut
   * tiles scroll to sections). A callback ref keeps ref access out of
   * render, which the React compiler requires. */
  onContentRef?: (sv: ComponentRef<typeof ScrollView> | null) => void;
  /** Optional pull-to-refresh control (added for live read-only data). */
  refreshControl?: ReactElement;
}) {
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const { colors, spacing } = tokens;
  // The redesigned header family (eyebrow, larger title, accent rule)
  // belongs to the Receptionist presentation; a pinned 'dark' surface
  // (Member workspace) keeps the exact original header.
  const lightHeader = (props.surface ?? 'light') === 'light';

  return (
    <View style={{ flex: 1, backgroundColor: colors.ownerBg, paddingTop: insets.top }}>
      <ScrollView
        ref={(sv) => props.onContentRef?.(sv)}
        refreshControl={props.refreshControl}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: props.footerPadding ?? 118 }}
        keyboardShouldPersistTaps="handled">
        {/* Page header on the dark ground: eyebrow (optional), large
            condensed white title, short electric-blue accent rule, muted
            subtitle — one header family across every workspace screen.
            A pinned 'dark' surface (Member workspace, out of scope)
            renders the exact original header. */}
        <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              {lightHeader && props.eyebrow && (
                <AppText
                  variant="label"
                  style={{ color: colors.ownerAccent, letterSpacing: 1.4, textTransform: 'uppercase' }}>
                  {props.eyebrow}
                </AppText>
              )}
              <AppText
                variant={lightHeader ? 'display' : 'title'}
                style={{ color: colors.ownerHeroInk, marginTop: lightHeader && props.eyebrow ? spacing['3xs'] : 0 }}>
                {props.title}
              </AppText>
              {lightHeader && (
                <View
                  style={{
                    width: 30,
                    height: 3,
                    borderRadius: tokens.radius.pill,
                    backgroundColor: colors.ownerAccent,
                    marginTop: spacing.xs,
                  }}
                />
              )}
              {props.subtitle && (
                <AppText variant="label" style={{ color: colors.ownerHeroMuted, marginTop: lightHeader ? spacing.xs : spacing['3xs'] }}>
                  {props.subtitle}
                </AppText>
              )}
            </View>
            {props.actions}
          </View>
          {props.demo && <DemoDisclosure />}
        </View>

        {/* Light content panel with the shared subtle dot pattern. The
            panel (and everything on it) declares its button surface:
            'light' gives Receptionist screens the readable light-panel
            button palette; 'dark' (Member attendance) keeps the dark one. */}
        <ButtonSurfaceContext.Provider value={props.surface ?? 'light'}>
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
        </ButtonSurfaceContext.Provider>
      </ScrollView>
    </View>
  );
}

/** One floating-navigation destination. `href` must be a real route. */
export interface WorkspaceNavItem {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  href: string;
}

/**
 * Trial motion: the floating nav pill rises into place when a page
 * arrives (12 px up + fade, once per mount, transform/opacity only).
 * Pairs with the page crossfade so a page change reads as one
 * choreographed arrival. Reduce-motion renders it instantly. Delete the
 * two `NavEntrance` wrappers (Reception + Owner bars) to revert.
 */
export function NavEntrance({ children }: { children: ReactNode }) {
  const reduce = useReduceMotion();
  const progress = useSharedValue(reduce ? 1 : 0);

  useEffect(() => {
    if (reduce) {
      return; // progress already settled
    }
    // Mount a frame later so the effect body never writes a shared value
    // synchronously with the first render; 60ms delay lets the page
    // crossfade land first.
    const raf = requestAnimationFrame(() => {
      progress.set(withDelay(60, withTiming(1, { duration: Motion.short, easing: ReEasing.bezier(...Easing.out) })));
    });
    return () => cancelAnimationFrame(raf);
  }, [reduce, progress]);

  const animated = useAnimatedStyle(() => ({
    opacity: progress.get(),
    transform: [{ translateY: (1 - progress.get()) * 12 }],
  }));

  return <ReAnimated.View style={animated}>{children}</ReAnimated.View>;
}

/**
 * Fino-style floating bottom navigation, shared by the Receptionist
 * workspace (and available to future multi-route member navigation).
 * Identical geometry to the Owner pill: white surface, hairline border,
 * soft shadow, accent-tinted selected tab. Route navigation preserves
 * history; the active tab does not re-push itself.
 */
export function WorkspaceBottomNavigation(props: { active: string; items: readonly WorkspaceNavItem[] }) {
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const { colors, spacing, radius } = tokens;

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: Math.max(insets.bottom, 8) + 6 }}>
      <NavEntrance>
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
          {props.items.map((item) => {
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
                <AnimatedIcon
                  name={item.icon}
                  active={active}
                  animateOnMount={active}
                  size={20}
                  color={colors.ownerInkMuted}
                  activeColor={colors.ownerAccentDeep}
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
      </NavEntrance>
    </View>
  );
}

/**
 * Light-panel card on the member/reception screens — redesigned (Stage 8
 * rework): larger radius, a clearly visible border (one step darker than
 * the hairline rule) and the navy-tinted lift so cards read as individual
 * surfaces floating above the dotted panel. The dark-ground
 * `Elevation.card` is far too heavy here; a pinned 'dark' surface keeps
 * the exact previous flat look.
 */
export function WorkspaceCard(props: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const tokens = useTokens();
  const { colors, spacing, radius } = tokens;
  const light = useContext(ButtonSurfaceContext) === 'light';
  return (
    <View
      style={[
        {
          backgroundColor: colors.ownerPanel,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: light ? colors.ownerDot : colors.ownerRule,
          padding: spacing.md,
        },
        light ? tokens.elevation.lightCard : null,
        props.style,
      ]}>
      {props.children}
    </View>
  );
}

/**
 * Section heading on the light panel: restrained steel-navy blue
 * (`ownerBlueSoft`, ~5.5:1 on white) so section headings read as
 * intentional accents instead of flat black; body copy stays dark. A
 * pinned 'dark' surface keeps the charcoal heading. */
export function WorkspaceSection(props: { title?: string; action?: ReactNode; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const tokens = useTokens();
  const { spacing } = tokens;
  const light = useContext(ButtonSurfaceContext) === 'light';
  return (
    <View style={[{ marginTop: spacing.lg, gap: spacing.sm }, props.style]}>
      {(props.title || props.action) && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
          {props.title && (
            <AppText
              variant="heading"
              style={{ color: light ? tokens.colors.ownerBlueSoft : tokens.colors.ownerInk }}>
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

/**
 * Light tinted well on the light panel (supporting explanations). On the
 * 'light' surface a hairline border keeps the inset well defined against
 * the dot-patterned panel rather than blending into it; a pinned 'dark'
 * surface keeps the borderless well.
 */
export function WorkspaceWell(props: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const tokens = useTokens();
  const { colors, spacing, radius } = tokens;
  const light = useContext(ButtonSurfaceContext) === 'light';
  return (
    <View
      style={[
        {
          backgroundColor: colors.ownerPanelMuted,
          borderRadius: radius.md,
          borderWidth: light ? 1 : 0,
          borderColor: light ? colors.ownerRule : undefined,
          padding: spacing.md,
        },
        props.style,
      ]}>
      {props.children}
    </View>
  );
}

/** Hairline divider between rows on the light panel. */
export function WorkspaceRowDivider() {
  const tokens = useTokens();
  return <View style={{ height: 1, backgroundColor: tokens.colors.ownerRule }} />;
}
