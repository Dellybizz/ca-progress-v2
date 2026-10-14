# Phase 7 — Responsive and installed-package certification

This phase preserves the book/stationery design and existing account IDs, billing behavior, guest records and study history. The isolated `/onboarding-layout-preview` exposes the shared screen components in 320×640, 390×844, 844×390, 768×1024 and 1280×800 frames. It provides sample account forms without account-service callbacks. It is a layout fixture, not a login/reset destination, and is excluded from setup return paths.

Small Back, carousel, password visibility and text action controls now have 44-pixel touch areas. Onboarding respects both OS reduced motion and the application's `data-reduce-motion` preference. The offline demo banner participates in document flow rather than overlaying narrow-screen content.

Native onboarding CAS/handoff writes now use guarded `INSERT OR REPLACE ... SELECT` rather than UPSERT. The guard requires either a genuinely absent target or the exact previously read value; handoff also requires the exact source. `local_meta` has no dependent foreign-key records. This makes these writes compatible with the older system SQLite shipped on the supported Android floor without weakening concurrent-write protection.

Android version is 1.7.0 / build 11. The obsolete sample instrumentation test had the wrong package ID; it is replaced by installed-package tests that check the real package, local Capacitor configuration, JS/CSS inclusion, illustration manifest byte lengths/hashes, disk reopen, stale writes, guarded atomic handoff, account isolation and retained-history preservation. The test SQL fixture is generated from production exports before building the test APK.

`onboarding-phase7.yml` builds the production-assets debug APK and its instrumentation APK in the same job so signatures match. It verifies the APK signature and records SHA-256. Android API 24 and 35 jobs install that exact downloadable APK, disable Wi-Fi/data, and run the package/SQLite tests. No emulator fixture account is compiled into the delivered APK. The debug APK is a test installation artifact, not a store-signed release.

## Evidence status

- Local: 28 onboarding tests, TypeScript and targeted lint passed before publication.
- Live application commit: `dc40a348d8c8ad9fc0992ac616e00b8c6fdaf334`; release workflow `38536266525` passed all 1,285 regressions, TypeScript, lint, build, Worker size (3.343 MiB), SSR, migration rehearsal and live authentication/health gates.
- Browser: all 16 shared screen variants inspected in the five viewport classes; no horizontal overflow after the scoped minimum-width fix. Review Edit controls measure 44 pixels and the main action 48 pixels. Book entry, carousel endpoints and academic radio navigation work from the keyboard. Phone level and desktop feature compositions were visually compared with the design system; the SVGs remain documented interpretations of the original illustration, not pixel-identical 3D art.
- Installed-package workflow `38536264598` passed on Android API 24 (AOSP) and API 35 (Google APIs), using the exact same downloadable APK. Both installed the production-assets APK and matching instrumentation APK, disabled Wi-Fi and mobile data, and passed both native tests. An earlier API 24 shell failure was diagnosed as missing `CHANGE_WIFI_STATE`; root is used only in disposable test emulators, with no app permission added.
- Final downloadable APK from `38536264598`, source `dc40a348d8c8ad9fc0992ac616e00b8c6fdaf334`: version 1.7.0/build 11; 4,505,357 bytes; SHA-256 `d3304532d86c23d42ce0e56024b0813c53200f9ef42a7ba1d6a3e62d16026ab3`. It passed install/assets/storage tests on both Android versions. APK signature verification passed; extracted bytes match the CI checksum.
- Scope of Android instrumentation: installed assets and native storage. It does not certify touch/swipe gestures, keyboard/rotation behavior, cold first-launch rendering or provider login on a physical device.
- Fresh/completed accounts, retained guests, legacy setup, ownership, conflict/retry and recovery-proof protections remain covered by repository regressions and release authentication gates. This does not substitute for end-to-end visual checks of each account state on actual devices.
- Full physical-device and iOS install certification remains open. The test APK uses a CI debug signing identity; updating an older APK with retention of its installation data is not certified. Do not recommend uninstalling an older app as an update workaround.

## Completion boundary

Web responsive review, accessibility corrections, release regressions and Android installed-assets/storage certification are complete. Full Phase 7 remains partial: native cold first-launch rendering, gestures, keyboard/rotation state, fresh/existing/guest visual transitions, and signed upgrade retention still need interactive Android/device verification. The available browser environment does not expose an Android UI, so no such result is inferred from instrumentation asset tests.
