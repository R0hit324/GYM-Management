# Phase Tracker

## Part 1 — Foundation + Design System + All 8 Screens
**Status**: ✅ Complete

### v4 Dark Redesign (Nov 2026) — "Ember Night", from the user's 8-screen reference image
- ✅ User supplied an 8-screen reference image (premium dark gym app) as the primary visual direction; v3 "Piste" light theme superseded
- ✅ `theme.ts` fully rewritten: near-black ground `#0B0C0E`, charcoal surfaces, one ember orange `#EE6A0C` (+ deep `#C2410C` for small fills), white/muted type, semantic green/amber/red, subtle `rule` borders, Radius 6–18/pill, `scrim` token added, `pressScale 0.98` + `riseDistance`
- ✅ Contrast re-verified: **28/28 pairs pass** (`scripts/contrast-check.mjs` rewritten for dark; buttons qualify as large text at 19px condensed 800)
- ✅ Components restyled (style-only): Card/Well/ListGroup/StatTile bordered dark cards, buttons ember/deep-ember fills, TextField dark fill + subtle border + ember focus, ModalSheet black scrim + floating shadow, chips/tab pills deep ember, status badges tinted pills (+ new additive `member` tone), RiseIn restored as subtle fade-and-rise (reduce-motion instant), charts ember
- ✅ **Splash** added on the existing entry route (`index.tsx`): ember brand mark + Pulse Gym wordmark, 1.5s hold → `/login` (login remains the only real destination; no fake loading)
- ✅ **Login** restyled: brand tile, two-tone wordmark, ember-bordered role cards, honest demo preview + recovery sheets unchanged
- ✅ **Join** restyled: plan cards select with ember border + lift; 3-step indicator ember
- ✅ **Member dashboard** composition on the existing attendance route: greeting header (avatar, name, demo badges), membership card (plan + Active pill + valid-till from the demo record, labelled demo), 3 working shortcut tiles that scroll to scanner/plan/progress, This-Week progress computed from demo check-ins; scanner, review controls, camera note, calendar and visit history all preserved
- ✅ Reception/owner screens ride the token system; stray blue-selection tints migrated to ember; chart/stat tones normalised to the one-hue direction
- ✅ Gates re-run after v4: `tsc --noEmit` clean · `expo lint` 0 errors 0 warnings · 3 test suites / 4 tests pass · `expo start` boots (Metro `packager-status:running`)

### v3 Theme Deal (Nov 2026) — "Piste", replaced by v4 dark redesign
- ✅ User rejected v2 ("just added some colours"); v3 is a genuine Hallmark theme deal, not a recolour: `theme.mjs deal --genre playful` (seed `gym-management-mobile-app-d440·02e9eda0·2026-11-11`), theme 1/3 **Piste** picked from 3 dealt themes after viewing dealt art + reference
- ✅ Piste tokens converted from OKLCH to sRGB (`scripts/contrast-check.mjs` includes the converter) — **all pairs pass** (text 4.5:1, heatmap levels 3:1 non-text): paper `#F8FAFE`, ink `#0A0D12`, one cobalt `#1F50F5`, semantic state pairs, heat greens `#CCF0D2→#1B9247`
- ✅ `src/constants/theme.ts` fully rewritten: Radius all 0 (square edges), BarlowCondensed **800** caps via new `Type.button`/`Type.buttonSmall`, Motion still (`pressScale: 1`, RiseIn static), Elevation flat, ControlHeight 52/44; removed v2 tokens (`accentSubtle`, `accentOnSubtle`, `accentBright`) with all usages migrated
- ✅ Components restyled (style-only, zero logic changes): card/Well flat paper steps, ListGroup/StatRow ruled by 2px ink bars, scaffold header snow + 2px ink rule (role bands removed, `roleTag` prop kept), buttons 2px-ink-outline secondary, TextField 52px ink border, DemoBadge/OtpInput/SearchBar square, all three progress slivers squared, report charts both cobalt (one hue)
- ✅ **New feature: LeetCode-style attendance calendar** (`src/components/attendance-calendar.tsx`) on the member attendance screen — square day squares, green levels per verified check-ins, month navigation (back to earliest data, forward to current month only), today outlined, Less→More legend, demo-labelled caption, a11y summary + per-day labels; fed by new deterministic demo history `demoMemberHistory` (~5 months, Sundays off, explicitly demo)
- ✅ Gates re-run after v3: `tsc --noEmit` clean · `expo lint` 0 errors 0 warnings (pre-existing BOM + unused-radius warnings also cleaned) · 3 test suites / 4 tests pass
- ✅ Docs updated: `docs/DESIGN_SYSTEM.md` rewritten for Piste v3

### v2 Visual Redesign (Nov 2026) — "Ember & Petrol" — ❌ rejected by user, superseded by v3
- ✅ Direction chosen via Hallmark ask-once: **Energetic Athletic** + **Bold accents** (user-selected)
- ✅ UI UX Pro Max research: fitness color palettes (energy orange + green second signal), Bauhaus colour blocking, Material 3 Expressive tints; react-native stack query returned no database match (noted honestly)
- ✅ Palette v2 committed to `src/constants/theme.ts` — deeper ember `#C2410C`, petrol `#0E7490`, plum `#A21CAF`, saturated semantic pairs, additive tint tokens (`role*Bg`, `role*OnBg`, `accentDeep`, `accentBright`, `chartQuaternary`)
- ✅ Contrast: `scripts/contrast-check.mjs` — **32/32 pairs pass** (4.5:1 normal text, 3:1 large figures)
- ✅ Bold accents applied (style-only, zero logic changes): tinted role header bands + role rule in `scaffold.tsx` (`roleTag` wired into all 6 role screens); ember selected tab pills; tone-coloured stat-tile markers; ember login logo block; petrol attendance chart vs ember money chart; role-tinted reception/owner badges in `status-badge.tsx`
- ✅ Floor sweep: no colour literals outside the token block except the QR surface (`#FFFFFF`, commented — scanner contrast is part of the payload surface)
- ✅ Gates re-run after redesign: `tsc --noEmit` clean · `expo lint` 0 errors (2 pre-existing warnings) · 3 test suites / 4 tests pass
- ✅ Docs updated: `docs/DESIGN_SYSTEM.md` v2 palette + bold-accent rules

### Completed Deliverables
- ✅ Project foundation: Expo SDK 58 template, `gym-management-app` inside `E:\GYM Management`
- ✅ Design system: Tokens, typography, color palette (`#B34511` WCAG AA 5.6:1), typography (Barlow + BarlowCondensed), light mode only
- ✅ All 8 main screens written:
  - Screen 1 — Login (`/login`): role picker, honest demo preview modal, forgot-password placeholder sheet
  - Screen 2 — Online Joining (`/join`): 3-step join; verification designed, disabled submit "not connected"
  - Screen 3 — QR Attendance (`/attendance`): scanner states + review control (SegmentedTabs); member/reception variants
  - Screen 4 — Today's Attendance: member's attendance history; empty/full/error states; review control
  - Screen 5 — Fees Entry (`/fees`): member pays amount into gym's UPI ID; formatCurrency; disabled submit
  - Screen 6 — Renewal List (`/renewals`): membership renewals; follow-up modal with phone number; authenticated actor
  - Screen 7 — Everyday Report (`/report`): line + bar charts, StatRow summary cards; daily/monthly toggle
  - Screen 8 — Lost Member List (`/lost`): members inactive 30+ days without check-in; flagged for owner review
- ✅ Docs (9 + 2): `AGENTS.md`, `README.md`, `docs/FINAL_SPECIFICATION.md`, `docs/BUSINESS_RULES.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE_DESIGN.md`, `docs/THREAT_MODEL.md`, `docs/SECURITY_POLICY.md`, `docs/DESIGN_SYSTEM.md`, `PHASE_TRACKER.md`, `PART_1_REPORT.md`
- ✅ Tests: 3 suites, 4 tests passing (`npm test` → 3 passed, 4 total)
- ✅ `npx tsc --noEmit` passes clean
- ✅ `npx expo lint` → 0 errors, 2 warnings (BOM + unused radius)
- ✅ `npx expo start` runs

### Remaining from Acceptance (to document, not develop)
- Part 2+ threat model, auth, backend integration will extend this phase
- Dark mode derivation planned for Part 2
- Real Supabase backend connection (Part 2+)

### Explicitly Out of Scope (Part 1)
- No real backend / auth / OTP / payments / QR validation
- No partial payments
- No fake successful verification/login/submission
- Dark mode (light only in Part 1)
- Extra top-level screens beyond 8 role-group screens

## Part 2 — Verification + Backend Integration

### V5 Redesign (2026-11-12) — "Coach Board"
**Completed**: full product-design pass, approved direction C, visual-only
scope. Audit + exploration in `docs/REDESIGN_V5_AUDIT.md`. Staged commits:
tokens+components (`7da45e4`), auth (`16c7406`), member (`070d819`),
reception (`764e80c`), owner (`3125119`), consistency sweep (`804d67f`).
No route, feature, form, validation, demo-honesty pattern or business rule
changed. See `docs/DESIGN_SYSTEM.md` (v5 section) for the component set.

**Planned**: After Part 1 review/approval
- Supabase backend connection
- Auth (email/OTP or social) with role enforcement
- QR attendance validation (time-signed tokens)
- UPI payment flow (integrated, not mocked)
- Membership freeze approval workflow
- Full audit logging

## Part 3 — Advanced Features
**Planned**: After Part 2
- Member portal (web + mobile)
- Billing history & invoices
- Notification system (push, SMS via third-party)
- Advanced reporting (export, trends, analytics)