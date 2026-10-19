# Phase 2 release — direct hierarchy editing

Completed and deployed on 18 October 2026 UTC.

Application commit: `8bc0ab4c849bda23f5282528da10453e7d69abc3`.

[Verified release run](https://github.com/Dellybizz/ca-progress-v2/actions/runs/39119737966) — verification and deployment succeeded.

## Verified behavior

- Node-local sibling/child controls, desktop click and double-click, touch hold/release versus movement, direct resizing with moving connector anchors, independent/branch movement, style/size/typography controls, parenting, duplication, locking and undo/cancellation.
- Duplication preserves shape and appearance. Menus use available space outside the node, allowing the next click of a double-click to reach it. A focused label commits before the hidden-page checkpoint.
- The direct hierarchy suite passed in CI at 320, 390, 768, 820, 1024 and 1440 px, including simulated touch hold/drag/pinch, immediate name focus, strict undo-from-field behavior, read-only refusal, saved reopening and safe export.
- All 1,457 repository tests, TypeScript, ESLint and production build passed. Complete existing Resources/Notes browser regressions passed, including financial controls, chart data/style editing, ink, paste/reuse and portrait/landscape print output.
- The existing 20-table/60-edit browser benchmark retained one snapshot and one continuous checkpoint, with an exact hidden-page draft. CI timings were 0.9 ms median and 1.6 ms 95th percentile; these are headless command timings, not physical input-to-paint measurements.

## Production evidence

- Live app-config reported the expected application commit.
- The normal-account fixture passed exact structured-note/D1 roundtrip, per-node dimensions/typography and connector styles in stored SVG/HTML, editor reopening, orientation update, stale-save refusal and private export boundaries.
- A save without the new hierarchy capability returned `NOTE_EDITOR_REQUIRED`; the stored extended hierarchy remained unchanged.
- Worker runtime/size checks and private backup restore passed. Web Worker: 3805.98 KiB compressed (3.717 MiB), within the 3.75 MiB repository guard.
- Web version: `5ce7b2cf-608b-41d2-af6a-3e1287fd1c4d`. Preview processor version: `0019a332-adc3-4fdd-b8ca-67ec9b5e2b32`.
- Signed-in private upload/download, file-manager revision/undo and sharing/moderation checks passed; fixture cleanup completed successfully.

Live entry: https://ca-progress-v2.habeebaasif622.workers.dev/notes/new

Physical Android Chrome/WebView and iOS Safari validation remains outstanding. This release does not claim physical-device or APK certification. Accounting/table redesign remains Phase 3.
