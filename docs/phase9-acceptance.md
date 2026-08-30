# Phase 9 — Smart Revision & Daily Planning Engine acceptance

Source of truth: CA Progress V2 detailed phased plan. This phase remains isolated to V2 staging and does not start Phase 10 Community work.

## Architecture boundary

- Phase 5 `chapter_progress` remains the canonical completion/revision/test state.
- Phase 6 `study_sessions`, `tasks` and `goals` remain canonical for study history and manual planning inputs.
- Phase 9 stores derived revision schedules, generated daily-plan decisions, user planner overrides and forecast history.
- Phase 9 uses meaningful event rows to decide when to recompute. It does not run a constant full recalculation loop.
- Generated items store `reason_code` and `reason_text`; ranking is deterministic and editable rather than opaque.

## Acceptance 1 — Completing a chapter creates the expected revision schedule

PASS mapping:
- `revision_rules.interval_days` defaults to `[1, 7, 21]` and can be changed through `phase9_set_revision_rules`.
- `phase9_chapter_progress_schedule` observes canonical `chapter_progress` changes.
- `phase9_rebuild_revision_schedule` creates one `revision_due_items` row per configured interval from `completed_at`, aligned to preferred study days.
- Manual `manual_due_at` values are excluded from generated-date overwrites.

## Acceptance 2 — Changing the attempt updates the forecast safely

PASS mapping:
- `phase9_profile_planning_changed` records attempt/daily-target/course/timezone changes as meaningful planner events.
- The planner sees a newer meaningful event and regenerates the current plan/forecast.
- Forecasting prefers verified V2 `exam_attempts.start_date` / verified `exam_events.event_date`.
- If verified day data is unavailable, the selected `YYYY-MM` attempt month is used only as an explicitly labelled planning estimate; no official exam date is invented.

## Acceptance 3 — The plan explains why an item was recommended

PASS mapping:
- Every generated `daily_plan_items` row requires `reason_code` and `reason_text`.
- Today Plan renders a reason chip and full reason sentence for each item.
- Ranking inputs include overdue revisions, manual tasks, tests, incomplete chapters, weak-subject signals, preferred study days and the user's daily target.

## Acceptance 4 — Manual changes override generated suggestions without immediate overwrite

PASS mapping:
- Complete, skip, snooze and reschedule set `manual_override=true`.
- Recompute preserves all manual/non-planned rows and blocks their `source_key` from regenerated suggestions.
- Only generated `status=planned AND manual_override=false` rows are replaced.
- `manual_plan_change` history events are stored but intentionally excluded from the meaningful-event list so the user's action does not immediately trigger a destructive regeneration loop.
- Explicit “Regenerate around my changes” preserves manual rows while filling remaining target capacity.

## Required routes/states

- `/planner/today` — guest/setup/ready/empty/loading/error states.
- `/planner/revision-settings` — guest/setup/ready/loading/error states.
- `/analytics/forecast` — guest/setup/ready/history/loading/error states.
- Responsive breakpoints at 1050px, 720px and 430px.

## Deferred

Phase 10 Community, Phase 11 entitlements/billing, and any opaque AI/LLM planner decisions are not introduced in Phase 9.
