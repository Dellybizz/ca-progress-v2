# Resources design reset — Phase 2

Phase 2 implements the Resources browsing shell from the approved Phase 1 design. Resources stores uploaded files and saved notes; Notes opens an authoring flow. The document viewer and full editor redesign remain Phases 3 and 4.

## Shipped behavior

- Collection navigation is My resources, Community, and ICAI official. It remains visible on mobile. All files, Folders, Recent, Starred and Trash are pending choices inside Filters, with no hydrated navigation portal or fallback row to flash during refresh.
- A single compact breadcrumb shows location. The repeated main heading and shell route trail are removed on Resources. Desktop keeps inline search and one New menu: Upload files, New folder, Create note. Mobile puts New, search, Filters, and grid/list controls on one action row beneath the breadcrumb; search expands in that row. Existing notebook and section operations remain under Folder options.
- Filters use compact chips for the view, one primary sort, direction and file types. Academic selectors appear only when relevant. The duplicate toolbar sort and secondary-sort setting are removed. Grouping, tags, owner, status, dates and saved views remain under More filters. Edits stay in a draft until Apply; closing discards them, and Reset changes only the draft. Layout remains on the toolbar.
- The Resources frame fills the available viewport without the former outer top, bottom, or side gutters. The sidebar stretches through the page, its updates link stays at the bottom, the file canvas scrolls independently, and the bottom controls occupy a defined bottom strip. ResourceViewport measures the actual header, visual viewport, canvas width and visible bottom navigation. The fixed footer uses those measurements, including in a two-file library and when the viewport height changes. A Resources-specific important height/padding rule overrides the legacy global mobile document-scroll rule, which otherwise forces auto height and leaves unused space below a sparse library. Folders and mixed file/note cards occupy the canvas. Counts occur in the bottom strip rather than repeated heading and results totals. The items-per-page selector and zoom bar are removed. Touchscreen pinch, trackpad pinch, and Ctrl/Command + mouse wheel resize the file canvas from 60% to 200%, with owner/context-scoped persistence. Ordinary wheel input scrolls. Browser zoom outside the file canvas remains available. Previous/Next appear only for multiple pages. Reapplying unchanged filters no longer resets pagination, including when zooming on page two.
- Desktop Details and Transfers use one 320px utility column. Expanded panels are mutually exclusive. The transfer indicator remains available with Details open. The upload coordinator stays in the application shell when its visible surface changes.
- Mobile Details uses the existing focused drawer. Transfers uses a bounded, full-width utility surface, with its collapsed indicator above the fixed footer. Controls fit a 320px viewport.
- Resources no longer sends the files-only filter to the workspace API. Existing saved notes participate in its counts, filters, search, cursors, folders, Recent, Starred, and Trash. The optional files-only API scope remains compatible with older consumers.
- `/notes` opens `/notes/new`; the existing Community-to-note draft flow is retained. The new page uses the existing validated editor and save API, displays that notes save in My resources, and preserves valid academic context. Choosing a particular folder for a new note remains available through Resources → Move after saving.
- Resources and Notes use their respective offline snapshot keys. No data migration or deletion is required.

## Verification

- 1,401 automated tests passed, including mixed note/file cursor counts, note type filtering, Trash, and restore.
- Production compilation and TypeScript checks passed.
- Real-component browser journeys passed at 320, 390, 1024, and 1440 pixels: mixed notes/files, stable selection geometry, type filters, authoring entry, uploads, utility dock switching, anchored footer geometry, expanded search, a single mobile action row, visible mobile collection tabs, no transient file-view row, actual header resizing, shorter viewports, sparse two-file libraries, mouse/trackpad and two-touch pinch input, draft cancellation and Apply, zoom persistence, and forward/back cursor navigation through 50 files.
- Existing browser regressions cover back/forward/reload, search focus, layout persistence, keyboard and touch selection, context menus, internal folder/file drag, external upload staging, dirty details, partial results/retry, destination hierarchy, stale-safe undo, real thumbnail loading, and upload recovery across navigation and account changes.
- The full-shell fixture includes the complete production globals.css import tree and the real library flex wrapper, so legacy mobile CSS participates in viewport checks. Frame height and canvas coverage are asserted as well as footer position.
- Review captures disable animations, and filter captures wait for the opening animation to finish and assert full opacity, so the evidence records settled panel geometry. Open Details must stay within viewport bounds; desktop utility panels must occupy a separate column from the canvas.

Release source: `64ef33ff362010c86610b50cd294833836b6a3b0`.

Browser verification: https://github.com/Dellybizz/ca-progress-v2/actions/runs/38932858993 (passed).

Release workflow: https://github.com/Dellybizz/ca-progress-v2/actions/runs/38932857939 (verification and production deployment passed).

Screenshot artifact: `file-manager-browser-64ef33ff362010c86610b50cd294833836b6a3b0`, artifact ID `12059113066`.


## Production release

Web Worker version: `352b7939-9295-480f-a1b3-69c832bc57d8`.

The deployed app-config reports source commit `64ef33ff362010c86610b50cd294833836b6a3b0`. Live checks passed for authentication boundaries, ordinary JSON limits, normal-account sign-in and setup, three real upload parts, idempotent finalization, exact private download, owned hierarchy, move and Trash undo, and stale revision refusal. The temporary fixture resources and original bytes were removed.

Live page: https://ca-progress-v2.habeebaasif622.workers.dev/resources
