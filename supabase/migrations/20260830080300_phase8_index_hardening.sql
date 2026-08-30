-- CA Progress V2 - Phase 8 foreign-key/index hardening
-- Apply only to the isolated V2 Supabase project.

create index if not exists exam_attempts_source_idx on public.exam_attempts (source_id) where source_id is not null;
create index if not exists exam_attempts_snapshot_idx on public.exam_attempts (source_snapshot_id) where source_snapshot_id is not null;
create index if not exists exam_events_source_idx on public.exam_events (source_id);
create index if not exists exam_events_snapshot_idx on public.exam_events (source_snapshot_id) where source_snapshot_id is not null;
create index if not exists icai_change_events_run_idx on public.icai_change_events (run_id);
create index if not exists icai_change_events_source_idx on public.icai_change_events (source_id);
create index if not exists icai_change_events_reviewer_idx on public.icai_change_events (reviewed_by) where reviewed_by is not null;
create index if not exists icai_resources_snapshot_idx on public.icai_resources (source_snapshot_id) where source_snapshot_id is not null;
create index if not exists icai_resources_replaced_by_idx on public.icai_resources (replaced_by_resource_id) where replaced_by_resource_id is not null;
create index if not exists icai_review_queue_run_idx on public.icai_review_queue (run_id);
create index if not exists icai_review_queue_source_idx on public.icai_review_queue (source_id);
create index if not exists icai_review_queue_reviewer_idx on public.icai_review_queue (reviewed_by) where reviewed_by is not null;
create index if not exists icai_sync_runs_requested_by_idx on public.icai_sync_runs (requested_by) where requested_by is not null;
