# BATCH R-3C — EXPO DEPENDENCY SECURITY ASSESSMENT (READ-ONLY)

**Project:** Gym Management App (`gym-management-app`)
**Date:** 2026-11-21
**Batch:** R-3C — Expo Dependency Security Assessment (Owner-authorized **read-only** assessment)
**Predecessors:** `docs/SECURITY_BATCH_R3_DEPENDENCY_ASSESSMENT.md` (R-3), `docs/SECURITY_BATCH_R3A_TYPESCRIPT_ESLINT_REMEDIATION_REPORT.md` (R-3A), `docs/SECURITY_BATCH_R3B_JEST_DEPENDENCY_ASSESSMENT.md` (R-3B)
**Mode:** Assessment, compatibility investigation, and remediation planning only. **No dependency change, install, upgrade, override, patch, or SDK change was performed.**

---

## 1. Executive Summary

- Batch R-3C was authorized as a strictly read-only assessment of the remaining **Expo-related** dependency vulnerabilities.
- Current audit baseline: **22 moderate / 0 critical / 0 high** (total 22).
- Remaining vulnerability chain under investigation: **`expo → @expo/fingerprint → glob/minimatch`** (Glob AbortSignal cancellation bypass — GHSA-3g3m-2fjr-6pw4; Minimatch globparts denial-of-service — GHSA-g3hv-75wg-m249).
- Installed state: `expo@58.0.25` → `@expo/fingerprint@0.21.10` → `minimatch@10.2.6` (affected); `glob@13.0.7` (affected, via Jest toolchain).
- npm-suggested remediation (`expo@52.0.49`) is a **semver-major** change and **incompatible with the Expo SDK 58 baseline** — explicitly not authorized for implementation in this stage.

## 2. Baseline (revalidated, unchanged during this stage)

| Item | Value |
|---|---|
| Branch | `main` |
| HEAD | `90753a4` |
| Node.js | `v24.20.0` |
| npm | `11.19.0` |
| Expo (declared) | `~58.0.24` (installed `58.0.25`) |
| Expo SDK | 58 |
| React Native | `0.88.1` |
| React | `19.3.0` |
| @expo/fingerprint (installed) | `0.21.10` |
| glob (installed) | `13.0.7` (top), `10.5.0` (nested via Jest) |
| minimatch (installed) | `10.2.6` (via expo/fingerprint), `9.0.9` (nested via glob@10), `11.0.9` (via @typescript-eslint), `3.1.5` (via eslint tooling) |
| @typescript-eslint (R-3A result) | `eslint-plugin@8.73.0`, `parser@8.73.0` (present) |
| npm audit | **22 moderate / 0 critical / 0 high** (total 22) |

## 3. Vulnerability Inventory — Expo-related findings

| Package | Installed version | Advisory | Severity | Dependency chain | Fixed version |
|---|---|---|---|---|---|
| `expo` | `58.0.25` | `>=53.0.0-canary-20241211-61c49bd` (via `@expo/fingerprint`) | moderate | `expo → @expo/fingerprint@0.21.10 → minimatch@10.2.6` | `expo@52.0.49` (**semver-major**, SDK-incompatible) |
| `@expo/fingerprint` | `0.21.10` | `>=0.11.12-canary-20250303-4dba60e` | moderate | `@expo/fingerprint → minimatch@10.2.6` | `expo@52.0.49` (**semver-major**) |
| `minimatch` | `10.2.6` (via `@expo/fingerprint`) | `>=7.0.0 – <11.0.1` (GHSA-g3hv-75wg-m249) | moderate | `minimatch → globparts amplification DoS` | `>=11.0.1` (npm-suggested via `expo@52.0.49`) |
| `glob` | `13.0.7` (via Jest toolchain) | `>=9.0.0 – <=14.0.1` (GHSA-3g3m-2fjr-6pw4) | moderate | `glob → minimatch` | via `jest@29.7.0` (semver-major) |

## 4. Expo Dependency Graph

- `expo@58.0.25` (production direct dependency) → `"@expo/fingerprint": "^0.21.10"` → `@expo/fingerprint@0.21.10` → `"minimatch": "^10.2.6"` → resolved `minimatch@10.2.6`.
- Post-R-3A: `@typescript-eslint/typescript-estree@8.73.0` → `minimatch@11.0.9` (patched instance, not affected).
- Jest toolchain instances: `glob@13.0.7` and `glob@10.5.0` with nested `minimatch@9.0.9` / `10.2.6` — all within vulnerable ranges for the flagged advisories.

## 5. Exposure Analysis

- Local development: fingerprint/CLI operations could traverse vulnerable `minimatch`/glob code.
- CI / build: same toolchain exposure.
- Production runtime: `expo` runtime pieces are prod dependencies; the flagged component (`@expo/fingerprint`) is consumed by Expo CLI/fingerprint/build tooling rather than the shipped runtime bundle.

## 6. Expo SDK 58 Compatibility

- Current: Expo SDK 58 (`expo@58.0.25`) pinning `@expo/fingerprint@^0.21.10`; installed `0.21.10` is inside the vulnerable range.
- npm-suggested fix (`expo@52.0.49`) is semver-major → incompatible with SDK 58 baseline; not authorized.
- SDK-58-compatible patched Expo release not identified within assessment scope; independent `@expo/fingerprint` update constrained by `^0.21.10` range.

## 7. Remediation Options (A–G, assessment only)

- A: SDK-58-compatible Expo patch — not identified as available.
- B: SDK-58-compatible `@expo/fingerprint` update — constrained by Expo's `^0.21.10` pin.
- C: Compatible transitive update — `minimatch ^10.2.6` requires patched `>=11.0.1`, outside parent range; parent-driven update needed.
- D: npm overrides — assessment only; not recommended/implemented.
- E: Patch-package — assessment only; not implemented.
- F: SDK upgrade — assessment only; not implemented.
- G: Temporary deferral — recommended if no safe SDK-58-compatible fix exists.

## 8. Risk Prioritization

- Expo-related findings: **P2** (moderate severity; dev/build tooling exposure).

## 9. Required Report (this file).

## 10. File Change Control

- Created: `docs/SECURITY_BATCH_R3C_EXPO_DEPENDENCY_ASSESSMENT.md`. No other file changed in this stage.

## 11. Stop Conditions

- Compatibility could not be established without an SDK change → remediation deferred pending Owner decision.

## 12. Final Status and Verdict

**ASSESSMENT COMPLETE — REMEDIATION PLAN READY**

- Read-only assessment completed; no remediation implemented; no dependencies changed.

---

## Final Response — Batch R-3C

1. **Status:** **ASSESSMENT COMPLETE — REMEDIATION PLAN READY**.
2. **Baseline:** Expo `58.0.25`, `@expo/fingerprint@0.21.10`, glob/minimatch flagged (moderate); audit **22 moderate / 0 critical / 0 high**.
3. **Findings:** `expo → @expo/fingerprint → minimatch` (GHSA-g3hv-75wg-m249); `glob` (GHSA-3g3m-2fjr-6pw4).
4. **Compatibility:** npm fix (`expo@52.0.49`) semver-major → SDK-58 incompatible; not authorized.
5. **Remediation options:** A–G assessed; safe SDK-58-compatible fix not identified in scope.
6. **Files created:** `docs/SECURITY_BATCH_R3C_EXPO_DEPENDENCY_ASSESSMENT.md`. No other file changes in this stage.
7. **Git:** no commit/push; HEAD `90753a4`; package files at R-3A state.
8. **Stop condition respected:** assessment stopped for Owner review; no implementation performed.

---

*End of Batch R-3C — Expo Dependency Security Assessment. Read-only assessment completed; no remediation implemented; no dependencies changed during this stage.*
