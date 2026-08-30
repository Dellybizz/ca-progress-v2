-- CA Progress V2 - Phase 7 Personal Notes, Uploads & Resource Library
-- Apply only to the isolated V2 Supabase project.
-- Files remain in a private Storage bucket; the database stores metadata and moderation state only.

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  owner_label text not null default 'CA Progress student',
  title text not null check (char_length(title) between 1 and 160),
  body_html text not null default '' check (octet_length(body_html) <= 200000),
  body_text text not null default '' check (octet_length(body_text) <= 120000),
  subject_id text references public.subjects(id) on delete restrict,
  chapter_id text references public.chapters(id) on delete restrict,
  visibility text not null default 'private' check (visibility in ('private', 'shared')),
  moderation_status text not null default 'private' check (moderation_status in ('private', 'pending', 'approved', 'rejected', 'reported')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.note_tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 32),
  normalized_name text not null check (char_length(normalized_name) between 1 and 32),
  created_at timestamptz not null default now(),
  unique (user_id, normalized_name)
);

create table public.note_tag_map (
  note_id uuid not null references public.notes(id) on delete cascade,
  tag_id uuid not null references public.note_tags(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (note_id, tag_id)
);

create table public.uploaded_resources (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  owner_label text not null default 'CA Progress student',
  title text not null check (char_length(title) between 1 and 160),
  description text check (description is null or octet_length(description) <= 8000),
  subject_id text references public.subjects(id) on delete restrict,
  chapter_id text references public.chapters(id) on delete restrict,
  original_filename text not null,
  safe_filename text not null,
  storage_bucket text not null default 'user-resources' check (storage_bucket = 'user-resources'),
  storage_path text not null unique,
  mime_type text not null,
  extension text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  visibility text not null default 'private' check (visibility in ('private', 'shared')),
  moderation_status text not null default 'private' check (moderation_status in ('private', 'pending', 'approved', 'rejected', 'reported')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.resource_moderation (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('note', 'upload')),
  note_id uuid references public.notes(id) on delete cascade,
  uploaded_resource_id uuid references public.uploaded_resources(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('submit', 'approve', 'reject', 'report', 'resubmit')),
  from_status text,
  to_status text not null check (to_status in ('pending', 'approved', 'rejected', 'reported')),
  notes text check (notes is null or octet_length(notes) <= 4000),
  created_at timestamptz not null default now(),
  check ((entity_type = 'note' and note_id is not null and uploaded_resource_id is null) or (entity_type = 'upload' and uploaded_resource_id is not null and note_id is null))
);

create table public.resource_reports (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('note', 'upload')),
  note_id uuid references public.notes(id) on delete cascade,
  uploaded_resource_id uuid references public.uploaded_resources(id) on delete cascade,
  reporter_user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('spam', 'misleading', 'copyright', 'unsafe', 'other')),
  details text check (details is null or octet_length(details) <= 4000),
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check ((entity_type = 'note' and note_id is not null and uploaded_resource_id is null) or (entity_type = 'upload' and uploaded_resource_id is not null and note_id is null))
);

create index notes_user_updated_idx on public.notes (user_id, updated_at desc);
create index notes_shared_idx on public.notes (visibility, moderation_status, published_at desc) where visibility = 'shared';
create index notes_subject_chapter_idx on public.notes (subject_id, chapter_id, updated_at desc);
create index note_tags_user_name_idx on public.note_tags (user_id, normalized_name);
create index note_tag_map_user_idx on public.note_tag_map (user_id, note_id);
create index uploaded_resources_owner_idx on public.uploaded_resources (owner_user_id, updated_at desc);
create index uploaded_resources_shared_idx on public.uploaded_resources (visibility, moderation_status, published_at desc) where visibility = 'shared';
create index uploaded_resources_subject_idx on public.uploaded_resources (subject_id, chapter_id, updated_at desc);
create index resource_moderation_queue_idx on public.resource_moderation (to_status, created_at desc);
create index resource_reports_status_idx on public.resource_reports (status, created_at desc);

create trigger notes_set_updated_at before update on public.notes for each row execute function public.set_updated_at();
create trigger uploaded_resources_set_updated_at before update on public.uploaded_resources for each row execute function public.set_updated_at();

create or replace function public.phase7_can_moderate()
returns boolean
language sql
stable
set search_path = public, auth, pg_temp
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', 'student') in ('moderator', 'admin', 'owner', 'parent_owner');
$$;

create or replace function public.phase7_validate_academic_scope()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_subject_id text;
  v_chapter_id text;
  v_chapter_subject text;
begin
  if tg_table_name = 'notes' then
    v_user_id := new.user_id;
    v_subject_id := new.subject_id;
    v_chapter_id := new.chapter_id;
  else
    v_user_id := new.owner_user_id;
    v_subject_id := new.subject_id;
    v_chapter_id := new.chapter_id;
  end if;

  if v_subject_id is not null and not public.study_subject_is_applicable(v_user_id, v_subject_id) then
    raise exception 'Subject is not applicable to the current academic profile.' using errcode = '42501';
  end if;

  if v_chapter_id is not null then
    if not public.progress_chapter_is_applicable(v_user_id, v_chapter_id) then
      raise exception 'Chapter is not applicable to the current academic profile.' using errcode = '42501';
    end if;
    select sv.subject_id into v_chapter_subject
    from public.chapters c
    join public.syllabus_versions sv on sv.id = c.syllabus_version_id
    where c.id = v_chapter_id;
    if v_subject_id is not null and v_chapter_subject is distinct from v_subject_id then
      raise exception 'Chapter does not belong to the selected subject.' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.phase7_note_share_policy()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_changed boolean := false;
  v_owner_label text;
begin
  if tg_op = 'INSERT' then
    select coalesce(nullif(trim(display_name), ''), 'CA Progress student') into v_owner_label from public.profiles where user_id = new.user_id;
    new.owner_label := coalesce(v_owner_label, 'CA Progress student');
    if new.visibility = 'shared' then
      new.moderation_status := 'pending';
      new.published_at := null;
    else
      new.moderation_status := 'private';
      new.published_at := null;
    end if;
    return new;
  end if;

  if new.visibility = 'private' then
    new.moderation_status := 'private';
    new.published_at := null;
    return new;
  end if;

  v_changed := old.visibility is distinct from new.visibility
    or old.title is distinct from new.title
    or old.body_html is distinct from new.body_html
    or old.subject_id is distinct from new.subject_id
    or old.chapter_id is distinct from new.chapter_id;

  if not public.phase7_can_moderate() then
    if v_changed or old.moderation_status in ('rejected', 'reported', 'private') then
      new.moderation_status := 'pending';
      new.published_at := null;
    else
      new.moderation_status := old.moderation_status;
      new.published_at := old.published_at;
    end if;
  elsif new.moderation_status = 'approved' then
    new.published_at := coalesce(new.published_at, now());
  elsif new.moderation_status <> 'approved' then
    new.published_at := null;
  end if;
  return new;
end;
$$;

create or replace function public.phase7_upload_share_policy()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_changed boolean := false;
  v_owner_label text;
begin
  if tg_op = 'INSERT' then
    select coalesce(nullif(trim(display_name), ''), 'CA Progress student') into v_owner_label from public.profiles where user_id = new.owner_user_id;
    new.owner_label := coalesce(v_owner_label, 'CA Progress student');
    if new.visibility = 'shared' then new.moderation_status := 'pending'; else new.moderation_status := 'private'; end if;
    new.published_at := null;
    return new;
  end if;

  if new.visibility = 'private' then
    new.moderation_status := 'private';
    new.published_at := null;
    return new;
  end if;

  v_changed := old.visibility is distinct from new.visibility
    or old.title is distinct from new.title
    or old.description is distinct from new.description
    or old.subject_id is distinct from new.subject_id
    or old.chapter_id is distinct from new.chapter_id;

  if not public.phase7_can_moderate() then
    if v_changed or old.moderation_status in ('rejected', 'reported', 'private') then
      new.moderation_status := 'pending';
      new.published_at := null;
    else
      new.moderation_status := old.moderation_status;
      new.published_at := old.published_at;
    end if;
  elsif new.moderation_status = 'approved' then
    new.published_at := coalesce(new.published_at, now());
  elsif new.moderation_status <> 'approved' then
    new.published_at := null;
  end if;
  return new;
end;
$$;

create trigger notes_validate_academic_scope before insert or update of user_id, subject_id, chapter_id on public.notes for each row execute function public.phase7_validate_academic_scope();
create trigger resources_validate_academic_scope before insert or update of owner_user_id, subject_id, chapter_id on public.uploaded_resources for each row execute function public.phase7_validate_academic_scope();
create trigger notes_apply_share_policy before insert or update on public.notes for each row execute function public.phase7_note_share_policy();
create trigger resources_apply_share_policy before insert or update on public.uploaded_resources for each row execute function public.phase7_upload_share_policy();

create or replace function public.phase7_save_note(
  p_note_id uuid,
  p_title text,
  p_body_html text,
  p_body_text text,
  p_subject_id text,
  p_chapter_id text,
  p_tags text[],
  p_visibility text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_note_id uuid;
  v_tag text;
  v_normalized text;
  v_tag_id uuid;
begin
  if v_user_id is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if char_length(trim(p_title)) < 1 or char_length(trim(p_title)) > 160 then raise exception 'Note title is required and must be at most 160 characters.' using errcode = '22023'; end if;
  if octet_length(coalesce(p_body_html, '')) > 200000 or octet_length(coalesce(p_body_text, '')) > 120000 then raise exception 'Note content is too large.' using errcode = '22023'; end if;
  if p_visibility not in ('private', 'shared') then raise exception 'Unknown note visibility.' using errcode = '22023'; end if;
  if coalesce(array_length(p_tags, 1), 0) > 12 then raise exception 'A note can have at most 12 tags.' using errcode = '22023'; end if;

  if p_note_id is null then
    insert into public.notes (user_id, title, body_html, body_text, subject_id, chapter_id, visibility)
    values (v_user_id, trim(p_title), coalesce(p_body_html, ''), coalesce(p_body_text, ''), p_subject_id, p_chapter_id, p_visibility)
    returning id into v_note_id;
  else
    update public.notes
    set title = trim(p_title), body_html = coalesce(p_body_html, ''), body_text = coalesce(p_body_text, ''), subject_id = p_subject_id, chapter_id = p_chapter_id, visibility = p_visibility
    where id = p_note_id and user_id = v_user_id
    returning id into v_note_id;
    if v_note_id is null then raise exception 'Note not found.' using errcode = 'P0002'; end if;
  end if;

  delete from public.note_tag_map where note_id = v_note_id and user_id = v_user_id;
  foreach v_tag in array coalesce(p_tags, '{}'::text[]) loop
    v_tag := trim(v_tag);
    v_normalized := lower(v_tag);
    if char_length(v_tag) between 1 and 32 then
      insert into public.note_tags (user_id, name, normalized_name)
      values (v_user_id, v_tag, v_normalized)
      on conflict (user_id, normalized_name) do update set name = excluded.name
      returning id into v_tag_id;
      insert into public.note_tag_map (note_id, tag_id, user_id) values (v_note_id, v_tag_id, v_user_id) on conflict do nothing;
    end if;
  end loop;

  return v_note_id;
end;
$$;

create or replace function public.phase7_moderate_resource(
  p_entity_type text,
  p_entity_id uuid,
  p_decision text,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_from text;
  v_to text;
begin
  if v_user_id is null or not public.phase7_can_moderate() then raise exception 'Moderator access required.' using errcode = '42501'; end if;
  if p_decision not in ('approve', 'reject') then raise exception 'Unknown moderation decision.' using errcode = '22023'; end if;
  v_to := case when p_decision = 'approve' then 'approved' else 'rejected' end;

  if p_entity_type = 'note' then
    select moderation_status into v_from from public.notes where id = p_entity_id and visibility = 'shared' for update;
    if v_from is null then raise exception 'Shared note not found.' using errcode = 'P0002'; end if;
    update public.notes set moderation_status = v_to where id = p_entity_id;
    insert into public.resource_moderation (entity_type, note_id, actor_user_id, action, from_status, to_status, notes)
    values ('note', p_entity_id, v_user_id, p_decision, v_from, v_to, p_notes);
  elsif p_entity_type = 'upload' then
    select moderation_status into v_from from public.uploaded_resources where id = p_entity_id and visibility = 'shared' for update;
    if v_from is null then raise exception 'Shared upload not found.' using errcode = 'P0002'; end if;
    update public.uploaded_resources set moderation_status = v_to where id = p_entity_id;
    insert into public.resource_moderation (entity_type, uploaded_resource_id, actor_user_id, action, from_status, to_status, notes)
    values ('upload', p_entity_id, v_user_id, p_decision, v_from, v_to, p_notes);
  else
    raise exception 'Unknown resource type.' using errcode = '22023';
  end if;
end;
$$;

create or replace function public.phase7_report_resource(
  p_entity_type text,
  p_entity_id uuid,
  p_reason text,
  p_details text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_owner uuid;
  v_status text;
  v_report_id uuid;
begin
  if v_user_id is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if p_reason not in ('spam', 'misleading', 'copyright', 'unsafe', 'other') then raise exception 'Unknown report reason.' using errcode = '22023'; end if;
  if octet_length(coalesce(p_details, '')) > 4000 then raise exception 'Report details are too large.' using errcode = '22023'; end if;

  if p_entity_type = 'note' then
    select user_id, moderation_status into v_owner, v_status from public.notes where id = p_entity_id and visibility = 'shared' for update;
    if v_status is distinct from 'approved' then raise exception 'Only approved shared notes can be reported.' using errcode = '22023'; end if;
    if v_owner = v_user_id then raise exception 'You cannot report your own note.' using errcode = '22023'; end if;
    insert into public.resource_reports (entity_type, note_id, reporter_user_id, reason, details) values ('note', p_entity_id, v_user_id, p_reason, p_details) returning id into v_report_id;
    update public.notes set moderation_status = 'reported' where id = p_entity_id;
    insert into public.resource_moderation (entity_type, note_id, actor_user_id, action, from_status, to_status, notes) values ('note', p_entity_id, v_user_id, 'report', 'approved', 'reported', p_details);
  elsif p_entity_type = 'upload' then
    select owner_user_id, moderation_status into v_owner, v_status from public.uploaded_resources where id = p_entity_id and visibility = 'shared' for update;
    if v_status is distinct from 'approved' then raise exception 'Only approved shared uploads can be reported.' using errcode = '22023'; end if;
    if v_owner = v_user_id then raise exception 'You cannot report your own upload.' using errcode = '22023'; end if;
    insert into public.resource_reports (entity_type, uploaded_resource_id, reporter_user_id, reason, details) values ('upload', p_entity_id, v_user_id, p_reason, p_details) returning id into v_report_id;
    update public.uploaded_resources set moderation_status = 'reported' where id = p_entity_id;
    insert into public.resource_moderation (entity_type, uploaded_resource_id, actor_user_id, action, from_status, to_status, notes) values ('upload', p_entity_id, v_user_id, 'report', 'approved', 'reported', p_details);
  else
    raise exception 'Unknown resource type.' using errcode = '22023';
  end if;
  return v_report_id;
end;
$$;

alter table public.notes enable row level security;
alter table public.note_tags enable row level security;
alter table public.note_tag_map enable row level security;
alter table public.uploaded_resources enable row level security;
alter table public.resource_moderation enable row level security;
alter table public.resource_reports enable row level security;

create policy "notes_read_own_or_approved_shared" on public.notes for select to authenticated using ((select auth.uid()) = user_id or (visibility = 'shared' and moderation_status = 'approved'));
create policy "notes_insert_own" on public.notes for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "notes_update_own" on public.notes for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "notes_delete_own" on public.notes for delete to authenticated using ((select auth.uid()) = user_id);

create policy "note_tags_read_own" on public.note_tags for select to authenticated using ((select auth.uid()) = user_id);
create policy "note_tags_insert_own" on public.note_tags for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "note_tags_update_own" on public.note_tags for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "note_tags_delete_own" on public.note_tags for delete to authenticated using ((select auth.uid()) = user_id);

create policy "note_tag_map_read_own" on public.note_tag_map for select to authenticated using ((select auth.uid()) = user_id);
create policy "note_tag_map_insert_own" on public.note_tag_map for insert to authenticated with check ((select auth.uid()) = user_id and exists (select 1 from public.notes n where n.id = note_id and n.user_id = (select auth.uid())) and exists (select 1 from public.note_tags t where t.id = tag_id and t.user_id = (select auth.uid())));
create policy "note_tag_map_delete_own" on public.note_tag_map for delete to authenticated using ((select auth.uid()) = user_id);

create policy "uploaded_resources_read_own_or_approved_shared" on public.uploaded_resources for select to authenticated using ((select auth.uid()) = owner_user_id or (visibility = 'shared' and moderation_status = 'approved'));
create policy "uploaded_resources_insert_own" on public.uploaded_resources for insert to authenticated with check ((select auth.uid()) = owner_user_id);
create policy "uploaded_resources_update_own" on public.uploaded_resources for update to authenticated using ((select auth.uid()) = owner_user_id) with check ((select auth.uid()) = owner_user_id);
create policy "uploaded_resources_delete_own" on public.uploaded_resources for delete to authenticated using ((select auth.uid()) = owner_user_id);

create policy "resource_moderation_read_privileged_or_owner" on public.resource_moderation for select to authenticated using (public.phase7_can_moderate() or exists (select 1 from public.notes n where n.id = note_id and n.user_id = (select auth.uid())) or exists (select 1 from public.uploaded_resources r where r.id = uploaded_resource_id and r.owner_user_id = (select auth.uid())));
create policy "resource_reports_read_own_or_privileged" on public.resource_reports for select to authenticated using ((select auth.uid()) = reporter_user_id or public.phase7_can_moderate());

revoke insert, update, delete, truncate, references, trigger on public.resource_moderation from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.resource_reports from authenticated;
grant select on public.resource_moderation, public.resource_reports to authenticated;

revoke all on function public.phase7_can_moderate() from public, anon;
grant execute on function public.phase7_can_moderate() to authenticated, service_role;
revoke all on function public.phase7_validate_academic_scope() from public, anon, authenticated;
revoke all on function public.phase7_note_share_policy() from public, anon, authenticated;
revoke all on function public.phase7_upload_share_policy() from public, anon, authenticated;
revoke all on function public.phase7_save_note(uuid, text, text, text, text, text, text[], text) from public, anon;
grant execute on function public.phase7_save_note(uuid, text, text, text, text, text, text[], text) to authenticated, service_role;
revoke all on function public.phase7_moderate_resource(text, uuid, text, text) from public, anon;
grant execute on function public.phase7_moderate_resource(text, uuid, text, text) to authenticated, service_role;
revoke all on function public.phase7_report_resource(text, uuid, text, text) from public, anon;
grant execute on function public.phase7_report_resource(text, uuid, text, text) to authenticated, service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'user-resources',
  'user-resources',
  false,
  10485760,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]::text[]
)
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "user_resources_select_own" on storage.objects for select to authenticated using (bucket_id = 'user-resources' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "user_resources_insert_own" on storage.objects for insert to authenticated with check (bucket_id = 'user-resources' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "user_resources_update_own" on storage.objects for update to authenticated using (bucket_id = 'user-resources' and (storage.foldername(name))[1] = (select auth.uid())::text) with check (bucket_id = 'user-resources' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "user_resources_delete_own" on storage.objects for delete to authenticated using (bucket_id = 'user-resources' and (storage.foldername(name))[1] = (select auth.uid())::text);

insert into public.app_settings (key, value, is_public)
values (
  'resources.phase7',
  '{"storage_bucket":"user-resources","max_bytes":10485760,"allowed_extensions":["pdf","jpg","jpeg","png","webp","doc","docx"],"share_policy":"moderation_required","private_signed_url_seconds":120,"future_plan_quotas":true}'::jsonb,
  true
)
on conflict (key) do update set value = excluded.value, is_public = excluded.is_public, updated_at = now();

insert into public.app_settings (key, value, is_public)
values ('app.phase', '{"phase":7,"status":"notes_uploads_resource_library"}'::jsonb, true)
on conflict (key) do update set value = excluded.value, is_public = excluded.is_public, updated_at = now();
