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
