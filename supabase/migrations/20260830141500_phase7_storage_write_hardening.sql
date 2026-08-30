-- Phase 7 hardening: private file bytes and upload metadata are server-write-only.
-- This prevents a browser client from bypassing server MIME/signature validation or guessing Storage paths.

revoke insert, update on public.notes from authenticated;
revoke insert, update, delete on public.uploaded_resources from authenticated;

-- Notes are mutated through phase7_save_note; owner delete remains RLS-protected.
grant select, delete on public.notes to authenticated;
grant select on public.uploaded_resources to authenticated;

-- No authenticated user receives direct Storage object access for Phase 7 files.
-- The application authorizes metadata first, then creates a short-lived signed URL server-side.
drop policy if exists "user_resources_select_own" on storage.objects;
drop policy if exists "user_resources_insert_own" on storage.objects;
drop policy if exists "user_resources_update_own" on storage.objects;
drop policy if exists "user_resources_delete_own" on storage.objects;

insert into public.app_settings (key, value, is_public)
values (
  'resources.phase7',
  '{"storage_bucket":"user-resources","max_bytes":10485760,"allowed_extensions":["pdf","jpg","jpeg","png","webp","doc","docx"],"share_policy":"moderation_required","private_signed_url_seconds":120,"storage_access":"server_signed_only","upload_write_path":"server_validated_only","future_plan_quotas":true}'::jsonb,
  true
)
on conflict (key) do update set value = excluded.value, is_public = excluded.is_public, updated_at = now();
