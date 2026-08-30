# Phase 5 — Progress Tracker & Analytics Foundation

## Scope implemented

- Normalized `chapter_progress` source-of-truth rows keyed by user + chapter.
- Timestamped Completed, Revision 1, Revision 2, Test 1 and Test 2 stages.
- Transactional database-side dependency validation.
- `progress_events` history with previous/new state and guarded recent undo.
- Undo hardening rejects an older event whenever newer history exists, even if the chapter later returns to the same visible state.
- Strict own-user RLS reads and RPC-only writes.
- `/progress` tracker with subject/group filters, search, stage lock states, optimistic interaction and automatic save feedback.
- `/analytics` derived completion/revision/test/weekly consistency summaries.
- `/subjects/[subjectSlug]/progress` per-subject chapter tracker.
- Phase 4 dashboard progress placeholders promoted to real Phase 5 overall/group/subject percentages without inventing Phase 6 or Phase 9 data.
- Guest, setup-required, loading, empty, error and mobile states.
- Phase 5 staging version label.

## Database migrations

- `20260830120100_phase5_progress_tracker.sql`
- `20260830121500_phase5_guard_latest_undo.sql`

Both migrations are applied to the isolated CA Progress V2 Supabase staging project.

## Dependency contract

- Revision 1 requires Completed.
- Revision 2 requires Revision 1.
- Test 1 requires Completed.
- Test 2 requires Test 1.
- Clearing a prerequisite while a dependent stage remains set is rejected server/database-side.

## Data integrity

Progress is written per chapter under a row lock. A change to one chapter never replaces another chapter's row. Analytics are calculated from normalized chapter rows and event history; no manually maintained aggregate is a source of truth.

Rolled-back database acceptance checks verify invalid dependency rejection, independent writes to different chapters, event creation, and rejection of an older undo after newer same-state history.

## Phase boundary

No Phase 6 study sessions, tasks, goals or calendar source-of-truth tables are created here. No Phase 9 revision recommendation engine is created here.
