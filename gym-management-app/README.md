# Gym Management App

**Expo + React Native + TypeScript** — Gym management mobile application (Part 1 only).

## Overview

A role-based mobile app for gym management with 8 main screens:

| Role | Screens |
|------|---------|
| Member | Today's Attendance, QR Attendance |
| Receptionist | Online Joining, QR Attendance, Fees Entry, Renewal List |
| Owner | Everyday Report, Lost Member List |

## Screens

- **Login** (`/login`) — Role picker with honest demo preview modal
- **Online Joining** (`/join`) — 3-step join; verification designed, disabled submit "not connected"
- **QR Attendance** (`/attendance` — member/reception) — Scanner states + review control
- **Today's Attendance** — Member's attendance history
- **Fees Entry** (`/fees`) — Fee payment recording
- **Renewal List** (`/renewals`) — Membership renewals
- **Everyday Report** (`/report`) — Charts & stats (Owner)
- **Lost Member List** (`/lost`) — Inactivity-flagged members (Owner)

## Quick Start

```bash
npx expo start          # start dev server
npx expo lint           # run linter
npm test                # run jest tests
npx tsc --noEmit        # typecheck
```

## Project Structure

```
src/
  app/              # Expo Router screens, grouped by role group
  components/       # UI components, charts, scaffold
  constants/        # Theme tokens
  data/             # Demo data (labeled mock)
  hooks/            use-tokens, use-reduce-motion
  types/            # Domain types
  utils/            # format, haptics
tests/              # Jest test suite
docs/               # Specification docs
```

## Acceptance Criteria

- `npx expo start` runs
- `npx tsc --noEmit` passes
- `npx expo lint` passes
- `npm test` runs and passes
- PHASE_TRACKER.md updated
- PART_1_REPORT.md complete

## Part 1 Scope Only

No real backend, auth, OTP, payments, or QR validation. Demo data explicitly labeled `demo`/`mock`. Honest disabled states. No fake success presented.

See `AGENTS.md` for full project rules and development guidelines.