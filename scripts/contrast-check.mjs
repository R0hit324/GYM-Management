/**
 * WCAG 2.1 contrast verification for the "Ember Night" palette (v4).
 *
 * Premium dark theme per the user's 8-screen reference image: near-black
 * ground, charcoal surfaces, one ember orange for brand/action, white and
 * muted-grey type, semantic green/amber/red state colours. All values are
 * declared in src/constants/theme.ts; this script verifies every
 * foreground/background pair the app uses.
 *
 * Note on button labels: filled buttons use Barlow Condensed 800 at 19px
 * (≥ the 18.66px bold large-text floor), so white-on-ember is verified at
 * the 3:1 large-text threshold; small filled buttons use accentDeep /
 * dangerStrong, which pass 4.5:1 at any size.
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
  paper: '#0B0C0E',
  surface: '#15171B',
  surfaceAlt: '#1D2025',
  ink: '#F4F6F8',
  inkMuted: '#A6ACB4',
  inkSubtle: '#7B828B',
  accent: '#EE6A0C',
  accentInk: '#FFFFFF',
  accentDeep: '#C2410C',
  accentBright: '#FDBA74',
  success: '#4ADE80',
  successBg: '#12291B',
  successOnBg: '#4ADE80',
  warning: '#FBBF24',
  warningBg: '#2E2410',
  warningOnBg: '#FBBF24',
  danger: '#F87171',
  dangerStrong: '#DC2626',
  dangerBg: '#2B1416',
  dangerOnBg: '#F87171',
  info: '#8FBCFF',
  infoBg: '#14263D',
  infoOnBg: '#8FBCFF',
  roleMemberBg: '#331D0E',
  roleMemberOnBg: '#FDBA74',
  roleReceptionBg: '#26292F',
  roleReceptionOnBg: '#C8CDD4',
  roleOwnerBg: '#F4F6F8',
  roleOwnerOnBg: '#0B0C0E',
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
  ['accentInk', 'accent', 3.0, 'primary button label (large text: 19px condensed 800)'],
  ['accentInk', 'accentDeep', 4.5, 'small filled button label (any size)'],
  ['accentInk', 'dangerStrong', 4.5, 'danger button label (any size)'],
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
