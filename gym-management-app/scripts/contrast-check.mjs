/**
 * WCAG 2.1 contrast verification for the "Coach Board" palette (v5).
 *
 * Approved V5 direction (docs/REDESIGN_V5_AUDIT.md, direction C): layered
 * graphite ground/cards, one amber-orange reserved for actions, data
 * highlights and deltas. Amber fills carry the dark ink label (verified
 * ≥4.5:1 at any size); danger fills keep a white label. All values are
 * declared in src/constants/theme.ts; this script verifies every
 * foreground/background pair the app uses.
 *
 * Run: node scripts/contrast-check.mjs
 */

function luminance(hex) {
  const h = hex.replace('#', '');
  const rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const [r, g, b] = rgb.map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(fg, bg) {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

const T = {
  paper: '#101114',
  surface: '#17181C',
  surfaceAlt: '#1E2025',
  ink: '#F4F5F7',
  inkMuted: '#A0A6AE',
  inkSubtle: '#80868E',
  inkInverse: '#141519',
  accent: '#F59E0B',
  accentInk: '#141519',
  accentDeep: '#D97706',
  accentBright: '#FDBA74',
  accentBg: '#38260D',
  success: '#4ADE80',
  successBg: '#12291B',
  successOnBg: '#4ADE80',
  warning: '#FBBF24',
  warningBg: '#2E2410',
  warningOnBg: '#FBBF24',
  danger: '#F87171',
  dangerStrong: '#C81E1E',
  dangerBg: '#2B1416',
  dangerOnBg: '#F87171',
  info: '#8FBCFF',
  infoBg: '#14263D',
  infoOnBg: '#8FBCFF',
  roleMemberBg: '#38260D',
  roleMemberOnBg: '#FDBA74',
  roleReceptionBg: '#2A2D33',
  roleReceptionOnBg: '#C8CDD4',
  roleOwnerBg: '#F4F5F7',
  roleOwnerOnBg: '#141519',
  authTop: '#F3F3F3',
  authBg: '#050505',
  authSurface: '#151515',
  authField: '#151515',
  authRuleStrong: '#4A4A4A',
  authAccent: '#FFFFFF',
  authAccentDeep: '#E2E2E2',
  authAccentInk: '#080808',
  authInk: '#FFFFFF',
  authInkMuted: '#A3A3A3',
  authInkSubtle: '#858585',
  authHeadingMuted: '#8C8C8C',
  authTopInk: '#6B6B6B',
  authSelectedBg: '#1E1E1E',
  ownerBg: '#101116',
  ownerDarkElevated: '#1C1D24',
  ownerPanelBg: '#F7F8FC',
  ownerPanel: '#FFFFFF',
  ownerPanelMuted: '#EDF0F6',
  ownerDot: '#DDE2EC',
  ownerRule: '#E4E7EE',
  ownerCard: '#1C1D24',
  ownerCardRule: '#2A2C35',
  ownerInk: '#171923',
  ownerInkMuted: '#656B78',
  ownerInkSubtle: '#5F6572',
  ownerHeroInk: '#FFFFFF',
  ownerHeroMuted: '#A5A9B5',
  ownerAccent: '#648BFF',
  ownerAccentDeep: '#3D5AF1',
  ownerAccentTint: '#EEF2FF',
  ownerSuccess: '#36C995',
  ownerSuccessDeep: '#0E7A57',
  ownerWarning: '#F4B85B',
  ownerWarningDeep: '#B45309',
  ownerError: '#F06C76',
  ownerErrorDeep: '#B91C1C',
  ownerVioletDeep: '#6D28D9',
  ownerCyanDeep: '#0E7490',
  ownerBlueSoft: '#33689F',
  ownerGradA: '#A5C0FA',
  ownerGradB: '#C4B5FD',
  ownerGradInk: '#0A0A0A',
  heat1: '#1C4A2A',
  heat2: '#237A3B',
  heat3: '#2EA043',
  heat4: '#46D96F',
};

/** [fg, bg, minimum, why] */
const pairs = [
  ['ink', 'paper', 4.5, 'body text on ground'],
  ['ink', 'surface', 4.5, 'body text on cards'],
  ['ink', 'surfaceAlt', 4.5, 'body text on wells'],
  ['inkMuted', 'paper', 4.5, 'secondary text on ground'],
  ['inkMuted', 'surface', 4.5, 'secondary text on cards'],
  ['inkMuted', 'surfaceAlt', 4.5, 'secondary text on wells'],
  ['inkSubtle', 'paper', 4.5, 'captions on ground'],
  ['inkSubtle', 'surface', 4.5, 'captions on cards'],
  // Amber fills carry the dark label at any size; pressed accent too.
  ['accentInk', 'accent', 4.5, 'primary button label (dark on amber)'],
  ['accentInk', 'accentDeep', 4.5, 'selected pill/chip label (dark on deep amber)'],
  ['inkInverse', 'accent', 4.5, 'dark label on amber fills'],
  ['accentBright', 'accentBg', 4.5, 'badge text on amber tint'],
  ['inkMuted', 'accentBg', 4.5, 'selected role card blurb on amber tint'],
  // Danger keeps its white label on the red fill.
  ['ink', 'dangerStrong', 4.5, 'danger button label (white on red)'],
  ['accent', 'paper', 4.5, 'figures and accent text on ground'],
  ['accent', 'surface', 4.5, 'figures on cards'],
  ['accentBright', 'paper', 4.5, 'small emphasis text on ground'],
  ['accentBright', 'surface', 4.5, 'small emphasis text on cards'],
  ['successOnBg', 'successBg', 4.5, 'success badge text'],
  ['warningOnBg', 'warningBg', 4.5, 'warning badge text'],
  ['dangerOnBg', 'dangerBg', 4.5, 'danger badge text'],
  ['infoOnBg', 'infoBg', 4.5, 'info badge text'],
  ['success', 'paper', 4.5, 'success tone text on ground'],
  ['warning', 'paper', 4.5, 'warning tone text on ground'],
  ['danger', 'paper', 4.5, 'danger tone text on ground'],
  ['roleMemberOnBg', 'roleMemberBg', 4.5, 'member chip'],
  ['roleReceptionOnBg', 'roleReceptionBg', 4.5, 'reception chip'],
  ['roleOwnerOnBg', 'roleOwnerBg', 4.5, 'owner chip'],
  // Auth surface (light-top + black-panel reference): auth screens only.
  ['authInk', 'authBg', 4.5, 'auth body text on ground'],
  ['authInk', 'authSurface', 4.5, 'auth text on cards'],
  ['authInk', 'authField', 4.5, 'auth text in inputs'],
  ['authInkMuted', 'authBg', 4.5, 'auth secondary text'],
  ['authInkMuted', 'authSurface', 4.5, 'auth secondary on cards'],
  ['authInkMuted', 'authField', 4.5, 'auth secondary in inputs'],
  ['authInkSubtle', 'authBg', 4.5, 'auth captions'],
  ['authInkSubtle', 'authField', 4.5, 'auth captions in inputs'],
  ['authHeadingMuted', 'authBg', 4.5, 'muted half of two-tone headings'],
  ['authHeadingMuted', 'authSurface', 4.5, 'muted heading half on cards'],
  ['authAccent', 'authBg', 4.5, 'white text on ground (links, focus)'],
  ['authAccent', 'authSurface', 4.5, 'white text on cards'],
  ['authAccentInk', 'authAccent', 4.5, 'dark label on the white pill'],
  ['authAccentInk', 'authAccentDeep', 4.5, 'dark label on pressed white'],
  ['authInkMuted', 'authSelectedBg', 4.5, 'unselected-adjacent text on selection tint'],
  ['authInk', 'authSelectedBg', 4.5, 'text on selected category tint'],
  ['authTopInk', 'authTop', 4.5, 'logo wordmark on the light upper zone'],
  // Owner dashboard ("Fino for Pulse"): charcoal ground, white panels.
  ['ownerInk', 'ownerPanel', 4.5, 'owner text on white cards'],
  ['ownerInk', 'ownerPanelBg', 4.5, 'owner text on the light panel ground'],
  ['ownerInk', 'ownerPanelMuted', 4.5, 'owner text on light wells / track'],
  ['ownerInkMuted', 'ownerPanel', 4.5, 'owner supporting text on white'],
  ['ownerInkMuted', 'ownerPanelBg', 4.5, 'owner supporting text on the light ground'],
  ['ownerInkMuted', 'ownerPanelMuted', 4.5, 'owner supporting text on wells / unselected segment'],
  ['ownerInkSubtle', 'ownerPanel', 4.5, 'owner captions on white'],
  ['ownerInkSubtle', 'ownerPanelBg', 4.5, 'owner captions on the light ground'],
  ['ownerHeroInk', 'ownerBg', 4.5, 'page titles / hero numerals on the dark ground'],
  ['ownerHeroInk', 'ownerCard', 4.5, 'card values on dark cards'],
  ['ownerHeroMuted', 'ownerBg', 4.5, 'supporting text on the dark ground'],
  ['ownerHeroMuted', 'ownerCard', 4.5, 'card labels on dark cards'],
  ['ownerSuccess', 'ownerCard', 4.5, 'positive trend on dark cards'],
  ['ownerError', 'ownerCard', 4.5, 'negative trend on dark cards'],
  ['ownerSuccessDeep', 'ownerPanel', 4.5, 'positive trend text on white'],
  ['ownerErrorDeep', 'ownerPanel', 4.5, 'negative trend text on white'],
  ['ownerWarningDeep', 'ownerPanel', 4.5, 'pending/attention text on white'],
  ['ownerAccent', 'ownerBg', 4.5, 'accent icons on the dark ground'],
  ['ownerAccentDeep', 'ownerPanel', 4.5, 'accent text/icons on white'],
  ['ownerAccentDeep', 'ownerAccentTint', 4.5, 'selected chip label / nav active on tint'],
  ['ownerVioletDeep', 'ownerPanel', 4.5, 'violet accent numerals on white'],
  ['ownerCyanDeep', 'ownerPanel', 4.5, 'cyan accent numerals on white'],
  ['ownerBlueSoft', 'ownerPanel', 4.5, 'soft blue numerals on white'],
  ['ownerGradInk', 'ownerGradA', 4.5, 'text on the pastel gradient start'],
  ['ownerGradInk', 'ownerGradB', 4.5, 'text on the pastel gradient end'],
  // Heatmap squares encode meaning graphically: WCAG 1.4.11 non-text 3:1
  // against the ground for the levels that must read as "trained".
  ['heat4', 'paper', 3.0, 'deepest heatmap level vs ground'],
  ['heat3', 'paper', 3.0, 'deep heatmap level vs ground'],
  ['heat4', 'heat1', 3.0, 'deep vs light level separation'],
];

let fails = 0;
for (const [fg, bg, min, why] of pairs) {
  const r = ratio(T[fg], T[bg]);
  const ok = r >= min;
  const mark = ok ? 'PASS' : 'FAIL';
  if (!ok) fails++;
  console.log(`${mark}  ${r.toFixed(2).padStart(5)} : 1  (need ${min.toFixed(1)})  ${fg} on ${bg}  — ${why}`);
}

console.log(fails === 0 ? '\nAll pairs pass.' : `\n${fails} pair(s) fail — tune values above.`);
