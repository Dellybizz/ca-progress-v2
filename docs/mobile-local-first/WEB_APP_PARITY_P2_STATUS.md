# P2 — Account and academic context data status

25 September 2026 · branch `mobile-phase7-student-parity`

**Status: implementation in progress; same-account phone verification open.** P0 and P1 device gates are also open. Do not claim P2 complete from CI or a single progress screenshot.

## Changes through `a2e9691ee05aebb7b419e3351d7d6b8eee15d6ed`

- Bootstrap now joins chapter progress to the selected academic subjects and includes chapter titles and subject IDs. Subject-linked tasks and notes are restricted to the selected subject IDs; unassigned personal tasks/notes remain visible.
- Local workspace reads select one active academic context before querying subjects, chapters, progress, tasks, notes, profile, activity, leaderboard and buddies. Old-context rows are excluded from the active view.
- Sync upserts refresh each row's academic context key. Chapter titles fall back to the saved chapter catalog when older tracked progress payloads omit them.
- Sync checks the server's current account and academic context before pushing pending edits. If the context changed with queued edits, the edits remain local and require review rather than being sent under a stale context.
- Compatible verified attempt options and the selected group are included in the local academic snapshot. The More sheet can change attempt through the existing authoritative profile API when online and no edits are pending. The server selection wins over an older tracked profile payload.
- Cursor and entity writes remain in one local transaction; no new local schema or D1 migration was required.

## Verification and remaining work

- Phase 17/20 mobile tests, TypeScript, lint and production build passed in workflow `36129421190`; Android and iOS simulator jobs passed. V2 CI `36129421203` passed. Debug APK artifact `10861641908`; SHA-256 `bdcf0dca5e91b698dfcafc051473c28bba1997765d15b184c430ea853bcf77a1`. Cloudflare web runtime deploy step succeeded at `a2e9691`; the independent ICAI live proof remained in progress when this status was recorded.
- On the same signed-in phone and mobile website account, compare user ID (redacted), level, group, attempt, subjects, chapters and counts; confirm chapter titles and subject-linked tasks/notes.
- Test offline restart, second no-op sync, reconnect after a local edit, context switch with/without pending edits, and second-account isolation. Capture the APK SHA, Worker SHA, local schema version and redacted evidence.
- Native profile editing, dashboard projection, goals and revision settings still need follow-on coverage. Confirm attempt switch and all P2 fields on the same phone/account; these paths are not certified from CI.

No `main` merge. The website and production D1 records must remain stable.