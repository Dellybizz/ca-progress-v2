# Editor repair Phase 3: live charts and diagrams

Selecting a chart, category, node or connector opens contextual controls on the writing page. Data/style/layout panels sit below the toolbar and scroll within bounded regions on narrow screens. The existing advanced inspector remains accessible through its explicit Edit button; double-clicking the diagram no longer opens an unsolicited modal.

## Chart editing

- Editable category and series labels, numeric grid, series colours and pie-category colours; figures redraw after every valid edit.
- Add/delete categories and series; reorder categories without detaching their values, palettes or stable category identities.
- Bar/line/pie conversion preserves every data series (pie displays the first). Pie rejects negative and all-zero data; invalid/incomplete edits retain the last valid saved model.
- Change orientation, labels, legend, axes, markers, number format and line width. Width/alignment presets complement direct corner resizing.

## Hierarchies and connectors

- Select SVG nodes and links directly; double-click or press Enter on a focused part to edit its label in the page controls.
- Add children, siblings, parents and independent nodes; delete nodes, reparent, collapse/expand branches and auto arrange. Adding a parent retains the original incoming connection identity. Deleting a node leaves its children available as separate nodes.
- Create/delete/reconnect links, edit labels and colours, and choose dashed/straight/elbow lines. Tree/hierarchy operations reject cycles, duplicate links and a second parent. Flow diagrams allow cycles.
- Per-node fill/border/text colours and shapes; global diagram colour.
- Drag one node or a whole branch with 10-unit snapping; arrow keys move by 10 or Shift+arrow by 50. Branch movements clamp as a unit to preserve relative geometry.
- Pointer previews change only SVG DOM. Release commits one undo transaction; cancellation leaves document/save state unchanged. Undo/redo works from the canvas and contextual controls.

## Persistence and performance

The bounded portable model remains version 1 with optional fields, so legacy line data and existing JSON remain readable. Category/node/edge identities and custom styles remain in structured JSON and safely rendered SVG/HTML. The advanced inspector maintains category IDs and uses the same styled renderer for drag previews. Optional fields are validated with exact keys, colours, booleans and enum values; no arbitrary CSS is accepted.

Only a selected diagram subscribes to model attributes; ordinary text typing leaves the contextual panel unmounted. Gestures do not take full-document snapshots or issue data changes per pointer frame. Existing debounced save/checkpoint behavior remains unchanged. No package or database migration was added. Authoring controls are outside document content and exported output.

Limits remain 40 categories/nodes, six series and 80 connections. Auto arrange falls back to a bounded grid if deep graphs exceed coordinate limits. Large or extreme-aspect diagrams can span export pages; explicit sizing remains available. Browser checks include narrow/touch-enabled contexts and simulated pointer gestures; they do not certify physical stylus, iOS Safari or assistive-technology hardware behavior.
