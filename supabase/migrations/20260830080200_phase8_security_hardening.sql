-- CA Progress V2 - Phase 8 service boundary hardening
-- Apply only to the isolated V2 Supabase project.

-- Phase 8 synchronization/review RPCs are service-side only. RLS still protects
-- the underlying tables, but EXECUTE is also explicitly removed from client roles.
revoke all on function public.icai_sync_apply_source_batch(uuid, text, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.icai_sync_record_unchanged(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.icai_sync_mark_source_failure(uuid, text, text) from public, anon, authenticated;
revoke all on function public.icai_review_decide(uuid, text, uuid, text) from public, anon, authenticated;

grant execute on function public.icai_sync_apply_source_batch(uuid, text, jsonb, jsonb, jsonb, jsonb) to service_role;
grant execute on function public.icai_sync_record_unchanged(uuid, text, jsonb) to service_role;
grant execute on function public.icai_sync_mark_source_failure(uuid, text, text) to service_role;
grant execute on function public.icai_review_decide(uuid, text, uuid, text) to service_role;

-- The top-level study-material index is useful as a source-health/discovery page,
-- but a temporary empty parse must not invalidate already verified child-course data.
update public.icai_sources
set adapter_config = adapter_config || '{"allow_empty":true}'::jsonb
where id = 'icai-study-material-hub';

insert into public.app_settings (key, value, is_public)
values
  ('icai.sync', '{"phase":8,"schedule":"30 0 * * *","timezone":"UTC","display_timezone":"Asia/Kolkata","source_policy":"official_icai_only","storage_policy":"metadata_and_official_links"}'::jsonb, true),
  ('app.phase', '{"phase":8,"status":"icai_daily_update_engine"}'::jsonb, true)
on conflict (key) do update
set value = excluded.value,
    is_public = excluded.is_public,
    updated_at = now();
