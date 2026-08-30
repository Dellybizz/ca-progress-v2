# Phase 5 acceptance coverage

- Two devices changing different chapters: writes lock `(user_id, chapter_id)` only; verified against the V2 database in a rolled-back acceptance transaction.
- Invalid dependency transitions: database checks plus `progress_validate_state` inside the transactional RPC; verified by attempting Revision 1 before Completed.
- Automatic persistence: tracker posts each accepted interaction immediately to the authenticated mutation API, which calls the transactional RPC and returns the saved row state.
- Derived analytics: completion/revision/test/overall/weekly metrics are computed from `chapter_progress` and `progress_events`; no aggregate total is a source of truth.
