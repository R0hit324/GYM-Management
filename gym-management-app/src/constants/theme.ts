/**
 * Gym Management App — design tokens.
 *
 * v5: "Coach Board" — approved direction of the V5 product redesign
 * (docs/REDESIGN_V5_AUDIT.md, direction C, inspired by the Fitonist /
 * STRYVE / UI-Deft dashboard pattern language, original execution).
 * Layered graphite ground and cards with hairline borders; ONE amber-orange
 * reserved strictly for primary actions, data highlights and deltas (dark
 * label on amber fills — premium and AA-strong); white figures, muted grey
 * metadata; green/amber/red semantic states as quiet tinted pills. SaaS
 * organisation: KPI rows, unified page headers, chart cards.
 *
 * Functionality rule: this file is style-only. No screen logic, route,
 * demo-honesty pattern or business rule may change for its sake. Every
 * foreground/background pair is machine-verified — run
 * `node scripts/contrast-check.mjs` (all pass).
 *
 * Colour-literal floor rule: no component may hard-code a value a token
 * here already expresses. The only sanctioned literals outside this file
 * are the QR surface white (scanner contrast is part of the payload
 * surface, commented at its call site).
 *
 * Dark is the only mode in Part 1; a light variant is deferred.
 */

export const Colors = {
  // ---- Ground and surfaces (layered graphite ladder) ------------------
  paper: '#101114', // screen ground
  surface: '#17181C', // cards
  surfaceAlt: '#1E2025', // wells, elevated fills, untrained day squares
  surfacePressed: '#24262B', // pressed rows / chips

  // ---- Rules: subtle card borders and stronger dividers ---------------
  rule: '#2A2D33',
  ruleStrong: '#3A3E46',
  scrim: '#000000', // modal overlay only

  // ---- Ink (text): white primary, muted grey secondary ----------------
  ink: '#F4F5F7',
  inkMuted: '#A0A6AE',
  inkSubtle: '#80868E',
  inkInverse: '#141519', // dark label on amber fills

  // ---- Accent: the one amber-orange (actions, data, deltas) -----------
  accent: '#F59E0B', // fills, selected states, figures on dark
  accentInk: '#141519', // label colour on amber fills (8.9:1)
  accentDeep: '#D97706', // pressed accent shade
  accentBright: '#FDBA74', // amber on dark for small emphasis text, focus ring
  accentBg: '#38260D', // amber tint for badges/chips
  focus: '#FDBA74', // focus ring and nothing else

  // ---- Semantic state (own hues; status, never decoration) ------------
  success: '#4ADE80',
  successBg: '#12291B',
  successOnBg: '#4ADE80',
  warning: '#FBBF24',
  warningBg: '#2E2410',
  warningOnBg: '#FBBF24',
  danger: '#F87171', // red text/figures on dark
  dangerStrong: '#C81E1E', // danger button fill (white/ink label ≥4.5:1)
  dangerBg: '#2B1416',
  dangerOnBg: '#F87171',
  info: '#8FBCFF',
  infoBg: '#14263D',
  infoOnBg: '#8FBCFF',

  // ---- Role identity — same dark system, different chip weights -------
  roleMember: '#FDBA74',
  roleMemberBg: '#38260D',
  roleMemberOnBg: '#FDBA74',
  roleReception: '#C8CDD4',
  roleReceptionBg: '#2A2D33',
  roleReceptionOnBg: '#C8CDD4',
  roleOwner: '#141519',
  roleOwnerBg: '#F4F5F7',
  roleOwnerOnBg: '#141519',

  // ---- Attendance heatmap (LeetCode-style day squares on dark) --------
  heat0: '#1E2025', // no check-ins: elevated square
  heat1: '#1C4A2A', // one check-in
  heat2: '#237A3B', // two
  heat3: '#2EA043', // three
  heat4: '#46D96F', // four or more

  // ---- Chart series (amber + step accents; values always labelled) ----
  chartPrimary: '#F59E0B',
  chartSecondary: '#FDBA74',
  chartTertiary: '#7A8087',
  chartQuaternary: '#4ADE80',
  chartRule: '#2A2D33',

  // ---- Auth surface (light-top + black-panel reference, auth screens only) --
  // Pixel-referenced to the supplied Travel-App login/signup/OTP screenshot:
  // light dotted upper zone, large black panel with rounded top corners,
  // charcoal pill fields, white pill CTA. Scoped to the authentication
  // screens: the workspaces keep the Coach Board amber system. Semantic
  // states above (danger/success) are shared, not duplicated.
  authTop: '#F3F3F3', // light upper zone (dotted pattern + logo)
  authTopInk: '#6B6B6B', // logo wordmark / dark controls on the light zone
  authBg: '#050505', // black authentication panel
  authSurface: '#151515', // cards, sheets, plan rows on auth screens
  authField: '#151515', // pill input surface
  authRule: '#303030', // field borders / hairlines
  authRuleStrong: '#4A4A4A', // stronger border (focused-adjacent, upcoming step)
  authAccent: '#FFFFFF', // white: CTA fill, focus border, selected state
  authAccentDeep: '#E2E2E2', // pressed CTA
  authAccentInk: '#080808', // dark label on the white pill
  authInk: '#FFFFFF', // primary text on the panel
  authInkMuted: '#A3A3A3', // secondary text (≥4.5:1 on panel + field)
  authInkSubtle: '#858585', // captions, metadata (≥4.5:1 on panel + field)
  authHeadingMuted: '#8C8C8C', // muted half of two-tone headings
  authSelectedBg: '#1E1E1E', // selected category pill tint
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

/** Rounded, controlled corners per the Coach Board reference: soft cards. */
export const Radius = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  authPanel: 30, // large rounded top corners of the black auth panel
  pill: 999,
} as const;

export type RadiusToken = keyof typeof Radius;

/**
 * Type scale. Barlow Condensed 800 carries display headings and figures in
 * title case; Barlow 400/500/600/700 carries body, labels, captions and
 * buttons. Few sizes, few weights — editorial, not noisy.
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
  // Buttons: condensed 800, title case ("Sign in", "Next"). Amber fills take
  // the dark ink label (verified ≥4.5:1 at any size); danger fills keep white.
  button: { fontSize: 19, lineHeight: 22, fontFamily: 'BarlowCondensed_800' as const, letterSpacing: 0.2 },
  buttonSmall: { fontSize: 15, lineHeight: 17, fontFamily: 'BarlowCondensed_700' as const, letterSpacing: 0.2 },
  // Auth-only: the reference's large light-weight headings ("Welcome back,")
  // — a plain-weight sans at display size, NOT the condensed-800 display.
  // Two-tone colouring is applied via nested AppText at the call site.
  authHeading: { fontSize: 30, lineHeight: 36, fontFamily: 'Barlow_400' as const, letterSpacing: 0 },
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
