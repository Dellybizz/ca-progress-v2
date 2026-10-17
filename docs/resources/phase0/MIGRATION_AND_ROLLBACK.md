# Additive migration and rollback plan

Phase 0 changes no production schema, objects or student records. Future migrations must follow this sequence.

1. **Freeze provenance.** Record deployed web/API SHA, native build SHA, D1 migration ledger, R2 bindings and feature flags immediately before implementation deployment. Repo currently declares a D1 database and R2 bucket with historic staging names while app vars say production: verify bindings, not names alone. `NEXT_PUBLIC_OFFLINE_ENABLED` is build-time; absence from checked-in vars does not establish the deployed value.
2. **Prepare isolated fixtures.** Use non-production accounts/data for old rich HTML, complex tables, mixed scripts, 1,001 items per collection, corrupt files, interrupted intents, skewed clocks, read-only copies, revoked shares and pending old queues. Current editor benchmark fixtures are in `tools/resources-editor-spike/benchmark.mjs`; SQL-limit fixtures are in `scripts/resources/phase0-baseline.mjs`.
3. **Protect existing state.** Use authorized operator backup/restore procedures for D1 and reachable R2 objects; verify restore in an isolated target. This is distinct from student-exportable backups. Neither a student backup nor a generated test artifact may contain protected bytes, encrypted packages, keys or recoverable protected derivatives. No real backup was exported by Phase 0.
4. **Add, do not replace.** Add schema versions, folder/source/version relations and needed indexes without dropping existing notes/uploads, IDs, HTML or links. New migration number is reserved only at implementation time after remote ledger/head checks. No blind reset or blanket destructive rollback.
5. **Keep legacy content.** Import old HTML using explicit adapters and stable block IDs. Compare semantic text, headings, links, tables/spans, highlights, direction and attribution. Keep original HTML and conversion result until verified. Unsupported constructs produce a report and recovery choice, not silent removal. Never re-save old HTML through a truncating sanitizer as a migration mechanism.
6. **Canonicalize once.** Tiptap's default trailing-node behaviour can append an empty paragraph after a terminal table on a subsequent transaction. Define canonical import once before assigning the first content hash; require subsequent JSON round-trip stability. Preserve original source hash separately. Do not create endless autosave revisions for normalization-only differences.
7. **Migrate queues independently.** Accept both legacy and versioned note routes through one normalization adapter before editing new queued envelopes. Preserve owner/context, idempotency IDs, baselines and predecessor order. Stale/unknown envelopes remain recoverable, not discarded or blindly replayed. Account handoff must not attach another account's drafts.
8. **Introduce new reads behind flags.** Separate switches for resource listing, document v1, local drafts, history, previews and protected delivery. Compare old/new read results and counts in isolated fixtures. Restriction enforcement precedes any restricted preview/export/index exposure. Do not enable protected features based on UI-only controls.
9. **Guard old clients.** A client without the new document schema may read a safe derivative if authorized but cannot overwrite/flatten advanced content. Return an explicit unsupported-client result. Keep legacy edits only for legacy-format documents until converted; do not blindly dual-write canonical and HTML representations independently.
10. **Prove rollback.** Disable affected new feature flags, retain new documents/revisions read-only with authorized recovery, restore legacy views for unaffected content and preserve outbox receipts. Do not restore a database snapshot over newer student work or erase new schema columns to roll back UI. Forward repair is preferred for data already committed.
11. **Reconcile object state.** Scan staged intents, processing receipts and logical references before removing unreferenced objects. Account for revisions, Trash, lawful copies and unresolved branches; no automatic deletion of student content to free quota. Purge only according to the approved lifecycle/security rules.
12. **Release with evidence.** Record tests, runtime smoke, deploy SHA, web/mobile visual checks, native build provenance and rollback result per phase. A green existing unit suite does not certify new offline/crypto/stylus scenarios. Physical-device gaps stay open until tested.

## Proposed backfill gates

| Gate | Evidence required before proceeding |
|---|---|
| Schema | Existing and new clients read old records; constraints prevent cross-owner parents and invalid references |
| Content | Exact text and supported formatting retained; canonical JSON stabilizes; source/attachment metadata unchanged |
| Listing | More than current caps remain discoverable; stable cursors/counts; no unauthorized snippets |
| Offline | Old pending saves survive schema upgrade, crash and account change; local receipts precede network |
| History | Every retained revision reconstructs; uncertain branches remain retained and common version displayed |
| Protected | Original, thumbnail, OCR, delta, download, print, backup and native bridge share one effective policy |
| Rollback | Flag rollback tested with mixed old/new documents and unapplied offline operations |

## Immediate Phase 1 order

1. Versioned note-route normalization and backward-compatible queue replay.
2. Explicit note size rejection, content preservation and reliable save/receipt handling.
3. Reproduce and repair partial note/upload completion paths before adding bulk operations.
4. Add folder/entry schema plus migration tests; implement real folder operations without deleting nonempty folders.
5. Cursor-based listing/search and page-scoped note extras; preserve current layouts and routes.
6. Add Trash/restore and only then bulk destructive actions. Verify accessible dialogs and mobile navigation throughout.
