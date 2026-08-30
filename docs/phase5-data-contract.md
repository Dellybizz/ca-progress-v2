# Phase 5 progress data contract

`chapter_progress` is the current state, keyed by `(user_id, chapter_id)`.

`progress_events` is immutable change history apart from the `undone_at` marker on an event that has been explicitly reverted.

All authenticated writes pass through `progress_set_stage` or `progress_undo_event`. Direct client writes to both tables are revoked. The RPCs derive the user from `auth.uid()`, verify that the chapter belongs to the user's current academic selection, lock only the target chapter row, enforce dependencies and append history transactionally.

Analytics read normalized rows/events and are never saved as manually-maintained totals.
