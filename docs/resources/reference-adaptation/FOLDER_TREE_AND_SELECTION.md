# Scoped folder trees and selection scrolling

## Behavior

- The selected collection owns the sidebar tree. Resources lists owned folders; Trash lists deleted folders. ICAI Official uses its subject/material hierarchy, and Community uses subjects and chapters without exposing other users' private folders.
- Every top-level folder remains visible. The current folder and its ancestor path expand; unrelated branches stay closed. Sidebar and breadcrumb navigation remain single-click. Canvas folder tiles select on one click/tap and open on double-click/double-tap; keyboard activation opens directly.
- Mouse marquee selection scrolls near the upper/lower edge, including while the pointer is held still. Its anchor follows content coordinates, so files already selected outside the viewport remain selected. Releasing or cancelling the pointer stops scrolling.
- Completed operations produce a compact, temporary confirmation without Undo, retry or dismissal buttons. The persistent result bar and visible loading sentence are removed; accessible loading state remains available.
- Thumbnail identity follows the source revision rather than organization metadata. Scoped cached blobs remain visible during background refresh, concurrent reads are deduplicated, and completed thumbnail repairs are briefly remembered across remounts.

## Verification

The browser suite covers six viewport widths, collection switches, folder-tree scope/expansion, history, desktop double-click, touch double-tap, drag/drop, confirmation expiry and thumbnail reuse after the former 15-second expiry. An 80-file scenario verifies upward/downward marquee scrolling, offscreen selection retention and stopping on release. Backend tests cover Trash hierarchy navigation and preview identity through rename/replacement.

## Release evidence

- Source: `473c109e90071b1a8e56eb1d007f5e99480f3263`.
- Browser run: https://github.com/Dellybizz/ca-progress-v2/actions/runs/38985683474 — passed. Artifact `12082962422` contains 69 screenshots; reviewed the desktop sidebar, mobile layout/confirmation and marquee.
- Release: https://github.com/Dellybizz/ca-progress-v2/actions/runs/38985683395 — verification and deployment passed.
- All 1,411 tests, TypeScript, ESLint, production build, D1 index validation, native bundle and search benchmark passed. The release repeated the browser suite successfully; artifact `12083351768`.
- Cached folder/collection switches rendered in 27–35ms with a simulated 700ms network delay in the release browser run.
- Web Worker: `4357f164-b029-4796-b67f-746717bb0d51`. The live app-config endpoint confirmed the exact tested source.
- Live checks passed: normal-account multipart upload, idempotent finalization, exact private download, owned hierarchy, move/Trash protections, stale-revision refusal and confirmed Community moderation submission. Test resources and original bytes were removed.
- Live page: https://ca-progress-v2.habeebaasif622.workers.dev/resources
