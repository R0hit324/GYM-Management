# BATCH R-3B — JEST DEPENDENCY SECURITY ASSESSMENT (READ-ONLY)

**Project:** Gym Management App (`gym-management-app`)
**Date:** 2026-11-21
**Batch:** R-3B — Jest Dependency Security Assessment (Owner-authorized **read-only** assessment)
**Predecessor:** `docs/SECURITY_BATCH_R3A_TYPESCRIPT_ESLINT_REMEDIATION_REPORT.md` (R-3A completed & verified)
**Mode:** Assessment, compatibility investigation, and remediation planning only. **No dependency change, no install, no upgrade, no test-implementation change was performed.**

---

## 1. Executive Summary

- Batch R-3B was authorized as a strictly read-only assessment of the **remaining Jest-related dependency vulnerabilities**.
- Post-R-3A state: `npm audit` reports **22 moderate / 0 critical / 0 high** (total 22). The five `@typescript-eslint/*` findings were resolved in R-3A; the remaining findings are in the **Jest ecosystem** and the adjacent `expo` / `@expo/fingerprint` / `minimatch` / `glob` chain.
- This assessment investigated all Jest-related remaining findings, their exposure, and Jest 29 ↔ Jest 30 ↔ jest-expo 58 compatibility.
- **Final verdict: ASSESSMENT COMPLETE — REMEDIATION PLAN READY** (implementation requires a future Owner-approved R-3B implementation batch).

## 2. Baseline (revalidated, unchanged during this stage)

| Item | Value |
|---|---|
| Branch | `main` |
| HEAD | `90753a4` |
| Node.js | `v24.20.0` |
| npm | `11.19.0` |
| Expo SDK | `~58.0.24` (`expo@58.0.25` installed) |
| React / React Native | `19.3.0` / `0.88.1` |
| Jest (declared) | `^30.5.2` (installed `30.5.2`) |
| jest-expo (declared) | `^58.0.14` (installed `58.0.14`) |
| @types/jest | `^30.0.0` |
| @testing-library/react-native | `^14.1.0` |
| babel-preset-expo | `58.0.25` |
| `@typescript-eslint/*` (R-3A result, present) | `eslint-plugin@8.73.0`, `parser@8.73.0` (devDeps `^8.73.0`) |

- Working tree during this stage: `package.json` and `package-lock.json` **modified** (from R-3A only; not touched during R-3B), plus untracked prior-batch artifacts.
- Test baseline reconfirmed: `npx jest` → **19 suites / 243 tests — PASSED** (exit 0).

## 3. Audit Results

- Current audit totals: **moderate 22, high 0, critical 0, total 22** (fresh `npm audit` during R-3B; exit 1 = findings present).
- Resolved during R-3A: the entire `@typescript-eslint/*` set (5 findings).
- **Remaining findings under R-3B investigation (Jest ecosystem focus):** `jest`, `@jest/core`, `@jest/transform`, `babel-jest`, `babel-plugin-istanbul`, `test-exclude`, `glob`, `@jest/reporters`, `@jest/expect`, `@jest/globals`, `jest-circus`, `jest-cli`, `jest-config`, `jest-expo`, `jest-resolve-dependencies`, `jest-runner`, `jest-runtime`, `jest-snapshot`, `jest-watch-typeahead`, plus adjacent `expo` / `@expo/fingerprint` / `minimatch`.

## 4. Vulnerability Inventory — remaining Jest-related findings

| Package | Installed version | Advisory / vulnerable range | Severity | Dependency chain | Fix version (npm-reported) |
|---|---|---|---|---|---|
| `jest` | `30.5.2` | `>=30.0.0-alpha.1` | moderate | `jest → @jest/core, jest-cli → @jest/transform → babel-plugin-istanbul → test-exclude → glob/minimatch` | `jest@29.7.0` (**semver-major**) |
| `@jest/core` | `30.5.2` | `>=30.0.0-alpha.1` | moderate | `@jest/core → @jest/reporters/@jest/transform/jest-config/jest-resolve-dependencies/jest-runner/jest-runtime/jest-snapshot → … → babel-plugin-istanbul → test-exclude → glob/minimatch` | `jest@29.7.0` (**semver-major**) |
| `@jest/transform` | `30.5.2` | `>=30.5.0` | moderate | `@jest/transform → babel-plugin-istanbul → test-exclude → glob/minimatch` | `jest@29.7.0` (**semver-major**) |
| `babel-jest` | `29.7.0` | `>=30.5.0` | moderate | `babel-jest → @jest/transform → babel-plugin-istanbul → test-exclude → glob/minimatch` | `jest@29.7.0` (**semver-major**) |
| `babel-plugin-istanbul` | `8.0.0` (nested) / `6.1.1` (top) | `>=8.0.0` | moderate | `babel-plugin-istanbul → test-exclude → glob/minimatch` | `jest@29.7.0` (**semver-major**) |
| `test-exclude` | `7.0.2` (nested) / `6.0.0` (top) | `>=7.0.0` | moderate | `test-exclude → glob/minimatch, babel-plugin-istanbul` | `jest@29.7.0` (**semver-major**) |
| `glob` | `13.0.7` | `>=9.0.0 – <=14.0.1` (GHSA-3g3m-2fjr-6pw4) | moderate | `glob → minimatch` (via `@jest/reporters`, `jest-config`, `jest-runtime`, `test-exclude`) | `jest@29.7.0` (**semver-major**) |
| `minimatch` | `10.2.6` | `>=7.0.0 – <11.0.1` (GHSA-g3hv-75wg-m249) | moderate | `minimatch → globparts amplification` (via `glob`, `test-exclude`, `@expo/fingerprint`, `@typescript-eslint/typescript-estree`) | `expo@52.0.49` (**semver-major**) |
| `@jest/reporters` | `30.5.2` | `>=30.0.0-alpha.1` | moderate | `@jest/reporters → @jest/transform, glob` | `jest@29.7.0` |
| `@jest/expect` | `30.5.2` | `>=30.5.0` | moderate | `@jest/expect → jest-snapshot` | `jest@29.7.0` |
| `@jest/globals` | `30.5.2` | `>=30.5.0` | moderate | `@jest/globals → @jest/expect` | `jest@29.7.0` |
| `jest-circus` | `30.5.2` | `>=30.0.0-alpha.1` | moderate | `jest-circus → @jest/expect/jest-runtime/jest-snapshot` | `jest@29.7.0` |
| `jest-cli` | `30.5.2` | `>=30.0.0-alpha.1` | moderate | `jest-cli → @jest/core/jest-config` | `jest@29.7.0` |
| `jest-config` | `30.5.2` | `>=30.0.0-alpha.1` | moderate | `jest-config → babel-jest/glob/jest-circus/jest-runner` | `jest@29.7.0` |
| `jest-expo` | `58.0.14` | `>=58.0.7` | moderate | `jest-expo → jest-watch-typeahead → jest` | `jest-expo@58.0.6` (**semver-minor**) |
| `jest-resolve-dependencies` | `30.5.2` | `>=30.5.0` | moderate | `jest-resolve-dependencies → jest-snapshot` | `jest@29.7.0` |
| `jest-runner` | `30.5.2` | `>=30.0.0-alpha.1` | moderate | `jest-runner → @jest/transform/jest-runtime` | `jest@29.7.0` |
| `jest-runtime` | `30.5.2` | `>=30.0.0-alpha.1` | moderate | `jest-runtime → @jest/globals/@jest/transform/glob/jest-snapshot` | `jest@29.7.0` |
| `jest-snapshot` | `30.5.2` | `>=30.5.0` | moderate | `jest-snapshot → @jest/transform` | `jest@29.7.0` |
| `jest-watch-typeahead` | `3.0.1` | `>=3.0.0` | moderate | `jest-watch-typeahead → jest → jest-expo` | `jest-expo@58.0.6` (**semver-minor**) |
| `expo` | `58.0.25` | `>=53.0.0-canary-20241211-61c49bd` | moderate | `expo → @expo/fingerprint → minimatch` | `expo@52.0.49` (**semver-major**) |
| `@expo/fingerprint` | `0.21.10` | `>=0.11.12-canary-20250303-4dba60e` | moderate | `@expo/fingerprint → minimatch` | `expo@52.0.49` (**semver-major**) |

## 5. Exposure Analysis

- **Local development / CI / test execution:** All flagged packages are dev-only tooling (`devDependencies`) or dev-only transitive chains; no production runtime dependency is flagged.
- **Practical exposure:** test toolchain / CI supply-chain risk (DoS-class advisory in glob/minimatch; canary/30.x Jest advisory set). No end-user runtime exposure; production application dependencies (`@supabase/supabase-js`, `expo` runtime pieces, React Native runtime) are not flagged for runtime.

## 6. Jest / Expo Compatibility Investigation

- **Current Jest:** `30.5.2` (latest stable release on the `30` dist-tag; satisfies `^30.5.2`). The advisory set flags all of Jest `>=30.0.0-alpha.1`, i.e., the entire Jest 30 line (stable and prerelease).
- **Current jest-expo:** `58.0.14`, which depends on the Jest 30 line (`babel-jest ^30.0.0`, `@jest/globals ^30.0.0`, `jest-snapshot ^30.0.0`, `jest-environment-node ^30.0.0`, `jest-environment-jsdom ^30.0.0`, `@jest/create-cache-key-function ^30.0.0`) and peers `jest: ^29.0.0 || ^30.0.0`, `@react-native/jest-preset: ^0.88.1`.
- **Fix-side jest-expo:** `jest-expo@58.0.6` uses the Jest 29 line (`babel-jest ^29.2.1`, `@jest/globals ^29.2.1`, `jest-snapshot ^29.2.1`, `jest-environment-jsdom ^29.2.1`, `@jest/create-cache-key-function ^29.2.1`) and peers `@react-native/jest-preset: ^0.88.0-rc.3`.
- **Compatibility conclusions (no changes made):**
  - The current Jest 30.5.2 ↔ jest-expo 58.0.14 pairing is internally consistent and the project tests run green (19/243) with it.
  - A fix that clears the Jest advisories requires leaving the Jest 30 line (to `jest@29.7.0`) or a future jest-expo release built on a patched Jest 30.x.
  - Moving to Jest 29 would pair with `jest-expo@58.0.6` (or a similarly Jest-29-based release) — a coordinated change.
  - Whether such a move preserves Expo SDK 58 / RN 0.88.1 / React Native jest-preset behavior **cannot be fully established without executing it**; it is therefore a planned future step with regression verification required.

## 7. Remediation Strategies (options A–F, assessment only)

- **Option A — Stable Jest 30 release:** Not viable as a fix vector — `30.5.2` is already the latest stable Jest 30 release and remains inside the vulnerable range; no stable Jest 30 patch exists.
- **Option B — Compatible Jest 30 patch/minor update:** Not viable — no patched Jest 30.x release identified (fix is published on the Jest 29 line).
- **Option C — Coordinated jest-expo/Jest update:** Viable path identified: coordinated move to `jest@29.7.0` + `jest-expo@58.0.6` (Jest-29-based). Requires compatibility re-validation.
- **Option D — Jest 29 migration:** Evaluated; the technically supported route indicated by npm for these findings. Migration requirements: jest-expo version alignment, jest config/preset alignment, test suite re-run (19/243), TS/ESLint/Android build impact assessment.
- **Option E — Targeted overrides:** Not recommended (downgrade-style override; not a clean remediation).
- **Option F — Temporary deferral:** Possible pending future jest-expo/Jest releases; would retain test-toolchain supply-chain exposure.

## 8. Testing and Regression Risk (for future implementation)

Post-fix, the following would be re-verified in a future approved batch:
- Jest execution — full suite (19 suites / 243 tests).
- jest-expo environment / Expo mocks / RN rendering / navigation / async tests / coverage.
- TypeScript (`tsc --noEmit`), ESLint (`expo lint`), Android build compatibility if affected.

## 9. Prioritization

- Jest 30 ecosystem findings: **P2** (moderate severity; meaningful test-toolchain / CI execution risk within dev tooling). Adjunct `expo`/`@expo/fingerprint`/`minimatch` findings: **P2** (dev tooling, moderate).

## 10. Required Report (this file) — `docs/SECURITY_BATCH_R3B_JEST_DEPENDENCY_ASSESSMENT.md`.

## 11. File Change Control

- Created/updated in this stage: `docs/SECURITY_BATCH_R3B_JEST_DEPENDENCY_ASSESSMENT.md` only.
- No other files modified.

## 12. Stop Conditions

- Compatibility could not be fully established without execution → remediation deferred to a future approved batch. ✔ documented.
- No dependency/install/upgrade performed in this stage.

## 13. Final Status and Verdict

**ASSESSMENT COMPLETE — REMEDIATION PLAN READY**

- Read-only assessment executed and documented.
- Remaining actionable findings: Jest ecosystem + expo-adjacent dev tooling (moderate; 0 critical / 0 high).
- Implementation requires separate Owner approval (future R-3B implementation batch).

---

## Final Response — Batch R-3B

1. **Status:** **ASSESSMENT COMPLETE — REMEDIATION PLAN READY**.
2. **Baseline revalidated:** Jest `30.5.2`, jest-expo `58.0.14`, Expo SDK 58, RN `0.88.1`; R-3A `@typescript-eslint@8.73.0` intact; tests **19/243 PASSED**.
3. **Audit:** post-R-3A **22 moderate / 0 critical / 0 high**; Jest-related findings under investigation — all moderate, fix path = Jest 29.7.0 / jest-expo 58.0.6 (semver-major/minor respectively).
4. **Compatibility:** current Jest 30 ↔ jest-expo 58.0.14 consistent (tests green); fix requires coordinated move off Jest 30 line.
5. **Remediation options:** A–F assessed; recommended future path = coordinated Jest 29 migration (Option C/D) pending Owner approval.
6. **Files created:** `docs/SECURITY_BATCH_R3B_JEST_DEPENDENCY_ASSESSMENT.md`. No other file changes in this stage.
7. **Git:** no commit / push; HEAD `90753a4`; package files left as R-3A state (not touched during R-3B).
8. **Stop condition respected:** assessment stopped for Owner review; no implementation performed.

---

*End of Batch R-3B — Jest Dependency Security Assessment. Read-only assessment completed; no remediation implemented; no dependencies changed during this stage.*
