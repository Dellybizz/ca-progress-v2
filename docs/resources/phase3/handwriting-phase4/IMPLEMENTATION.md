# Phase 4 — Writing and annotation

## Delivered behavior

Insert → Handwriting adds a vector drawing block at the current caret (after the enclosing table/list when the caret is nested), alongside text, CA formats and charts. Each block has an editable accessible label and stable document block identity. Pen, translucent highlighter, straight line, rectangle and ellipse tools share colour and stroke-width controls. Stroke erasing, polygon lasso, drag movement, selection shrink/enlarge, arrow-key movement, selection deletion and whole-block deletion use the editor's undo/redo history. Drawing width is configurable after insertion. No raster copies, extra uploads or new database migration are required.

Text mode permits normal scrolling and browser pinch zoom. Mouse/pen input draws only with a drawing tool selected. Fingers navigate by default; Finger draw explicitly enables touch drawing. Active gestures use pointer capture and coalesced samples with a fallback. Pressure is retained and rendered in four width bands. Escape, pointer cancellation, capture loss, tool changes and view destruction discard unfinished previews. Only the active pointer can cancel its gesture. Browser/device palm rejection is not guaranteed.

## Anchoring and persistence contract

Ink is anchored to its own content block, including when inserted within a table cell. The block moves with document flow; nearby typing cannot detach its strokes. Coordinates remain on a fixed 1000 × 600 vector surface; resizing, working-width changes and portrait/landscape reflow scale the entire block without modifying geometry. This is an independent drawing surface, not a free-floating overlay attached to a chart pixel or an annotation layer on an imported PDF.

Committed gestures are single document history operations and enter the existing owner/context-scoped IndexedDB draft, guarded server save, stale-write protection and JSON export pipeline. The validated server renderer emits vector SVG for the read-only reader and printing. Each drawing is limited to 400 strokes and 4,000 total samples; document-wide size limits continue to apply. Invalid shapes, attributes, identifiers, colours, pressure and coordinates are rejected before rendering. Pasted SVG cannot create an ink block. Older editors refuse unknown structured content instead of flattening it.

## Verification and remaining certification

Automated protocol tests exercise exact round trips, safe SVG/label rendering, malicious attributes, finite geometry, limits, pressure retention, hit testing, lasso membership and constrained transforms. The actual browser suite exercises all tools, undo/redo, moving/resizing, deletion, cancellation, explicit touch mode, pressure input, editing nearby, six responsive widths, offline recovery and vector A4 output. The release workflow additionally creates an isolated authenticated production note containing typed content, CA workings, charts and ink, asserts exact D1 JSON and rendered vector HTML, reloads, changes orientation and rejects a stale write. Test fixture cleanup follows the existing release mechanism.

Physical tablet/phone/stylus testing remains an explicit certification gate. Desktop pointer/touch emulation does not certify real pen latency, palm rejection, native keyboard interactions or all browser zoom combinations. PDF-file overlays, recognition, ink-to-text, incremental history and native editor parity are outside this delivery. Phase 5 retains long mixed-content, cross-device and export certification.

Primary implementation references: https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events and https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent/getCoalescedEvents .
