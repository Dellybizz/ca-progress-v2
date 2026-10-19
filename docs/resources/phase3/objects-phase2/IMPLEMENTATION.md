# Notes Phase 2 — editable objects

Charts now open a focused inspector instead of the template catalogue. Data cells support up to 40 categories and six named, independently coloured series. Bar/line/pie conversion retains the source series; pie displays the first series. Controls include orientation, per-slice colours, legend, values, axes, markers, number/rupee/percentage labels and line thickness. Negative pie values are rejected rather than silently changed.

Diagrams use stable node/edge identities, allowing duplicate labels and arbitrary labelled connections. The inspector supports direct node dragging with 10px snapping, numeric coordinates, process/decision/start-end shapes, child/sibling/free-node creation, removal and automatic arrangement. Connected lines follow pointer previews. Diagram orientation changes rearrange the graph; type changes retain its data. Limits: 40 nodes, 80 edges, 4000px coordinate bounds. This is a compact diagram editor; group selection, routed connectors and per-node sizes remain future enhancements.

On-page selection exposes corner resize handles for charts and owned images. Pointer movement changes only the affected DOM; releasing commits one undoable editor transaction. Image dragging preserves its proportions. Shift constrains chart proportions. Handles also support arrow-key sizing. Width is relative (10–100% in controls); frame height is 80–1600px. The inspector stores alignment and exact frame dimensions. Image controls retain alt text, caption and contain/cover fit. Selected objects can be duplicated/deleted, diagrams reordered with explicit up/down controls, and native editor drag moves objects between paragraphs.

The portable model is validated on the server, in offline snapshots and before HTML export. Existing line-based chart data is still accepted, with conversion on editing. Only generated SVG is emitted; colours, geometry, identities and data have strict bounds and all labels are escaped. Unsupported model versions are rejected. Object changes use the existing revision-guarded note API and owner-scoped recovery; no database migration is required.

## Validation

- 1,422 tests, including actual SQLite/API round trips of multiple series and dimensions, hostile model validation and backward-compatible legacy formats.
- Real editor browser checks at 320, 390, 768, 820, 1024 and 1440px.
- Desktop/mobile inspector interactions: data grid, second series, type/style changes, node edits/dragging, duplicate labels, resizing with one-step undo/redo, Cancel, duplicate/delete/reorder.
- Owned-image resizing, structured save, reload/offline recovery, legacy RTL/merged tables and native A4 landscape/portrait export.
- PNGs and A4 PDF renders visually reviewed. Deployment workflows repeat all checks and validate Worker size/runtime and an isolated authenticated production API/database round trip.
