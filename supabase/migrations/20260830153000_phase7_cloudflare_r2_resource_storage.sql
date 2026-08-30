-- Phase 7 storage backend switch: file bytes move to Cloudflare R2.
-- Supabase remains the metadata / authorization source of truth.

alter table public.uploaded_resources
  drop constraint if exists uploaded_resources_storage_bucket_check;

alter table public.uploaded_resources
  alter column storage_bucket set default 'r2:ca-progress-v2-staging-user-resources';

alter table public.uploaded_resources
  add constraint uploaded_resources_storage_bucket_check
  check (storage_bucket in ('user-resources', 'r2:ca-progress-v2-staging-user-resources'));

create or replace function public.phase7_create_uploaded_resource(
  p_title text,
  p_description text,
  p_subject_id text,
  p_chapter_id text,
  p_original_filename text,
  p_safe_filename text,
  p_storage_path text,
  p_mime_type text,
  p_extension text,
  p_size_bytes bigint,
  p_visibility text
)
returns table(id uuid, moderation_status text)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_title, ''))) not between 1 and 160 then
    raise exception 'A resource title is required and must be at most 160 characters.' using errcode = '22023';
  end if;
  if p_description is not null and octet_length(p_description) > 8000 then
    raise exception 'Resource description is too large.' using errcode = '22023';
  end if;
  if char_length(coalesce(p_original_filename, '')) not between 1 and 180
     or char_length(coalesce(p_safe_filename, '')) not between 1 and 120 then
    raise exception 'Resource filename is invalid.' using errcode = '22023';
  end if;
  if p_storage_path is null or position(v_user_id::text || '/' in p_storage_path) <> 1 then
    raise exception 'Resource storage path is invalid.' using errcode = '42501';
  end if;
  if p_size_bytes is null or p_size_bytes <= 0 or p_size_bytes > 10485760 then
    raise exception 'Resource file size is invalid.' using errcode = '22023';
  end if;
  if p_visibility not in ('private', 'shared') then
    raise exception 'Unknown resource visibility.' using errcode = '22023';
  end if;
  if p_extension not in ('pdf', 'jpg', 'jpeg', 'png', 'webp', 'doc', 'docx') then
    raise exception 'Resource extension is not allowed.' using errcode = '22023';
  end if;
  if not (
    (p_extension = 'pdf' and p_mime_type = 'application/pdf') or
    (p_extension in ('jpg', 'jpeg') and p_mime_type = 'image/jpeg') or
    (p_extension = 'png' and p_mime_type = 'image/png') or
    (p_extension = 'webp' and p_mime_type = 'image/webp') or
    (p_extension = 'doc' and p_mime_type = 'application/msword') or
    (p_extension = 'docx' and p_mime_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  ) then
    raise exception 'Resource MIME type does not match its extension.' using errcode = '22023';
  end if;

  insert into public.uploaded_resources (
    owner_user_id,
    title,
    description,
    subject_id,
    chapter_id,
    original_filename,
    safe_filename,
    storage_bucket,
    storage_path,
    mime_type,
    extension,
    size_bytes,
    visibility
  ) values (
    v_user_id,
    trim(p_title),
    nullif(trim(coalesce(p_description, '')), ''),
    p_subject_id,
    p_chapter_id,
    p_original_filename,
    p_safe_filename,
    'r2:ca-progress-v2-staging-user-resources',
    p_storage_path,
    p_mime_type,
    p_extension,
    p_size_bytes,
    p_visibility
  ) returning uploaded_resources.id into v_id;

  return query
  select r.id, r.moderation_status
  from public.uploaded_resources r
  where r.id = v_id;
end;
$$;

create or replace function public.phase7_update_uploaded_resource(
  p_resource_id uuid,
  p_title text,
  p_description text,
  p_subject_id text,
  p_chapter_id text,
  p_visibility text
)
returns text
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_status text;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_title, ''))) not between 1 and 160 then
    raise exception 'A resource title is required and must be at most 160 characters.' using errcode = '22023';
  end if;
  if p_description is not null and octet_length(p_description) > 8000 then
    raise exception 'Resource description is too large.' using errcode = '22023';
  end if;
  if p_visibility not in ('private', 'shared') then
    raise exception 'Unknown resource visibility.' using errcode = '22023';
  end if;

  update public.uploaded_resources
  set title = trim(p_title),
      description = nullif(trim(coalesce(p_description, '')), ''),
      subject_id = p_subject_id,
      chapter_id = p_chapter_id,
      visibility = p_visibility
  where id = p_resource_id and owner_user_id = v_user_id
  returning moderation_status into v_status;

  if v_status is null then
    raise exception 'Resource not found.' using errcode = 'P0002';
  end if;
  return v_status;
end;
$$;

create or replace function public.phase7_delete_uploaded_resource(p_resource_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_deleted uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  delete from public.uploaded_resources
  where id = p_resource_id and owner_user_id = v_user_id
  returning id into v_deleted;

  if v_deleted is null then
    raise exception 'Resource not found.' using errcode = 'P0002';
  end if;
  return true;
end;
$$;

revoke all on function public.phase7_create_uploaded_resource(text,text,text,text,text,text,text,text,text,bigint,text) from public, anon;
revoke all on function public.phase7_update_uploaded_resource(uuid,text,text,text,text,text) from public, anon;
revoke all on function public.phase7_delete_uploaded_resource(uuid) from public, anon;

grant execute on function public.phase7_create_uploaded_resource(text,text,text,text,text,text,text,text,text,bigint,text) to authenticated, service_role;
grant execute on function public.phase7_update_uploaded_resource(uuid,text,text,text,text,text) to authenticated, service_role;
grant execute on function public.phase7_delete_uploaded_resource(uuid) to authenticated, service_role;

insert into public.app_settings (key, value, is_public)
values (
  'resources.phase7.storage',
  '{"provider":"cloudflare_r2","binding":"USER_RESOURCES_R2","bucket":"ca-progress-v2-staging-user-resources","public":false,"delivery":"authorized_worker_stream","max_bytes":10485760,"metadata_store":"supabase_postgres"}'::jsonb,
  true
)
on conflict (key) do update
set value = excluded.value, is_public = excluded.is_public, updated_at = now();
