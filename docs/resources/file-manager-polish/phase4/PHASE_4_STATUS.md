# File-manager polish Phase 4

Implementation candidate; deployment evidence is recorded after verification, not inferred from source changes.

- Desktop File details is a non-modal utility panel. The file canvas remains interactive; mobile retains the focus-trapped drawer. Multi-selection has a count and known/unknown-size summary.
- Academic organization saves refresh the server workspace without closing Details or reloading the router. Subjects remain available inside physical folders. Name/subject/chapter survive rejected saves, and a dirty editor asks before closing/switching Details.
- Move dialogs browse the owned hierarchy and search full paths. Breadcrumbs expose the current destination. The shared drag eligibility contract blocks no-op moves, self/descendant cycles and invalid notebook-section destinations; the server remains authoritative.
- Rename/tag dialogs keep failed values. Tags explicitly replace the selection's tags, and blank removes all tags. Partial completion retargets an open dialog to failures only.
- Operation results persist across background GETs, show completion/failure counts and per-item failures, and retry only failed keys. Empty-folder deletion and permanent erasure use accessible confirmations with explicit scope. The existing nonempty-folder deletion policy remains enforced by the database.
- Online file move and Trash responses include additive undo receipts. Each write checks an activity revision within SQL; its receipt is captured in the same D1 batch transaction. Undo independently authorizes each item, checks its acknowledged revision and refuses stale receipts, including same-second edits/replays. Trash undo restores; move undo returns to the previous physical folder. No undo is offered for permanent deletion, offline queued writes or folder moves. Receipts are session UI state, not a durable history feature.
- Existing native drag and keyboard/touch Move routes are retained. Shared-original rename/duplicate/version eligibility now matches the existing private-original server policy.
- Database failures are translated into actionable messages rather than raw D1/SQLite internals. No schema migration is required.

Verification: real SQLite tests cover acknowledged move/Trash undo, receipt replay, later metadata edits, foreign owners, invalid receipt actions and partial batches. The Phase 4 Chromium journey covers 1440/390 widths, nested-folder academic editing and retry, unsaved edits, rename retry, failed-item-only retry, hierarchy browsing, cycle prevention, empty-folder confirmation and undo. Existing controls, navigation, selection, menu, native drag and upload journeys remain mandatory in both browser and full release workflows.

Local initial run: 1,386 tests passed. TypeScript and lint passed after the first UI pass. The restored checkout uses a dependency symlink outside Turbopack's project root; local default production build cannot consume that symlink. The local Chromium CDN download also failed. GitHub's clean install, production build and real Chromium checks are the release authority; no checks have been bypassed.

Pending: final-source CI/browser and Cloudflare release, live normal-account upload/download and exact version evidence. The professional typed-note editor and Phase 5 transfer-coordinator work remain paused.
