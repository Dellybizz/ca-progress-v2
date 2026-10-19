# Phase 4 release — catalogue and linked personal workings

Completed and deployed on 18 October 2026.

Application commit: `f1d0b104f2f5ae64847c4e9c5089f001596ce491`.

[Verified release run](https://github.com/Dellybizz/ca-progress-v2/actions/runs/39124096655) — verification and deployment succeeded.

## Delivered

All 24 accounting families / 71 variants now use semantic widths and direct row/column controls. Remaining paired account families have independent sides; partner, department, investment, quantity/rate and text-heavy workings have specific layouts. Manual mode remains the default. Known totals use explicit definitions; balancing entries and tax calculations remain writable.

Linked working notes have stable targets, document-order W.N. numbers, return links and missing-target warnings. They accept writing, tables and charts, and survive reordering and export. My formats captures linked workings, remaps identities in copies, supports blank figures and duplication, and provides atomic import/export for explicit transfer between devices. Personal collections remain scoped to the account/context on each device.

## Verification

- All 1,477 tests, TypeScript, ESLint, production build, D1 index validation and native bundle passed.
- Catalogue/working-note checks passed at 320, 390, 768, 820, 1024 and 1440 px. Coverage includes all accounting variants, independent sides, creation/navigation/reordering, formats inside workings, linked reuse, portable imports, save capabilities and portrait/landscape print output.
- All existing Resources/Notes browser regressions passed, including hierarchy, charts, ink, financial controls, paste/reuse and legacy imports.
- Existing 20-table/60-edit CI benchmark: 0.8 ms median and 1.2 ms 95th percentile, one continuous checkpoint and an exact hidden-page draft. These are headless command timings, not physical input latency.

## Production evidence

- Live app-config reported the expected application commit.
- Normal-account verification passed exact D1 JSON, working targets/numbers/return links in safe HTML, editor reload, orientation update and private export boundaries. A client lacking linked-working-note capability was refused without overwriting the note.
- Worker runtime/size checks and private backup restore passed. Web Worker: 3.720 MiB compressed, below the 3.75 MiB repository guard.
- Web version: `9a8310f7-d66e-463b-91c0-e94325264d1c`. Preview processor: `78cb9b57-9173-4ab0-97bd-798d5c930ea7`.
- Private upload/download, resource revision/undo, moderation and fixture cleanup passed.
- [APK workflow](https://github.com/Dellybizz/ca-progress-v2/actions/runs/39124093516): packaging and Android API 24/35 package/storage jobs passed. The API 35 job initially failed at adb startup before app tests; retry succeeded.

Live entry: https://ca-progress-v2.habeebaasif622.workers.dev/notes/new

Physical Android Chrome/WebView and iOS Safari certification and broader task-based validation remain Phase 5. Emulator package checks do not certify physical-device editing behavior.
