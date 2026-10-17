# CA Progress file manager: research and implementation plan

**Decision date:** 15 October 2026. **Status:** research and proposed implementation specification. The next Resources feature phases are paused until the file-manager polish gate is met. Work packages below do not renumber the existing eight-phase Resources roadmap.

Read alongside the [source register](SOURCE_REGISTER.md) and [interaction acceptance matrix](INTERACTION_ACCEPTANCE_MATRIX.md). The source register identifies verified competitor behavior and research limitations. Specifications below are proposals for CA Progress unless explicitly labeled evidence.

## 1. Product direction

Build a calm, dependable file workspace: easy browsing and organization, explicit permissions, recoverable operations, and a transfer center that tells the truth. Use Drive's contextual browsing principles and MEGA's explicit transfer/state management as references. Do not reproduce either product's branding or promise their full cloud-storage feature sets.

The user's requirements are fixed inputs:

1. Uploading is a simple file-choice action. No subject, chapter, tags, title or sharing form is required before upload.
2. New files are private and initially unclassified. The filename supplies the initial display name. Chapter tagging is available afterward.
3. Progress belongs in a separate upload sidebar/transfer center, not the upload picker.
4. Progress measures actual transferred bytes. Successful byte transfer, successful save and preview availability are different states.
5. Do not add an arbitrary per-file application cap. Enforce the account's real storage allowance, accepted types, and documented infrastructure/browser constraints honestly.
6. Polish the file manager before continuing the typed-notes and other planned phases.

“Industry grade” means the same action behaves consistently from a row, menu, toolbar, keyboard and touch surface; failures preserve data and context; large libraries remain usable; keyboard and assistive-technology users can complete the core tasks; and release evidence covers the real deployed storage/database flow.

## 2. Research conclusions

### 2.1 Evidence-to-design comparison

| Area | Google Drive evidence | MEGA evidence | Proposed CA Progress decision |
|---|---|---|---|
| Workspace entry | New, My Drive, Home, selected-item actions [G01] | File manager has separate tree/content regions [M01–M02] | One main file canvas; stable Library navigation; one New entry point. Avoid three competing toolbar rows. |
| Layouts | List/grid, appropriate sort controls and saved folder-order preference [G02] | Column widths and optional/context-dependent columns [M02] | Detailed list plus thumbnail grid; compact is list density. Preserve layout, sort, column choices and current position. |
| Selection | Directional selection and range-extension shortcuts [G05] | Explicit ordered selection, anchor and current item [M03] | One selection controller shared by all layouts, with distinct focus and selection state. |
| Organization | Destination picker, folders, stars, descriptions and shortcuts [G03, G11] | Rights/context-sensitive menus and explicit conflict outcomes [M05, M07] | Real folders and optional academic metadata are different concepts. Move picker validates destination and explains conflicts. |
| Inspection | File details/activity is contextual [G01, G07] | Information panel responds to selection and can aggregate multi-item information [M04] | Non-modal desktop inspector; mobile details sheet; preview is a separate surface. |
| Transfers | Simple upload entry points [G06] | Web queue/widget state [M06, M08]; historical desktop article emphasizes per-item control and a shared model [M09] | App-level transfer coordinator, persistent transfer center, per-file controls, byte progress and explicit finalization. |
| Search | Text plus removable filter chips and advanced search [G04] | No current hosted MEGA search details claimed here | A visible search scope, useful chips, clear filters, and canonical URL state; server searches the whole permitted collection. |
| Deletion/history | Ownership-aware delete/remove, recoverable Trash, activity versus versions [G07–G08] | Context/rights influence available menu actions [M05] | Preserve our owner checks and 30-day Trash; add undo and clearer history. Keep our stricter policy that trashed content is unavailable. |
| Access | Explicit roles and inherited access [G09] | Node rights and share state influence actions [M05] | Capabilities come from our server. Private/community moderation remains our real model; do not show unimplemented Drive-style editor roles. |

### 2.2 Patterns to adopt and patterns to adapt

Adopt stable spatial organization, clear selection, context-sensitive actions, discoverable keyboard operation, recoverable deletion, actionable errors and independent transfer management.

Adapt the scope to a study workspace. Academic chapters are optional metadata, not mandatory filesystem parents. Official ICAI items remain externally sourced/read-only unless explicitly copied. Community approval is different from direct collaboration access. Existing typed notes can appear as files, but polishing their container does not release a new rich-text editor.

Do not assume browser uploads can continue after a tab closes because desktop clients can. Do not display browser-managed download completion without an observable completion event. Do not use fake thumbnails, fake ETA, simulated progress or a generic success toast in place of an acknowledged server result.

### 2.3 Remaining research validation

Before visual design sign-off, capture a targeted current-product walkthrough of list/grid selection, context menus, move dialogs, details, transfer minimization and mobile adaptation. MEGA help-host access was blocked in this research environment; its published source was used instead. Exact current MEGA web pixel geometry and mobile behavior remain unverified. Our dimensions below are proposed, not copied or measured from competitors.

## 3. Current implementation audit

Baseline: application source `aa07463d1544ba6a19af6aa0d364e4ab088ac087`; the upload/sidebar foundation was introduced in `58c674329e81d881f343663c823b95aff0b55129`. Source inspection establishes behavior; it does not replace a complete manual usability audit.

| Area | Existing foundation | Gap/risk to address | Primary source files |
|---|---|---|---|
| Shell | Personal/community/official collections and file view buttons | Library navigation, folder navigation, filters and actions compete for horizontal space; back/forward state is mostly local React state | `resource-library.tsx`, `workspace-browser.tsx` |
| Layouts | Grid, list, compact, a persisted layout choice | Compact is a separate mode rather than density; static list headings are not sorting controls; no configurable columns; preference is not owner-scoped | `file-manager.tsx`, `file-manager.css` |
| Selection | Checkboxes, page select-all, anchor ref, some arrow-key focus movement | Primary file click opens a modal; range behavior is checkbox-event dependent; anchor changes during extension; no complete modifier/keyboard/context-menu contract; selection across pages is unclear | `file-manager.tsx` |
| Actions | Selection toolbar supports rename, move, tags, duplicate, Trash and versions | A three-dot icon opens details, not a contextual menu; no reusable action/capability registry; no row right-click surface | `file-manager.tsx`, `workspace-browser.tsx` |
| Details | Metadata, organization form, activity and versions | Shared Drawer is an aria-modal overlay and locks the page; opening details prevents browsing another row; history uses raw timestamps; some error states lack an in-place retry | `overlay.tsx`, `file-history.tsx` |
| Organization | Real folders, hierarchy validation, server owner checks | Flat destination select; only empty folder deletion; folder view passes an empty subjects list, making post-upload academic assignment unavailable there | `workspace-browser.tsx`, `file-organization.tsx`, `workspace.ts` |
| Uploads | Durable device queue, 5 MiB parts, retries, source hashes, receipt reconciliation, real byte events and separate sidebar | Component lifecycle still belongs to Resources; one active run and global busy state limit independent controls; adding a batch during an active snapshot run may require Continue; no measured ETA or queue ordering | `upload-panel.tsx`, `transfer-client.ts`, `transfer-queue.ts` |
| Storage correctness | Quota-aware insertion and retained multipart receipts | The latest repairs exposed integration gaps: blank foreign keys, two-part schema, middleware limits and signed-GET parameter order; protect all boundaries with live tests | upload routes, `transfers.ts`, migrations 0097/0098, `r2-presign.ts` |
| Search | Server-wide query, cursor pagination, filters, stable sorting and existing large-library tests | Raw filter fields and no prominent active-chip summary; URL/search scope not a single state model; loading/no-results/error distinction needs a contract | `file-manager.tsx`, `workspace-browser.tsx`, `workspace.ts` |
| Previews | Lazy thumbnails, private preview endpoints, processing states, safe large-original download fallback | Thumbnail retries are per tile, including avoidable requests for known unsupported states; details combines preview and metadata; viewer state should reconcile stale IDs consistently | `file-thumbnail.tsx`, `resource-viewer.tsx` |
| Trash/versions | 30-day Trash, restore, version history and owner-bound operations | Browser confirm for permanent deletion; limited bulk reporting/undo; version restore feedback and conflicts need consistency | `workspace-browser.tsx`, `file-history.tsx`, `lifecycle.ts` |
| Accessibility | Labels, real buttons, focus containment for modals, some keyboard support | No complete composite-grid contract, context-menu navigation or non-modal inspector contract; 9–11px mobile metadata is too dense; screen-reader task evidence incomplete | UI components and CSS |
| Performance | Server pagination, debounced search, bounded upload hashing/copying and preview isolation | All folders are loaded for each workspace request; no measured RUM budgets, shared thumbnail request budget or query-cost baseline by library size | `workspace.ts`, thumbnail/queue modules |

Preserve the working foundations. This is an incremental consolidation, not a replacement of the database or a rewrite of every route.

## 4. Information architecture and layout

### 4.1 Navigation model

| Destination | Meaning | Default actions and constraints |
|---|---|---|
| My files | Actual folder root and its children | Upload, new folder, create existing supported note, select/organize owned items |
| All files | Optional flat smart view spanning personal folders | Show Location column; moving an item changes its folder, not the smart view |
| Recent | Recently opened personal items | Label the date as Last opened; explain any alternate sort instead of silently changing the meaning |
| Starred | Saved personal favorites | Unstar is reversible and does not delete content |
| Unfiled | No academic subject/chapter assignment | A smart filter; not a storage location and not a demand to classify |
| Official ICAI | Verified external resources | Open source, view verification information, eligible save/copy action; no rename/delete on the original |
| Community | Approved shared library | Clear author/approval context; report/save actions only when implemented; no owner-only organization controls |
| Trash | Recoverable removed personal content | Restore, permanent delete and expiry; no normal preview/edit/share actions |
| Saved views | Named combinations of scope and filters | User-scoped; selection and scroll position are not part of a saved query |
| Storage | Used/available account storage and cleanup entry | Show actual allowance/reservations; plan changes never silently discard queued bytes |

A collapsible folder tree belongs under My files. “Browse by subject/chapter” is an optional filter/navigation group, visually distinct from real folders. Moving a file does not alter its chapter tags; retagging does not move its stored location.

### 4.2 Proposed spatial specification

Desktop starting values: a 220–240px left navigation, flexible center canvas and a 340–400px right utility dock. The inspector and transfer center share one dock host so panels cannot overlap each other or cover the file actions. Their state is independent: switching to Details leaves Transfers running and visible through its count/status indicator. A minimized transfer strip remains accessible. These widths must be validated at 1280, 1440 and 1920px.

Top of canvas: breadcrumb/title, then one main toolbar. Search is prominent. New is the main creation action. Layout, sort and filter controls form a compact secondary group. With selection, contextual actions replace that group rather than adding an unbounded extra action row. Sticky headings must not cover focused rows.

Tablet: collapsible navigation and at most one utility surface. Mobile: primary navigation in a sheet, file list with readable metadata, two-column grid only when names remain usable, selection mode with a compact action bar, and details/transfers as full-height or bottom-sheet surfaces. A transfer status pill remains reachable above app navigation and safe-area insets. Test 320, 390, 768, 1024, 1440 and 1920px plus zoom.

### 4.3 Layout rules

| Mode | Purpose | Proposed rendering |
|---|---|---|
| Detailed list | Organizing many documents | Default desktop filing view; Name, Modified, Size and optional Location/Chapter/Status columns; sticky sortable headings |
| Compact density | Dense scanning | Same list, selection and actions; smaller row height, never smaller essential text or touch targets |
| Thumbnail grid | Visual recognition | Stable preview aspect ratio, 1–2-line filename, file type/size, status and checkbox; no card-height shifts when thumbnail arrives |

Folders appear first by a saved preference, not by an undocumented sorting exception. Unknown size is “—”, not zero; it remains consistently placed in either direction. Natural/numeric and locale-aware filename ordering must agree across client and server. Column resizing/hiding has a reset action; essential Name and action access cannot be hidden. Preferences are scoped to the signed-in owner and appropriate collection.

## 5. Interaction contract

### 5.1 Selection and opening

Desktop single click selects one item. Ctrl/Cmd-click toggles membership. Shift-click extends from a stable anchor in the current displayed order. Changing focus with modifier keys does not accidentally drop a multi-selection. Checkbox selection is additive and does not open a file. Double click or Enter opens a folder/file; Space provides a quick preview when supported. Clicking empty canvas clears selection, except when interacting with a menu, drag target or inspector.

Arrow keys navigate the actual grid/list geometry using a roving focus model. Shift+arrows extend selection. Home/End and Page Up/Down have documented scope. Ctrl/Cmd+A selects the loaded page initially; the label explicitly says “Select this page.” Selecting all matching results is a separate future server-backed operation with a query snapshot, count and confirmation. Never imply that 24 loaded items represent all 10,000 results.

Opening a right-click menu over an already selected item preserves the multi-selection. Right-click on an unselected item makes it the current single target. The three-dot button opens the same action registry. Shift+F10/context-menu key provides an equivalent keyboard route. Escape closes the topmost surface first and restores focus; another Escape may clear selection. File-manager shortcuts do not capture typing, browser/native file dialogs, document editors or preview iframe keys.

On touch, tap opens and long-press enters selection; explicit checkboxes/actions offer a non-gesture alternative. Do not require double tap, hover or right click on mobile.

### 5.2 Contextual actions

One capability resolver supplies menus, toolbar buttons, keyboard commands and details actions. It considers ownership, collection, item type, Trash state, processing state, online state, active operation and current server permissions. The server rechecks every mutation. Mixed selections expose only compatible operations; partial eligibility is explained before starting, not hidden in a generic failure.

Suggested action groups: Open/Preview/Download; Rename/Move/Copy/Star; Tag chapters/Edit metadata; Versions/Activity; Share or community submission when supported; Trash. Permanent delete belongs only in Trash and is visually separated. A disabled action gives a reason where useful; an irrelevant action is absent. No nonfunctional menu entries.

### 5.3 Popup and panel inventory

| Surface | Presentation | Behavior and acceptance rule |
|---|---|---|
| New | Anchored menu | File upload and New folder; only supported note/folder-upload entries; outside click/Escape closes and returns focus |
| Item/multi-item actions | Context menu/popover | Permission-filtered; keyboard arrows; viewport collision handling; no selection loss |
| Sort/columns | Popover | Current choice checked; immediate apply; preserve selection/scroll; reset defaults |
| Filters | Popover on desktop, sheet on mobile | Chips reflect every active filter; Apply/Clear semantics consistent; no viewport clipping |
| Upload picker | Small modal or native picker | Files only, destination context shown when relevant; close once safely queued; no progress list or mandatory tagging |
| Rename | Focused modal/inline edit | Name selected, validation near input, Enter saves, Escape cancels; original extension/bytes are not silently changed |
| Move/copy | Destination picker dialog | Hierarchical browse, breadcrumb, search and New folder; current location, forbidden descendants and permissions clear |
| Tag chapters | Inspector editor or modal | Optional subject/chapter, searchable options, remove assignment, bulk mixed-value state; available inside folders too |
| Details | Non-modal dock | Updates with selection without blocking the canvas; displays single-item metadata or multi-item aggregate |
| Preview | Dedicated viewer | Previous/next within known query, zoom where supported, download and open; Escape restores row and scroll |
| Transfers | Separate dock/sidebar | Independent from picker and route page; minimize/expand; per-file control and truthful status |
| Conflict | Decision dialog | Skip, keep both or explicitly create a version where supported; apply-to-remaining scoped to this batch |
| Trash result | Snackbar with Undo | Undo is a real compensating server action; partial bulk results are itemized |
| Permanent delete | Destructive modal | Named item/count, irreversible explanation and explicit Delete permanently action; no generic browser confirm |
| Version restore | Version panel + confirmation if needed | Selected historical version is clear; current identity preserved; server conflict/permission recheck |
| Error | Local field/row/banner | Specific recovery, retry scope and retained-data explanation; no raw database messages |

Only blocking decisions trap focus. An inspector/transfer dock must not reuse the current modal Drawer behavior on desktop. Unsaved metadata changes require an explicit save/discard policy before switching targets; never silently save to the newly selected file.

## 6. Upload and transfer center specification

### 6.1 One coordinator, independent views

Move queue ownership above Resources routing into an authenticated app-shell provider or an equivalent persistent service. The file picker enqueues; the transfer center observes; navigation does not instantiate a second runner or abort a healthy transfer. The durable queue and receipt reconciliation remain the source of recovery, not component state. Account switching immediately hides the old queue and prevents the new session from sending the old owner's bytes.

Retain web-tab leadership locking and reconcile after reload. Define behavior when a second tab becomes leader. App-shell persistence means navigation within the open app, not background execution after tab/browser shutdown. On reopening, show recovered/paused work honestly and resume only with valid source access and authentication.

### 6.2 State model

`Preparing → Queued → Uploading → Saving → Saved`, with explicit Paused, Waiting for connection, Needs retry, Reselect original, Duplicate/conflict and Cancelled branches. Preview processing is a separate resource state after Saved. Authentication expiry and quota change require actionable account/storage states, not repeated blind retries.

Preparing covers hashing, device persistence and descriptor validation. Uploading uses actual transport events. Saving covers assembly, full-hash verification and metadata commit. Saved requires a server resource ID and idempotent completion receipt. A 100% transfer bar may accompany Saving but may never display Saved early.

### 6.3 Progress, speed and ETA

Per-file transfer fraction is `(confirmed previous-part bytes + current-attempt sent bytes) / source size`. Resume starts from server receipts, not the last optimistic percentage. Retries may legitimately reduce the current-attempt bar; label retrying instead of fabricating monotonic progress. A smaller final part contributes its true byte weight.

Track sent bytes and durable confirmed bytes separately. Aggregate batch progress is weighted by file bytes, not averaged across file percentages. Speed is a smoothed rate from recent active-transfer samples, excluding paused time. ETA appears only with enough stable samples and a positive rate; otherwise show “Calculating…” or omit it. Saving and preview work have indeterminate status unless a measurable work unit exists.

If downloads are handed to the browser, report “Download started,” not a fabricated complete bar. Fully managed download progress requires a streaming, bounded-memory save path and browser-capability testing; do not buffer arbitrary large files in a Blob merely to draw a progress bar.

### 6.4 Queue controls and correctness

Provide Pause/Resume/Retry/Cancel per file, Pause all/Resume eligible/Clear completed at batch level, and retry only failed files. Other active files remain controllable when one fails. Adding a new batch while work is active automatically joins the running scheduler. A concurrency limit is measured and bounded; begin conservatively and tune using mobile/network evidence rather than assuming more parallel uploads are faster.

Cancel aborts the active request and server multipart work and releases reservations only after a confirmed cleanup or a recorded retryable cleanup task. Remove from the UI is not proof that bytes were deleted. Duplicate resolution distinguishes identical content from a filename collision. File/version replacement is explicit and never overwrites the only existing copy before the new version is verified.

Folder upload is enabled only after relative-path validation, empty-directory policy, supported-type handling, conflict behavior and browser support are implemented. Drag/drop receives visible destination feedback; dropping onto a folder respects ownership and does not tag a chapter implicitly. The existing file-count queue bound remains a separate concern from a per-file size cap; the product should explain what can be queued without conflating count, quota and provider limits.

### 6.5 Transport and database invariants

Keep exact ownership, declared/actual byte-size checks, per-part/full SHA-256 verification, immutable source keys, quota reservations, completion claims and idempotent receipts. All layers must agree on chunk/envelope limits: browser, middleware, route parser, R2 upload and D1 schema. Preserve existing receipts during additive migrations. Database failure retains verified bytes for retry. Use stable request/error codes and a non-secret correlation ID; never log credentials or presigned URLs.

Files exceeding the bounded full-preview inspection path remain download-only with an honest explanation. Successful hashing/envelope validation is not a claim of full malware scanning. Accepted file types and safe preview execution remain enforced independently of file size.

## 7. Search, metadata, previews and recovery

### 7.1 Search and filters

Use a canonical location/query state containing collection, real folder, text, type set, subject/chapter, owner, status, date range, sort and direction. Persist navigable state in the URL; validate it on the server. Layout/density are preferences rather than access-control parameters. Back/forward restores the location, query, loaded page, scroll and focused item where still valid.

Make scope visible: “Search My files,” “Search this folder,” “Official ICAI” or “Community.” Offer an explicit scope change, not a silent switch after no results. Within one facet, selected values are OR; across facets and text they are AND. Visible removable chips summarize every active constraint. Clear one removes only that condition; Clear all preserves the current collection/location unless labeled otherwise. Date boundaries use documented inclusive/exclusive rules and timezone normalization. Future advanced operators require a real parser and help, not ad-hoc text matching.

Debounce typing while keeping input immediate. Abort superseded requests and ignore stale responses. Retain the previous page with an Updating indicator, or use correctly sized initial skeletons. Distinguish zero files, zero search matches, unavailable network, expired cursor and permission loss. A failed fetch must never look like an empty library. Search covers permitted server records, not just thumbnails currently loaded; unsupported originals may lack extracted full-text, which must be understood in search help.

### 7.2 Post-upload organization

Details exposes Display name, Description, Folder location, Subject, Chapter, optional tags and privacy state. Subject/chapter are optional; remove assignment writes SQL null. On subject change, clear an incompatible chapter. Search long chapter lists. Preserve edits on validation/network failure. Support mixed values for multi-selection and an explicit “Leave unchanged” option; blank and unchanged are not interchangeable.

Physical move and academic retag are separate operations. The current folder view must still supply valid subject options. Save refreshes the affected item and query counts without resetting the whole workspace or closing unrelated transfer activity. If the item leaves the current filter after retagging, announce why and provide a route to its new context.

### 7.3 Previews and details

The grid uses generated safe thumbnails or truthful type icons. Avoid requesting a thumbnail for a known unsupported/quarantined state. Cache by resource/version/source ETag and authorized owner context. Batch/poll processing states with backoff rather than starting one repeated timer per tile. Preserve reserved dimensions to prevent layout jumps.

The inspector has Details and Activity/Versions sections, with metadata editing clearly separate from viewing. Multi-selection shows count, known total size and mixed properties; unknown sizes are not silently counted as zero. A preview failure leaves Download available only if access and inspection permit it. Original-file delivery, extracted text and image thumbnails retain independent permissions and content-type handling.

Preview opening preserves the underlying query and position. Previous/next is limited to known results or explicitly loads the next authorized page. PDF/image zoom controls need keyboard equivalents and sensible touch behavior. Other document types use supported extracted text or an explicit download fallback. Never show a stuck spinner where the format or size is known unsupported.

### 7.4 Trash, undo, versions and partial outcomes

Use a recoverable Trash operation with an acknowledged result and Undo. Permanent deletion requires explicit scope and conflict checks. The app's current policy hides trashed items from shared access; retain that policy even where competitor semantics differ. Display expiry and storage impact using real backend policy, not copied marketing text.

Preserve the existing decision: folders may be deleted only after their files have been moved elsewhere. Keep “Delete empty folder” honest and explain why a nonempty folder cannot be deleted. Recursive folder Trash is outside this polish authorization; never simulate it with client-only removal.

Bulk operations return per-item outcome, affected IDs, new revision and retryability. A snackbar summarizes “8 moved; 2 need attention” and opens a result sheet. Retrying operates only on failures. Undo uses a server operation token/baseline and refuses to overwrite a later conflicting edit. Permissions may change between menu display and execution; preserve context and report the affected item.

Activity is an event trail; versions are byte/document revisions. Display localized human timestamps with an exact timestamp on demand. Restoring a version retains stable file identity and creates a recoverable current-history relationship. A stale version list, already deleted source, quota failure or processing failure receives a specific recovery path.

## 8. Accessibility and visual consistency

Choose a semantic interaction pattern and implement it fully. A static table can remain a table; an interactive composite grid needs managed focus and the keyboard contract in A01. Do not add ARIA roles without the behavior. Use real checkboxes or equivalent checked semantics, announce selection count and sort direction, and keep row and action labels unique for duplicate filenames.

Every core operation has a keyboard route and a touch route. Menus expose expanded/controlled state and manage focus. Actual modals trap focus and restore it to a surviving trigger; non-modal docks do not trap or hide the file canvas. Escape priority and unsaved edits are tested with stacked surfaces. File upload supports an accessible native input as well as drag/drop.

Use readable essential text, visible focus, consistent icon meanings and target sizes. Proposed target: 44px touch controls where practical, with WCAG 2.2 AA requirements checked independently; dense desktop icons need spacing, labels and keyboard access. Never use color alone for selection, error, sharing or progress. Provide reduced-motion behavior, high contrast, 200% zoom/reflow checks, and screen-reader announcements that do not speak every byte-progress event.

Define tokens for row heights, canvas gutters, thumbnail ratio, menu radius, separator spacing, dock width, elevation and motion. Use the app's current typography/colors rather than competitor branding. Long Unicode filenames, no extensions, multiple dots, very large numbers, RTL names and emoji must not break layout or file identity. Truncation has a full-name accessible label and discoverable tooltip; it must not obscure distinguishing suffixes during a conflict decision.

## 9. Performance and resilience plan

### 9.1 Measure first

Record a reproducible baseline for 0, 24, 1,000, 10,000 and 100,000 file records; shallow and deep folder trees; 0/1/96 visible thumbnails; mixed processing states; and 1, 20 and recovered queued uploads. Large database datasets use synthetic local/staging fixtures, not 100,000 production objects.

Capture first render, query p50/p95, rows scanned/D1 query plans, response size, browser long tasks, heap, thumbnail request count, render count, upload throughput and retry amplification. Include cold/warm Worker paths, mid-range mobile CPU and representative network latency/loss. Current tests demonstrate behavior at over 1,000 records; they are not proof of a 100,000-record production SLO.

### 9.2 Proposed acceptance budgets

| Metric | Proposed target | Verification |
|---|---|---|
| Core Web Vitals | Good p75 experience: LCP ≤2.5s, INP ≤200ms, CLS ≤0.1 | RUM by device/network, plus repeatable lab checks; do not present lab-only results as field compliance |
| Warm folder/search API | Initial engineering budget p95 ≤500ms at 10,000 synthetic records in the selected region | Compare to baseline; inspect indexes/query plan; explicitly revise if measured architecture requires a different budget |
| Local selection/layout feedback | Normally paint within 100ms without waiting on network | Browser performance traces; no whole-library recomputation per checkbox |
| Large listings | Bounded page response and DOM; no silent record truncation | Cursor traversal and duplicate/missing-ID tests through the full dataset |
| Folder navigation | Do not fetch the entire folder tree for each page | Lazy children/search/path endpoints with owned cursors; measure payload across 10,000 folders |
| Thumbnails | Bounded concurrency; no requests for known unsupported states; fixed geometry | Request-budget tests at 96 visible items and slow processing |
| Upload memory | Growth bounded by part/window size plus hashing/transport overhead | 128 MiB+ streaming tests and device traces; no whole-file copies for arbitrary large sources |
| Progress rendering | Coalesce updates to a modest UI rate, e.g. ≤10 updates/second per active item | Bytes remain exact in transfer state; React/IndexedDB need not update per network event |
| Recoverability | No committed-source deletion after transient metadata failure | Fault injection, retained-object checks and retry without reupload |
| Data isolation | Zero cross-owner records/bytes exposed | API tests, account-switch checks and normal-account live fixtures |

These are our proposed budgets, not measurements of Google Drive or MEGA. Establish the baseline and report p50/p95 and device/network conditions before declaring success.

### 9.3 Engineering changes

Keep server keyset pagination and stable tie-breakers. Reuse cursor/query-scope protections; avoid global client sorting of partially loaded results. Separate folder children/path/search queries from file pages. Review COUNT and revision queries against real query plans. Introduce shared request deduplication and selection-aware data updates, not a second incompatible file cache.

Virtualize only if the chosen scrolling/loaded-window design requires it; pagination already bounds the current DOM. If introduced, preserve keyboard navigation, focused rows, selection, measured row heights and screen-reader semantics. “Virtualization” is not a substitute for correct server pagination.

Move expensive preparation off the main thread when measured, using bounded slices and cancellation. Throttle UI progress independently of transport accuracy. Retain part receipts and exponential backoff with jitter for retryable failures; never retry owner/auth/conflict errors indefinitely. Store stable error codes and stage timings without filenames/body contents/tokens where unnecessary. Add correlation IDs, completion failure counts, retry rates and cleanup lag.

Service-worker/offline caches must be owner-scoped and respect private resource policy. Show last-known data distinctly from current server truth. Mutations supported offline get pending/conflict indicators; unsupported offline actions give an immediate explanation without clearing the user's input.

## 10. Proposed technical structure

| Module | Responsibility | Migration approach |
|---|---|---|
| `FileWorkspaceShell` | Navigation, canonical route/query state, toolbar and utility dock host | Extract from existing library/workspace browser without changing entity IDs |
| `FileCollectionController` | Cursor pages, counts, invalidation, stale-response protection | Wrap current workspace API; preserve owner/academic-scope restrictions |
| `FileSelectionController` | Focus, stable anchor, selected IDs and page/query scope | Reuse across grid/list/density and action entry points |
| `FileActionRegistry` | Labels, capability eligibility, execution and shortcuts | One definition for menu, toolbar, inspector and keyboard |
| `FileGrid` / `FileList` | Rendering and semantics | Presentational; no separate business rules or independent sorting |
| `FileInspector` / `FilePreview` | Non-modal metadata/history versus viewing | Replace desktop modal-details coupling; retain actual modal component for dialogs |
| `FileDestinationPicker` | Owned hierarchy browsing and valid destinations | Replace flat selects; add lazy tree endpoints only where measured |
| `TransferCoordinator` | Durable scheduling, tab leadership, owner isolation and transport | Lift existing queue/receipt engine into authenticated shell scope |
| `TransferCenter` / `UploadPicker` | Observer UI versus enqueue UI | Preserve the user's simple upload requirement; no duplicated runner |
| `OperationResult` / `UndoController` | Partial results, acknowledgments and safe compensation | Add stable server contracts before optimistic UI |
| `ThumbnailController` | State-aware requests, cache identity and polling budget | Consolidate per-tile retry behavior |

Example API evolution: return stable `operationId`, per-item `{id, ok, code, retryable}`, affected revision and capabilities where useful. Preserve versioned routes and mobile compatibility. Additive database migrations must be rehearsed against a private restored snapshot; no dropping user data or disabling foreign keys to bypass errors. Rollback builds must remain compatible with expanded multipart receipts and already-issued transfer intents.

## 11. Work packages and dependencies

Size is relative engineering complexity: S, M, L. This is ordering, not a promise of calendar duration. Each package ends with a reviewable build and evidence; no automatic leap into the next Resources feature phase.

| Package | Scope and deliverable | Depends on | Size / risk | Exit gate |
|---|---|---|---|---|
| FMP-00 | Close upload/database/download regressions; preserve real signed-in three-part live gate; record baseline and rollback compatibility | Current release | M / high integrity risk | Exact private download hash, idempotent save, retained retry, scoped cleanup and source/version evidence all pass |
| FMP-01 | Interaction specification, source register, task journeys, canonical state, capability/action contract and design tokens | FMP-00 | M / medium | Matrix reviewed against real routes, ownership and mobile support; unverified claims identified |
| FMP-02 | Consolidated shell/navigation, real folder root, breadcrumbs, URL/back-forward state, layout/density and preference persistence | FMP-01 | L / medium | Navigate/search/back/refresh without losing location or exposing old-owner state |
| FMP-03 | Shared selection controller, single/double-click policy, keyboard/touch selection, contextual menus and action registry | FMP-01–02 | L / high interaction risk | Same eligible action and target from all entry points; mixed/page/range cases pass |
| FMP-04 | Non-modal inspector, destination picker, rename/tag dialogs, partial results, accessible destructive confirmation and safe undo | FMP-02–03 | L / high data risk | Post-upload tagging works inside folders; failures preserve edits; no hidden partial success |
| FMP-05 | App-shell transfer coordinator, independent controls, new-batch scheduling, truthful aggregate/speed/ETA, recovery and account-switch behavior | FMP-00–02 | L / high storage risk | Navigate within app during upload, reconnect/reload/retry/cancel and quota/auth changes preserve correct bytes and state |
| FMP-06 | Search chips/scope, thumbnail request budgets, preview/detail separation, history/Trash clarity, storage page | FMP-02–04 | M–L / medium | Whole-collection search and all empty/loading/error/unsupported states have defined recovery |
| FMP-07 | Profile and optimize queries/folder fetches/rendering; accessibility, responsive visual pass and observability | FMP-03–06 | L / broad | Measured budgets, keyboard/screen-reader tasks and device matrix pass; no unsupported compliance claim |
| FMP-08 | End-to-end certification, normal-account live journeys, migration/rollback rehearsal, documentation and polish release | FMP-00–07 | M / release risk | All mandatory matrix cases and operational gates pass; only then reconsider the paused roadmap |

Critical path: FMP-00 → FMP-01 → FMP-02 → FMP-03 → FMP-04 → FMP-06 → FMP-07 → FMP-08. Transfer work FMP-05 can be implemented once the shared shell/state contract exists, but is still a release dependency. Do not postpone integrity or accessibility until a final cosmetic pass; each package includes its relevant checks.

## 12. Verification and release gate

The acceptance matrix is the executable task inventory, not proof that those cases already pass. Establish test ownership and evidence per row: unit/domain where a rule matters, real-route/database integration for mutations, browser journeys for interaction, and isolated live checks for the storage/database boundary.

Mandatory journeys include: upload privately without tags; navigate while it runs; pause/reconnect/resume without duplicate bytes; confirm actual save; exact private download; tag chapter from inside a folder; move/undo; range select and bulk action with one denied item; search beyond the first page; back/forward restoration; inspect/preview without losing context; Trash/restore; version restore; keyboard-only completion; and account switch during a transfer.

Use normal isolated test accounts, never another user's credentials or a guest-mode shortcut for the signed-in certification. Fixtures get minimum necessary data, owner-scoped cleanup, revoked sessions and disabled accounts retained where audit references require them. Preserve the first failure even if cleanup also fails; report test, API and cleanup outcomes independently. Clean test objects through authorized bindings/APIs rather than assuming broad account-level R2 permissions.

Release gates: zero known data-loss, cross-owner access, false-success or unrecoverable-upload bugs; no P0/P1 interaction defects; core actions accessible at each supported size; no raw database error in the UI; explicit limits/capabilities; reproducible performance results; private backup restore and compatible rollback; signed-in live upload/download and exact source version evidence. A unit-test count alone is not acceptance.

## 13. Deliberately separate future capabilities

This polish pass does not silently expand into collaborative Google Docs, Drive ACL inheritance, MEGA-equivalent end-to-end encryption, cloud sync daemons, native background transfer guarantees, arbitrary file-format rendering, full malware scanning, OCR, AI organization, handwriting, or the Phase 3 rich-text editor. Their entry points stay absent or honestly labeled until their server/client contracts exist.

Folder uploads and query-wide “select all results” are specified here because they affect interaction design. Nonempty folder deletion remains blocked under the existing decision. They must either ship with their acceptance cases or remain visibly unsupported without suggesting success. Direct protected-sharing features remain subject to the existing later roadmap rather than being implied by a copied Share dialog.

## 14. Definition of done before resuming phases

A student can find, select, upload, download, move, rename, tag, inspect and recover their files using mouse, keyboard or touch without guessing what happened. The same action has the same meaning everywhere. Network and permission failures preserve data and give a recovery path. Transfers remain independently visible while browsing. Large-library performance is measured. All mandatory acceptance cases have linked evidence and no open integrity blockers.

Until that gate is satisfied, the next Resources feature phases remain paused. The signed-in upload/download gate in FMP-00 has passed (see the linked release evidence). The [Phase 0 checkpoint](phase0/PHASE_0_STATUS.md) records its new baseline and historical-fixture audit; then begin the shared state and shell work in FMP-01/FMP-02; this document itself is research and planning, not a claim that the proposed redesign has shipped.
