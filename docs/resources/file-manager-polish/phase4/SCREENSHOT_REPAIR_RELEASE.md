# Screenshot polish repair — deployed

The Resources file manager screenshot repair is live at https://ca-progress-v2.habeebaasif622.workers.dev/resources .

- Functional source: `d610c90c9aeaa0bc30fd8aaea4e6100eb13ba764`, branch `onboarding-design-phase7`.
- [Release run 38822654283](https://github.com/Dellybizz/ca-progress-v2/actions/runs/38822654283): verification job `116722926817` and deployment job `116724255021` succeeded.
- All 1,388 tests passed, with TypeScript, lint, production build, D1 hot indexes, native bundle and search benchmark checks.
- [Dedicated browser run 38822654247](https://github.com/Dellybizz/ca-progress-v2/actions/runs/38822654247) passed. Release browser checks also passed at 1440px and 390px: real image decoding, missing-thumbnail repair, blocked-image nonrequests, primary/More actions, focus restoration, filters, bounded preview status and no page overflow. Existing navigation, dialogs, selection, keyboard/touch, native file/folder drag and external upload staging remained green.
- Private backup restore, all 87 retained migrations and clean foreign keys passed. No new schema migration or Worker budget increase.
- Web Worker version `6edb7f62-9be8-4185-9fc9-dd89f80306b9`, gzip 3,649.23 KiB. Private processor `6eba6e34-0fab-496b-b2f9-2b859c3b37d6`, gzip 509.67 KiB.
- Live app-config matched the functional source. A fresh normal account completed onboarding, uploaded three real parts with blank subject/chapter, finalized idempotently, downloaded exact private bytes, and verified move undo, stale undo rejection and Trash undo against deployed D1. Fixtures were cleaned up. Final live gate passed at 2026-10-15 23:28 UTC.

## Changes

Larger image cards, uncropped image previews, proper image glyphs, readable status badges without overlapping skeleton lines, quieter navigation, and readable primary selection actions. Secondary actions and export are under More; grouping and saved views are inside Filters. Details uses the same thumbnail renderer. UTF-8 preview fixtures preserve breadcrumb characters.

Thumbnails stop showing Preparing preview after image decoding. Transient preview failures retry a finite number of times. File/version changes reset thumbnail state. Missing owner image derivatives are repaired from an authorized decoded image using a bounded two-job canvas queue, same-origin endpoints and exact source hashes.

Verified queued owner PNG/JPEG/WebP images up to the existing 10 MiB inspection limit can recover through the existing private processor using a compare-and-set claim. Ready inspected owner rasters can temporarily render their verified private original while saving a small derivative. Other viewers require derivatives; queued/unverified, failed, quarantined, unsupported, changed-source and oversized originals remain blocked. This limit concerns preview inspection, not upload file size.

Backend repair and privacy rules were verified against real SQLite migrations and R2-shaped fixtures, including approved shared viewers, quarantine, changed ETags, missing hashes, unsupported MIME types, size bounds and processor failure. Browser tests used controlled image responses. The live upload gate covered the existing multipart/organization flow; it did not independently exercise every new raster recovery branch.

This is the requested screenshot repair, not completion of later polish phases or the full 104-case certification. The paused rich typed-note editor remains paused.
