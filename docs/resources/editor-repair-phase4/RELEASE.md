# Phase 4 verification and release tracking

Release branch: `onboarding-design-phase7`.

## Local evidence

- 1,450 repository tests pass. New cases cover quoted spreadsheet text, range limits, exact financial precision/styles/identity retention, axis growth, invalid/merged atomic rejection, independent/blank template copies, owner/context isolation, duplicate-name limits, corrupt storage and resource-bound refusal.
- TypeScript, ESLint and Next.js production build passed.
- The six-width workflow browser suite covers real clipboard events, paste/undo/redo, exact amounts, merged/invalid rejection, keyboard navigation, control undo, reusable table/diagram save/rename/insert/delete/undo, blank figures, draft reopening and device-collection reopening. Widths: 320, 390, 768, 820, 1024 and 1440 px.
- Existing broad editor regression and both inline financial/object suites pass across the same six widths. Legacy import, mixed content, save races/failures, recovery, ink, direct graph gestures and financial totals remain covered.
- The 20-table/60-edit benchmark used one snapshot and one continuous checkpoint; the hidden-page draft matched exactly. Local command timings: 0.9 ms median and 1.5 ms 95th percentile. These are headless command timings, not physical input-to-paint measurements.
- Portrait and landscape A4 outputs were visually reviewed, including a 1600px editor-height diagram. Figures fit printable areas and financial styling is retained without authoring controls.

## Release boundary

The Resources release workflow repeats all repository and complete Resources/Notes browser checks, including `scripts/notes/workflow-check.mjs`, before publishing the exact verified build. It then asserts the expected live commit, runtime boundaries, exact normal-account structured-note storage/reopen/export and private file roundtrip/cleanup. No claim of production completion is made until those steps succeed. The new reusable collection is device-scoped; server assertions apply to inserted note content through the unchanged structured-note protocol.

## Production verification — 18 October 2026 UTC

Application commit: `6d26e5683011fef5ca3395ecb122c525429fc415`.

- [Resources release](https://github.com/Dellybizz/ca-progress-v2/actions/runs/39086021925): verification and deployment succeeded.
- CI passed all 1,450 tests, type/lint/build, database/native checks and complete Resources/Notes browser regression. All six widths passed for workflow paste/reuse/shortcuts/printing and the existing financial/object suites. CI performance: 1.0 ms median, 1.8 ms 95th percentile, one snapshot for 60 edits; continuous checkpoint and exact hidden-page draft passed.
- Worker runtime/size validation and private backup restoration passed. Web version: `be6d4055-150b-44c7-af11-ec9908646b86`, 3803.32 KiB compressed (3.714 MiB), below the 3.75 MiB guard. Preview version: `15a7288b-ddeb-48f9-a60d-39285d25c1e3`.
- The deployed app reports the expected commit. The normal-account fixture passed exact D1 structured-note roundtrip, stored HTML/editor reopening, chart/graph styles and identities, Resources listing, orientation update, stale-save refusal and private export boundaries.
- Three-part upload, idempotent retry, exact private download, file-manager revision/undo and Community moderation boundaries passed; test resources and bytes were cleaned up.

Phase 4 is complete and live at https://ca-progress-v2.habeebaasif622.workers.dev/notes/new. My formats remains an explicitly device-scoped collection; inserted content is saved normally with notes.
