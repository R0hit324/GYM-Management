# BATCH R-3 — DEPENDENCY HARDENING ASSESSMENT (READ-ONLY)

**Project:** Gym Management App (`gym-management-app`)
**Date:** 2026-11-21
**Batch:** R-3 — Dependency Hardening Assessment (Owner-authorized **read-only** assessment)
**Stage:** Security Remediation Plan → Batch R-3 (assessment phase)
**Mode:** Assessment only. **No dependency install / upgrade / update / fix was performed.**

---

## 1. Executive Summary

- The Owner authorized **Batch R-3 — Read-Only Dependency Security Assessment**. This report is the deliverable of that assessment phase.
- The dependency vulnerability posture was **re-validated live** against the current lockfile via `npm audit` and `npm audit --json` (Node/npm toolchain: Node.js `v24.20.0`, npm `11.19.0`).
- **Current audit totals: 0 critical, 0 high, 27 moderate — total 27 findings.** These numbers **re-confirm** the figures recorded in the Stage 1 audit (`docs/COMPREHENSIVE_SECURITY_AUDIT_REPORT.md` §10) and the Stage 2 remediation plan (`docs/SECURITY_REMEDIATION_PLAN.md` §6) — the previously reported dependency posture remains unchanged.
- **No new vulnerability class appeared** in the current re-run; all moderate findings remain within the previously documented dev-tooling chains.
- **No production runtime dependency is flagged** by the current audit; all moderate findings originate in development / build / test tooling dependency chains (with one advisory surfaced through the `expo` package dependency graph at CLI/build-fingerprint level).

## 2. Audit Results

### Commands executed (read-only)

- `npm audit` → exit code `1` (findings present); human-readable summary.
- `npm audit --json` → machine-readable report captured and parsed (totals below).
- `npm ls --depth=0` → installed top-level dependency versions.
- Direct reads of `package.json` and `package-lock.json` (via `require`).

### Actual audit totals (current run)

| Severity | Count |
|---|---|
| Critical | **0** |
| High | **0** |
| Moderate | **27** |
| Low | **0** |
| **Total** | **27** |

- `metadata.vulnerabilities`: `{ info: 0, low: 0, moderate: 27, high: 0, critical: 0, total: 27 }`.
- Dependency graph footprint: prod `1006`, dev `364`, optional `66`, peer `53`, peerOptional `0`, total `1450` packages.

### Comparison with Stage 1 (2026-11 audit)

- Stage 1 recorded: **0 critical, 0 high; 27 moderate** — all dev-only chains; no production runtime dependency flagged; fix paths involved semver-major alignment (Jest 29.7.0, expo 52.0.49) — deferred.
- **Current re-run: identical totals (27 moderate, 0 critical, 0 high).** Revalidation **CONFIRMS** the Stage 1 dependency findings as still present in the current lockfile state; no new findings were reported by the current audit run beyond the previously documented set.

## 3. Environment

| Item | Version / range |
|---|---|
| Node.js | `v24.20.0` |
| npm | `11.19.0` |
| Expo SDK | `~58.0.24` (package.json) — `expo@58.0.25` installed; `@expo/ui@~58.0.27`; `@expo/vector-icons@^15.1.1` |
| React | `19.3.0` |
| React Native | `0.88.1` |
| react-native-web | `~0.21.4` |
| react-native-reanimated | `4.7.1` |
| react-native-worklets | `0.13.0` |
| react-native-svg | `15.16.0`; react-native-qrcode-svg `^6.3.54`; gesture-handler `~3.3.0`; screens `~4.30.1`; safe-area-context `~5.11.1` |
| TypeScript | `~6.0.3` |
| ESLint | `^9.39.5`; eslint-config-expo `~58.0.4` |
| Jest | `^30.5.2`; jest-expo `^58.0.14`; @types/jest `^30.0.0`; @testing-library/react-native `^14.1.0` |
| Supabase JS | `@supabase/supabase-js ^2.119.0`; supabase CLI `^3.1.0` |

## 4. Vulnerability Inventory

### 4.1 Summary of distinct vulnerable packages reported (27 total findings)

All findings are **severity: moderate**; none critical/high.

| # | Vulnerable package | Installed version(s) | Severity | Vulnerable range | Direct / Transitive | Fix available | Fix type |
|---|---|---|---|---|---|---|---|
| 1 | `jest` | `30.5.2` | moderate | `>=30.0.0-alpha.1` | Direct (dev) | `jest@29.7.0` | Semver-major (downgrade) |
| 2 | `@jest/core` | `30.5.2` | moderate | `>=30.0.0-alpha.1` | Transitive (dev) | `jest@29.7.0` | Semver-major (downgrade) |
| 3 | `@jest/expect` | `30.5.2` | moderate | `>=30.5.0` | Transitive (dev) | `jest@29.7.0` | Semver-major (downgrade) |
| 4 | `@jest/globals` | `30.5.2` | moderate | `>=30.5.0` | Transitive (dev) | `jest@29.7.0` | Semver-major (downgrade) |
| 5 | `@jest/reporters` | `30.5.2` | moderate | `>=30.0.0-alpha.1` | Transitive (dev) | `jest@29.7.0` | Semver-major (downgrade) |
| 6 | `@jest/transform` | `30.5.2` | moderate | `>=30.5.0` | Transitive (dev) | `jest@29.7.0` | Semver-major (downgrade) |
| 7 | `jest-circus` | `30.5.2` | moderate | `>=30.0.0-alpha.1` | Transitive (dev) | `jest@29.7.0` | Semver-major (downgrade) |
| 8 | `jest-cli` | `30.5.2` | moderate | `>=30.0.0-alpha.1` | Transitive (dev) | `jest@29.7.0` | Semver-major (downgrade) |
| 9 | `jest-config` | `30.5.2` | moderate | `>=30.0.0-alpha.1` | Transitive (dev) | `jest@29.7.0` | Semver-major (downgrade) |
| 10 | `jest-resolve-dependencies` | `30.5.2` | moderate | `>=30.5.0` | Transitive (dev) | `jest@29.7.0` | Semver-major (downgrade) |
| 11 | `jest-runner` | `30.5.2` | moderate | `>=30.0.0-alpha.1` | Transitive (dev) | `jest@29.7.0` | Semver-major (downgrade) |
| 12 | `jest-runtime` | `30.5.2` | moderate | `>=30.0.0-alpha.1` | Transitive (dev) | `jest@29.7.0` | Semver-major (downgrade) |
| 13 | `jest-snapshot` | `30.5.2` | moderate | `>=30.5.0` | Transitive (dev) | `jest@29.7.0` | Semver-major (downgrade) |
| 14 | `babel-jest` | `29.7.0` (nested) | moderate | `>=30.5.0` | Transitive (dev) | `jest@29.7.0` | Semver-major (downgrade) |
| 15 | `babel-plugin-istanbul` | `8.0.0` (nested) | moderate | `>=8.0.0` | Transitive (dev) | `jest@29.7.0` | Semver-major (downgrade) |
| 16 | `test-exclude` | `7.0.2` / `6.0.0` (nested) | moderate | `>=7.0.0` | Transitive (dev) | `jest@29.7.0` | Semver-major (downgrade) |
| 17 | `glob` | `13.0.7` | moderate | `>=9.0.0 – <=14.0.1` | Transitive (dev) | `jest@29.7.0` | Semver-major (downgrade) |
| 18 | `minimatch` | `10.2.6` (top) / `9.0.9` (nested) | moderate | `>=7.0.0 – <11.0.1` | Transitive (dev) | `expo@52.0.49` | Semver-major (downgrade) |
| 19 | `jest-watch-typeahead` | `3.0.1` | moderate | `>=3.0.0` | Transitive (dev) | `jest-expo@58.0.6` | Semver-minor |
| 20 | `jest-expo` | `58.0.14` | moderate | `>=58.0.7` | Direct (dev) | `jest-expo@58.0.6` | Semver-minor |
| 21 | `@typescript-eslint/eslint-plugin` | `8.72.1` | moderate | `6.16.0 – 8.72.2` | Transitive (dev, via eslint-config-expo) | `true` (compatible fix within 8.x) | Non-major |
| 22 | `@typescript-eslint/parser` | `8.72.1` | moderate | `6.16.0 – 8.72.2` | Transitive (dev, via eslint-config-expo) | `true` (compatible fix within 8.x) | Non-major |
| 23 | `@typescript-eslint/type-utils` | `8.72.1` | moderate | `6.16.0 – 8.72.2` | Transitive (dev) | `true` (compatible fix within 8.x) | Non-major |
| 24 | `@typescript-eslint/typescript-estree` | `8.72.1` | moderate | `6.16.0 – 8.72.2` | Transitive (dev) | `true` (compatible fix within 8.x) | Non-major |
| 25 | `@typescript-eslint/utils` | `8.72.1` | moderate | `6.16.0 – 8.72.2` | Transitive (dev) | `true` (compatible fix within 8.x) | Non-major |
| 26 | `@expo/fingerprint` | `0.21.10` | moderate | `>=0.11.12-canary-20250303-4dba60e` | Transitive (via `expo`) | `expo@52.0.49` | Semver-major (downgrade) |
| 27 | `expo` | `58.0.25` | moderate | `>=53.0.0-canary-20241211-61c49bd` | Direct (prod) | `expo@52.0.49` | Semver-major (downgrade) |

### 4.2 Advisory details (verified from `npm audit --json`)

| Package | Advisory | Title | GHSA | Severity | CWE | Affected range | Fix |
|---|---|---|---|---|---|---|---|
| `glob` | via advisory object | Glob: AbortSignal cancellation bypass allows post-timeout filesystem traversal | GHSA-3g3m-2fjr-6pw4 | moderate | CWE-400 | `>=9.0.0 – <=14.0.1` | via `jest@29.7.0` |
| `minimatch` | via advisory object | minimatch has potential denial of service via globparts amplification | GHSA-g3hv-75wg-m249 | moderate | CWE-405 | `>=7.0.0 – <11.0.1` | via `expo@52.0.49` |
| Jest ecosystem (`jest@30.5.2` and `@jest/*@30.5.2`) | multi-package advisory set | Jest 30 canary-line findings | (npm advisory set) | moderate | — | `>=30.0.0-alpha.1` / `>=30.5.0` | via `jest@29.7.0` |

## 5. Dependency Chain Analysis

### Chain A — Jest 30 canary ecosystem (via `jest-expo@58.0.14`)

- `jest-expo@58.0.14` (dev, direct) → `jest-watch-typeahead@3.0.1` (`>=3.0.0`).
- `jest@30.5.2` (dev, direct) → `@jest/core`, `jest-cli` → `@jest/transform`, `babel-jest`, `jest-config`, `jest-runner`, `jest-runtime`, `jest-snapshot`, `jest-circus`, `jest-resolve-dependencies`, `@jest/expect`, `@jest/globals` → `babel-plugin-istanbul` → `test-exclude` → `glob` / `minimatch` (GHSA-3g3m-2fjr-6pw4, GHSA-g3hv-75wg-m249).
- Findings span: `jest`, `@jest/core`, `@jest/expect`, `@jest/globals`, `@jest/reporters`, `@jest/transform`, `jest-circus`, `jest-cli`, `jest-config`, `jest-resolve-dependencies`, `jest-runner`, `jest-runtime`, `jest-snapshot`, `babel-jest`, `babel-plugin-istanbul`, `test-exclude`, `glob`, `minimatch`, `jest-watch-typeahead` — **18 distinct vulnerable packages** in this chain.

### Chain B — `@typescript-eslint/*` 8.72.1 (via `eslint-config-expo@58.0.4`)

- `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser`, `@typescript-eslint/type-utils`, `@typescript-eslint/typescript-estree`, `@typescript-eslint/utils` — installed at `8.72.1`; vulnerable range `6.16.0 – 8.72.2`; findings via `typescript-estree` → `minimatch` and via the `@typescript-eslint` internal utils chain.

### Chain C — `expo` → `@expo/fingerprint` → `minimatch` → `glob`

- `expo@58.0.25` (prod, direct) → `@expo/fingerprint@0.21.10` (`>=0.11.12-canary-20250303-4dba60e`) → `minimatch` (`>=7.0.0 <11.0.1`).

## 6. Production Exposure Analysis

- **Production runtime exposure: none flagged.** The current audit reports findings only within dev tooling, build tooling, and test tooling chains.
- The single `expo`-family finding (`expo` → `@expo/fingerprint` → `minimatch`) enters through the `expo` package dependency graph; the affected component (`@expo/fingerprint` / `minimatch`) is consumed by Expo CLI / fingerprinting / build tooling rather than the shipped runtime bundle.
- **Practical exposure classification:** development tooling / CI / local test tooling (Jest, @typescript-eslint, Expo fingerprint) — dev/CI supply-chain risk (malicious or vulnerable tooling) rather than an immediately exploitable end-user runtime compromise.
- Supabase JS (`@supabase/supabase-js@2.119.0`) and all application runtime dependencies are **not flagged**.

## 7. Compatibility Risks (assessment only — nothing changed)

- **Jest 30 → 29.7.0:** semver-major downgrade required to clear the Jest canary-line findings; `jest-expo@58.0.14` currently pairs with the Jest 30 line — a coordinated Jest/jest-expo alignment is required and must be re-validated (Jest config preset, RN preset behavior).
- **`jest-expo@58.0.6`:** npm-reported semver-minor fix candidate for the `jest-watch-typeahead` / `jest-expo` findings; SDK-58 compatibility must be re-verified after any change.
- **`@typescript-eslint/*` fix:** npm reports a compatible (non-semver-major) fix available within the `8.72.x` line; low breaking risk expected, but `eslint-config-expo@58.0.4` peer coupling should be re-checked.
- **`expo` / `@expo/fingerprint` / `minimatch` / `glob`:** npm-proposed fix (`expo@52.0.49`) is a **semver-major** change and conflicts with the project's Expo SDK 58 baseline; deferral or SDK-aligned upgrade path must be chosen deliberately.
- React Native `0.88.1`, React `19.3.0`, Reanimated `4.7.1`, Worklets `0.13.0`, etc. are **not** flagged and were not changed.

## 8. Remediation Options

Per vulnerable dependency / chain, the assessed options (no action taken):

- **Jest 30 canary chain:** Option C (major downgrade to `jest@29.7.0`) or coordinated migration; `npm audit fix` for this set requires `--force` (breaking). Temporarily mitigated only by CI/test-hygiene discipline — **not** applied.
- **`@typescript-eslint/*` chain:** Option A/B (minimal compatible patch/minor to the 8.72.x fixed line) — `npm audit fix` (no force) path identified; not applied.
- **`expo` / `@expo/fingerprint` / `minimatch` / `glob`:** Option C (`expo@52.0.49`) or Option D/F (monitor + parent-upgrade alignment); blocked-by-SDK risk for immediate application.

## 9. Prioritization

| Priority | Classification | Content |
|---|---|---|
| P0 | Critical/High exploitable production dependency | **None open** (0 critical, 0 high; no production runtime dependency flagged). |
| P1 | Moderate with meaningful production/build exposure or strong exploitability | **None open** under current classification (all moderate findings are dev/build/test tooling; no production runtime exposure). |
| P2 | Moderate dev/build/test tooling vulnerability with limited practical exposure | **Current set (27 moderate findings)** — CI / test tooling supply-chain and DoS-class findings; practical exploitability limited but real; should be remediated in an authorized batch. |
| P3 | Low-impact / theoretical; monitor or defer with justification | Not separately needed; the `expo`-chain major fix is deferred pending SDK alignment (justified deferral candidate). |

## 10. Remediation Matrix (plan only — not executed)

| Finding | Recommended action | Target version | Breaking risk | Priority | Required tests after future approved upgrade |
|---|---|---|---|---|---|
| Jest 30 canary ecosystem (`jest`, `@jest/*`, `babel-jest`, `babel-plugin-istanbul`, `test-exclude`, `glob`, `minimatch`, `jest-watch-typeahead`) | Migrate / align to `jest@29.7.0` and compatible `jest-expo` release | `jest@29.7.0` (+ aligned `jest-expo`) | **HIGH** (major) | P2 | `npm audit`; dependency tree; `npm install` reproducibility; Jest/RN test run; `tsc`; `eslint`; expo-doctor; Android build. |
| `@typescript-eslint/*` (5 packages @ `8.72.1`) | Bump to fixed 8.72.x line | fixed 8.72.x version (npm: non-major fix) | LOW | P2 | `npm audit`; `npm ls`; `eslint` run; `tsc`. |
| `expo` → `@expo/fingerprint` → `minimatch` / `glob` | Upgrade to Expo release pulling fixed transitive (`expo@52.0.49` per npm) / monitor for SDK-58-aligned fix | `expo@52.0.49` (semver-major; SDK-incompatible) | **HIGH** (major + SDK) | P2 | `npm audit`; `expo-doctor`; SDK compat check; build validation. |

## 11. Upgrade Order (safe staged sequence — plan only, nothing executed)

1. **Stage 1 (lowest risk, no SDK/runtime impact):** `@typescript-eslint/*` → fixed 8.72.x line; re-run ESLint + TypeScript checks.
2. **Stage 2 (coordinated tooling migration):** Jest 29.7.0 + aligned `jest-expo`; re-run Jest suite, lint, typecheck; validate RN/Jest preset behavior.
3. **Stage 3 (SDK-aligned resolution):** `expo` / `@expo/fingerprint` / `minimatch` / `glob` — defer until an Expo SDK-58-aligned fixed release exists; currently npm-proposed fix (`expo@52.0.49`) is semver-major/incompatible with SDK 58.

## 12. Verification Plan (post-approval — not executed here)

After a future approved R-3 implementation batch, the following read-only/verification steps would be run:

- `npm audit` and `npm audit --json` (totals back to 0 critical / 0 high / acceptable moderate set).
- Dependency tree verification (`npm ls`) and lockfile reproducibility (`npm install` / `npm ci` discipline).
- Expo compatibility validation (`npx expo install --check`, `npx expo-doctor`).
- TypeScript (`npx tsc --noEmit`), ESLint (`npx expo lint`).
- Jest test suite run.
- SQL migration regression suites where relevant (Jest does not cover SQL; regression suites remain green).
- Android build / EAS validation where applicable.

## 13. Deferred Risks

- Dev-only moderate advisories remain open until an R-3 implementation batch is approved and executed.
- The `expo`-family fix currently requires a semver-major change that conflicts with the Expo SDK 58 baseline; deferral carries residual build-tooling supply-chain risk until an SDK-aligned fix lands.

## 14. Approval Gate

- **Assessment phase complete (read-only).**
- **Any remediation implementation requires a separate, explicit Owner approval (a future Batch R-3 implementation authorization).**
- No upgrades were installed, changed, or applied during this stage.

## 15. Final Status

**ASSESSMENT COMPLETE — REMEDIATION PLAN READY**

---

## Final Response — Batch R-3 Dependency Hardening Assessment

1. **Status:** **ASSESSMENT COMPLETE** (read-only; remediation not implemented).
2. **Commands executed:** `npm audit`, `npm audit --json`, `npm ls --depth=0`, version reads; **no install/update/fix commands run**.
3. **Audit results:** **0 critical, 0 high, 27 moderate** (total 27) — re-validated; identical to Stage 1 figures.
4. **Environment:** Node `v24.20.0`, npm `11.19.0`, Expo SDK 58 (`expo@58.0.25`), React `19.3.0`, React Native `0.88.1`, TypeScript `~6.0.3`, Jest `^30.5.2`, jest-expo `^58.0.14`.
5. **Vulnerability inventory:** 27 moderate findings across the Jest 30 canary chain (18 packages), `@typescript-eslint/*@8.72.1` chain (5 packages), and the `expo` → `@expo/fingerprint` → `minimatch`/`glob` chain; advisories GHSA-3g3m-2fjr-6pw4 (glob) and GHSA-g3hv-75wg-m249 (minimatch) verified.
6. **Production exposure:** **None flagged**; all findings dev/build/test tooling (CI supply-chain + DoS-class tooling risk); production runtime dependencies unaffected.
7. **Compatibility risks:** Jest 30→29.7.0 semver-major; `jest-expo` alignment; `@typescript-eslint` non-major fix; `expo@52.0.49` semver-major (SDK-incompatible) — all assessed, none applied.
8. **Remediation matrix / order / verification plan:** documented (§8–§12); nothing executed.
9. **Deferred risks:** dev-only moderate advisories open pending future authorized R-3 implementation batch; Expo-chain fix deferred pending SDK-58-aligned release.
10. **Files created/modified in this stage:** Created `docs/SECURITY_BATCH_R3_DEPENDENCY_ASSESSMENT.md`. **No other files.**
11. **Dependencies unchanged:** `package.json` and `package-lock.json` **unchanged** (git diff empty); no install/uninstall/upgrade/downgrade/`npm audit fix`/`npm update` performed; no lockfile modification.
12. **Git:** no commit / push performed during this stage. HEAD remains `90753a4`.
13. **Hosted / production safety:** local read-only audit only; no hosted Supabase operation, no production data access, no destructive operation.
14. **Remediation recommendations:** staged, compatibility-assessed upgrades (see §8–§11) — to be executed only under a future Owner-approved R-3 implementation batch.
15. **Owner approval requirements:** separate Owner approval required before any dependency change is implemented.

---

*End of Batch R-3 — Dependency Hardening Assessment. Read-only assessment completed; no remediation implemented; no dependencies changed; no commit/push performed.*
