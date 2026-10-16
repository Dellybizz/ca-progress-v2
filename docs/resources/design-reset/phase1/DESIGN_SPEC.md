# Resources, file viewer and note editor — design reset, Phase 1

Status: design proposal and current-source audit. No production UI is changed by this phase. Example documents, storage values and transfer percentages in the preview are illustrative. The preview's note saves affect its local example data only.

## 1. Correct product model

Resources is the single storage and organization surface for uploaded files AND saved CA Progress notes. Notes is a separate authoring tool, not a second file manager. Creating a note produces a note item in Resources; opening that item enters its editor or permitted read-only presentation. A note is not silently converted into an uploaded PDF/HTML file. Its existing identity, document content, ownership and revision checks remain intact.

Entry points: Resources → New → Upload files / New folder / Create note. A separate Notes navigation shortcut can open a new editor or resume a draft, but must not duplicate the Resources library. The final name and placement of that shortcut follow the whole-app navigation contract. Resources remains active when browsing; the editor clearly identifies its return location.

Canonical journey: select a folder in Resources → Create note → write → save → find the note in that folder → reopen → edit the same item. Back returns to the originating collection, folder, filters and layout, not an unrelated root page.

## 2. Evidence from the current implementation

| Finding | Current source | Consequence | Repair destination |
|---|---|---|---|
| Resources deliberately sends `filesOnly=true` and the server excludes `entity_kind='note'` | `resource-library.tsx`, `workspace-browser.tsx`, `workspace.ts` | Saved notes disappear from Resources totals, pagination and search | Phase 2: restore mixed item browsing without losing filtering or permissions |
| `/notes` renders the legacy mixed library | `app/(student)/notes/page.tsx`, `resource-library.tsx` | A second library competes with the file manager | Phase 4: authoring entry/draft resume rather than duplicate library |
| Note detail repeats the title in a page header, card header and editor input | `app/(student)/notes/[id]/page.tsx` | Multiple nested sections consume the top of the page before writing begins | Phase 4: one document header, one toolbar, one writing canvas |
| Metadata and sharing occupy the main note form | `note-editor.tsx` | Subject/chapter/unit/tags/visibility compete with writing | Phase 4: optional Note options panel |
| Editor uses contenteditable plus `document.execCommand` | `note-editor.tsx` | Visual cleanup alone cannot establish predictable complex editing | Phase 4: verify existing content round trips and evaluate the editor engine before extending capabilities |
| Note save combines local recovery, remote response and navigation | `note-editor.tsx` | Status must distinguish local draft, queued sync and acknowledged save | Phase 4: explicit save-state model and preserved identity |
| Viewer has a filename/access bar followed by image/iframe/text fallback | `resource-viewer.tsx` | Opening is technically supported, but controls and document framing differ by surface | Phase 3: one viewer shell with type-appropriate controls |
| Owned notes and shared notes use different outer stacks | `notes/[id]/page.tsx` | Viewing and editing do not feel like one document product | Phase 4: common document shell with permission-based controls |
| Details and transfers already have useful state and recovery logic | `file-inspector.tsx`, `transfer-provider.tsx`, `transfer-coordinator.ts` | A redesign must preserve behavior rather than discard working safeguards | Phases 2–5: retain the existing domain operations and verify new presentation |

This is a source audit, supplemented by the two user-supplied Resources/Drive screenshots already examined in this conversation. It is not a claim of a new signed-in live-browser audit.

## 3. Shared visual system

Use the existing CA Progress identity: calm light surface, dark navy text, one blue/purple brand accent, restrained borders and readable sans-serif controls. The proposal uses blue emphasis for focus and selected states. Dark appearance must use the same hierarchy with suitable contrast. No decorative gradients, hero banners, metric cards or explanatory paragraphs above the work area.

Spacing scale: 4, 8, 12, 16, 24, 32px. Default desktop controls 36–40px high; touch controls target an effective 44px area. Main text 14–16px, secondary metadata 12px; filenames remain distinguishable from metadata. Small document thumbnails are illustrative, not a justification for tiny product labels.

There are two shells. Browsing uses the normal app navigation plus a single Resources navigation column. Viewing/editing uses a focused document shell with Back, identity/status and contextual actions. Avoid another permanent app header above the document header.

Desktop browsing at 1280–1440px: a 176–208px Resources navigation column, 16–24px canvas insets, a compact location/search/New row and one 40–44px controls row. Use a fluid canvas rather than a narrow centered marketing-style container. A compact folder strip is allowed when folders exist. Do not add separate Folders and Files headings when they merely repeat obvious content.

Grid tiles use available width, approximately 170–220px at common desktop widths, with 12px gaps and bounded preview height. List rows use about 48–52px, with columns that collapse by priority. Fit, readability and content density take precedence over forcing a fixed column count. A short library will naturally have empty space; do not enlarge two files to fill the whole screen.

## 4. Resources specification

### Structure

1. One Resources sidebar: My resources, Recent, Starred, Trash; Community and ICAI official separated by a quiet divider. No duplicate top tabs for the same locations.
2. Location/search/New row. Search is scoped to the active collection and includes note titles/content according to the server's search contract. A nested folder replaces the location title with compact actionable breadcrumbs.
3. One controls row: type filter, sorting, list/grid. More advanced filters open on demand rather than permanently occupy another row.
4. Optional compact folders, then the file/note canvas.
5. A minimal footer only when pagination is needed. Do not repeat identical totals in three locations.

### Item behavior

Notes have a recognizable note icon and document excerpt thumbnail; PDF, image and document types have appropriate icons/previews. Ownership, official provenance, permission restrictions and actual preview processing state must not be invented by the thumbnail. Failed or blocked previews retain a useful, unobscured fallback.

Desktop: checkbox selects; Ctrl/Cmd toggles; Shift ranges; a dedicated filename/open action and Enter open the item. Single-click preview selects, with double-click opening where enabled. Touch: tap the item to open, with a reachable checkbox or explicit selection mode for bulk work. Right-click, three-dot menu and toolbar use the same permission/action rules.

Selection replaces the ordinary controls row at the same height. Common actions: Open for one item, Move, Details and More; overflow contains applicable Rename, Star, Share, Trash and other secondary actions. Multi-select never offers an invalid single-file operation. Clear selection restores filters without shifting the file canvas.

Drag-to-move and external drop-to-upload remain required. Show eligible folder/breadcrumb targets; prohibit foreign-owner moves, moving a folder into itself/descendants, and invalid destinations. A Move picker provides keyboard/touch access to the same operation.

### Utility panels

Details and Transfers are mutually exclusive expanded views in one utility area, approximately 300–340px on a large desktop. The canvas resizes rather than hiding its actions behind a floating panel. The transfer runner remains shell-owned and independent of the visible panel. A compact transfer indicator remains available while Details is shown. Panel choice must not pause uploads.

On narrow screens, Details and Transfers become focused sheets with a clear return/close action; they do not squeeze a 390px file grid into a tiny column. The mock uses an in-place focused panel to make that state inspectable. Production sheets must preserve scroll, focus and dismissal rules.

## 5. File-viewer specification

Header: Back to originating Resources location, filename, optional private/owner status, available Download and Details actions. Do not show backend authorization terminology in ordinary product copy.

PDF: page input/previous/next, fit/zoom and find. The document is the dominant surface. Controls must be connected to a controlled rendering API; placing a decorative toolbar above an unrelated browser iframe is not completion. Verify PDF.js feasibility using the existing preview dependency or an equivalent renderer, range requests, authorization expiry, bounded page rendering and mobile memory before implementing the toolbar.

Images: fit, zoom and pan when zoomed. Do not display PDF page controls for images. Show orientation correctly and avoid forcing every image into a crop. Large/unsupported or blocked images follow existing safe-preview rules.

Word/other documents: display a clearly labelled text preview if only extracted text is available; do not imply faithful Word layout. Offer an authorized download only when permitted. Never replace this state with a blank white page.

States: checking preview; loading document; ready; retryable load failure; unsupported/download-only; quarantined/restricted; offline saved copy; unavailable offline; session expired. Loading and retry remain inside the viewer shell so Back stays reachable. Download handed to the browser is labelled Download started, not fabricated completion.

## 6. Note-editor specification

Header: Back, one title/identity, accurate save status, Note options, Save now. The writing area contains one editable title and the document body. Keep a single toolbar for paragraph styles, emphasis, lists, highlighting, links and tables; advanced controls live under appropriate menus. Metadata forms and moderation controls do not interrupt the writing canvas.

Default writing width about 680–760px in the production desktop editor, with 40–64px paper padding where space allows. The inline proposal uses a smaller paper to remain readable at conversation width. On mobile, use 16–20px margins and at least 16px typing text. The toolbar must remain accessible with the software keyboard open and avoid overlapping the caret. Test visual viewport resize and safe-area insets on actual mobile browsers.

Save states are separate: Unsaved changes → Saving → Saved in Resources. Offline: Saved on this device / Waiting to sync. Errors: Could not save + Retry, with the draft retained. Show Saved only for the version acknowledged by the server; edits made during a save remain visibly unsaved. Preserve owner/context guards, optimistic revision checks, stable creation IDs, sanitization, local draft recovery and conflict handling.

Creating in a folder carries a destination ID. Note creation and folder placement must be reliable and idempotent; if placement fails after creation, show the actual location and an actionable retry. Never create a duplicate note because the first save response was lost. Renaming from Resources and the editor updates the same item.

Autosave is a behavior decision in Phase 4, not something implied by a green checkmark. Local draft recovery remains automatic. Any server autosave must debounce writes, retain explicit Save now, reconcile revisions and distinguish queued offline work. The current preview demonstrates explicit local mock saving only.

Read-only shared notes use the same document framing with editing tools removed. Offer an explicitly permitted copy operation separately from editing the owner's document. Keep source attribution accessible without a large source card above the title. Sharing is deliberate, defaults private and respects existing policy.

## 7. Mobile and responsive rules

At 320, 390, 768, 1024, 1280, 1440 and 1920px, controls must not cause document-wide horizontal overflow. Mobile uses a collection picker/menu instead of both a full sidebar and duplicate tabs. Search occupies a purposeful full row when required. The New menu remains visible and touch-friendly. Two grid columns are a starting point at phone widths; use a list when filename readability is better.

Viewer and editor use focused headers and do not retain a permanent bottom app bar while the document/caret needs that space. Back returns to the prior library state. Optional panels cannot cover Save, selection actions or the system keyboard. Never reduce type to make a crowded toolbar appear to fit.

## 8. Implementation packages after this design phase

| Phase | Concrete scope | Completion evidence |
|---|---|---|
| 2 — Resources | Restore note entities to Resources; replace duplicate browsing surfaces; location/New/filter/selection row; coherent grid/list and utility dock | Real uploaded files AND saved notes visible/searchable; folder and bulk actions retained; visual comparison at desktop and phone widths |
| 3 — Viewer | One document shell; real PDF controls, image controls and honest extracted-text preview; permissions and loading/recovery | Open each supported file type, navigate/zoom, retry expired access, exercise offline and blocked cases; no blank/unstyled page |
| 4 — Editor | Dedicated authoring route and shell; optional metadata; reliable save states and folder placement; content round-trip/engine validation | Create in folder, save, locate in Resources, reopen/edit same ID; offline recovery, conflicting edits, owner switch and read-only cases |
| 5 — End-to-end certification | Verify combined experience and deployed source; complete visual acceptance separately from domain tests | Screenshot review plus real create/save/find/open/edit/upload journeys and mobile keyboard checks |

This reset supersedes the old file-only Resources interpretation and the idea that a functional phase automatically certifies design. The earlier transfer and file-manager safeguards remain implementation assets, not evidence that the visual design is approved.

## 9. Phase 1 review checklist

- Resources, viewer and editor look like related parts of CA Progress while serving different tasks.
- Notes are created in the editor and stored/discovered in Resources.
- The first file row starts promptly; no hero, redundant tab strip or stacked action bars.
- Selecting a file does not move the file canvas.
- All note/file types remain identifiable in grid and list.
- Details and Transfers can be inspected without overlapping expanded panels.
- Desktop and mobile presentations cover all three screens.
- Save → show in Resources → reopen preserves the note in the interactive example.
- No mock control or example percentage is presented as production functionality.
- Live production routes and data are unchanged by Phase 1.

## 10. Verification boundary

The standalone preview is a design model, not a production implementation or a replacement for the app's tests. Browser verification checks mock state changes, save/find/reopen, selection geometry and overflow. It cannot certify actual authorization, cloud saving, uploads, PDF rendering, rich-text formatting, mobile keyboard behavior or storage integrity. Those remain release gates in the implementation phases above.
