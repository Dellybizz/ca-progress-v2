# Phase 13 baseline lock

Captured 2026-09-23 UTC on `mobile-phase7-student-parity`. This is a read-only architecture baseline; it changes no runtime, production data, migration, or native configuration.

## Repository and release

| Item | Locked value |
|---|---|
| Phase 13 starting local commit | `106d6438183c305c26216b7b8850085285f7cee7` |
| Published planning tree commit | `5c462c298f558dda59e395c2c194b1ca68aece51` |
| Release baseline | `471ade75da025df51fcf98ba6740f400e10b9cae` |
| Release contract | schema 2; sequence 12; API 1; academic context 1; offline schema 3 |
| Production origin | `https://caprogress.zanisheluxe.in` |
| Native application ID | `in.zanisheluxe.caprogress` |
| D1 ledger | retained migrations `0001` through `0063`; latest `0063_mobile_phase12_release_operations.sql` |

The installed Phase 12 build remains a hosted-shell fallback. `capacitor.config.ts` sets `webDir: "native-shell"`, but also sets production `server.url` to the production origin, so the WebView loads the website rather than a complete bundled application.

## Last certified Android artifact

| Field | Value |
|---|---|
| Workflow run | `35891216081` |
| Artifact ID | `10764731976` |
| Artifact | `ca-progress-debug-apk-27b65698a1646b6df9961a4fc78123c2a226d2f7` |
| Built commit | `27b65698a1646b6df9961a4fc78123c2a226d2f7` |
| Size | 3,891,552 bytes |
| SHA-256 | `9c9d6ca3c20a48b019c0ad28334f2b6761f13a62d4627f3da30100973049e110` |
| Artifact expiry | 2026-10-07T16:50:08Z |

This identifies evidence, not a store release. Store signing and publication remain external approvals.

## API routing truth

Physical `/api/v1` handlers exist for bootstrap, capabilities, dashboard and session operations. `next.config.ts` has a fallback rewrite from `/api/v1/:path*` to `/api/:path*`; therefore a physical v1 handler wins, and otherwise the established unversioned handler runs. New native contracts must use explicit v1 handlers rather than depend indefinitely on this compatibility rewrite.

## Reproduced offline URL inconsistency

`lib/offline/projection.ts` recognizes `/api/progress`, `/api/planner/tasks`, `/api/notes`, and `/api/study/timer`. Active components call `/api/v1/progress`, `/api/v1/planner/tasks`, `/api/v1/notes`, and `/api/v1/study/timer`. Consequently `snapshotKind("/api/v1/progress")` is undefined and optimistic local projection is skipped even though the network fallback rewrite can still reach the server handler. Existing tests exercise the unversioned form and therefore do not expose the active-client mismatch.

The current IndexedDB path is also gated by `NEXT_PUBLIC_OFFLINE_ENABLED === "true"`; the production Worker configuration does not enable it. Phase 13 deliberately records both facts without changing them.
