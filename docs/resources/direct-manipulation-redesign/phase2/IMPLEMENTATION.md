# Phase 2 — direct hierarchy editing

Implemented in the existing Tiptap diagram NodeView. This phase replaces the hierarchy interaction surface; accounting/table changes remain Phase 3.

## Interaction

- Side plus adds a sibling under the same parent; a root sibling is another root. Bottom plus adds a child. New elements avoid existing bounds without rearranging existing elements, and focus their text immediately.
- Mouse click opens an anchored element menu. Touch tap selects and reveals controls; a 500 ms hold opens the menu and keeps it open on release. Moving 8 px cancels the hold and drags; mouse movement threshold is 4 px. The selected element also has a visible options button. Menus use the available side/above/below space to avoid intercepting a double-click on the node.
- Move one element by default. The explicit branch option moves descendants together. Relationships do not change with visual position.
- Selected elements have northwest/southeast resize handles and numeric size alternatives. Per-node size, fill/border/text colour, shape, font size and alignment persist. Connector anchors follow resized bounds for rectangles, ellipses and decisions.
- Menu includes text, fit to text, duplicate, child/sibling, parent, collapse/expand, position lock, delete element and a separately confirmed delete-branch action. Deleting one element retains its child branches; its direct children become roots. Last-element deletion is refused.
- Connections expose local label, colour, straight/elbow, solid/dashed, endpoints and delete. Hierarchies reject cycles/second parents; flowcharts retain general graph relationships.
- Blank-canvas dragging pans; two-finger background gestures zoom/pan. Explicit zoom and Fit remain available. Viewport navigation is local and does not alter saved geometry. Ordinary page navigation remains outside the embedded canvas.
- Arrow keys move, Shift increases the step, F2 edits, Enter/Space opens options, Escape cancels previews/closes options; Ctrl/Cmd Z/Y supports undo/redo. Text edits commit on blur as one step, or before the note’s hidden-page/pagehide checkpoint if the field is still focused. Move/resize previews dispatch no editor transaction and commit once on release; cancellation restores the original.

## Persistence and compatibility

Optional bounded fields extend graph nodes without rewriting legacy models: width 80–600 (default 150), height 40–400 (default 64), font size 10–32 (default 12), alignment and boolean position lock. Existing IDs, positions, colours and connections are retained. Unknown/unsafe fields, sizes, colours, invalid relationships and oversized models fail validation. SVG/HTML export uses the same geometry without authoring controls.

New saves advertise `hierarchy-node-geometry-v1` in the request body, including offline queued writes. Updating a saved extended hierarchy without that capability returns `NOTE_EDITOR_REQUIRED`/409 before writing, preventing older editor HTML fallback from losing geometry. No D1 migration is required. Read-only editors expose no local controls and cannot change the graph.

## Verification

- Seven additional model/compatibility tests; 1,457 repository tests passed during this phase.
- Direct hierarchy browser suite: real editor at 320, 390, 768, 820, 1024 and 1440 px. Exact add relationships, immediate text edit, local options, styles/sizes, moving/resizing/anchors, one-step undo, Escape, branch movement, lock, keyboard, read-only refusal, background navigation, saved reopening and safe export. CDP touch simulation at 390 px covers hold/release, drag and pinch.
- Existing six-width chart/object and broad editor suites pass, including cancellation, legacy import, structured saving and portrait/landscape vector output. Baseline 20-table/60-edit benchmark retained one snapshot and one checkpoint (1.3 ms median, 2.8 ms 95th percentile in the local headless run; not physical input latency).
- The release workflow runs the new direct suite before deployment. Its normal-account live fixture now verifies exact geometry/style storage and SVG output, reopening and old-editor write refusal, then cleans up fixture data.

Physical Android/WebView and iOS Safari checks remain outstanding. Browser emulation is not hardware certification. Deployment status and exact commit/run belong in RELEASE.md once verified.
