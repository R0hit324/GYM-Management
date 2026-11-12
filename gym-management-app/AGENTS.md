This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.

Docs: https://docs.expo.dev/eas/index.md

## Part 1 Project Rules

These rules apply to Part 1 (foundation + design system + all 8 screens) only and will be superseded by Part 2 rules:

- **No real backend / auth / OTP / payments / QR validation**. All demo data is explicitly labeled `demo` / `mock`. Never present fake successful verification, login, or submission — use honest disabled states and preview modals.
- **Role variations only**: one shared app; `src/app/(auth)/{login,join}.tsx` for role picker, `(member)/attendance.tsx`, `(reception)/{attendance,fees,renewals}.tsx`, `(owner)/{report,lost}.tsx`. No extra top-level screens.
- **Business rules fixed**: freezes with approval extend validity; no partial payments; multiple check-ins/day allowed; inactivity = 30 consecutive days without check-in; locked subscription prices; reversals are edits-not; UPI QR ≠ attendance QR.
- **Demo data honesty**: `demoAttendanceQrPayload` inert; review controls label states ("Review control, removed when the camera lands"); disabled submit with explanatory caption; login shows "No server connected" and a demo workspace picker.
- **Fonts**: `Barlow_400/500/600/700` + `BarlowCondensed_500/600/700` loaded in root `_layout.tsx` via `useFonts` + `SplashScreen.hide`. Light mode only in Part 1.
- **Colors**: warm-tinted neutrals, orange accent `#B34511` (WCAG AA 5.6:1 with white). All token contrasts pre-verified.
- **Navigation**: root `_layout.tsx` with fonts + Stack; `index.tsx` Redirect to `/login`; 4 group `_layout.tsx` files; NativeTabs per role group; icons via `NativeTabs.Trigger.Icon sf/md`.
- **Screens**: Login (role picker, honest demo preview modals, forgot-password placeholder sheet), Online Joining (3-step join; verification designed, disabled submit "not connected"), QR Attendance (scanner states + review control), Today's Attendance, Fees Entry, Renewal List, Everyday Report, Lost Member List.
- **Expo SDK 58** template; deps: `expo-haptics`, `react-native-svg`, `@expo-google-fonts/barlow`, `react-native-qrcode-svg`, `@expo/vector-icons@15.1.1`; dev: `jest/jest-expo/@testing-library/react-native/@types/jest`.

## Commands (continued)

```bash
npx expo-doctor             # diagnose dependency and config issues
```

Run lint and typecheck before declaring any task done.

## Design System Reference

- **Design direction**: "Iron & Signal" — warm-tinted neutrals, orange accent `#B34511`.
- **Typography**: Barlow Condensed (display/figures) + Barlow (body).
- **Tokens**: `src/constants/theme.ts` (Colors/Spacing/Radius/Type/Motion/Easing/Elevation/HitTarget/ControlHeight).
- **Components**: `src/components/ui/` — text, press-surface, button, text-field, status-badge, card, segmented-tabs (+FilterChip), search-bar, feedback (Loading delay 250ms/min 400ms, SkeletonRow, EmptyState, ErrorState, InlineSpinner), stat-tile (+StatRow), modal-sheet, list-row (+ListGroup/MemberAvatar), qr-display (react-native-qrcode-svg), otp-input, demo-badge, rise-in (entrance animation, reduce-motion aware); charts `src/components/charts/{line-chart,bar-chart}.tsx`; scaffold `src/components/scaffold.tsx`; `src/components/workspace-meta.tsx`.
- **WCAG**: All token WCAG contrast pairs pass AA.