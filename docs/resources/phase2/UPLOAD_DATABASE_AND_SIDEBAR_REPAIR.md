# Upload database and sidebar repair

The upload picker now asks only for files. New files use their filenames as titles, are private, and have null subject/chapter IDs. Chapter tagging remains available after upload through File details → Rename or move file. The picker closes once files are safely queued on the device.

A separate, non-modal, minimizable upload sidebar shows each file's status, real byte transfer percentage, pause, retry, reselect and dismiss controls. Browser XMLHttpRequest upload events measure in-flight bytes; confirmed multipart receipts provide the resume baseline. Percentages are weighted by bytes, including the smaller last part. There are no preset 85/95/98-percent milestones or timers. Reaching 100% bytes sent does not mean saved: the sidebar shows “Saving file…” until the server returns the saved resource ID. The queue persists across Resources reloads; this does not claim background execution after closing the browser or navigating away from Resources.

## Database corrections

- The old upload picker sent empty subject/chapter strings. Those strings reached foreign-key columns instead of SQL null and caused `SQLITE_CONSTRAINT_FOREIGNKEY` at metadata insertion. New intent creation, completion of legacy intents, and central quota-aware inserts normalize optional empty IDs to null. Explicit selected IDs are checked for existence and subject/chapter relationship before completion.
- A database metadata failure now retains verified originals and the issued intent so the same transfer can be retried. Foreign-key failures are presented as a recoverable file-details error rather than raw D1 output.
- Migration 0097 still constrained receipts to two parts. Additive migration 0098 preserves the original table, backfills a new 1–10000-part receipt table, and forwards legacy inserts/updates through triggers. New workers read expanded receipts and write the first two through the legacy table for rollout compatibility. Foreign keys remain enabled; original migration history is unchanged.

## Verification

Upload/sidebar source: `58c674329e81d881f343663c823b95aff0b55129`. Final release source, including signed-download correction: `aa07463d1544ba6a19af6aa0d364e4ab088ac087`.

Local TypeScript and full lint pass. All 1,371 tests pass, including real SQLite foreign-key reproduction, legacy blank-intent completion, retained bytes after simulated metadata failure, migration/backfill/forwarding constraints, three-part assembly/finalization, and byte-weighted progress before server save confirmation.

The release workflow additionally checks the real middleware and upload UI at 1440px and 390px, queue recovery after reload, separate/minimizable sidebar, private unclassified descriptors, backup restore, retained migrations, web Worker build/size/smoke, rollout readiness, and authentication boundaries.

A new post-deployment gate provisions an isolated normal password test account, uploads three actual parts through the deployed API, finalizes with real D1 foreign keys and R2 storage, checks null classification and idempotent completion, and hashes the private original downloaded through its authenticated access route. Credentials and signed URLs are never logged. Cleanup only removes fixture-owned resources/objects and disables the fixture account with its sessions revoked.

Production release outcome: **passed**, 15 October 2026, 03:25 UTC / 08:55 IST.

- [Successful release workflow 38675117150](https://github.com/Dellybizz/ca-progress-v2/actions/runs/38675117150): verification job `116226984899`, deployment job `116228361150`.
- Web Worker `74ae48cc-435a-47aa-af93-27c500c060c5`; compressed size 3637.74 KiB, within the 3.75 MiB guard.
- Preview processor `a0e6d1f4-042b-4cc1-b5d3-5679ebee1fd4`; compressed size 509.67 KiB.
- Migrations 0095–0098 present, foreign-key check clean, private restore drill passed.
- Actual normal-account 12 MiB + 123 byte PDF: all three parts accepted; resource saved with null classification; completion replay returns the same ID; private original download has the exact SHA-256; final fixture resources/bytes removed, sessions revoked and account disabled.

The live gate exposed a separate existing signed-GET defect: locale-based sorting put lowercase response overrides before uppercase SigV4 fields. Canonical encoded ASCII ordering fixes the download 403. Two new GET/PUT tests compare the signature with an independent `aws4fetch` signer, including encoded Unicode paths and response overrides.

Earlier release 38673522090 deployed the UI/database repair but its live gate failed: account-level R2 CLI cleanup masked the initial signed-download failure. Follow-up certification isolated the 403 and cleanup was changed to authenticated fixture-owned cancellation through the deployed R2 binding. That earlier attempt is not recorded as a passing end-to-end release. Its account was disabled; deletion of its synthetic R2 test object through the failed CLI was not confirmed. The subsequent [file-manager Phase 0 audit](../file-manager-polish/phase0/PHASE_0_STATUS.md) uniquely identified that historical fixture account and found zero objects in its upload prefix in both inventories, resolving the uncertainty without deletion. No user document was used in these tests.

Next Resources feature phases are paused for the [file-manager polish plan](../file-manager-polish/RESEARCH_AND_IMPLEMENTATION_PLAN.md); Phase 3 typed notes remains unreleased; this repair does not release the editor or claim a new native APK.
