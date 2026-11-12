# Threat Model (Part 1 — Foundation)

## Threat Modeling Scope
Part 1 is a **local-first mock app** with no real backend, auth, OTP, or payment processing. This doc records the threat model foundations that will be enacted in Part 2 when a live backend and auth system are connected.

## Asset Inventory (Part 1 Projection)
- **Demo data** (`src/data/demo.ts`): Inert payload; no real member PII. Risks: accidental exposure via console logging, de minimis since data is synthetic.
- **Local state** (role selection, attendance history): Stored in React state (`useState`, `useReducer`). Risks: state leakage via deep links, mitigated by not persisting sensitive data; demo role is UI-only expectation.
- **QR code payloads** (attendance QR, UPI QR): Display-only in Part 1; inert data. Risks: if displayed in production without validation, could be scanned by external reader; mitigated by keeping them as inert SVGs with labeled `demo` watermark.
- **Theme tokens** (`src/constants/theme.ts`): Color values, WCAG contrasts. Risks: low — purely cosmetic; any contrast regression would be caught by automated checks.
- **UI component library** (`src/components/ui/`): Shared primitives. Risks: XSS if any user-generated content renders unsanitized; Part 1 has no user-generated content.

## Threats (Part 1 → Part 2 Progression)
| Threat | Part 1 Status | Part 2 Mitigation |
|--------|--------------|-------------------|
| **Unauthorized access** | N/A (no auth) | RBLS/RLS per role in Supabase; session auth with JWT; re-auth on resume. |
| **Data tampering (financial)** | N/A (mock only) | Immutable payment records; reversal entries never edit originals; audit log. |
| **QR code forgery** | Inert demo QRs | Time-signed tokens; payload encryption; attendance QR separate from UPI QR. |
| **Insecure session management** | N/A | Part 2: secure cookies / Expo SecureStore; token rotation; device-bound sessions. |
| **Reduced motion bypass** | Partial (hook implemented) | `useReduceMotion` hook uses `useSyncExternalStore` + `AccessibilityInfo` — OS floor rule enforced. |
| **Cross-site scripting** | N/A (RN, not web) | RN sandbox; no HTML injection surface in Part 1. |
| **Reverse engineering** | De-minified TS, bundled JS | Part 2: EAS ProGuard/R8 obfuscation; secrets in environment variables; Remote Config for feature flags. |

## Attack Surface (Post-Part 1 → Part 2)
- **Expo Go / Development Build**: Credentials not embedded; environment variables via `google-services.json` / `Apple Info.plist` (not checked into repo).
- **Over-the-air updates** (`eas update`): Update sandbox validates EAS Build signature; no unchecked code pushes.
- **Native modules**: Only approved Expo SDK modules; no arbitrary native code in Part 1.
- **Deep links**: Role picker routes only; no sensitive deep links in Part 1.

## Security Foundation (Mandatory Docs)
See also: `docs/SECURITY_POLICY.md`

- **Auth, RBAC/RLS**: Part 2 will enforce role-based access via Supabase RLS. Part 1 states role as UI placeholder only.
- **QR tokens**: Time-limited, single-use; distinct from UPI payment QR.
- **Financial immutability**: Payments never edited; reversals create new entries with audit trail.
- **Mobile security**: No sensitive data stored in AsyncStorage in Part 1; any Part 2 storage encrypted.
- **Audit logging**: All state changes logged with actor, timestamp, old/new values.
- **Monitoring**: EAS Monitor for crashes; no real-time APM in Part 1.
- **OWASP tooling**: Part 2 will integrate OWASP ZAP / EAS Scan for dependency checks.

## Honest Disclaimers (Part 1)
- No authentication or session management in Part 1. Role chosen on login screen is a UI preference; no backend verification.
- Demo QR codes are inert — they do not validate against any server.
- Fee submission displays "No backend connected — Parts 2-3 connect payments and verification."
- Membership activation only after full payment verification (Part 2+).