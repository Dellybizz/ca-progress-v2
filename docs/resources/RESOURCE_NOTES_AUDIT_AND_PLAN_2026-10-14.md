# CA Progress — Resources and Professional Notes Roadmap

Date: 14 October 2026. Status: **audit and proposed delivery plan; no application changes made by this document.**

Audited local commit: `4d41d8c3`; source tree: `c57f8a653cb53c5ddb2173e67f04edc1b3660adf`. GitHub feature branch `onboarding-design-phase7` was verified at `b7325c2e916da5ec8e1b496afed9594797a5e2b2` with the same source tree.

This roadmap uses **RN00–RN23** so it does not reset the completed onboarding phases or confuse them with the existing scenario/security plan P00–P33. The earlier [Scenario Implementation Master Plan](https://github.com/Dellybizz/ca-progress-v2/blob/4a9f52760c73d757346e7f5259eb3b996dc525f7/docs/SCENARIO_IMPLEMENTATION_MASTER_PLAN.md) remains the policy reference. Its existence is not evidence that its features have shipped. Reuse verified implementations and record remaining gaps rather than rebuilding everything.

## 1. Outcome and audit boundaries

The target is a complete study workspace: a dependable file manager, a professional typed document editor, a handwritten notebook, and a PDF reader with annotations. “Industry standard” is made concrete through the capability register below; it is not a promise to reproduce every feature of every competing product.

This is a **source audit and primary-source research review**, including resource UI, upload/access APIs, D1 listing limits, note persistence, offline routing, background processing, and native source. A fresh live interaction audit, production data/binding inspection, physical stylus tests, recovery drill, parser penetration test, and measured performance baseline remain RN00 work. No real student records were changed. Risks are distinguished from reproduced defects; source findings do not establish an exploitable vulnerability or a production incident.

Source evidence:

| Surface | Reviewed files |
|---|---|
| Unified hub and file UI | `app/(student)/resources/page.tsx`, `components/resources/{resource-library,file-manager,file-thumbnail,file-organization}.tsx`, `lib/resources/{file-manager,navigation,service}.ts`, `components/icai/resource-browser.tsx` |
| Uploads and delivery | `app/api/resources/{upload-url,upload-complete}/route.ts`, `app/api/resources/[id]/{route.ts,access/route.ts}`, `lib/resources/validation.ts`, `lib/jobs/execute.ts` |
| Typed notes | `components/resources/note-editor.tsx`, `lib/notes/phase6.ts`, `lib/data/d1/hot-screens.ts` |
| Browser offline | `lib/offline/{config,mutation,projection}.ts` |
| Installed app | `apps/mobile/src/{main.tsx,files.ts}`, `packages/mobile-data/src/resources.ts` and existing native parity documentation |

## 2. Current capabilities worth retaining

- My files, Community and ICAI views share a file manager. Existing note/resource URLs and subject/chapter context remain useful foundations.
- Grid, list and compact layouts; multiple file-type filters; primary/secondary sorting; subject/type grouping; virtual subject folders; selection; details; selected-metadata CSV export.
- Real image and text-note previews; generic PDF/Word covers; PDF iframe viewing; owner upload title/location editing.
- Up to 20 selected uploads, drag/drop, sequential direct R2 transfer, progress/cancel and in-session retry. Server upload intents reserve quota and check owner, declared size and stored MIME. Completed-intent retries have idempotent recovery.
- Basic note headings, formatting, lists, highlights, tables, tags, academic links and attachment references; moderated Community publishing and source attribution.
- Existing browser write-ahead mutation queue and account/context isolation, plus native SQLite/file-vault/transfer foundations. These are not equivalent to continuous note autosave or resumable byte transfer.

## 3. Findings that should determine the order

1. **A source-level offline save mismatch exists.** The editor submits `/api/v1/notes`, while `snapshotKind()` and note projection match `/api/notes`. With `NEXT_PUBLIC_OFFLINE_ENABLED=true`, the wrapper rejects an unmapped URL before sending. With the flag disabled it performs a normal fetch. Production flag state has not been verified, so this is a conditional defect, not a claim that every live save currently fails.
2. **Main-library discovery is incomplete at scale.** D1 reads cap own notes/uploads at 250 each and other users’ approved shared notes/uploads at 150 each; there is no continuation in that library model. Client pagination/search cannot reach older excluded records. Note extras also truncate combined IDs to 400.
3. **The editor foundation limits safe expansion.** Formatting uses `contentEditable`, deprecated `document.execCommand`, and direct table DOM edits. `document_json` is an HTML envelope, not an editor tree. New toolbar controls alone would not produce dependable document semantics. MDN documents the command’s deprecated status [S5].
4. **There is no continuous draft protection in the reviewed editor.** It saves manually. The existing write-ahead queue begins on Save; it does not capture every typing session. There is no dedicated draft recovery or immutable revision browser in this editor.
5. **Direct upload validation stops short of content inspection.** Finalization checks R2 HEAD size/content-type, not file signatures. A separate `validateUploadFile()` exists, but is not called on this path. The reviewed `attachment-process` handler only updates a processing row to `ready`; it does not scan, extract text, or generate thumbnails. This is a validation/processing gap, not proof of malware delivery.
6. **The native notes UI is a separate plain-text textarea.** Adding a web editor will not provide APK parity automatically. Native file download also accumulates bytes and bridges base64, which needs measurement before increasing file limits.
7. **Prior permission policies exceed the reviewed resource API.** The current access route distinguishes owner/approved shared visibility and issues a signed R2 URL. The complete frozen-share/no-export/private-copy policy is not represented by that check. Do not claim protected delivery until every route and derivative is covered.

## 4. Gap and capability register

Priority: **A** = correctness, data protection or access boundary; **B** = professional core; **C** = advanced capability. A desired capability is not automatically a defect. “Not found” applies to the reviewed surface, not an assertion about every repository subsystem.

| ID | Current state / gap | Required outcome | Priority / delivery |
|---|---|---|---|
| R01 | Search sees capped arrays | Server cursor pagination, accurate counts, stable ordering, deep links | A / RN03–04 |
| R02 | Full note bodies accompany listings | Metadata/excerpts first; open document body on demand; bounded offline prefetch | B / RN03–04 |
| R03 | Note extras limited to 400 IDs | Join/batch by requested page; no silent attachment/topic omissions | A / RN03–04 |
| R04 | “Folders” are subject filters | Real nested folders/notebooks, stable IDs, root, move, cycle guards | B / RN02–03 |
| R05 | Selection mostly supports CSV | Range/keyboard selection, bulk move/tag/Trash with partial-failure recovery | B / RN03, RN07 |
| R06 | No lifecycle recovery in reviewed delete path | 30-day Trash, restore, explicit permanent erase, safe folder guards | A / RN07 |
| R07 | Search is loaded metadata/excerpt matching | Full-text note/PDF search, ranked snippets, facets, saved searches | B / RN04, RN06 |
| R08 | Grouping runs after client page slicing | Correct server grouping/folder counts and group-aware continuation | B / RN04 |
| R09 | Layout preference only is clearly persisted | Saved sort/filter/view preferences, recent files, starred/pinned shortcuts | B / RN03–04 |
| R10 | PDF/Word covers are icons | Authorized generated first-page thumbnails; explicit unavailable state | B / RN06 |
| R11 | Image covers request original image | Small derived images, dimension checks, lazy loading, cache invalidation | B / RN06 |
| R12 | Office preview absent | Sandboxed conversion/read-only preview; original preserved | B / RN06, RN18 |
| R13 | Accepted upload formats narrowly fixed | Safe unsupported storage after actual validation; preview support listed separately | B / RN05–06 |
| R14 | Queue/staged intents live in component memory | Durable queue, reattachment rules on web, restart-safe native jobs | A / RN05, RN08 |
| R15 | Direct PUT restarts whole transfer | Resumable protocol where warranted, chunk integrity and expiry recovery | B / RN05 |
| R16 | Batch stops at first error | Per-item pause/retry/remove, explicit independent success/failure | B / RN05 |
| R17 | Global 10 MiB cap and separate plan limits | One policy source, correct quota UI/reservations, measured larger-file budgets | B / RN05 |
| R18 | Metadata checks trust stored content-type | Byte inspection, corruption checks, quarantine and processing statuses | A / RN01, RN05–06 |
| R19 | Processing enqueue failure is swallowed | Durable transactional outbox or repairable delivery; retries/dead-letter diagnostics | A / RN01, RN06 |
| R20 | Completion client accepts successful response without checking ID | Validate completion schema/receipt before reporting cloud backup | A / RN01 |
| R21 | R2 and D1 delete are separate operations | Recoverable lifecycle/outbox reconciliation, no orphaned logical state | A / RN07 |
| R22 | No complete file activity/version UI found | Activity, replace-as-new-version for eligible private files, revision restore | B / RN07, RN10 |
| R23 | Basic owner/shared gate | Separate view/edit/save/copy/tag/reshare/download/print/export grants | A / RN02, RN19 |
| R24 | Signed original URLs used for current previews | Protected gateway and derivative policy before restricted-content preview | A / RN06, RN19 |
| R25 | Official provenance present, richer workflow missing | Save to chapter, source/version date, stale/broken status, authorized update comparison | B / RN03, RN17 |
| R26 | Upload dialog differs from shared accessible overlay | Focus trap/return, Escape, labels, live progress, keyboard drop alternative | B / RN01, all phases |
| N01 | Deprecated browser commands | Structured editor engine with schema and transaction history | A / RN09 |
| N02 | HTML wrapped as JSON | Versioned structured document, stable block IDs, non-destructive legacy adapter | A / RN02, RN09 |
| N03 | Manual save only | Account-scoped local draft capture, durable writes, restart restore | A / RN01, RN10 |
| N04 | Versioned/legacy offline URL mismatch | Canonical route normalization and tested queue/replay compatibility | A / RN01 |
| N05 | No reliable per-note in-flight guard/revision contract in UI | Idempotency, revision preconditions, retain edits made during save | A / RN01, RN10 |
| N06 | No editor history browser | Incremental history, checkpoints, compare/restore, unresolved branch retention | A / RN10 |
| N07 | Local/server sanitizer schemas differ | One versioned schema/validation contract across clients and server | A / RN01–02, RN09 |
| N08 | HTML silently sliced at 200,000 chars; plain text at 120,000 | Explicit safe size limits and validation; no invisible content truncation | A / RN01 |
| N09 | Note body, metadata and links saved in multiple steps | Atomic mutation or recoverable transaction protocol with receipt | A / RN01–02 |
| N10 | Checklist is a literal square character | Interactive task nodes with keyboard support and persistence | B / RN12 |
| N11 | Link/table creation uses prompts; selection not bookmarked | Accessible dialogs, preserved selection, meaningful validation | B / RN09, RN12 |
| N12 | Table fallback selects last table; mutations target last row/column | Selection-aware table commands, safe boundaries, undoable transactions | A / RN01, RN12 |
| N13 | Limited typography controls | Styles, fonts, size, color, highlight, alignment, spacing, indents | B / RN11 |
| N14 | No dedicated undo/redo toolbar/state | Cross-command undo/redo, shortcuts, IME-safe history and active marks | B / RN09–11 |
| N15 | No editor navigation tools | Outline/TOC, find/replace, word/character counts, document zoom/focus | B / RN11 |
| N16 | No professional page model | Page sizes/margins/breaks, header/footer/page numbering, print preview | B / RN13 |
| N17 | Attachments only referenced, not true inline editing | Inline images/captions/resize/crop, safe embeds, attachment cards | B / RN12 |
| N18 | No equations/citations/code/callouts | Editable math, highlighted code, quotes, callouts, nested blocks, references | B / RN12 |
| N19 | No notebook/page architecture | Notebook sections/pages, templates, page thumbnails, reorder/duplicate | B / RN03, RN14 |
| N20 | No ink engine | Pen/highlighter/eraser, stroke objects, stylus pressure where supported | B / RN14 |
| N21 | No canvas object manipulation | Lasso, move/resize/rotate, shapes/ruler, layers, paper backgrounds | B / RN14–15 |
| N22 | No PDF annotation sidecar | Page-anchored ink/text/highlights/comments/bookmarks, split-view notes | B / RN16 |
| N23 | No handwriting/OCR pipeline | Searchable recognized text; editable conversion without losing original | C / RN20 |
| N24 | No audio creation/replay | Local recording, chunk recovery, timestamped typed/ink replay, transcript | C / RN21 |
| N25 | Export is owner JSON in reviewed note route | Permission-aware PDF/Markdown/HTML/JSON, DOCX conversion and round-trip report | B / RN18 |
| N26 | No document imports | Markdown/HTML/plain text/DOCX/PDF intake with fidelity and safety report | B / RN18 |
| N27 | No contextual knowledge links | Stable note/block links, backlinks, transclusion permission checks | B / RN17 |
| N28 | No rich CA study workflow | Academic templates, linked material, revision cards, optional spaced review | B / RN17 |
| N29 | No comments/suggestions/coediting in editor | Anchored threads, tracked suggestions, controlled collaborative working copies | C / RN22 |
| N30 | Native editor is plain text | Shared document contract and matched web/native editing; native offline assets | A / RN08–15 |
| N31 | No measured long-document/stroke budget | Virtualized pages, worker processing, bounded memory, device benchmarks | A / RN00, RN23 |
| N32 | Limited mobile editing controls | Keyboard-safe toolbar, touch handles, accessible navigation, IME/RTL tests | B / RN09–15, RN23 |
| N33 | No optional assistive AI in reviewed editor | Opt-in source-grounded summaries/flashcards with quotas and undo | C / RN22 |
| S01 | Policy/docs and current code do not fully agree | Decision-to-code test matrix; user policy overrides older implementation docs | A / RN00–02 |
| S02 | No end-to-end protection certification in this audit | Every access/export/cache/index/thumbnail path follows inherited policy | A / RN19, RN23 |
| S03 | Native transfer rows do not prove byte resume | Process-kill/reboot/network tests and actual server offset/integrity evidence | A / RN05, RN08 |
| S04 | Browser persistence differs from native guarantees | Honest offline availability, storage-pressure handling and account isolation | A / RN08, RN10 |
| S05 | Native download assembles full bytes plus base64 | Streaming vault bridge/reader design; memory profiling before larger limits | B / RN08 |
| S06 | Production limits and entitlement bindings unmeasured | Inspect deployed configuration; preserve existing billing plan decisions | A / RN00, RN05 |

## 5. Research and product decisions

The following are references for capabilities, not claims of identical licensing or platform support in every competing product. Source review date: 14 October 2026.

| Reference | Relevant capability observed | CA Progress decision |
|---|---|---|
| Google Drive [S1] | List/grid, sorting, folder ordering and contextual preview information | Retain existing layouts; finish real organization, metadata, saved views and scalable queries |
| Google Drive upload API [S2] | Resumable transfer protocol | Persist upload sessions and verify completion rather than calling a whole-file retry “resume” |
| Notion editing [S3] | Movable content blocks | Structured blocks, contextual controls and templates; advanced controls open on demand |
| Notion history/restore [S4] | Recover deleted content and inspect/restore page history | Trash and recoverable versions before bulk destructive operations |
| OneNote [S6] | Typed text, ink, images, lists and media on note pages | Separate Document and Notebook modes with common organization and search |
| Goodnotes annotation [S7], lasso [S8] | PDF markup and object selection/transforms | Page-anchored annotations and a true vector ink/object model |
| Goodnotes audio [S9] | Notes connected to recording time and searchable transcription | Recording/replay and transcription form a separate setup track |
| Obsidian properties [S10] | Structured note properties and property search | Academic metadata, study status and searchable custom properties |
| Google Docs suggestions [S11] | Review edits as suggestions | Optional comments/suggestions on editable working copies, separate from immutable published originals |
| Tiptap [S12], Lexical [S13] | Model-driven editors and extensibility | Benchmark candidates before selecting; no continued expansion of DOM-command editor |
| Cloudflare R2 [S14], D1 [S15] | Multipart object APIs; SQLite FTS5 | Reuse the existing platform; benchmark full-text search before adding a separate search service |

### Proposed workspace

- **Resources:** compact sidebar for My files, notebooks, folders, Recent, Starred, Shared, ICAI and Trash; one search/command bar; filter chips; grid/list/compact; optional details/preview panel. Show controls applicable to selection and permission. Preserve the removed marketing/breadcrumb clutter decision; nested-folder navigation can use a compact location control.
- **Document:** centered writing surface, collapsible outline, compact formatting bar, contextual selection tools, optional source/PDF panel. Focus mode hides surrounding controls. Academic metadata lives in a details panel rather than occupying writing space.
- **Notebook:** page strip, paper templates, floating pen tools, zoom/pan and text boxes. A student can type and handwrite on the same notebook page.
- **PDF annotation:** page thumbnails/search/bookmarks, markup tools and adjacent notes. The original PDF stays unchanged; annotations are a separate permitted working layer.

### Architecture recommendation

1. Keep Next.js/Workers, D1 metadata, R2 objects, browser IndexedDB and the existing native repository/vault. Add capability contracts rather than a second unrelated resource backend.
2. Provisionally prefer **Tiptap/ProseMirror** for typed documents, subject to RN00 comparison with Lexical for Android WebView, offline packaging, accessibility, tables, languages, long documents and extension licenses. Tiptap core is MIT, while hosted services and some advanced features have separate terms [S12]. Do not assume paginated editing, conversions, collaboration, tracked changes or AI are free or already included.
3. Canonical notes use a versioned JSON document with stable block IDs. HTML is an import/export/render derivative. Legacy HTML remains backed up and readable; migration must report unsupported constructs rather than silently drop them. Preserve attachment IDs and community attribution.
4. Ink uses vector strokes/objects and page coordinates; PDF annotations use a versioned sidecar anchored to document revision and page geometry. Do not store an entire notebook as one raster image or large base64 D1 cell.
5. Use immediate local durable edit records, compact operation batches and verified checkpoints. Background upload is separate from local save. Recoverable branches, operation receipts and revision preconditions are mandatory.
6. Owner, folder, notebook, academic classification, source provenance and access rights are distinct concepts. Moving a file must preserve its identity/history/chapter links; folders must not become a permission bypass.
7. Heavy Office/PDF parsing, OCR, malware inspection and thumbnails run in isolated background processing with resource limits, repairable jobs and authorization checks. Untrusted parsers should not inflate the request Worker or block editor interactions.
8. Search indexes and thumbnails inherit access/revocation/no-export classification. Protected storage/delivery must be completed before restricted files enter richer preview, OCR, conversion, collaboration or AI pipelines.
9. Bundle required editor, canvas, PDF worker, fonts and static assets in the APK. No CDN requirement for opening an installed offline editor. Web browser file-handle persistence and background execution cannot be assumed to match native storage/jobs.

## 6. Approved policies carried forward

These are inherited from the prior user-approved scenario plan, not new approvals requested by this audit:

- Published originals are immutable. Editable personal versions are separate identities. A private copy saved under View Only remains read-only.
- No-download/no-export content stays within authorized CA Progress viewing. Encrypted protected caches, thumbnails, revisions and keys cannot become an export loophole. Local backups exclude protected content. Do not promise prevention of all screen capture or immediate revocation while offline.
- Latest reliably ordered actual edit wins using server-synchronized ordering. If order is uncertain, preserve both branches; show the last confirmed common revision and provide on-demand compare/restore in private history. Do not silently use unreliable device wall-clock values. Unresolved branches survive retention cleanup.
- Routine note/file synchronization is invisible. Surface a nonblocking actionable warning for persistent student-fixable blockers, accurately distinguishing local save from cloud backup. Do not copy onboarding's visible sync UI policy into notes.
- Eligible deletion uses 30-day Trash. Nonempty folders cannot be deleted until contents are deliberately moved safely, including nested contents. Moving preserves IDs and academic links.
- Keep Offline pins are device-specific; Clear Cache preserves pins. Do not silently evict student content to make space. Authorization revocation and explicit wipe follow their separate approved rules.
- Web/mobile-site and native APK parity is required. Existing onboarding/account behaviour is preserved; note autosave does not change Chapter Hub/Progress's separate explicit Save/Discard policy.
- Native encryption, OS background jobs, key delivery, sync protocols and permissions require separate setup and verification. Cloudflare paid service does not itself configure any of those systems.

Older September mobile docs specify manual conflict handling; later explicit user scenario decisions above take precedence. Current source must be characterized and migrated rather than assumed compliant.

## 7. Phased implementation plan

Each phase produces a scoped commit, capability/permission matrix updates and reproducible acceptance evidence. Features remain behind appropriate flags until their dependencies pass. Implementation status for every phase below is **planned**; this audit is input to RN00, not a claim that RN00 certification is complete.

### RN00 — Baseline, policy mapping and editor prototypes

- Reproduce the source findings in isolated test accounts; inspect deployed flags/bindings and resource entitlements. Trace all existing resource/note/access/export/native paths and map them to the prior P00–P33 decisions.
- Create representative fixtures: old rich HTML, complex tables, Hindi/English/RTL and IME input, long documents, large PDFs, broken uploads, read-only/protected files, revoked shares and >1,000 items.
- Benchmark Tiptap vs Lexical and ink/PDF candidates. Record licenses, compatibility, package and memory budgets. Capture real current mobile UI and native build provenance.
- **Gate:** measured baseline, retained golden fixtures, rollback/migration strategy and evidence-backed engine decision. No student data migration yet.

### RN01 — Repair current save/upload reliability

- Normalize versioned note routes across queue/projection/replay; preserve old queued operations. Add save re-entry protection and revision/idempotency contract; retain edits made during requests.
- Explicitly reject oversized input instead of truncating; reconcile current sanitization rules; stop unsafe table fallback; protect unsaved legacy drafts during the transition.
- Validate upload completion receipts; make processing dispatch repairable; handle partial note/metadata/link mutations and upload failures. Adopt accessible modal primitives.
- **Gate:** online/offline save, reload, double submit, malformed response and partial failure tests retain content; no false cloud success. This phase is a bounded fix, not a temporary second editor architecture.

### RN02 — Canonical files, documents and permissions

- Add versioned contracts for entries/folders/notebooks, typed blocks, ink/PDF layers, owned copies, immutable publications, grants, revisions, Trash and transfer receipts. Reconcile existing tables before additive migrations.
- Establish stable IDs, parent/cycle rules, source lineage, schema versions, atomic/recoverable mutations and inherited restrictions. Define file-version versus note-revision semantics.
- **Gate:** production-like migration/rollback rehearsal, old-client compatibility and cross-owner/invalid-state tests. Protected features stay gated until RN19 delivery exists.

### RN03 — Real folders, notebooks and file operations

- Nested folders; notebook/section/page organization; move/rename/duplicate eligible private items; tags/academic metadata; Recent/Starred; keyboard/range selection and useful selection actions.
- Preserve chapter links and official provenance. Add Save to chapter for eligible ICAI references. Nonempty folder deletion remains blocked; bulk deletion waits for RN07.
- **Gate:** moves across folders/subjects preserve IDs, history and source; no cycles, cross-account moves or permission escalation; mobile navigation works.

### RN04 — Scalable discovery and saved views

- Cursor-based server filtering/sorting/pagination, deterministic tie breaks, accurate counts and group-aware results. Load bodies on demand and remove the 400-ID extras omission.
- D1 FTS5 prototype for note text and processed file text; facets for folder/type/subject/chapter/tags/owner/date/status. Saved searches, view preferences and accessible command navigation.
- **Gate:** all matching records remain discoverable beyond present caps; access-safe snippets/counts; stable results during concurrent updates; query/memory measurements on large fixtures. OCR text arrives later in RN20.

### RN05 — Durable transfers, validation and storage

- Durable per-file queue, restart/expiry recovery, independent batch outcomes, dedup warnings and atomic quota reservations. Server byte validation/quarantine and safe unsupported-file policy.
- Implement resumable transfer protocol, using R2 multipart where appropriate [S14]; do not assume small files need multipart. Raise size limits only after entitlement, validation, memory and processing budgets pass.
- Browser reload recovery must state when the user needs to reselect a file. Native jobs preserve source handles/bytes securely.
- **Gate:** network loss, repeated finalization, duplicate parts, quota races, altered bytes, crash/relaunch and expired URLs neither lose originals nor duplicate records/accounting.

### RN06 — Processing, thumbnails and previews

- Isolated idempotent pipeline for signature/corruption inspection, scan decision, small image/PDF/Office thumbnails, safe PDF/Office preview and text extraction. Explicit queued/ready/unsupported/quarantined/failed states.
- Durable job/outbox, timeouts, retry/dead-letter visibility and orphan reconciliation. Derived assets inherit original policy and purge rules; restricted content stays gated pending RN19.
- **Gate:** malformed/decompression-heavy fixtures fail within budgets; private thumbnails cannot leak; stale derivatives invalidate; full originals no longer load merely to paint image cards.

### RN07 — Trash, bulk actions and file lifecycle

- 30-day Trash/restore; permission-aware bulk move/tag/Trash; explicit permanent erase; file-version replacement for eligible private files; activity and duplicate handling.
- Reconcile R2/D1 partial outcomes, reference-safe purges and abandoned uploads. Block nonempty folder deletion and preserve independent chapter links.
- **Gate:** offline delete/move/restore, nested folders, expiry races and interrupted cleanup remain recoverable; protected/public originals cannot be overwritten.

### RN08 — Shared web/native storage and background foundation

- Extend existing IndexedDB and native SQLite/vault schemas rather than replace them. Account-isolated document/layer stores, durable transfer/outbox, native background job scheduling and secure session handling.
- Bundle required assets; improve full-buffer/base64 paths where profiling requires streaming. Implement device-local pin and explicit cache cleanup contracts.
- **Gate:** first supported offline launch, relaunch/upgrade/process kill, account switch, disk full and reconnection on emulator and device. Separate native guarantees from browser persistence limitations.

### RN09 — New typed editor and legacy migration

- Introduce selected structured engine, real undo/redo, selection-safe commands, keyboard shortcuts, semantic blocks and accessible dialogs/toolbars.
- Import old HTML into structured documents with preserved attribution/attachments, compare golden renderings and keep original content/recovery path. Enforce matching server schema.
- **Gate:** old notes round-trip with no unexplained loss; IME/paste/undo and Android WebView editing pass. Old clients cannot silently flatten advanced notes.

### RN10 — Autosave, incremental history and recovery

- Durable local draft capture before acknowledging save; autosave batching, manual checkpoint, operation receipts, dependency ordering, checkpoints/deltas and restore/compare UI.
- Preserve every accepted local edit during request, navigation, crash and sign-out scenarios. Apply reliable-time conflict policy; uncertain branches retain common revision without popup or branch erasure.
- **Gate:** crash/restart, simultaneous devices/tabs, skewed clocks, missing delta, offline→online and retention tests reconstruct exact content; normal sync remains silent.

### RN11 — Professional writing controls

- Paragraph/heading styles, bold/italic/underline/strike, sub/superscript, curated fonts/sizes, text/highlight colors, alignment, spacing/indents, nested lists, formatting reset and keyboard shortcuts.
- Outline/TOC, find/replace, counts, zoom, focus mode, selection status, browser spellcheck integration and language controls. Do not label browser spellcheck as a full grammar service.
- **Gate:** mixed-selection formatting, cross-block undo, copy/paste and accessible mobile toolbar all persist through reload/export.

### RN12 — Rich blocks, tables, media and references

- Real tasks, slash insertion, reorderable blocks, callouts/quotes/toggles, code blocks, editable math, dividers and stable block links.
- Tables: row/column insertion at selection, resize, merge/split/header, alignment, multi-cell selection, spreadsheet paste and accessible navigation. Inline images with captions/alt text/resize/crop; safe media/attachment cards, citations/footnotes and source links.
- **Gate:** complex paste, tables, media failure, undo and schema round-trip have deterministic outcomes. External embeds have clear offline fallbacks.

### RN13 — Page layout and publishing-quality output

- Optional page mode with A4/Letter/custom bounds, margins, breaks, header/footer, page numbers, tab stops and print preview; retain continuous writing mode.
- Outline/TOC numbering, print styles, accessible pagination and long-document rendering. Advanced layout capability is evaluated against engine licensing; custom development is explicitly budgeted if needed.
- **Gate:** representative CA answers/tables/footnotes paginate correctly in screen preview and generated PDF without clipping or missing text.

### RN14 — Handwritten notebook core

- Vector ink, pen/highlighter/eraser, thickness/color, pressure/tilt where hardware exposes it, undo/redo, pan/zoom, touch/pen distinction and best-supported palm rejection.
- Page templates: ruled, grid, dotted, blank and accounting sheets. Page thumbnails, add/reorder/duplicate and typed text boxes on ink pages.
- **Gate:** physical stylus testing, rotation, zoom, long strokes and offline crash recovery preserve stroke geometry; document unsupported hardware behaviour honestly.

### RN15 — Advanced canvas and ink manipulation

- Lasso/select, cut/copy/move/resize/rotate/recolor, layering/locking, shape recognition, straightedge/ruler and reusable diagram elements. Page backgrounds and paper settings remain independent of strokes.
- Accessible object list and typed alternatives; incremental object history and bounded page rendering. Infinite canvas is a distinct optional document type, not a forced replacement for notebooks.
- **Gate:** transforms survive save/restore/zoom, undo across tools is consistent and dense notebooks meet measured latency/memory budgets.

### RN16 — PDF reading and annotation

- Search/select existing PDF text, thumbnails, bookmarks, page navigation/rotation, zoom, highlighting, underlining, comments, typed boxes and ink. Split-screen source and notes with stable citations.
- Store annotations separately against immutable PDF revision/page coordinates. Page extraction/reordering or flattening creates a permitted derivative; it never modifies an immutable published source.
- **Gate:** annotations remain aligned across zoom/rotation/reopen/offline; encrypted/restricted files use authorized viewers; long/scanned PDFs remain responsive.

### RN17 — CA study and knowledge workflows

- Templates for accounting workings/journal entries, law case analysis, tax computations, audit checklists, formula sheets and revision summaries. Subject/chapter/topic/unit tagging stays canonical.
- Backlinks, note/block references, linked resource side panel, revision cards/flashcards, optional spaced-review dates and study-session links. Official material retains edition/applicability/source dates.
- **Gate:** links survive rename/move, private content cannot be exposed by backlinks/previews, and templates work offline without filling the editor with required metadata fields.

### RN18 — Import, export, printing and backup

- Intake plain text, Markdown, HTML, DOCX and PDFs with explicit supported-content/fidelity reports; PDFs remain sources or notebook backgrounds rather than pretending every PDF is an editable Word document.
- Permission-aware PDF/Markdown/HTML/JSON exports; DOCX conversion after isolated converter setup. Batch export and local backup inspect inherited restrictions for originals, attachments, previews, deltas and keys.
- **Gate:** round-trip golden documents, backup restore/idempotency and export payload inspection pass. Protected content is excluded; unsafe or unsupported content is never silently discarded.

### RN19 — Complete protected sharing and authorization

- Reuse the P06–P08 key/delivery architecture and P19–P24 snapshot/share graph policy: immutable publication; view/edit-personal-version/save/tag/reshare/download/export controls; source lineage and selective revocation.
- Encrypted in-app restricted delivery and offline caches; no plaintext original URL/backup/print bypass. Authorized alternate share paths remain valid; frozen share settings do not become editable-original semantics.
- Device registry/revocation/wipe and admin diagnostics remain mapped to P29–P30. Wipe is acknowledged only after delivery; native secret/key management requires its own setup.
- **Gate:** negative API/export/cache/thumbnail/search tests across owner, recipient, revoked user and admin; private View Only copies remain read-only. Restricted capabilities in earlier phases cannot leave their gate until this passes.

### RN20 — OCR, handwriting recognition and indexed content

- Isolated OCR/recognition pipeline for scanned PDFs/images and handwriting; language/accuracy evaluation, searchable text with page/stroke anchors and editable conversion while retaining originals.
- Decide on-device versus hosted models, consent, data boundaries, indexing cost and processing quotas. No protected file goes to a provider without a policy-compliant execution path.
- **Gate:** representative English/Hindi/mixed notation corpus, correction workflow, denied/revoked indexing access, large-file budgets and failed-job recovery. Recognition is assistive, not guaranteed perfect.

### RN21 — Audio capture, replay and transcription

- Local audio recording with permissions, pause/resume, durable chunks, playback speed/bookmarks and synchronized typed/ink timestamps. Recording recovery and device background limitations are explicit.
- Separate transcription adapter, language support, timestamps, corrections, private search and storage accounting. Recording works without requiring a transcript provider.
- **Gate:** interrupted/restarted recordings do not silently lose captured chunks; denied microphone, screen lock, device routing, offline playback and transcript failures are tested.

### RN22 — Review, collaboration and optional assistance

- Anchored comments, resolved threads, suggestions/accept/reject, reviewer roles and version attribution on editable working copies. Live coediting needs its own presence/transport/authorization and shared-document merge design.
- CRDT coediting must not silently replace the approved offline conflict policy for personal documents. Published originals remain frozen; collaborative drafts publish new snapshots.
- Optional AI: explicitly invoked summaries, explanations, rewrite, citations and flashcards with source references, undo, provider/data policy and spend caps. Core writing/ink never depends on AI availability.
- **Gate:** permission revocation, reconnect, comment anchors, suggestion history, collaborative branches and provider failure/spend tests pass. Collaboration and AI are independently switchable.

### RN23 — Full web/APK certification and staged release

- End-to-end student journeys across web, mobile browser and installed APK; migration/restore drills, security/access matrix, storage/full-network fault injection and production-like load.
- Physical-device pen/palm/rotation/keyboard tests; accessibility, dark mode, touch targets, screen readers, RTL/IME and old-client handling. Verify native bundled assets and signed build provenance.
- Staged flags/backfill: fixtures → controlled accounts → limited rollout → wider release with rollback and repair dashboards. No “live” claim based only on a successful build.
- **Gate:** no open data-loss/unauthorized-access blockers; reproducible behaviour/performance evidence; completed device matrix and rollback drill. Mark unavailable device checks as open rather than passed.

## 8. Dependency and milestone map

| Milestone | Phases | Deliverable |
|---|---|---|
| Trustworthy foundation | RN00–02 | Reproduced defects fixed; canonical contracts and safe migration |
| Complete file manager | RN03–08 | Real organization, search, transfers, previews, recovery and storage parity |
| Professional typed notes | RN09–13 | Structured writing, local recovery/history, rich content and page layout |
| Complete write-and-type workspace | RN14–18 | Handwriting, advanced ink, PDF workflow, study tools and portable output |
| Protected sharing | RN19 | Full inherited permission enforcement across every surface |
| Advanced capture and teamwork | RN20–22 | Recognition, audio, review/coediting and optional AI |
| Certified release | RN23 | Measured web/APK acceptance and staged rollout |

RN00–02 precede schema-dependent work. RN08 is required before native offline completion claims. RN09–10 precede complex writing features. RN14 precedes RN15; RN06/RN09/RN14 support RN16. RN19 enforcement is a prerequisite for exposing restricted material to any advanced pipeline, regardless of numeric order. Validation, accessibility, native parity and permission tests apply during every phase, not only RN23.

### Mapping to the existing 34-phase security plan

| Existing phases | New roadmap integration |
|---|---|
| P00–P03 policy/audit/contracts/staging | RN00–02 |
| P04–P05 D1/R2 | RN02, RN05–07 |
| P06–P08 encryption/keys/delivery | RN19, with gates in RN06/RN08/RN16/RN18 |
| P09–P11 validation/transfers/quota | RN01, RN05–06 |
| P12–P15 browser/native storage/jobs | RN08, RN10, native acceptance throughout |
| P16–P18 sync and owned multi-device files | RN08–10 |
| P19–P24 publication/sharing/revocation/viewing/cache | RN19 and shared-policy tests in all dependent phases |
| P25–P26 delta history/conflicts | RN02, RN10 |
| P27–P28 Trash/folder/backup | RN07, RN18 |
| P29–P30 device security/admin | RN19, RN23; retain separate setup |
| P31–P33 security/UX/rollout | Per-phase gates plus RN23 |

## 9. Setup tracks and acceptance budgets

Separate setup does not mean stop routine work for permission. Prepare concrete code/configuration and verification; identify any actual missing account credential, provisioning decision or paid service before dependent rollout.

| Track | Required setup | Phase |
|---|---|---|
| Editor | Candidate benchmark, licenses, server schema and legacy adapter | RN00, RN09 |
| D1/search | Additive migrations, indexes/FTS prototype, backfill and query benchmarks | RN02–04 |
| R2/transfers | Multipart/session lifecycle, integrity, quota reservations and cleanup | RN05 |
| Processing | Isolated PDF/Office/scan jobs, queue/outbox, derivative access | RN06 |
| Native | APK assets, SQLite/vault migrations, streaming bridge, OS jobs and devices | RN08, RN14–16 |
| History/sync | Delta/checkpoint engine, receipts, time-confidence metadata, branch recovery | RN10 |
| Protected content | Reviewed encryption, key provisioning/rotation, gateway, offline grants | RN19 |
| Recognition | OCR/handwriting model/provider, languages, cost and policy evaluation | RN20 |
| Audio | Microphone/codec/storage/background rules; independent transcript provider | RN21 |
| Collaboration/AI | Shared-draft transport, authorization/merge contract; separate AI provider/budget | RN22 |

Proposed performance targets to validate in RN00, **not current measured results**: p95 simple typing response under 50 ms on the declared reference device; p95 local draft commit under 300 ms after a bounded edit batch; visible pen feedback within one or two display frames where hardware permits; no full-original download merely for a thumbnail. Define document/page/stroke, file-size and low-memory budgets using actual reference devices and fixtures before locking numeric release thresholds. Track cold/warm/offline startup, page seek, save, restore, memory, query time and bundle size as separate measurements.

Required behavioural evidence includes: accessible keyboard-only create/open/move/edit/restore; >1,000-item search; duplicate/restarted uploads and quota races; malformed/unsafe file handling; two tabs/devices and unreliable clocks; crash after local commit/before server receipt; revoked access to search/previews/exports; backup payload inspection; native kill/reboot/upgrade and physical stylus cases. Existing test counts are not proof these new flows work.

## 10. Research sources

- **S1:** [Google Drive — view and reorder files/folders](https://support.google.com/drive/answer/2375177?hl=en).
- **S2:** [Google Drive API — manage uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads).
- **S3:** [Notion — writing and editing basics](https://www.notion.com/help/writing-and-editing-basics).
- **S4:** [Notion — delete and restore content](https://www.notion.com/help/duplicate-delete-and-restore-content).
- **S5:** [MDN — document.execCommand](https://developer.mozilla.org/en-US/docs/Web/API/Document/execCommand).
- **S6:** [Microsoft OneNote — take and format notes](https://support.microsoft.com/en-us/onenote/take-and-format-notes).
- **S7:** [Goodnotes — PDF annotation](https://www.goodnotes.com/features/pdf-annotation).
- **S8:** [Goodnotes Support — select, move and edit with lasso](https://support.goodnotes.com/hc/en-us/articles/7353695644175-Select-Move-and-Edit-Content-With-the-Lasso-Tool).
- **S9:** [Goodnotes — audio recording](https://www.goodnotes.com/features/audio-recording).
- **S10:** [Obsidian — properties](https://obsidian.md/help/properties).
- **S11:** [Google Docs — suggest edits](https://support.google.com/docs/answer/6033474?hl=en-R).
- **S12:** [Tiptap — editor overview](https://tiptap.dev/docs/editor/getting-started/overview).
- **S13:** [Lexical — comparison with ProseMirror](https://lexical.dev/docs/concepts/compared-with-prosemirror).
- **S14:** [Cloudflare R2 — multipart API from Workers](https://developers.cloudflare.com/r2/api/workers/workers-multipart-usage/).
- **S15:** [Cloudflare D1 — SQL support including FTS5](https://developers.cloudflare.com/d1/sql-api/sql-statements/).

Next implementation step: **RN00**. It should finish the runtime/device baseline and engine selection using this audit, then RN01 repairs the existing save/upload paths before larger UI expansion.
