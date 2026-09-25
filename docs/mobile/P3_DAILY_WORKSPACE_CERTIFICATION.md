# P3 — Daily workspace parity

Status: **Automated P3 implementation gate passed; device parity certification open.**

Certified commit: `0d0ebcbb653239e799136f58a25d67cbdaa0feca` (`feat(mobile): complete P3 daily workspace [p3-certified]`).

Certification workflow: `Mobile P3 daily workspace`, run `36148046029` — **success**.

Implemented: Dashboard + synchronized verified exam countdown, Today filters/timeline, Focus modes/session lifecycle, Planner task and goal controls, read-only task Calendar, and revision settings. The website Calendar's event create/edit/delete flow is still missing in the app.

Local-first contract: task, goal, revision-settings, timer and session mutations are written to device state and the mutation outbox in the same transaction. Focus timer state is restored from SQLite after process restart. Goal and revision-setting endpoints are included in the reconnect sync allow-list and bootstrap snapshot. Goal creation preserves the client identity so queued follow-up mutations replay idempotently.

Certified automated gates:

- `node --test tests/mobile-p3-daily-workspace.test.mjs` — passed (6/6 P3 contracts).
- `npm run typecheck` — passed.
- `npm run native:bundle` — passed.
- `npm run test:mobile:phase20` — passed, including the retained mobile test chain through Phases 1–20.
- `git diff --check` and P3 deployment/runtime-infrastructure safety check — passed.

The dedicated workflow checks source contracts and builds. It does not verify matched website screenshots, same-account phone data, or offline edit/reconnect behavior. The remaining app parity phases P4–P8 and earlier P0–P2 phone gates are open.

The P3 implementation is committed only on `mobile-phase7-student-parity`; this certification does not merge or promote the branch to `main`.
