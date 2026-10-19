# Register redesign Phase 1 — release verification

Application commit: `3048d5759b8241336fe3fdc85e81df11e3e07495`.

Release run: https://github.com/Dellybizz/ca-progress-v2/actions/runs/39155275386

Released 19 October 2026 (India time). Verification, editor-certification and deployment jobs all passed.

Delivered: facing portrait register pages, selected landscape page, navigation/page creation, zoom, ruled/squared/dotted paper with page-specific overrides, margins and print controls. Existing notes preserve their saved writing view; switch to Register pages in Page setup. New notes default to A4 register view.

Local checks passed: 1,486 tests, TypeScript, ESLint, production build, complete existing Notes browser suite including legacy import and printing, six-viewport editing certification, and the three-viewport register suite. Generated A4 PDFs were rendered and visually inspected. The existing 20-table/60-edit benchmark retained one snapshot and one continuous checkpoint (median 2.2ms, p95 3.6ms, headless command timing).

Final-commit CI evidence: 1,486 tests, TypeScript, ESLint and default production build passed. Database-index rehearsal, native bundle, search benchmark and all existing Resources/Notes browser suites passed. Chromium and WebKit both passed six-viewport editor certification and the three-viewport register suite, including incomplete numeric drafts and custom paper spacing. The CI 20-table/60-edit benchmark measured median 1.2ms and p95 2.1ms, with one snapshot, one continuous checkpoint and an exact hidden draft. These are headless command timings, not physical input latency.

Live deployment evidence:

- Web Worker: `338f905a-44ec-40c2-8949-f500a1b162b5`; preview processor: `c5c705b7-89ef-46b8-8451-6c5777f73524`.
- Compressed web Worker: 3.721 MiB, under the repository's 3.75 MiB guard. Runtime smoke checks passed.
- Backup restore passed; existing notes/uploads were unchanged and foreign-key checks were clean.
- Live app-config reported application commit `3048d5759b8241336fe3fdc85e81df11e3e07495`.
- Signed-in structured-note create, exact D1 roundtrip, editor reload, Resources listing, orientation update, stale-save refusal and private export passed. This fixture includes ruled paper and a page-2 dotted override, confirming both persist without being stripped.
- Chart identities/geometry/style, real upload/download, file-manager operations and Community moderation checks passed. Fixture resources and original bytes were removed.

Open the web editor at https://ca-progress-v2.habeebaasif622.workers.dev/notes/new. Existing notes: Page setup → Writing view → Register pages. Paper settings are in the same panel.

Physical-device validation and full offline APK rich-editor integration remain open under the earlier direct-manipulation certification plan. This release covers the web editor.
