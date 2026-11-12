/**
 * Gym Management App — design tokens.
 *
 * v4: "Ember Night" — premium dark redesign driven by the user's 8-screen
 * reference image (splash, login, join, member/receptionist/owner
 * dashboards, plans, reports). Near-black ground, charcoal surfaces with
 * subtle borders, vibrant ember-orange as the single brand/action colour,
 * white primary text with muted grey secondary, and semantic green/amber/
 * red state colours. Barlow Condensed 800 carries display headings and
 * figures (title case), Barlow carries body.
 *
 * Functionality rule: this file is style-only. No screen logic, route,
 * demo-honesty pattern or business rule may change for its sake. Every
 * foreground/background pair is machine-verified for WCAG contrast — run
 * `node scripts/contrast-check.mjs` (all pass; buttons qualify as large
 * text: Barlow Condensed 800 at 19px ≥ the 18.66px bold large-text floor).
 *
 * Colour-literal floor rule: no component may hard-code a value a token
 * here already expresses. The only sanctioned literals outside this file
 * are the QR surface white (scanner contrast is part of the payload
 * surface, commented at its call site) and demo chart accent choices that
 * reference these tokens by name.
 *
 * Dark is the only mode in Part 1; a light variant is deferred.
 */

export const Colors = {
  // ---- Ground and surfaces (charcoal ladder) --------------------------
  paper: '#0B0C0E', // screen ground — near-black
  surface: '#15171B', // cards
  surfaceAlt: '#1D2025', // wells, elevated fills
  surfacePressed: '#24272D', // pressed rows / chips

  // ---- Rules: subtle card borders and stronger dividers ---------------
  rule: '#26292F',
  ruleStrong: '#3A3E46',
  scrim: '#000000', // modal overlay only

  // ---- Ink (text): white primary, muted grey secondary ----------------
  ink: '#F4F6F8',
  inkMuted: '#A6ACB4',
  inkSubtle: '#7B828B',
  inkInverse: '#0B0C0E',

  // ---- Accent: the one ember orange (brand + action) ------------------
  accent: '#EE6A0C', // fills, selected states, figures on dark
  accentInk: '#FFFFFF', // labels on accent fills (large text ≥3:1)
  accentDeep: '#C2410C', // pressed fills, small-button fills (≥4.5:1 with white)
  accentBright: '#FDBA74', // orange on dark for small emphasis text, focus ring
  focus: '#FDBA74', // focus ring and nothing else

  // ---- Semantic state (own hues; status, never decoration) ------------
  success: '#4ADE80',
  successBg: '#12291B',
  successOnBg: '#4ADE80',
  warning: '#FBBF24',
  warningBg: '#2E2410',
  warningOnBg: '#FBBF24',
  danger: '#F87171', // red text/figures on dark
  dangerStrong: '#DC2626', // danger button fill (white label ≥4.5:1)
  dangerBg: '#2B1416',
  dangerOnBg: '#F87171',
  info: '#8FBCFF',
  infoBg: '#14263D',
  infoOnBg: '#8FBCFF',

  // ---- Role identity — same dark system, different chip weights -------
  roleMember: '#FDBA74',
  roleMemberBg: '#331D0E',
  roleMemberOnBg: '#FDBA74',
  roleReception: '#C8CDD4',
  roleReceptionBg: '#26292F',
  roleReceptionOnBg: '#C8CDD4',
  roleOwner: '#0B0C0E',
  roleOwnerBg: '#F4F6F8',
  roleOwnerOnBg: '#0B0C0E',

  // ---- Attendance heatmap (LeetCode-style day squares on dark) --------
  heat0: '#1D2025', // no check-ins: elevated square
  heat1: '#1C4A2A', // one check-in
  heat2: '#237A3B', // two
  heat3: '#2EA043', // three
  heat4: '#46D96F', // four or more

  // ---- Chart series (ember + step accents; values always labelled) ----
  chartPrimary: '#F97316',
  chartSecondary: '#FDBA74',
  chartTertiary: '#7B828B',
  chartQuaternary: '#4ADE80',
  chartRule: '#26292F',
} as const;

export type ColorToken = keyof typeof Colors;

export const Spacing = {
  '3xs': 2,
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  '3xl': 64,
} as const;

export type SpacingToken = keyof typeof Spacing;

/** Rounded, controlled corners per the reference: soft cards, pill chips. */
export const Radius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  pill: 999,
} as const;

export type RadiusToken = keyof typeof Radius;

/**
 * Type scale. Barlow Condensed 800 carries display headings and figures in
 * title case (the reference is not all-caps); Barlow 400/500/600/700 carries
 * body, labels, captions and buttons. Sizes stay on the established scale.
 */
export const Type = {
  displayXL: { fontSize: 40, lineHeight: 44, fontFamily: 'BarlowCondensed_800' as const, letterSpacing: 0 },
  display: { fontSize: 28, lineHeight: 32, fontFamily: 'BarlowCondensed_800' as const, letterSpacing: 0 },
  title: { fontSize: 22, lineHeight: 26, fontFamily: 'BarlowCondensed_800' as const, letterSpacing: 0 },
  heading: { fontSize: 18, lineHeight: 22, fontFamily: 'BarlowCondensed_700' as const, letterSpacing: 0 },
  body: { fontSize: 16, lineHeight: 24, fontFamily: 'Barlow_400' as const, letterSpacing: 0 },
  bodyStrong: { fontSize: 16, lineHeight: 24, fontFamily: 'Barlow_600' as const, letterSpacing: 0 },
  label: { fontSize: 13, lineHeight: 18, fontFamily: 'Barlow_500' as const, letterSpacing: 0 },
  caption: { fontSize: 12, lineHeight: 16, fontFamily: 'Barlow_400' as const, letterSpacing: 0 },
  figure: { fontSize: 28, lineHeight: 30, fontFamily: 'BarlowCondensed_800' as const, letterSpacing: 0 },
  figureSmall: { fontSize: 20, lineHeight: 22, fontFamily: 'BarlowCondensed_800' as const, letterSpacing: 0 },
  // Buttons are large text: condensed 800 at 19px ≥ the 18.66px bold floor,
  // so white-on-ember fills meet WCAG at the 3:1 large-text threshold.
  button: { fontSize: 19, lineHeight: 22, fontFamily: 'BarlowCondensed_800' as const, letterSpacing: 0.2 },
  buttonSmall: { fontSize: 15, lineHeight: 17, fontFamily: 'BarlowCondensed_700' as const, letterSpacing: 0.2 },
} as const;

export type TypeToken = keyof typeof Type;

/**
 * Motion: smooth and subtle. Presses compress slightly (0.98); RiseIn
 * returns as a gentle fade-and-rise entrance; functional overlays keep
 * their slide. Reduce-motion collapses everything to instant.
 */
export const Motion = {
  micro: 120,
  short: 220,
  long: 420,
  exitFactor: 0.65,
  pressScale: 0.98,
  riseDistance: 10,
} as const;

export type MotionToken = keyof typeof Motion;

export const Easing = {
  out: [0.16, 1, 0.3, 1] as [number, number, number, number], // arrivals
  in: [0.7, 0, 0.84, 0] as [number, number, number, number], // exits
  inOut: [0.65, 0, 0.35, 1] as [number, number, number, number], // toggles
} as const;

/** Depth: subtle borders carry card definition; controlled shadows sit on
 * elevated surfaces only (modal sheet, floating). */
export const Elevation = {
  card: {
    shadowColor: '#000000',
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
    elevation: 3,
  },
  floating: {
    shadowColor: '#000000',
    shadowOpacity: 0.45,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 24,
    elevation: 8,
  },
} as const;

/** Minimum touch target; visual controls may be smaller and pad to this. */
export const HitTarget = 44;

/** Control heights (visual). Reference forms are compact but generous. */
export const ControlHeight = {
  field: 52,
  button: 52,
  buttonSmall: 44,
  search: 52,
} as const;

export const AppName = 'Pulse Gym Management';
