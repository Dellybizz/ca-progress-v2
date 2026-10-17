# File-manager polish Phase 5

Complete and live on 2026-10-16.

- A student-shell transfer host owns the runner independently of Resources routing. The simple picker delegates to the host; upload progress stays in the separate transfer dock.
- One conservative serial scheduler accepts additional batches while running. Owner-scoped browser locks prevent competing transport leaders; device-change notifications and bounded polling allow leadership handoff.
- Independent Pause, Resume, Retry and Cancel controls; batch Pause all, Resume all, Retry failed and Clear completed controls. Cancelling retains the queue record and original until cleanup is acknowledged; failed cleanup is explicitly retryable.
- Actual sent bytes, separate confirmed bytes, byte-weighted totals, sampled speed and conditional ETA. Saving remains distinct from Saved. Multipart resumes reconcile server receipts.
- Connection interruption recovers eligible work; explicit pauses remain paused. Authentication errors stop scheduling until user retry. Missing original bytes require a matching reselect. Account changes hide the previous queue and abort its transport.
- Details and Transfers share available dock space; opening Details collapses Transfers without stopping work.
- User-directed scope change: Resources requests files only at the server, including totals/cursors/community/Trash. New note, notebook and page creation are removed there. `/notes` is restored as its own server-backed library with offline snapshots and existing note editing. No note data is deleted.

Limits: foreground app navigation is supported; closing the browser does not promise background transfer. On reopening, durable records and source bytes support recovery. Folder uploads and managed streaming downloads remain outside this phase.

Validation: coordinator integration tests cover scheduling, source retention, account isolation, connection recovery, authorization stops, second-tab pause and byte-weighted totals. Browser gates cover navigation away from Resources during transfer, pause/resume, account switching, cancellation, and prior multipart reload recovery at desktop and phone widths. Full tests and live certification must pass before marking this phase complete.

## Release certification

- Deployed source: `e0bb88c61e073d62d55d5e5a7c25c6097c7fab0b`.
- Web Worker version: `9446345a-e74d-46aa-b9d1-747d9c59ec39`.
- Release: https://github.com/Dellybizz/ca-progress-v2/actions/runs/38830007062 (verification and deployment successful).
- Independent full browser suite: https://github.com/Dellybizz/ca-progress-v2/actions/runs/38830006845 (successful).
- All 1,400 tests, TypeScript, lint, production build, D1 indexes, native bundling, search benchmark, Worker size/runtime checks and private backup restore passed.
- Desktop and phone browser journeys passed: multipart receipt recovery after reload, blocked R2 fallback, app navigation during upload, independent pause/resume, old-account abort, confirmed cancellation, clearing completed transfers, and the existing file-manager interactions.
- Live certification verified the expected source, authenticated three-part upload, idempotent retry, exact private download, move and Trash undo, stale-undo rejection, and fixture byte cleanup.
- No note data was deleted. Resources is file-only; Notes has its own navigation destination and server-backed page.
