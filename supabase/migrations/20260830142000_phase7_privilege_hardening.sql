-- Phase 7 privilege hardening.
-- Keep user-facing Phase 7 metadata readable through RLS while ensuring writes happen only through
-- the intended RPC/server paths. This also removes implicit TRUNCATE/REFERENCES/TRIGGER privileges.

revoke all on public.notes from anon, authenticated;
revoke all on public.note_tags from anon, authenticated;
revoke all on public.note_tag_map from anon, authenticated;
revoke all on public.uploaded_resources from anon, authenticated;
revoke all on public.resource_moderation from anon, authenticated;
revoke all on public.resource_reports from anon, authenticated;

grant select on public.notes, public.note_tags, public.note_tag_map, public.uploaded_resources, public.resource_moderation, public.resource_reports to authenticated;
-- Owners may delete their own note through the authenticated API path; RLS remains the final ownership guard.
grant delete on public.notes to authenticated;

insert into public.app_settings (key, value, is_public)
values (
  'resources.phase7.security',
  '{"metadata_mutations":"server_or_rpc_only","storage_mutations":"server_service_role_only","storage_reads":"authorized_signed_urls_only"}'::jsonb,
  true
)
on conflict (key) do update set value = excluded.value, is_public = excluded.is_public, updated_at = now();
