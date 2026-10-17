# Editor repair Phase 2 — in-page accounting formats

## Delivered interaction

Selecting a table reveals controls attached to that table, inside the writing surface. The previous duplicate table toolbar is removed. The Format settings dialog remains an advanced option; ordinary structure, styling and subtotal edits do not need it.

- Insert a line item below the selection, append at the bottom, insert or append columns, add section headings and working-note rows. New rows/columns receive stable identities and focus moves to the new content.
- Rearrange rows and columns using arrows or desktop drag handles. The header stays first. Values, precision, marks and total references move with their identities.
- Arrange exposes insertion before the selection, merge/split, header toggle, deliberate deletion, row roles and dimensions, column kinds and widths. Unavailable commands are disabled. Numeric dimension fields accept intermediate typing and commit valid values on blur/Enter; Escape restores the old dimension.
- Style changes cell fill/border colours (including multiple selected cells), table border pattern, spacing and decimal display directly. Source precision remains retained.
- Add an explicit subtotal from the selected line item or selected rows. Choose calculation columns and signed source rows in the attached Sources panel; edits apply immediately. Newly inserted subtotals enable optional Live totals for that working. Existing documents retain their previous opt-in behavior.
- Live totals use exact decimal arithmetic. Invalid amounts, deleted sources and circular references remain visibly stale instead of becoming zero. Directly typing into a computed amount replaces that cell's formula. Sources can repair missing rows by selecting valid replacements.
- Resize native columns, set minimum row heights, change table width via a slider or drag handle. Pointer previews stay in DOM until release; drag cancellation restores the saved width, and completed resizing is undoable. Column minimum widths can require horizontal scrolling.

## Persistence and architecture

No database migration or new dependency. Added validated structured attributes for row roles/heights, cell colours and table width, plus optional `autoTotals` inside existing format configuration. Hex colours, dimensions, enums and configuration keys are validated on the server. Arbitrary CSS remains rejected.

Portals target non-editable TableView hosts. Editing controls never become document content, word-count text, saved HTML or PDF content. Only the selected table computes its control state. Unchanged tables keep Phase 1's structural-sharing fast path. Changed tables, including nested formats, normalize and recalculate from the end of the document so replacement sizes cannot corrupt later table positions.

Saved JSON retains dimensions and styling. HTML/PDF output renders colours and row styles, repeats table headers and represents resized columns proportionally so A4 export can fit the available page width.

## Verification

- Three additional unit tests cover ID-preserving movement and exact decimals, signed source edits, preserved working-note marks, safe styling/dimensions, merged-table guards, immutable failures and rejected unsafe attributes.
- Six-width interaction checks cover insertion, reordering, live totals and source signs, colours, numeric field typing, dimensions, deletion/undo controls and saved/exported content. Desktop and 390px checks exercise real HTML drag/drop and pointer resize/cancellation. Device draft reopening preserves exact JSON.
- Multiple-table and nested-table checks ensure recalculation cannot overwrite neighbouring content. Portrait and landscape A4 exports were generated and visually reviewed.
- Existing broad Notes browser coverage retains format settings, charts, handwriting, failures, offline recovery and legacy RTL/merged-table imports.
- The production upload/note fixture now verifies exact D1 JSON roundtrip and stored HTML for the new dimensions, colours, roles and live-total configuration after deployment.
- Full test/type/lint/build results and release status are recorded in RELEASE.md.

## Boundaries

Structural reordering needs unmerged rectangular tables; merge/split and native resize remain available in Arrange. Financial workings retain the existing maximum of 200 line items, 12 columns and 80 source terms per total. Desktop drag is supplemented by buttons for touch devices. Physical Android keyboard and hardware stylus certification remain outstanding.

Chart data grids, hierarchy child/sibling controls and connector manipulation remain Phase 3. This phase does not add those interactions or spreadsheet formula syntax.
