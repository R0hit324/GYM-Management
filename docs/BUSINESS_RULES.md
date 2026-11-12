# Business Rules

## Core Principles
- **Immutability**: Financial data (fees, payments) is never edited — reversals create new reversal entries, never modify originals.
- **Honest States**: All disabled UI components carry explanatory captions (e.g. "No backend connected", "Membership activates after full payment verified").
- **No Partial Payments**: A member's subscription is either fully paid or not; partial payments are not accepted.

## Check-In Rules
- **Multiple check-ins per day allowed** — each scan registers as its own row.
- **Inactivity threshold**: A member is flagged as "lost" after 30 consecutive days without any check-in. The count resets on any check-in.
- **Freeze extension**: If a membership is frozen and the user obtains approval, the freeze validity extends accordingly. No partial freeze periods.

## Subscription & Pricing
- **Locked subscription prices** — prices are set at signup and do not change during the active subscription period.
- **Membership activation**: Only after full payment is verified does the membership become active.

## Role Boundaries
- **Member**: Can check in via QR, view own attendance, pay fees. Cannot access owner reports or renewal lists.
- **Receptionist**: Can handle join flow, fee entry, renewal list, attendance review. Cannot access financial immutability controls (owner-only).
- **Owner**: Full access to reports, lost-member list, financial reversal/audit controls.

## QR Codes
- **UPI QR** ≠ **attendance QR** — different bar formats, different validation paths, different underlying data.

## Demo Data Honesty
All Part 1 data is mock/demo labeled. Screens show "No server connected" or similar when backend is unavailable. Submit buttons are disabled with explanatory captions. Review controls label states explicitly: "Review control, removed when the camera lands".