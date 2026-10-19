# Phase 2 local verification and release tracking

Release branch: `onboarding-design-phase7`.

## Local evidence

- 1,436 automated tests passed; TypeScript, ESLint and Next.js production build passed.
- On-page format checks passed at 320, 390, 768, 820, 1024 and 1440px. The checks cover add/reorder operations, stable identities, explicit signed subtotals, multiple selected cells, live updates, safe colours/dimensions, undo, drag/drop, resize cancellation, exact local draft reopening, nested and neighbouring tables, and saved/exported content.
- Broad Notes browser regression covers existing CA formats, figures, precision, total configuration, charts/trees, object controls, anchored ink, save races/failures, offline recovery, legacy RTL and merged tables.
- New portrait and landscape A4 exports were generated and visually reviewed. Cell colours, row height/style, numeric formatting and column proportions remain visible; authoring controls are absent.
- The 20-table/60-edit benchmark recorded a 1.5 ms median, 2.5 ms 95th percentile and one full-document snapshot. Continuous checkpointing and exact hidden-page flush also passed. This is command-execution timing in headless Chromium, not a hardware pen or mobile input-to-paint measurement.

## Publication boundary

The Resources verification/release workflow repeats the complete repository and browser checks before deployment, then verifies the deployed authenticated save/reopen and stored HTML through the isolated fixture. New live assertions cover width, row height, cell colours/borders, row roles and column proportions. A commit or successful local build alone does not establish that this update is live; check the workflow for the application commit before reporting production completion.

Phase 1 application commit `dac65e2685661079cfa21528f2091117d2fcee1d` completed deployment and live checks in workflow https://github.com/Dellybizz/ca-progress-v2/actions/runs/39077909853 before this update was published.

## Production verification — 18 October 2026 IST

Application commit: `0b5f0c85b8eb5869b555ce2952173a873130ad28`.

- [Resources release](https://github.com/Dellybizz/ca-progress-v2/actions/runs/39079553934): verification and deployment succeeded.
- CI passed all 1,436 tests, type checks, lint, build, complete Resources/Notes regression and the six-width inline-format suite. CI benchmark: 0.9 ms median, 1.5 ms 95th percentile, one snapshot for 60 edits; continuous checkpoint and hidden-page flush passed.
- Worker size/runtime checks and the private database backup/restore rehearsal passed.
- Live normal-account note creation and exact D1 JSON roundtrip passed, including `autoTotals`, table width, row height/roles, cell fill/border and column widths. Stored HTML retained the new styles and proportional column group; editor reopening, Resources discovery, A4 orientation update, stale-save refusal and private export boundaries passed.
- The isolated upload fixture completed all three parts, idempotent retry and exact private download; fixture records and bytes were cleaned up.
- Web Worker version: `2d56c531-ca1c-42df-ab06-a3c67ca6cf93`; compressed size 3801.81 KiB (3.713 MiB), below the 3.75 MiB guard.
- Preview Worker version: `f2630a9d-7659-46a8-837a-76edf6521d04`.

Phase 2 is live. Phase 3 direct chart/hierarchy editing was paused at the user's request; its unpublished draft remains separate from this release.
