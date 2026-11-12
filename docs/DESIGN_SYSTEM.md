# Design System

## Design Direction: "Ember Night" — v4 dark theme (reference-driven)

v4 is a full visual redesign driven by the user's 8-screen reference image
(splash, login, join, member/receptionist/owner dashboards, membership plans,
reports). Near-black ground `#0B0C0E`, charcoal surfaces with subtle borders,
**one vibrant ember orange** for brand and actions, white primary text with
muted grey secondary, and semantic green/amber/red state colours. Barlow
Condensed 800 carries display headings and figures (title case — the
reference is not all-caps); Barlow carries body and buttons.

Functionality rule: the redesign is style-only. Routes, workspaces, forms,
validation, modals, demo-honesty patterns, business rules and accessibility
labels are unchanged; the theme file and component styles carry the look.

*Every foreground/background pair is machine-verified: `node
scripts/contrast-check.mjs` (all pass). Button labels are large text
(Barlow Condensed 800 at 19px ≥ the 18.66px bold floor), so white-on-ember
fills pass at the 3:1 large-text threshold; small filled buttons use the
deeper ember `#C2410C`, which passes 4.5:1 at any size.*

### Color Palette (Tokens from `src/constants/theme.ts`)

| Name | Hex | Contrast | Usage |
|------|-----|----------|-------|
| `paper` | `#0B0C0E` | ground | Screen ground (near-black) |
| `surface` | `#15171B` | ground | Cards |
| `surfaceAlt` | `#1D2025` | ground | Wells, elevated fills, untrained day squares |
| `surfacePressed` | `#24272D` | ground | Pressed rows/chips |
| `rule` | `#26292F` | — | Subtle card borders, dividers |
| `ruleStrong` | `#3A3E46` | — | Stronger outline (secondary buttons) |
| `scrim` | `#000000` | — | Modal overlay only |
| `ink` | `#F4F6F8` | 18.1:1 | Primary text, figures |
| `inkMuted` | `#A6ACB4` | 7.9:1 | Secondary text |
| `inkSubtle` | `#7B828B` | 5.0:1 | Captions |
| `accent` (ember) | `#EE6A0C` | 6.3:1 on paper | Primary fills, selected states, figures |
| `accentInk` | `#FFFFFF` | 3.1:1 on accent (large text) | Labels on ember fills |
| `accentDeep` | `#C2410C` | 5.2:1 with white | Pressed fills, small-button fills |
| `accentBright` | `#FDBA74` | 11.6:1 | Small emphasis text on dark, focus ring |
| `focus` | `#FDBA74` | — | Focus ring only |
| `success` | `#4ADE80` on tint `#12291B` | 8.9:1 | Active memberships, verified payments |
| `warning` | `#FBBF24` on tint `#2E2410` | 9.1:1 | Expiring soon |
| `danger` | `#F87171` on tint `#2B1416` | 6.3:1 | Errors, overdue |
| `dangerStrong` | `#DC2626` | 4.8:1 with white | Danger button fill |
| `info` | `#8FBCFF` on tint `#14263D` | 7.9:1 | Informational states |
| `roleMember` | ember tint `#331D0E` / `#FDBA74` | 9.4:1 | Member chip |
| `roleReception` | `#26292F` / `#C8CDD4` | 9.1:1 | Reception chip |
| `roleOwner` | light `#F4F6F8` / `#0B0C0E` | 18.1:1 | Owner chip (light fill) |
| `heat0`–`heat4` | `#1D2025` `#1C4A2A` `#237A3B` `#2EA043` `#46D96F` | 3:1+ non-text | Attendance heatmap levels |
| `chartPrimary` | `#F97316` | — | Chart series (ember) |
| `chartSecondary` | `#FDBA74` | — | Peak/highlight step |
| `chartRule` | `#26292F` | — | Grid lines |

### Application rules (v4)

- **One brand hue**: ember orange on controls, selected states, figures,
  shortcuts and charts. Semantic green/amber/red carry status; nothing else
  is coloured.
- **Cards**: charcoal `surface` with a 1px `rule` border, radius 14,
  optional controlled shadow (`elevated`). Lists are boxed cards with
  hairline dividers.
- **Selection**: medium filled buttons/tab pills and chips are ember
  (medium buttons + 19px labels at 3:1 large text; pills and chips use
  `accentDeep` so small labels pass 4.5:1). Role/plan cards select with an
  ember border + `surfaceAlt` lift.
- **Role identity**: same dark system, different chip weights — member =
  ember tint, reception = grey step, owner = light fill with dark text.
- **QR surface** stays white: scanner contrast is part of the payload
  surface, not an interface surface (commented at the call site).
- **Status badges**: dark tinted pills with bright state text, radius pill.
- **Dashboard compositions**: greeting header (avatar + name + role chip +
  demo badge), membership card with Active pill, quick shortcut tiles that
  scroll to their sections, stat cards with white figures and ember
  accents, trend cards with ember charts and green delta captions.

### Typography
- **Families**: `Barlow` 400/500/600 (body, labels, captions) + `Barlow
  Condensed` 700/800 (display, headings, figures, buttons) — title case.
- **Scale**: displayXL 40, display 28, title 22, heading 18, figure 28,
  figureSmall 20, button 19, buttonSmall 15; body 16, label 13, caption 12.
- Buttons: condensed 800, title case ("Sign in", "Next") — matches the
  reference and keeps labels in the large-text tier.

### Spacing, Radius & Elevation
- **Spacing**: 2px step scale (2, 4, 8, 12, 16, 24, 32, 48, 64).
- **Radius**: xs 6, sm 10, md 14, lg 18, pill 999 — soft cards, pill chips
  and badges, per the reference.
- **Elevation**: subtle controlled shadows (`card`: y6/r14 @0.35,
  `floating`: y10/r24 @0.45); card definition comes primarily from the
  1px border.
- **ControlHeight**: fields and buttons 52px, small buttons 44px, search 52.
- **HitTarget**: minimum 44×44 (PressSurface hitPadding).

### Motion — smooth and subtle
- `RiseIn` is a gentle fade-and-rise (10px, 340ms, 40ms stagger by index;
  transform/opacity only, no layout shift).
- `Motion.pressScale = 0.98` — presses compress slightly; shade step carries
  the rest of the feedback.
- Modal sheet: slides up 420ms, exits faster (65%); reduce-motion collapses
  everything to instant (hook floor rule).

### Component Library (`src/components/ui/`)
| Component | v4 notes |
|-----------|----------|
| **Text** | Variants map to the type scale; tone map includes `member/reception/owner` chips |
| **PressSurface** | ≥44px target; 0.98 press scale; haptics; reduce-motion aware |
| **Button** | Primary = ember fill (medium) / deep ember (small); secondary = `surface` with subtle outline; ghost = `accentBright`; danger = `#DC2626` fill; condensed-800 title-case labels; 52/44px |
| **IconButton** | Square 44×44 hit area |
| **TextField** | 52px, dark `surfaceAlt` fill, subtle `rule` border, ember focus, red error state |
| **StatusBadge** | Tinted pill per tone incl. role chips; label + tint (never colour alone) |
| **Card / Well** | Bordered charcoal card / borderless `surfaceAlt` well |
| **SegmentedTabs / FilterChip** | Selected segment/chip = deep ember pill with white label; unselected muted on `surfaceAlt` |
| **SearchBar** | 52px dark field, subtle border, clear action |
| **StatTile / StatRow** | White figures by default, ember/success/danger when the tone carries meaning; tiles are bordered cards, sibling tiles share one card with hairline dividers |
| **ModalSheet** | Black scrim (0.45), bordered surface sheet, floating shadow, functional motion |
| **ListGroup / ListRow** | Bordered card list, hairline dividers, avatars, status pills |
| **DemoBadge** | Square-ish chip, subtle border on `surfaceAlt` |
| **OtpInput** | Dark 52px boxes; filled digit takes the ember border |
| **AttendanceCalendar** | LeetCode-style heatmap on dark: square day cells, green levels per verified check-ins, today outlined in ember, future days empty, chevron month navigation, Less→More legend, demo caption, a11y summary + per-day labels |
| **RiseIn** | Subtle fade-and-rise once on mount; stagger by index; reduce-motion instant |

### Charts (`src/components/charts/`)
| Chart | v4 notes |
|-------|----------|
| **Bar Chart** | Ember bars (`chartPrimary`); every bar labelled; peak caption |
| **Line Chart** | Ember stroke; labelled axis; latest-value caption |

### WCAG Compliance
- All pairs verified in `scripts/contrast-check.mjs`; text ≥4.5:1, button
  large-text pair ≥3:1, heatmap levels ≥3:1 non-text (WCAG 1.4.11), legend
  and a11y summaries carry the meaning in words.
- Status is never colour alone: badges pair a word with a tint; chart values
  always labelled.

### Accessibility
- Touch targets ≥44px; `accessibilityRole` on composites; calendar exposes a
  month summary plus per-day check-in labels; future days are not focusable.
- Reduce-motion collapses every transition to instant.
- Dark theme: status bar light, navigation theme dark, tab bars themed.

## Design Tokens (`src/constants/theme.ts`)
Exported token categories:
- `Colors` — ground/surface ladder, ink ladder, ember accent, semantic
  states, role chips, heat levels, chart steps, scrim
- `Spacing` — 2px step scale
- `Radius` — 6/10/14/18/pill
- `Type` — Barlow / BarlowCondensed mapping incl. `button`, `buttonSmall`
- `Motion` — durations, `pressScale: 0.98`, `riseDistance: 10`
- `Easing` — easing references
- `Elevation` — subtle controlled shadows
- `ControlHeight` — 52 field/button, 44 small button, 52 search
- `HitTarget` — 44

All tokens WCAG-verified. Dark is the only mode in Part 1; a derived light
variant is deferred (the scheme hook parameter is retained for it).
