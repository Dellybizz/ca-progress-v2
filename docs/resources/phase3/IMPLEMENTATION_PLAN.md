# Phase 3 — Professional typed notes

User direction: finish the file manager for now; apply the same attention to spacing, placement, responsiveness and speed to a separate Notes feature. This is an adaptation to CA Progress, not a copy of another editor.

## Delivery order

1. Lock the document/save contract and legacy recovery. Add the selected Tiptap engine, server validation and a safe HTML derivative. Preserve existing IDs, original imported HTML, attribution and attachment permissions. Reject old-client saves that would flatten a structured document.
2. Build the writing surface. One compact header owns Back, title, save state and primary Save. A grouped toolbar owns formatting; an Insert menu owns rich blocks. A scrollable central canvas owns writing. Optional Outline and Details panels never push basic writing controls offscreen.
3. Finish real writing tools. Semantic headings, marks, fonts/sizes/colors, alignment, paragraph spacing/indentation, nested lists/tasks, undo/redo, find/replace, outline, word counts, focus, language/direction and keyboard shortcuts. Slash insertion and selected-block movement use the same schema as toolbar commands.
4. Finish rich content and output. Selection-aware tables with resize/merge/split/header controls; owned inline images with alt/caption/size/crop; attachment/reference cards; equations; callouts, code, dividers and page breaks. Continuous/page-width modes and explicit A4/Letter/custom print settings feed the browser's actual paginated print/PDF preview, not a simulated pagination claim.
5. Certify and release. Exercise actual editor typing, IME/composition, paste, mixed-language content, undo, legacy migration, server round-trip, local recovery, concurrent save rejection, image failure and six responsive widths. Review screenshots and print output, then publish/deploy and verify live persistence. Record device-specific limitations honestly; a desktop emulator does not certify a physical stylus or Android keyboard.

## Placement and density

| Surface | Desktop | Mobile |
|---|---|---|
| Header | Single 48–56px row; flexible title, subtle state, Save and More | Back/title/Save in one row; secondary actions in More |
| Formatting | 36–40px controls in semantic groups; active/disabled state | One horizontal tool strip with touch targets, no page overflow; deeper actions in compact panels |
| Document | Centred readable column; small outer gutters; continuous mode default | Uses available width; 16px minimum body text, comfortable line spacing and small side gutters |
| Outline/details | Optional bounded panel; closed by default | Modal sheet with own scrolling, close control and focus restoration |
| Insert/link/table/math | Accessible in-app dialog/popover with explicit Apply | Fits 320px width; form fields scroll; action footer remains reachable above keyboard |
| Status | Quiet local/cloud state; real errors actionable without covering writing | Same; no permanent success bars or routine sync banners |
| Footer | Small counts and page/view controls in a defined location | Compact; accounts for app navigation, safe area and keyboard viewport |

No duplicate Create/Edit headings, metadata cards around the editor, prompt/confirm-based formatting, placeholders presented as working features or decorative zoom slider. Metadata (subject/chapter/unit, tags, privacy, attachments) belongs in Details. Community attribution remains retained and inspectable.

## Persistence and failures

- Each document has a versioned structured tree; the server validates node/mark types, attributes, size/depth, linked resources and layout, then derives HTML itself. Client HTML cannot bypass that schema.
- Durable owner/context-scoped local drafts precede background network saves. Saving an earlier snapshot never marks later typing saved or removes its draft. New-note retries reuse a stable ID. Network errors retain the document; reload/navigation guards cover unpersisted changes.
- Recover drafts explicitly without replacing current typing. Tab/context changes and stale server revisions must not overwrite newer content. Rich notes remain structured in offline queued mutations and export.
- Local draft/autosave foundations ship here. Full incremental history, cross-device conflict reconciliation, native OS background jobs and native editor parity remain Phase 4 work; handwriting/PDF annotations remain Phase 5.

## CA Formats library — added user requirement

A searchable, ready-to-use library covers financial statements, books/accounts, CA workings and diagrams, with multiple variants per format. Configure titles, periods/parties, currency, columns and line items before insertion. Financial layouts become ordinary editable document tables, not images. Charts/hierarchies/branch trees/flowcharts retain editable data and can be reconfigured after insertion. Amounts start blank; no automatic-calculation or statutory-compliance claim is made. The initial catalogue includes balance sheets, P&L/trading/cash-flow/NPO statements, ledgers, journals, trial balances, cash/petty-cash books, partnership, branch/departmental/investment/revaluation accounts, cost sheets, depreciation, bank reconciliation, consolidation, ratios, budgets, variances, tax and audit workings. Multiple chart orientations, pie/doughnut and parent-child structures are separate real configurations. Editable labels/rows cover exercise-specific variations.

Primary topic references (independently authored study structures): https://www.icai.org/post/17757 ; https://asb.icai.org/index.php/web/home/checklist_and_format/formats .

## Release gates

- Legacy fixtures retain text, formatting, merged table spans, direction, source and attachment identity; unknown future formats fail safely.
- Actual browser tests cover editing, selection-safe commands, keyboard undo, lists/tasks, tables, image/reference/math edits, recovery and save while typing; no horizontal page overflow at 320, 390, 768, 820, 1024 and 1440px.
- Server tests refuse invalid trees, unsafe links/images, foreign attachments and flattening writes; exact structured document survives save/reload/export. Printing keeps representative CA text/table content without clipping.
- Existing file-manager and upload checks remain green. Deployment must use the exact tested source and pass live account/file access checks.

Primary references: https://tiptap.dev/docs/editor/getting-started/install/nextjs ; https://tiptap.dev/docs/editor/extensions/nodes/table ; https://tiptap.dev/docs/guides/performance . Dependencies are pinned; only OSS editor components are used.

## Implementation verification — 17 October 2026

Implemented the separate typed-note authoring surface, strict versioned documents, original legacy HTML retention, owner/context IndexedDB recovery, guarded saves and Resources discovery. The initial catalogue has 30 formats with 82 variants; tables remain editable and charts retain their data for reconfiguration. Subject/chapter/unit and file selection are scoped, unknown future documents are protected, and duplicate notes receive their own document identity.

Local validation: 1,419 tests passed; TypeScript and ESLint passed. Actual browser checks cover 320/390/768/820/1024/1440px layouts, format/chart configuration, table edits/undo, equations, images, metadata, save while typing, failed-save recovery and legacy RTL/merged tables. File-manager regression checks cover cached navigation, touch/keyboard/drag selection and marquee edge scrolling. Browser-generated A4 PDF output was reviewed, including equations and mixed-language text. CI repeats these checks before release, then exercises an isolated authenticated account against deployed D1 for exact structured-note save/reload, Resources discovery, update and stale-write refusal.

Physical Android keyboard/stylus behavior is not certified by these browser checks. Incremental history, cross-device reconciliation, native background jobs and handwriting/PDF annotation remain subsequent phases.
