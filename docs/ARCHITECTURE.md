# Architecture

## Overall Structure
- **One shared Expo app** with role-based route groups. No separate builds per role.
- **Expo Router** (v58) with file-based routing. Every file in `src/app/` is a screen; `_layout.tsx` files define navigators.
- **Group directories**:
  - `(auth)` — role picker (`login.tsx`, `join.tsx`)
  - `(member)` — attendance screens
  - `(reception)` — reception workflow screens
  - `(owner)` — owner reports and lists
- **NativeTabs** per role group for tab navigation within each group.

## Directory Groups
| Group | Path | Screens |
|-------|------|---------|
| `(auth)` | `src/app/(auth)/` | `login.tsx`, `join.tsx` |
| `(member)` | `src/app/(member)/` | `attendance.tsx` |
| `(reception)` | `src/app/(reception)/` | `attendance.tsx`, `fees.tsx`, `renewals.tsx` |
| `(owner)` | `src/app/(owner)/` | `report.tsx`, `lost.tsx` |

## Key Files
- `src/app/_layout.tsx` — Root layout with `useFonts` + `SplashScreen.hide`; `Redirect` to `/login`; `Stack` navigator from `expo-router`.
- `src/app/(auth)/_layout.tsx` — Auth group layout with font loading.
- `src/app/(member)/_layout.tsx` — Member group layout with NativeTabs (attendance).
- `src/app/(reception)/_layout.tsx` — Reception group layout with NativeTabs (attendance, fees, renewals).
- `src/app/(owner)/_layout.tsx` — Owner group layout with NativeTabs (report, lost).
- `src/index.tsx` — Root redirect: `Redirect href="/login"`.
- `src/components/scaffold.tsx` — Shared screen scaffold with header/back handling.
- `src/components/workspace-meta.tsx` — Displayes role/workspace info; demo badge when in demo mode.

## Navigation Pattern
- Role picker on `login.tsx` sets the user role in local state (demo mode only; no auth success faked).
- `router.replace('/(owner)/report' as never)` for programmatic navigation.
- Tab `NativeTabs.Trigger` names: member `attendance`; reception `attendance, fees, renewals`; owner `report, lost`.
- `Link` from `expo-router` for intra-app navigation.

## Data Flow (Part 1, mock)
- All data flows through local state + demo data (`src/data/demo.ts`).
- No API calls, no real backend, no OTP, no payment processing.
- Component props are typed via `src/types/domain.ts`.
- Charts use local `TrendPoint[]` data.