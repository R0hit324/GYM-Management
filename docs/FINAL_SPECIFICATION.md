# Final Specification

## App Overview
Gym Management App — Expo + React Native + TypeScript, Part 1 only. One shared app with role-based variations (member, receptionist, owner). 8 main screens, no extra top-level screens.

## Screens
1. **Login** (`/login`) — Role picker (Owner/Receptionist/Member); honest demo preview modal; forgot-password placeholder sheet stating "Part 2".
2. **Online Joining** (`/join`) — 3-step join flow; verification designed but disabled submit with caption "No backend connected — Parts 2-3 connect verification and owner review".
3. **QR Attendance** (`/attendance`) — Member scanner states; Reception scanner with Enter-icon; review control (SegmentedTabs: Full/Empty/Error); check-ins per day allowed more than once.
4. **Today's Attendance** — Member's attendance history; empty/full/error states; review control for visit list.
5. **Fees Entry** (`/fees`) — Member pays amount into gym's UPI ID; formatCurrency display; disabled submit when no backend.
6. **Renewal List** (`/renewals`) — List of memberships due for renewal; follow-up modal with phone number (member's number prefilled, records follow-up with authenticated receptionist as actor).
7. **Everyday Report** (`/report`) — Line and bar charts of attendance/trends; StatRow summary cards; daily/monthly report toggle.
8. **Lost Member List** (`/lost`) — Members inactive for 30+ consecutive days without check-in; flagged for owner review.

## Design Direction
"Iron & Signal": warm-tinted neutrals, orange accent `#B34511` (WCAG AA 5.6:1 with white). Light mode only in Part 1 (dark derived later).

## Typography
Barlow Condensed (display/figures) + Barlow (body). Font families: `Barlow_400/500/600/700`, `BarlowCondensed_500/600/700`.

## Tokens
`src/constants/theme.ts` — Colors, Spacing, Radius, Type, Motion, Easing, Elevation, HitTarget (44px min), ControlHeight.

## Business Rules (Part 1)
- Freezes with approval extend validity
- No partial payments
- Multiple check-ins per day allowed
- Inactivity = 30 consecutive days without check-in → flagged on lost-member list
- Locked subscription prices
- Reversals are edits-not (data immutability)
- UPI QR ≠ attendance QR

## Technical Constraints
- No real backend/auth/OTP/payments/QR validation in Part 1
- Local mock data explicitly labeled `demo`/`mock`
- Never present fake successful verification/login/submission
- Honest disabled states with explanatory captions
- Review control: labels sentence-case, untracked until camera lands
- Touch targets ≥44px
- SegmentedTabs: "Review control, removed when the camera lands"