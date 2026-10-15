# Phase 2 — Uploads and previews

15 October 2026. Additive release based on deployed Phase 1 commit 9241d031.

## Implemented

- Account-scoped browser queue persists source Blobs, descriptors, hashes and receipts in the existing IndexedDB store. Per-file outcomes, reload recovery, explicit reselection when source bytes are unavailable, duplicate warnings, pause/resume, and independent retries. Closing the dialog keeps the queue running while the Resources page remains mounted.
- Files up to 5 MiB retain direct signed PUT. Larger files within the unchanged 10 MiB cap use 5 MiB R2 multipart parts. D1 owns the receipts, expiration, ownership, hashes and completion leases. Repeated finalization reconciles an existing resource. Accepted bytes are copied to an immutable key never exposed through an upload URL.
- Atomic quota reservations include resource/test-attachment pending space. The final metadata INSERT/SELECT also respects committed bytes and other reservations, including racing private copies. Copy operations cannot bypass inspection.
- Server signature and structural inspection; bounded PNG decoding/checksums, JPEG/WebP frame/dimension checks, PDF envelope and isolated parsing, and DOCX directory/checksum/decompression/XML budgets. Altered bytes are quarantined before metadata creation. Processing states are queued, processing, ready, unsupported, quarantined and failed.
- A separate private Cloudflare Worker (`ca-progress-v2-resources-preview`) performs bounded PDF text extraction and safe DOCX extraction. It has no public route. Queue retries/dead letters retain operational visibility. Processing is idempotent against immutable source identity/ETag.
- Private bounded image thumbnails and first-page PDF thumbnails use browser Web Workers/canvas. PDF/DOCX text covers provide a safe fallback; Word previews render escaped extracted text without third-party viewers. Cards never request full originals to paint thumbnails.
- Preview authorization follows ownership, current Community approval, Trash, active private file version and current source ETag. Both browser and native original-delivery routes block quarantined/pending inspections. Derivative deletion uses a durable cleanup outbox and follows source/account deletion.
- Native uploads preserve source bytes in the existing account vault and receipts in SQLite. Foreground startup/resume/connectivity recovery, upload queue controls and the same server protocol are bundled with the app. Binary native parts use bounded JSON/base64 transport through the existing authenticated native HTTP layer.

## Verification

- 14 behavioural tests exercise real D1 SQL, finalization, hash/part/claim recovery, quota races, malformed files, actual PDF parsing, Word extraction, private/stale/Trashed previews, source freezing and retry reconciliation.
- Repository suite: 1,344 passed before the final review; final CI reruns the exact commit.
- TypeScript, ESLint, native asset bundling and production Next build passed locally. Isolated processor dry run: approximately 509 KiB gzip, below its 0.75 MiB guard.
- Release gates include actual desktop/mobile component browser fixtures for independent upload outcomes and part-only resume after reload, Worker build/size/runtime checks, private production backup/restore rehearsal, additive migration 0097, processor deployment, web deployment, and live authentication-boundary checks.

## Explicit boundaries

The inspection decision is structural-only, not a third-party antivirus certification. Legacy binary DOC, encrypted/image-only PDF text extraction and unsupported formats report unavailable previews; their originals are not converted into invented content. PDF extraction is bounded to 300-page documents and the first 20 pages/128,000 characters for search text. Full source PDF viewing remains explicit through the protected original route. Browser storage can be evicted by the OS; missing source bytes require exact-hash reselection. Native sources and foreground recovery are implemented, but this release does not certify OS background scheduling, physical-device process-kill behaviour or a new signed APK. Expanded native job guarantees remain Phase 4.

Production status remains pending until the exact-commit release workflow and live checks pass. Both migrations and originals are retained on application rollback.
