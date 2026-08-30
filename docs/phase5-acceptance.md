# Phase 5 acceptance evidence

CA Progress V2 Phase 5 uses normalized per-user/per-chapter progress rows with append-only change events.

## Acceptance gates

- Independent chapters are updated through row-scoped transactions, so changes on different chapters do not replace one another.
- Dependency transitions are enforced by database constraints and the `progress_set_stage` RPC, not only by client controls.
- The tracker optimistically updates and automatically persists each accepted stage change.
- Completion, revision, test, weekly activity, group and subject analytics are derived from `chapter_progress` and `progress_events`; no manually maintained total is a source of truth.

## Database verification

A rollback-only staging verification exercised independent writes on two applicable chapters, event creation, and a deliberately invalid Revision 1 transition before Completed. All three checks passed and the transaction was rolled back so no verification data remained.

## Phase boundary

`progress_daily_rollups` remain optional future scale work. Study sessions, planner/calendar source rows, goals, smart revision scheduling and recommendation ranking are not introduced in Phase 5.
