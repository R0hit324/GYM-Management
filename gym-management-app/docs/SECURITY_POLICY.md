# Security Policy

## Version
Part 1 — Foundation (2026). Part 2+ will extend this policy with live backend controls.

## Scope
This policy applies to the **Gym Management App** Part 1 foundation and outlines the security controls that will be formalized in Part 2 when a backend is connected. Part 1 is a local-first mock app; the controls below are stated as design targets and will be enforced in subsequent parts.

## 1. Authentication & Authorization
- **Part 1**: Role chosen on login screen is a UI expectation only. No backend verification, no OTP, no session tokens. The selected role is displayed locally and used for navigation routing within the app groups `(auth)`, `(member)`, `(reception)`, `(owner)`.
- **Part 2+**: 
  - Auth via Expo Authentication Session or Supabase Auth.
  - RBAC (Role-Based Access Control) enforced at the database level (Supabase RLS).
  - Session persistence via `expo-secure-store`; auto-refresh on app resume.
  - Re-auth required after 24h inactivity or app foreground/background transition.

## 2. RBAC / RLS (Projected)
| Resource | Member | Receptionist | Owner |
|----------|--------|-------------|-------|
| Attendance (own) | SELECT/INSERT | SELECT all | SELECT all |
| Attendance (all) | — | — | SELECT all |
| Fees/payments (own) | INSERT (own only) | INSERT, SELECT all | Full CRUD |
| Membership freeze approval | — | SUBMIT; Owner approves | APPROVE/REJECT |
| Reports | — | — | SELECT all |
| Lost member list | — | — | SELECT all |
| QR attendance tokens | Generate (own) | — | Issue all |

## 3. QR Token Security
- **Attendance QR**: Time-limited signed URL (Part 2+); contains member ID, timestamp, purpose=`attendance`; single-use; displayed as inert SVG in Part 1.
- **UPI QR**: Separate format; payment intent ID; never conflated with attendance QR (per Business Rules).
- **Part 1**: Both QR types are inert demo SVGs labeled `QR attendance ≠ UPI payment`. No network validation.

## 4. Financial Immutability
- **Payments never edited**: In the database, a payment record's status may change to `reversed`, but the original row is never modified. A new reversal entry is inserted with reference to the original.
- **Part 1**: Concept demonstrated via UI — submit button disabled with caption; no real payment processing.
- **Part 2+**: Database constraint + application logic + audit trigger.

## 5. Audit Logging (Projected)
Every sensitive state change logs:
- `actor` (user ID or "system")
- `action` (e.g. `payment_reversed`, `membership_frozen`, `membership_activated`)
- `timestamp` (UTC)
- `old_value` / `new_value` (JSON or structured)
- Table affected
- Used for compliance, anomaly detection, and reversal verification.

## 6. Mobile Security
- **No sensitive data in AsyncStorage** in Part 1. Part 2 will use `expo-secure-store` for tokens, with fallback to SQLite encrypted.
- **Development build only**: Native modules added after Part 1 require development builds (`npx expo run:ios|android` or `eas build --profile development`).
- **Expo Go limitations**: Part 1 works in Expo Go because it uses only bundled modules; no native code added until Part 2.

## 7. Monitoring & Incident Response
- **Part 1**: No monitoring — local mock app only.
- **Part 2+**: 
  - EAS Monitor for crash reporting.
  - OWASP ZAP / EAS Scan for dependency vulnerability checks in CI.
  - Log aggregation (part of Supabase / EAS environment).
  - Incident response playbook for credential leakage or unauthorized access.

## 8. OWASP Top 10 Mapping (Part 2+)
| A01:2021 — Broken Access Control | RBLS/RLS, session timeouts |
| A02:2021 — Cryptographic Failures | QR token encryption, TLS for all network |
| A03:2021 — Injection | Parameterized queries; no string concatenation in SQL |
| A04:2021 — Insecure Design | Threat modeling (this doc); security requirements in Definition of Done |
| A05:2021 — Security Misconfiguration | EAS profile management; feature flags via Remote Config |
| A06:2021 — Vulnerable and Outdated Components | Regular `npx expo install --fix`; dependency pinning |
| A07:2021 — Identification and Authentication Failures | Session management, re-auth on resume |
| A08:2021 — Software and Data Integrity | Immutable payments; reversal entries; signed QR tokens |
| A09:2021 — Security Logging and Monitoring | Audit log table; EAS Monitor |
| A10:2021 — Server-Side Request Forgery | Not applicable (RN app, no server-side fetch in Part 1) |

## 9. Incident Response
- If a QR token is suspected compromised: revoke via backend; display rotated QR in next scan.
- If financial data is suspected leaked: escalate to owner; audit log reviewed; payments marked for review (not edited).
- Communication: in-app notification to affected role; no external disclosure in Part 1 (no real data).

## 10. Compliance & Legal
- Part 1: No personal data processed (mock only). Part 2 will align with applicable data protection regulations (e.g., GDPR, local privacy laws) via consent screens, data retention policies, and user export/deletion endpoints.

## Review Cycle
This policy is reviewed at each part boundary (Part 1 → Part 2 → Part 3). Updates captured in `AGENTS.md` and `PHASE_TRACKER.md`.