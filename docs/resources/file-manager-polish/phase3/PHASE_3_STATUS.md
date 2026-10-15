# File-manager polish Phase 3 — selection, menus and drag

## Implemented interaction contract

- Single click/tap selects a file; Ctrl/Cmd-click toggles; Shift-click and Shift-checkbox select a range in rendered group order. The anchor stays fixed while a reversed range shrinks, preserving previously explicit additive choices.
- Selection is scoped to the current loaded page/query. Grid/list/compact changes preserve it. Hidden IDs are excluded from actions and CSV export. The header checkbox exposes a partial state and explicitly identifies loaded-page selection.
- Arrow keys move focus independently. Shift+arrows extend selection. Home/End move to loaded-page boundaries; Page Up/Down move by approximately one viewport within the loaded page. Enter opens, Space toggles selection, F2 renames an eligible single file, and Delete moves eligible files to Trash. Inputs retain native text shortcuts. No shortcut permanently erases files.
- Double click opens once; click does not also open a Details modal. Open records the existing opened activity. File details is a separate menu/toolbar action and retains the existing modal until Phase 4 replaces it.
- Three-dot buttons, right-click and Shift+F10 open the same action menu. Right-click on a selected item preserves its selected group; right-click on another item targets only that item. Touch has explicit checkboxes, menu buttons and an Open menu action, without needing long press or double tap.
- Menu focus supports arrows, Home/End, Escape and dismissal on outside pointer/navigation scroll. Escape restores the originating focus. Action activation restores the trigger before a dialog captures focus. The menu repositions within the viewport and supports internal scrolling.
- The toolbar and menu consume the same typed action descriptors and eligibility rules: ownership, collection, Trash, single-item requirements, uploaded-file version support, offline availability and busy/loading state. Execution checks eligibility again. APIs remain authoritative; permission/not-found failures refresh the listing. Existing destructive confirmation is retained for permanent erase; the richer confirmation/undo work is Phase 4.

## Drag support

- Drag selected owned files, or drag an unselected file to select/move it alone. Drop onto a visible child folder or an ancestor/root breadcrumb. Folder buttons are also draggable, one folder per operation; their existing keyboard Move folder action is available after navigating into the folder.
- The current-tab payload is bounded, versioned, owner/context scoped and resolved against current loaded source entities. A mismatched/expired payload, changed parent, foreign owner/context, Trash, unavailable ancestry, self/descendant cycle, section outside notebook or busy operation is rejected before mutation. The server repeats authorization/hierarchy enforcement.
- Drop targets expose allowed/blocked feedback and a textual explanation. Same-parent items are skipped explicitly in mixed file batches. No copy modifier or cross-account import is implied.
- Files remain until server acknowledgment (or the existing durable offline mutation queue accepts the move). Partial failures retain remaining source selection and expose errors. Escape/native drag cancellation performs no mutation. Navigating/account/context changes expires the active drag.
- External file drops into My files open the existing simple upload picker with the actual File objects staged. Upload starts only after its existing explicit upload button. Files stay private with null subject/chapter. The independent truthful-progress sidebar, type/quota checks and retry engine are unchanged. Reject directory drops and over-20-file batches explicitly rather than silently truncating drag input. Text/URL drops do not become uploads.

## Boundaries

Query-wide selection and folder upload are not supported or advertised. Folders currently use their existing navigation buttons rather than a mixed file/folder multiselection grid. Cross-tab internal dragging, hover-to-expand folders and custom drag auto-scroll are not implemented; visible folders/breadcrumbs and the keyboard Move alternatives are supported. The existing bounded server page and owner-scoped cache remain in use. Full destination picker, non-modal inspector and operation/undo UI remain Phase 4; transfer coordinator persistence remains Phase 5. These limits do not claim completion of the full 104-case final certification.

## Verification

Domain coverage includes exact/reversed ranges, page pruning and stable keys; mixed ownership/Trash/offline eligibility; duplicate/version restrictions; payload bounds/isolation; unavailable/cyclic/no-op destinations. The SSR file-manager suite verifies real rendered selection controls and file types across layouts and official collections. Its portal dependency is externalized to use the same React runtime as the test renderer.

The release workflow additionally runs a real-component Chromium journey at 1440px and 390px: click/modifier/range/checkbox selection, layout retention, context target semantics, menu keyboard focus/Escape, separate Details, Enter/double click, real native file/folder drag, a retained failed move, forged cross-owner payload rejection, self-drop rejection, external File staging in the real picker and horizontal overflow. It runs alongside the Phase 2 history tests and existing upload recovery tests. Browser APIs are intercepted fixture responses; signed-in production storage integrity is still verified by the existing live upload/private-download gate. Record actual CI/live results below before marking the release verified.
