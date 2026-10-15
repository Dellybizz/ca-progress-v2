# Upload recovery and larger originals — 15 October 2026

The direct-R2 recovery repair is live from source `0b3fc48c3e49af9c2fc196f9bddf89e64b63d8cc`. Release [38666053803](https://github.com/Dellybizz/ca-progress-v2/actions/runs/38666053803) passed 1,347 tests, native bundling, desktop/mobile blocked-PUT fallback and reload/resume checks, production Worker build/smoke, private backup/restore and live authentication verification. Web Worker version: `9f7ef52f-1895-4e1c-a21b-3f9f632f876b`. Processor version: `4fd4ea24-c28d-443f-ba11-e24a6ec55b5f`.

When a small direct PUT fails or times out, the queue retries through the authenticated application origin using the same intent, owner, hash, size, quota reservation, lease and finalization checks. Pausing and expired/changed ownership do not launch another request. A failed fallback retains the original source and transfer for retry. No migration was required.

## Follow-up: remove Resources per-file size limits

At the user's request, remove the 10 MiB application upload cap and Resources per-file plan restriction. Total storage entitlement, allowed file types and ownership checks remain enforced. Test-attempt attachment behavior is kept separate from Resources and unchanged.

- Hash files in 5 MiB slices in the browser instead of reading a whole file into memory.
- Reuse resumable multipart transfer for larger originals. Assemble directly into an owner-scoped immutable key that has never been exposed in a single-PUT URL, avoiding a second giant copy or the R2 single-PUT ceiling.
- Verify every source byte with incremental SHA-256, exact size and bounded container prefix/directory/trailer checks. Verification leases are renewed during long reads. Temporary reads/storage failures retain the source for retry; invalid bytes remain quarantined.
- Preserve full parsing and decompression budgets for small files. Larger originals are explicitly download-only; server byte budgets govern preview work, not upload acceptance. Do not claim full parser validation, antivirus scanning or a generated preview for these files.
- Copy large originals using bounded multipart writes. Download access retains ownership, moderation, Trash and inspection checks.
- Remove the browser/native source checks and the “10 MB each” label. No new APK delivery is claimed.

The application cap removal does not remove underlying service, device storage, memory or format constraints. R2 documents multipart and object limits in its [official limits](https://developers.cloudflare.com/r2/platform/limits/) and [upload guide](https://developers.cloudflare.com/r2/objects/upload-objects/). Current proxy parts remain 5 MiB, so R2's 10,000-part ceiling is a practical transport boundary; this release does not claim arbitrary file sizes.

Local verification: 25 behavioral transfer/inspection tests passed, including 100 MiB intent acceptance despite a former per-file policy value, exact 128 MiB streamed hash without retaining the whole source, above-cap finalization, bounded multipart copying, quota enforcement and retry preservation. TypeScript and targeted lint passed. The browser regression now uses a 12 MiB file plus a blocked small PUT at 1440px and 390px.

Follow-up release status: pending CI and deployment. Phase 3 remains in progress and is not declared complete by this repair.
