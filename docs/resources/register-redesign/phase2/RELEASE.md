# Phase 2 release evidence

Application commit: `e9ed46a1e0dcf9c8be20287c8111540100e1214c`
Release workflow: https://github.com/Dellybizz/ca-progress-v2/actions/runs/39168445366
Verification: PASS — job 117796268084; 1,492 tests, typecheck, lint, build, D1 validation, native bundle and all browser regression suites.
Browser certification: PASS — job 117796268222; Chromium and WebKit certification at six layouts, register checks and manipulation at three zoom/viewport combinations.
Deployment and signed-in persistence: PASS — job 117798452438; Worker runtime/size checks, backup restore, publication, deployment SHA and signed-in D1/R2 roundtrip.
Worker version: `727b044b-fff7-4d2f-aeb5-63523076d40c`. Web Worker compressed size: 3.722 MiB / 3.75 MiB guard. Preview Worker: `f914963c-4174-478c-9b7e-d3903c1168df` (0.498 MiB).

Local verification: 1,492 tests; TypeScript and ESLint; six-width complete Notes workflows; six-layout Chromium certification; row and column reordering with real Chromium touch events at 390px and 820px; manipulation/preview/cancel/undo/persistence at 50%, 75% and 100% zoom; page-two print positioning; existing financial checks at 320–1440px. Performance fixture: 20 tables, 60 edits, 1.4 ms median and 2.9 ms p95. These measurements are local fixture results, not a guarantee on physical phones.

Selection controls now occupy a dedicated strip and avoid table action buttons, diagram elements and the ink drawing surface. The visible east-edge proxy remains usable when a working extends beyond the viewport; off-screen overlapping handles are hidden. Short landscape layouts replace the redundant chart action row with the movement controls. Handwriting insertion after a selected diagram preserves the diagram.

The production workflow additionally verifies the new placement/proportion capability guard with an older client, exact structured persistence, HTML export, reload, and cleanup of test records.

Physical Android/iOS testing and offline APK rich-editor parity remain open separately. Phase 3 contextual menus and complete hierarchy-branch copying are next.

The remote performance fixture also passed with 2.3 ms p95. No database migration or Worker size-budget increase was needed for these editor changes.
