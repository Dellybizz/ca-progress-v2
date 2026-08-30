-- Phase 7 R2 hardening: browser sessions must not be able to manufacture upload metadata.
-- File validation and R2 writes happen in the Worker; metadata mutations remain server-service-role-only.

revoke execute on function public.phase7_create_uploaded_resource(text,text,text,text,text,text,text,text,text,bigint,text) from authenticated;
revoke execute on function public.phase7_update_uploaded_resource(uuid,text,text,text,text,text) from authenticated;
revoke execute on function public.phase7_delete_uploaded_resource(uuid) from authenticated;

grant execute on function public.phase7_create_uploaded_resource(text,text,text,text,text,text,text,text,text,bigint,text) to service_role;
grant execute on function public.phase7_update_uploaded_resource(uuid,text,text,text,text,text) to service_role;
grant execute on function public.phase7_delete_uploaded_resource(uuid) to service_role;

insert into public.app_settings (key, value, is_public)
values (
  'resources.phase7.storage',
  '{"provider":"cloudflare_r2","binding":"USER_RESOURCES_R2","bucket":"ca-progress-v2-staging-user-resources","public":false,"delivery":"authorized_worker_stream","max_bytes":10485760,"metadata_store":"supabase_postgres","metadata_mutations":"server_service_role_only"}'::jsonb,
  true
)
on conflict (key) do update
set value = excluded.value, is_public = excluded.is_public, updated_at = now();
