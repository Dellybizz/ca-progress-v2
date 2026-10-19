# Editor repair Phase 4 — Workflow polish and certification

This continues the editor-repair sequence: performance/control reliability, on-page financial formats, then direct chart/hierarchy editing. It is separate from older Notes/offline/handwriting roadmaps.

## Spreadsheet paste

- A clipboard extension handles tab-separated spreadsheet ranges and HTML tables. Quoted tabs/newlines, escaped quotes, CRLF, rectangular padding and trailing empty cells are retained. Plain code-block paste remains text.
- Paste into an existing simple table from the destination cell or the top-left cell of a rectangular cell selection. Add missing rows/columns up to 200 line items and 12 columns; source/target merges are rejected rather than flattened. Outside a table, create a normal editable table.
- Financial pastes retain row/column identities and cell styles. Amounts use canonical exact decimal strings and the working's numeric display style. Overwriting a computed cell replaces that formula; other source relationships remain available to live total recalculation.
- Validate the complete range before committing. Invalid numeric cells, uncalculated numeric spreadsheet expressions, oversized ranges/notes and nested/merged sources leave the existing document untouched and show a dismissible error.
- Commit the range in one history step. Undo/redo restores the complete previous state; the cursor returns to the destination cell. No clipboard formula is evaluated.

## My formats

- Available from CA Formats and More note options. Select a table cell or diagram to capture its actual structure, captions, colours, dimensions, totals and chart model.
- Save, search, rename, insert and delete/undo formats. Financial figures are blank by default while labels/styles/formula sources remain; users may retain figures instead. Insert independent block identities, preserve scoped formulas and remap internal caption/link ownership. Template insertion has its own undo boundary.
- Store up to 20 formats and 1 MB per account/study-context on the current device. Entries are versioned and schema-validated. Unsupported/resource-bound content is refused; there is no copying of attachment permissions. Duplicate names are rejected; corrupt/unavailable/quota-exhausted storage does not silently overwrite the collection or note.
- Cross-tab storage events refresh the open collection. This is a device collection, not a cloud-synced template service. The UI states this boundary; once inserted, content uses the note's existing local draft/cloud-save/reopen/export path.

## Input and output polish

- Undo/redo from financial controls; Escape closes the contextual panel and restores editor focus. Save/find shortcuts bubble to the studio from table/chart controls. Row/column arrow controls remain keyboard and touch alternatives to dragging.
- A4/Letter/custom print uses actual printable dimensions to bound tall diagram/ink SVGs. Explicit editor height does not force oversized printed figures. Financial text can wrap in narrow print columns; repeated headers and row break protection remain. Page setup explains landscape use and actual print pagination.
- The isolated tablet preview no longer forces a full-width main element in addition to its reserved navigation rail. This fixes the test fixture's off-screen header and tests the remaining editor width honestly.

## Boundaries

No database migration, protocol change or dependency was added. Existing notes and Phase 2–3 attributes are unchanged. Clipboard HTML contributes cell text, not arbitrary markup/scripts/styles. Physical Android/iOS keyboards, native clipboard integration and stylus hardware are not certified by headless touch/pointer contexts. Cloud synchronization or portable export of the format collection itself is outside this device collection; inserted note content is persisted normally.
