# Phase 5 — automated hardening release

Released on 18 October 2026. Automated release gates passed. Overall Phase 5 sign-off remains conditional on the full offline APK rich-editor integration and physical-device/user-task validation listed in CERTIFICATION.md.

Application commit: `d169e09a19d40eca1413fdf1afa644d162c2f5d2` (includes native safety changes from `60110ba370e2386bb1434a760486870500134ec0`).

[Verified release run](https://github.com/Dellybizz/ca-progress-v2/actions/runs/39143550742): verification, editor-certification and deployment all succeeded.

## Delivered fixes

- Numeric spreadsheet paste into an assisted total preserves the student's pasted figures as a manual row, with exact precision, atomic errors and undo.
- Phone insertion controls have 44-pixel targets, correct gutters and visible limits. WebKit's touch click path is preserved. Reference headers wrap in compact columns.
- Live read-only changes remove financial controls and placeholders; stale actions and clipboard events cannot mutate the note through those handlers.
- Destructive native table commands cannot leave an independent account with an invalid replacement side.
- The APK's plain-text editor protects known formatted notes before local note/outbox writes, shows a read-only preview and offers the full web editor. Plain notes remain editable offline. This is a safety guard, not full rich-editor parity.
- Android emulator startup retries the observed transient adb-root failure while retaining persistent-failure behavior.

## Verification

- All 1,482 tests, TypeScript, ESLint, the default production build, D1 indexes and native bundle passed.
- Chromium and WebKit certification passed at 1440×1000, 390×844, 320×740, 820×1180, 844×390 and 1024×768. Reports record physicalDevice:false. Coverage includes actual touch taps on insertion controls, paste/undo, read-only transitions, account-side protection, limits, node-local geometry and working-note links.
- The full existing Resources/Notes browser regressions passed, including Chromium touch hold/drag/pinch, diagrams/charts, financial controls, catalogue/reuse, background recovery, safe export and portrait/landscape print output.
- Existing 20-table/60-edit CI benchmark: 1 ms median, 1.9 ms 95th percentile, one snapshot/continuous checkpoint and an exact hidden-page draft. These are headless command timings, not physical input-to-paint latency.
- [APK workflow](https://github.com/Dellybizz/ca-progress-v2/actions/runs/39143243831) passed packaging and API 24/35 package/storage checks for the matching native changes. The later touch fix changes web controls, not the native notes implementation.

## Production evidence

- Live app-config reported the expected application commit.
- Normal-account exact D1 roundtrip, working references/return links, safe HTML, editor reload, stale-save refusal, private export and older-editor refusal passed.
- Worker runtime/size and backup restore checks passed. Web Worker: 3.720 MiB compressed, within the 3.75 MiB guard. Restore verified existing notes/uploads unchanged and zero foreign-key violations.
- Web version: `6bca2a47-814c-4bae-b9d8-1b21bf17a99d`; preview processor: `91dcbcf2-1df6-4cc7-94d3-c661df5e456d`.
- Private upload/download, file-manager revision/undo, moderation and fixture cleanup passed.

Live entry: https://ca-progress-v2.habeebaasif622.workers.dev/notes/new

Remaining: full rich editor and structured offline persistence in the APK; physical Android Chrome/WebView and iOS Safari checks; representative student tasks. No connected physical device was available, and no complete Phase 5/device-parity certification is claimed.
