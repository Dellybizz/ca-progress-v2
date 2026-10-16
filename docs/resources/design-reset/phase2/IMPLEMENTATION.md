# Resources design reset — Phase 2

Phase 2 implements the Resources browsing shell from the approved Phase 1 design. Resources stores uploaded files and saved notes; Notes opens an authoring flow. The document viewer and full editor redesign remain Phases 3 and 4.

## Shipped behavior

- Personal navigation is All files, Folders, Recent, Starred, and Trash, with Community and ICAI official separated below it on desktop. Mobile restores two visible navigation rows: My resources / Community / ICAI official, then the five personal views. All collection labels fit at 320px.
- A single compact breadcrumb shows location. The repeated main heading and shell route trail are removed on Resources. Desktop keeps inline search and one New menu: Upload files, New folder, Create note. Mobile puts New, search, Filters, and grid/list controls on one action row beneath the breadcrumb; search expands in that row. Existing notebook and section operations remain under Folder options.
- The filter dialog presents sort/order, file types, academic context when available, and Important. Grouping, secondary sort, tags, owner, status, dates and saved views are collapsed under More filters. Layout stays in its toolbar. Selection replaces the tools row at the same height. Secondary actions remain in More; keyboard and context menu behavior are preserved.
- The Resources frame fills the available viewport without the former outer top, bottom, or side gutters. The sidebar stretches through the page, its updates link stays at the bottom, the file canvas scrolls independently, and the bottom controls occupy a defined bottom strip. ResourceViewport measures the actual header, visual viewport and visible bottom navigation instead of relying on a guessed header height. Folders and mixed file/note cards occupy the canvas. Counts occur in the bottom strip rather than repeated heading and results totals. The items-per-page selector is removed. Zoom out, slider, zoom in and a percentage resize cards and rows from 60% to 160%, with owner/context-scoped persistence. Previous/Next appear only for multiple pages. Reapplying unchanged filters no longer resets pagination, including when zooming on page two.
- Desktop Details and Transfers use one 320px utility column. Expanded panels are mutually exclusive. The transfer indicator remains available with Details open. The upload coordinator stays in the application shell when its visible surface changes.
- Mobile Details uses the existing focused drawer. Transfers uses a bounded, full-width utility surface, with its collapsed indicator above the fixed footer. Controls fit a 320px viewport.
- Resources no longer sends the files-only filter to the workspace API. Existing saved notes participate in its counts, filters, search, cursors, folders, Recent, Starred, and Trash. The optional files-only API scope remains compatible with older consumers.
- `/notes` opens `/notes/new`; the existing Community-to-note draft flow is retained. The new page uses the existing validated editor and save API, displays that notes save in My resources, and preserves valid academic context. Choosing a particular folder for a new note remains available through Resources → Move after saving.
- Resources and Notes use their respective offline snapshot keys. No data migration or deletion is required.

## Verification

- 1,401 automated tests passed, including mixed note/file cursor counts, note type filtering, Trash, and restore.
- Production compilation and TypeScript checks passed.
- Real-component browser journeys passed at 320, 390, 1024, and 1440 pixels: mixed notes/files, stable selection geometry, type filters, authoring entry, uploads, utility dock switching, anchored footer geometry, expanded search, a single mobile action row, visible mobile tabs, actual header resizing, zoom sizing and persistence, and forward/back cursor navigation through 50 files.
- Existing browser regressions cover back/forward/reload, search focus, layout persistence, keyboard and touch selection, context menus, internal folder/file drag, external upload staging, dirty details, partial results/retry, destination hierarchy, stale-safe undo, real thumbnail loading, and upload recovery across navigation and account changes.
- Review captures disable animations, and filter captures wait for the opening animation to finish and assert full opacity, so the evidence records settled panel geometry. Open Details must stay within viewport bounds; desktop utility panels must occupy a separate column from the canvas.

Release source: `2a7750ce27b6b2385af31a525ad2e6d5d40efb43`.

Browser verification: https://github.com/Dellybizz/ca-progress-v2/actions/runs/38926400399 (passed).

Release workflow: https://github.com/Dellybizz/ca-progress-v2/actions/runs/38926400503 (verification and production deployment passed).

Screenshot artifact: `file-manager-browser-2a7750ce27b6b2385af31a525ad2e6d5d40efb43`, artifact ID `12056614254`.


## Production release

Web Worker version: `e688e850-7d26-4d33-b221-a9d0672479e1`.

The deployed app-config reports source commit `2a7750ce27b6b2385af31a525ad2e6d5d40efb43`. Live checks passed for authentication boundaries, ordinary JSON limits, normal-account sign-in and setup, three real upload parts, idempotent finalization, exact private download, owned hierarchy, move and Trash undo, and stale revision refusal. The temporary fixture resources and original bytes were removed.

Live page: https://ca-progress-v2.habeebaasif622.workers.dev/resources
