# P3 — Daily workspace parity

Status: **Implemented; automated phase gate required before commit.**

Scope: Dashboard + verified exam countdown, Today filters/timeline, Focus modes/session lifecycle, Planner, Calendar, Goals, and revision settings.

Local-first contract: task, goal, revision-settings, timer and session mutations are written to device state and the mutation outbox in the same transaction. Focus timer state is restored from SQLite after process restart. Goal and revision-setting endpoints are included in the reconnect sync allow-list and bootstrap snapshot.

Gate command: `node --test tests/mobile-p3-daily-workspace.test.mjs && npm run test:mobile:phase20 && npm run native:bundle && npm run typecheck`.
