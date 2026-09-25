# P2 — Account and academic context data status

25 September 2026 · branch `mobile-phase7-student-parity`

**Status: implementation in progress; same-account phone verification open.** P0 and P1 device gates are also open. Do not claim P2 complete from CI or a single progress screenshot.

## Changes through `08fefdc2829ffd1153e651e7d607e3798f3a670b`

- Bootstrap now joins chapter progress to the selected academic subjects and includes chapter titles and subject IDs. Subject-linked tasks and notes are restricted to the selected subject IDs; unassigned personal tasks/notes remain visible.
- Local workspace reads select one active academic context before querying subjects, chapters, progress, tasks, notes, profile, activity, leaderboard and buddies. Old-context rows are excluded from the active view.
- Sync upserts refresh each row's academic context key. Chapter titles fall back to the saved chapter catalog when older tracked progress payloads omit them.
- Sync checks the server's current account and academic context before pushing pending edits. If the context changed with queued edits, the edits remain local and require review rather than being sent under a stale context.
- Cursor and entity writes remain in one local transaction; no new local schema or D1 migration was required.

## Verification and remaining work

- Run Phase 17/20 mobile tests, TypeScript, lint, Android/iOS builds and V2 CI on the final SHA. Verify the Cloudflare deployment of the server bootstrap change at `3bde4520` or later.
- On the same signed-in phone and mobile website account, compare user ID (redacted), level, group, attempt, subjects, chapters and counts; confirm chapter titles and subject-linked tasks/notes.
- Test offline restart, second no-op sync, reconnect after a local edit, context switch with/without pending edits, and second-account isolation. Capture the APK SHA, Worker SHA, local schema version and redacted evidence.
- The native profile and attempt switcher still lack the full website edit/options flow. Dashboard projection, goals and revision settings still need P3 coverage. Not all Phase P2 data fields have a native read/write contract yet.

No `main` merge. The website and production D1 records must remain stable.