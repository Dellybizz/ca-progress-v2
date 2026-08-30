-- Phase 10 hardening: statement-level reference sync triggers must not rely on NEW/OLD.
create or replace function public.phase10_reference_channel_sync_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  perform public.phase10_sync_community_channels();
  return null;
end;
$$;

revoke all on function public.phase10_reference_channel_sync_trigger() from public, anon, authenticated;
grant execute on function public.phase10_reference_channel_sync_trigger() to service_role;
