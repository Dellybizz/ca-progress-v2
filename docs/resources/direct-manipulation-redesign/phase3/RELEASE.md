# Phase 3 release — direct accounting workings

Completed and deployed on 18 October 2026 UTC.

Application commit: `bfbc59671b524dd1206b90f99726a94a3564f59e`.

[Verified release run](https://github.com/Dellybizz/ca-progress-v2/actions/runs/39121984660) — verification and deployment succeeded.

## Verified behavior

New journals, P&L, balance sheets and ledger accounts have semantic column widths, row/column boundary insertion and explicit Manual/Assisted modes. Section totals follow membership as rows grow; signed detail and working-note exclusions avoid double counting. Net P&L results reference group totals. New paired accounts have independent Dr./Cr. tables, aligned under shared controls, with complete paired-account reuse. Existing notes retain their structure and figures.

- All 1,466 tests, TypeScript, ESLint, production build, D1 index checks and native bundle passed.
- The accounting suite passed at 320, 390, 768, 820, 1024 and 1440 px, covering native typing/caret retention, insertion immediately before/after totals, new amount columns/undo, manual overrides, reopening, asymmetric sides, simulated touch selection, My formats, normal saves and viewport bounds.
- Complete existing Resources/Notes browser regressions passed, including direct hierarchy editing, financial inspector, chart/ink editing, spreadsheet paste, saved formats and portrait/landscape print output.
- Existing 20-table/60-edit benchmark: 1 ms median, 2 ms 95th percentile; one snapshot, one continuous checkpoint and exact hidden-page draft. These are headless command timings, not physical input-to-paint measurements.

## Production evidence

- Live app-config reported the expected application commit.
- A normal student account saved asymmetric paired sides and scoped formulas. Exact D1 JSON, safe account HTML, editor reload, orientation updates, stale-save refusal and private export boundaries passed.
- A client advertising only the hierarchy capability was refused with `NOTE_EDITOR_REQUIRED` when attempting to overwrite the semantic accounting note.
- Worker runtime/size checks and private backup restore passed. Web Worker: 3807.72 KiB compressed (about 3.718 MiB), below the 3.75 MiB repository guard.
- Web version: `a61dc3b3-cf3d-4107-a1d0-d9987179d2d1`. Preview processor: `fef950a4-6a22-4be1-b18e-d75f19f35538`.
- Signed-in private upload/download, Resources revision/undo, sharing/moderation and fixture cleanup passed.

Live entry: https://ca-progress-v2.habeebaasif622.workers.dev/notes/new

Physical Android Chrome/WebView and iOS Safari certification remains outstanding. Remaining catalogue formats and linked working-note/personal reuse enhancements remain Phase 4.
