# V5 Redesign — UX/UI Audit & Design Direction (Stage 1–2)

Status: **awaiting approval** — no code changed yet. This document is the
audit and the design-exploration deliverable for the V5 "complete product
design" pass. Implementation begins only after the direction is approved.

Research note (honest): live Dribbble browsing failed in this environment
(web search quota exhausted; dribbble.com fetches return nothing). The three
named references — **Fitonist**, **STRYVE**, **UI Deft's Gym Management User
Dashboard** — are described from their well-known pattern language. Search
anchors for review: `dribbble.com/search/fitonist-fitness-dashboard`,
`dribbble.com/search/stryve-fitness`,
`dribbble.com/search/gym-management-user-dashboard`. All output remains an
original Pulse design; nothing is copied.

---

## Stage 1 — Audit

### Screen inventory (10 routes, all verified by inspection)

| Route | Purpose | Layout system |
|---|---|---|
| `index` | Splash → `/login` hold | custom |
| `(auth)/login` | Role select + email/password + demo preview + recovery sheets | custom scroll |
| `(auth)/join` | 3-step member registration (details → verify → review) | custom scroll + Stack.Screen |
| `(member)/attendance` | Member dashboard: greeting, membership card, shortcuts, scanner, calendar, visits | custom scroll (dashboard) |
| `(reception)/attendance` | Today's register: stats, QR display, search/filter, event list | `Screen` scaffold |
| `(reception)/fees` | Fees entry: member search, amount/discount/method/UTR form, verification queue | `Screen` scaffold |
| `(reception)/renewals` | Renewal list + follow-up modal (call/message/visit statuses) | `Screen` scaffold |
| `(owner)/report` | Everyday report: collections, stat rows, line + bar charts, explain sheets, daily/monthly | `Screen` scaffold |
| `(owner)/lost` | Lost members: 30-day/expiry buckets, search, follow-up filter, detail sheet | `Screen` scaffold |
| `*/_layout` ×4 | NativeTabs navigation (member 1 tab, reception 3, owner 2) | token-themed |

### Feature inventory (must survive V5 untouched)

- Login: local validation, honest no-server state, demo workspace preview modal, forgot-password placeholder sheet, sign-out everywhere
- Join: 3-step validation, mandatory phone/email verification design, disabled submit ("not connected"), locked listed prices
- Scanner: 5 designed states + explicitly-labelled review control (removed when camera lands in Part 5), camera-permission note
- Calendar: LeetCode-style heatmap, month navigation, verified-only counting, a11y summary + per-day labels, demo caption
- Visits: loading/empty/error states, multiple check-ins/day register rows
- Fees: member search select, discount clamp (≤50%), UPI UTR rule, verification-queue exclusion copy, "recorded" confirmation design
- Renewals: follow-up workflow statuses (none/called/messaged/visited/won/lost), phone row, authenticated-actor copy
- Report: verified-only collections (UPI statement-checked, cash counted), pending excluded, daily/monthly toggle, attendance trend (line) + collections by week (bar), explain sheets
- Lost: 30-day inactivity + expired buckets, untouched filter, follow-up status flow, phone actions
- Demo honesty: demo badges, "demo data" captions, no fake success anywhere

### Design problem report (the reasons V5 exists)

1. **Two header systems.** `Screen` scaffold header (title/subtitle/role chip) vs the member dashboard's custom greeting header — different title sizes, spacing rhythm and demo-badge placement. Screens don't read as one product.
2. **Spacing drift.** ~30 ad-hoc literals (`marginTop: 2/6/8`) outside the spacing scale, scattered through screens; vertical rhythm differs per screen.
3. **Three section-title patterns.** `Section` component, bare `heading` AppText, and card-internal titles all mean "section heading" — inconsistent weight/size.
4. **KPI/stat presentation is inconsistent.** StatTile tones were applied variably (accent/muted/info mix); no delta/trend affordance; `StatRow` vs standalone tiles differ visually; reference dashboards use value + delta-chip + trend rows.
5. **Charts are basic.** Plain strokes/bars, no area fill or gridline polish, no delta badges, small heights, caption styles differ between the two charts.
6. **Orange overuse.** Ember figures on most tiles make orange omnipresent; the brief wants accent used strategically (action + data only).
7. **Dashboards lack composition.** Reception register opens straight into a list (no operational overview/actions surface); owner report is one long stack — reads like a form, not a business platform; no export affordance surface (functional gap acknowledged, status-labelled).
8. **Weak quick-action affordances.** Member shortcuts are rows of small text buttons; references use icon-tile grids.
9. **Auth screens under-played.** Login lacks the brand hero moment; join's step indicator is thin bars rather than the numbered-step pattern; both are "fine", not premium.
10. **States are generic.** Empty/loading/error work but look like wireframes; skeletons are plain rows.
11. **Calendar polish.** Legend is cramped; weekday heads repeat letters; cells could breathe more (function is right, presentation isn't).
12. **Sheets/confirmations plain.** ModalSheet is uniform but bare; confirmation dialogs (recorded/renewal) use inconsistent internal composition.
13. **Misc.** SignOut icon placement varies by screen; member tab bar holds a single tab (odd visually); no notification surface exists (none may be faked).

### Standardisation plan (Stage 3)

One of each, reused everywhere: `PageHeader` (unifies both header systems), `KpiTile` (+ optional `delta` chip + `spark`), `ActionTile` grid, `SectionHeader`, `ChartCard` (header + delta + polished SVG), `ProgressBar`, `StepDots`, `ConfirmSheet` (on ModalSheet), refreshed `EmptyState`/`SkeletonRow`/`ErrorState`. All existing component APIs stay additive.

---

## Stage 2 — Design exploration (three directions)

### A. "Ember Studio" — evolve v4
Keep the v4 palette exactly; fix hierarchy, spacing, headers, charts and
states. Editorial large headings, accent quieted to action + deltas.
- **Visual quality**: good → very good. **Readability**: proven (28/28 WCAG pairs pass today).
- **Brand consistency**: high (v4 already cohesive). **Mobile usability**: proven.
- **Dashboard effectiveness**: improved but same bones. **Feasibility**: fastest (~token+component polish only).
- Risk: could still read as "the same app, tidied".

### B. "STRYVE Bold" — hero-dark drama
Near-black `#0A0A0B`, heavier cards with icon badge plates, oversized
condensed numerals, orange hero moments (dashboard banner, active-plan
plate), pronounced section separation.
- **Visual quality**: dramatic, strong Dribbble presence. **Readability**: needs care (more orange).
- **Brand consistency**: high. **Mobile usability**: good, denser.
- **Dashboard effectiveness**: strong hierarchy. **Feasibility**: medium (new plates/banners per screen).
- Risk: loud; orange can overwhelm — the brief explicitly warns against this.

### C. "Coach Board" — SaaS-grade restraint (recommended)
Layered graphite: ground `#101114`, card `#17181C`, elevated `#1E2025`,
hairline `#2A2D33` borders, radius 16. **Amber-orange `#F59E0B`-family
reserved strictly for primary actions, data highlights and deltas.** White
figures, muted grey metadata, green/amber/red states as quiet tinted pills.
SaaS organisation: every dashboard opens with a KPI row (value + delta chip
+ optional sparkline), sectioned cards with consistent `SectionHeader`,
chart cards with titles + delta badges, one `PageHeader` across all screens
(avatar, role chip, contextual actions). Motion: entrance fade-rise kept,
functional only.
- **Visual quality**: premium, editorial, calm. **Readability**: best (accent scarcity increases its value).
- **Brand consistency**: strongest — one header, one section pattern, one KPI pattern.
- **Mobile usability**: spacious; targets unchanged.
- **Dashboard effectiveness**: directly mirrors Fitonist/UI-Deft organisation.
- **Feasibility**: moderate (token re-tune + component set + screen composition passes).
- Risk: lowest of the ambitious options; fully reversible, checkpoints per stage.

### Comparison summary

| Criterion | A Ember Studio | B STRYVE Bold | C Coach Board |
|---|---|---|---|
| Visual quality | good | dramatic | premium, calm |
| Accent discipline | medium | weak | strong |
| SaaS dashboard organisation | partial | partial | full |
| Readability | proven | needs care | strong |
| Feasibility / risk | trivial | medium | moderate |
| Matches brief | partly | partly | best |

**Recommendation: C — "Coach Board".** It satisfies the brief's two hardest
constraints simultaneously: premium SaaS-dashboard organisation, and an
accent that signals instead of decorates.

### Approval-gated functional notes (not visual-only — flagged honestly)

- Member workspace has a single tab; a Profile/Account settings surface and
  a notification centre do **not exist**. V5 will not fake them. If wanted
  as real (demo-labelled) surfaces, that is a functional addition needing
  explicit approval, kept out of the visual-only scope.
- Report "Export" exists only as a designed notion in references; the
  current screen has no export feature. V5 keeps the verified-numbers
  surface; adding a real (demo) export would also be functional.

---

## Implementation plan after approval (Stage 3–9)

1. Design tokens re-tune + component set (checkpoint commit)
2. Auth + shared screens (splash, login, join) — commit
3. Member workspace — commit
4. Reception workspace — commit
5. Owner workspace — commit
6. Consistency sweep (spacing literals purge, section pattern unification) — commit
7. QA: tsc, lint, jest, contrast script, Metro boot; docs updated
(V4→V5 addendum in DESIGN_SYSTEM, PHASE_TRACKER, PART_1_REPORT)
