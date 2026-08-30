-- Keep the database default compatible with the currently deployed pre-R2 Worker during the transition.
-- The R2 Worker always writes storage_bucket explicitly, so no R2 row depends on this default.

alter table public.uploaded_resources
  alter column storage_bucket set default 'user-resources';

insert into public.app_settings (key, value, is_public)
values (
  'resources.phase7.storage_transition',
  '{"r2_rows_write_provider_explicitly":true,"legacy_default_preserved":true,"reason":"safe_premerge_transition"}'::jsonb,
  true
)
on conflict (key) do update
set value = excluded.value, is_public = excluded.is_public, updated_at = now();
