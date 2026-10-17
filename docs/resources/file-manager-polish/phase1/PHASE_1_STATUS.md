# File-manager polish Phase 1 — interaction foundation

## Scope

Implements shared query/location types, action eligibility, selection rules, drag payload and destination validation, and workspace geometry/focus tokens. The file renderer now uses the shared query contract and range-selection function. This phase does not enable drag handles or drop execution in the live UI; those require the navigation and selection integration in Phases 2–4. Drag is a required release feature.

## State ownership

| State | Owner / lifetime |
|---|---|
| Collection, view, folder, layout | Canonical location, normalized by `normalizeWorkspaceLocation`; URL wiring in Phase 2 |
| Search, filters, sort, group, page size | Shared `ManagerQuery`; changing query resets pagination |
| Cursor | Request scope only; never reuse after owner, context, location or query changes |
| Selected keys and range anchor | Loaded collection scope; stable entity keys, never display labels |
| Focused item | Separate from selection; survives layout changes when item survives |
| Dialog, inspector, context menu | Separate surface state; Escape closes top surface before clearing selection |
| Transfers | Durable owner-scoped queue; independent of location and selection |

Location keys include user and academic context. Shared/official collections cannot inherit a personal folder. Phase 2 defines a folder view without an ID as the real folder root, distinct from recursive All files. Route serialization, account-switch integration and owner-scoped layout persistence are integrated in Phase 2.

## Interaction contract

Single click selects; double click/Enter opens; checkbox or Ctrl/Cmd-click toggles; Shift extends from a stable anchor; Ctrl/Cmd+A selects the loaded page with an explicit scope label. These complete pointer/keyboard changes ship together in Phase 3. Phase 1 fixes the existing checkbox range anchor without changing click-to-open yet. Touch uses explicit selection and an action menu; it must never depend on hover or double tap.

All action entry points must consume `actionEligibility`. Open/details allow appropriate read-only items; mutations require My files and management capability. Mixed Trash and active selections cannot be changed as one action. Restore/erase require Trash. Existing offline mutations remain available; rename/tag/erase require connection. API authorization remains authoritative. Tags support batches, matching the existing route; rename requires a single file. Folder deletion remains empty-only.

## Required drag behavior

| Journey | Required behavior / gate |
|---|---|
| Desktop external files → upload zone | Highlight explicit target, prevent browser file navigation, enqueue through existing type/quota/hash validation; no classification form |
| Desktop external directories | Never silently treat directory entries as empty files; folder traversal needs a separate supported implementation and clear feedback |
| Internal selected files → folder / breadcrumb | Move selected eligible items; dragging an unselected item first selects only that item; do not start drag from checkbox, menu, text input or edit field |
| Internal folder → folder | Reject self, descendants, Trash, missing hierarchy and cyclic data; root is an explicit valid destination |
| Shared / official / trashed item | No move drag; explain unavailable operation through the regular action menu |
| Account/context switch during drag | Cancel; payload must match current owner and academic scope |
| Mixed same-parent batch | Skip unchanged items explicitly; do not silently report every item moved |
| Pending or failed move | Keep source until server acknowledgment; announce success/failure and partial results; preserve selection for retry |
| Hover expansion / scrolling | Delayed expansion, bounded auto-scroll, cleanup on Escape/drop/dragend; never navigate accidentally |
| Keyboard / touch alternative | Same destination picker and Move action with same validation; announce destination and outcome |

Internal custom MIME payloads contain only version, owner/context and stable entity IDs/parent IDs, never signed download URLs, file contents or credentials. Payload parsing is size/count bounded and rejects duplicate/malformed entries. Treat payload claims as untrusted: resolve entities from current owned state and authorize on the server before execution. `moveDropEligibility` requires known ancestry; lazy trees must fetch ancestry before accepting a drop. No copy modifier or cross-account import is implied. External text and URL drops are unsupported. Native OS drag is an enhancement; keyboard/touch Move must work independently.

## Visual foundation

Uses existing product colors and typography. Shared CSS tokens define canvas gap, row height, touch target, menu radius, dock width, thumbnail ratio, focus color and motion duration. Focus-visible outlines now apply consistently within the manager. New surfaces must consume these tokens; reduced-motion sets motion duration to zero. Existing layouts are intentionally migrated in later phases rather than globally changing density now.

## Verification

Domain tests execute the actual TypeScript module via esbuild: mixed capabilities, Trash/offline rules, repeated range selection, unloaded IDs, owner/context payload isolation, malformed/duplicate/bounded payloads, ancestor cycles, unknown/trashed destinations, root moves, file-vs-text drops and canonical identity isolation. Full repository tests, TypeScript and lint are required before release. Browser drag execution certification belongs to the implementation phases; these domain checks do not claim that drag UI is already shipped.
