# Phase 2: direct movement and resizing

The register uses one shared selection overlay for charts, images, tables, accounts and ink. Eight edge/corner handles and visible drag controls replace the table width slider. The movement strip occupies its own toolbar row. Controls stay at a usable physical size when the page is zoomed; off-screen edges have visible resize proxies within the canvas.

Objects remain in text flow by default. Top-level objects that fit a page can switch to free placement, with page-local coordinates, guide snapping and keyboard nudging. Oversized workings retain normal flow. Proportions can be locked. Column boundaries resize adjacent columns; selected rows have a height grip. Whole-account resizing preserves both tables.

Pointer capture is shared across mouse/touch gestures, including financial row/column reordering and hierarchy node movement/resizing. Pointer previews change only the DOM. Release commits one history step. Escape, pointer cancellation/loss, blur, stale documents and read-only transitions cancel previews. Stable IDs and formulas survive row/column moves.

The structured document remains canonical. New position/proportion attributes are validated, saved and exported. The write capability guard prevents older clients overwriting these settings. Print layout reapplies free placement after fonts/images load. Existing flow documents remain compatible.

## Verification

The release workflow runs the complete unit/type/lint/build checks and existing Notes browser suites. A new manipulation suite adds desktop and emulated touch viewports at multiple zoom levels, resize/move preview isolation, cancellation, undo, persistence, read-only transition, column/row sizing and real Chromium touch row dragging. It runs in Chromium and WebKit before deployment. Signed-in production verification checks placement/proportion persistence and old-client rejection.

Physical Android/iOS certification and the offline APK editor remain separate open gates. Browser emulation does not certify physical device parity.
