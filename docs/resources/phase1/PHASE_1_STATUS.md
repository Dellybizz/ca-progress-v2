# Phase 1 — Reliable file manager implementation

15 October 2026. Based on the Phase 0 tree on `onboarding-design-phase7`.

## Implemented and locally verified

- Nested owner-scoped folders, folder rename/move, cycle checks, empty-folder deletion and restoration. Moves retain original file IDs, stored content and independent chapter links.
- All files, folders, Recent, Starred and Trash; account-scoped saved queries; grid/list/compact layouts; range selection; bulk move/star/Trash/restore with independent outcomes.
- Server-side full note-text and metadata search, filters, multi-key sort/group and cursor continuation. Tests traverse 1,001 records, Unicode titles and all sort directions without omissions. Listings use excerpts, not complete note HTML. Note extras are fetched in bounded chunks rather than silently dropping records after 400 IDs.
- Recoverable 30-day deletion. Shared listings, detail/access routes and edits reject trashed content. Expired R2/D1 cleanup retries; restoration cannot race an already claimed purge. Nonempty folder deletion is blocked.
- Versioned note route normalization; explicit byte limits instead of content truncation; atomic note/tags/links/metadata/create receipts; create idempotency; in-flight save protection; preserve edits made while a save is running; account-scoped IndexedDB legacy draft recovery.
- Upload completion receipt validation, preserving committed storage on retry/partial failure, a repairable processing outbox, and the common accessible upload modal.
- Additive `0095_resource_workspace.sql` registered in migration runners. Fixture rehearsal runs all migrations, repeats 0095, checks ownership/cycles/restoration and verifies account deletion and foreign keys.

## Validation

- 1,318 Node tests passed, zero failed/skipped.
- TypeScript and ESLint passed.
- Next production build passed with webpack. Turbopack rejected the dependency symlink used by this isolated checkout; webpack compiled the same application successfully.
- No live migrations, deployment, APK build or physical-device checks were performed by this change.

## Completion update — implementation complete, release verification pending

The previously open feature scope is implemented: notebooks and sections with note pages; private note and upload duplication; bulk tags; permanent deletion with confirmed purge claims; owner-scoped activity; private file replacement and restoration with retained source versions; owner/status/tag/date facets; stale-cursor restart; indexed-search prototype; durable browser folder/move/star/Trash/restore queue replay with conflict and predecessor guards.

Further preservation fixes include atomic online note revision guards, retaining complete descriptions during metadata-only renames, and preventing quota cleanup from deleting a referenced version. Account deletion explicitly removes version relationships before its owned uploads. Migration 0096 adds the organization/lifecycle tables without changing old content. Existing note/upload identifiers and source metadata remain intact.

Private file versions point to immutable, separately uploaded owned file records. They cannot be made public through the visibility controls. Selecting a replacement searches and pages through the complete eligible file collection. Source files retained by versions cannot be permanently erased until their containing file is erased.

### Release evidence and limits

- Repository suite: 1,328 tests passed after the completion changes, including actual offline API replay, stale-save rollback, description retention and source-version cleanup protection.
- TypeScript, ESLint, production Next build, native asset bundling and OpenNext build passed locally.
- Last checked Worker: 3.421 MiB compressed, within the existing 3.75 MiB repository guard; the final release reruns that guard.
- The SQLite FTS5 prototype inspected 10,001 fixture records and verified owner-safe results. Production search currently retains the safe complete-text SQL path; production D1 FTS rollout is not claimed by the prototype.
- Local Chromium installation was blocked by a truncated network download. Local Worker runtime smoke was blocked by `uv_interface_addresses` in the restricted host. These checks are not marked passed.
- `.github/workflows/resources-phase1.yml` runs repository/build/native checks, real-component browser fixtures at 1440/390 px, Worker size/runtime checks, a private D1 export/isolated restore drill, retained migrations, and live authentication-boundary checks before/after web deployment. It never uploads the private database export.
- Native assets compile; a new APK and physical-device certification are not supplied by this change. Phase 4 remains responsible for the expanded native persistence/jobs and process-kill guarantees. Cached browser views are explicitly limited to their saved pages while disconnected; complete server search requires a connection.

Production rollout is only complete when the exact-commit workflow passes its browser, restore, runtime, migration and live checks. Until then, source implementation is complete and live release remains pending. Rollback keeps both additive migrations and recoverable content.

## Final preservation checks

The release follow-up preserves omitted tags, visibility, academic metadata and linked files when an older client edits a note. Existing owned attachments remain linked while in Trash; newly attaching a Trashed file is rejected. Open editors bind writes and draft persistence to the account and study context in which they opened. Malformed IDs cannot silently create a different note. Existing online revision guards and offline replay protection remain in place.

- Full suite: 1,329 passed before the final attachment regression; all 23 focused workspace tests passed with that regression (expected full total 1,330).
- TypeScript and production OpenNext build passed. Final CI reruns lint, tests, size and runtime checks for the exact commit.
