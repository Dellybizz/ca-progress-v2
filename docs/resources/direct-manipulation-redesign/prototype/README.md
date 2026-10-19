# Phase 1 — reviewable interaction prototype

This is the first phase of the revised five-phase direct-manipulation plan. It is a self-contained interaction prototype with fictional sample content. It does not replace or modify the live Notes editor and does not access an account, upload, API or network dependency.

## Review surface

`interaction-prototype.fragment.html` contains the complete markup, scoped product styling and script. It can be embedded in an HTML preview or wrapped in a minimal HTML document with a viewport meta tag. The same source is presented inline for design review.

### Hierarchy

- Hover/focus/select a node for side sibling and bottom child plus controls.
- Adding preserves the existing nodes' positions and immediately edits the new label.
- Desktop left click opens a local, viewport-clamped node menu. Touch hold opens that menu and release leaves it open; movement cancels the hold and drags instead. A short touch selects the node and its add/resize controls.
- Node menu changes fill/border/text colors, shape, text size and explicit width/height. Edit, duplicate, child/sibling, optional branch movement and node deletion are implemented. Deleting a node retains children and attaches them to its parent.
- Direct move and north-west/south-east resizing update connection geometry. Completed gestures are one undo step. Escape/pointer cancellation restores the starting state. Keyboard arrows move a focused node; F2 edits text.
- Positions are within an expandable, scrollable diagram region. The prototype does not implement cross-paragraph placement, graph reparenting, arbitrary connector edits or the complete Phase 2 hierarchy feature set.

### P&L

- Wider particulars and smaller analysis/final numeric columns; drag header boundaries to resize. Heading menus add columns on either side, rename/type/resize them and delete optional columns.
- Row-local insertion controls appear above/below the hovered/focused/selected row, including totals. The action gutter remains available during horizontal scrolling. Row options provide insertion, duplication, deletion, row type, total membership and fill.
- A line inserted immediately before a scoped total joins its group; a line inserted after it is initially outside that group. Membership is editable. Notes/headings are excluded. Income, expenses, PBT and PAT update as the example's figures change.
- Manual mode leaves totals editable. Assisted mode uses exact integer-paise arithmetic for this two-decimal example. This is not the production editor's complete precision/formula engine.
- Individual label/amount edits and structural actions are undoable. Invalid numbers retain the last valid amount and show an error.

## Persistence and safety

All state is local to the prototype. Where browser localStorage is available, reloading restores the sample's modified state; otherwise the UI reports Session only and continues in memory. The key is `ca-progress:interaction-prototype:v1`. No actual student note is read or modified. Corrupt stored model values fall back to the initial sample. Displayed user strings are escaped or assigned through native text/value properties.

## Verification

`check.mjs` serves the fragment locally and drives Chromium through Playwright. Set `CA_BROWSER_EXECUTABLE` if a custom browser binary is required. Run from the repository:

```
node docs/resources/direct-manipulation-redesign/prototype/check.mjs
```

All six widths passed: 320, 390, 768, 820, 1024 and 1440 px. Tests cover side/bottom adds with actual parent identities, immediate text editing, node menu styles, move/resize with connector changes, one-step gesture undo, cancellation, before/after total insertion and membership, live totals, column insertion/undo, manual calculation mode and exact local reopening. The 390 px context uses browser touch events for a stationary hold and a moving touch, asserting menu persistence/no movement and drag/no unwanted menu. Screenshots were reviewed for desktop and mobile menus and the P&L surface. The self-contained source is under 1 MB and contains no network API calls.

These checks use a browser touchscreen simulation. A physical Android/iPhone review is still required before certifying hardware behavior. Print/export, production persistence, migration, complete catalogue coverage and broader graph semantics belong to subsequent phases.

## Design checkpoint

Review the concrete hierarchy and P&L interactions before applying the design to the main editor. Phase 1 completion means this reviewable prototype exists and its stated checks pass; it does not mean the new editor has been deployed or physically certified.
