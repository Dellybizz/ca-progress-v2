-- CA Progress V2 - Phase 5 Progress Tracker & Analytics Foundation
-- Apply only to the isolated V2 Supabase project.
-- Normalized per-chapter state is the source of truth; analytics are derived from these rows/events.

create table public.chapter_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  chapter_id text not null references public.chapters(id) on delete restrict,
  completed_at timestamptz,
  revision_1_at timestamptz,
  revision_2_at timestamptz,
  test_1_at timestamptz,
  test_2_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, chapter_id),
  constraint chapter_progress_revision_1_requires_completed check (revision_1_at is null or completed_at is not null),
  constraint chapter_progress_revision_2_requires_revision_1 check (revision_2_at is null or revision_1_at is not null),
  constraint chapter_progress_test_1_requires_completed check (test_1_at is null or completed_at is not null),
  constraint chapter_progress_test_2_requires_test_1 check (test_2_at is null or test_1_at is not null)
);

create table public.progress_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  chapter_id text not null references public.chapters(id) on delete restrict,
  stage text not null check (stage in ('completed', 'revision_1', 'revision_2', 'test_1', 'test_2')),
  action text not null check (action in ('set', 'clear', 'undo')),
  previous_state jsonb not null check (jsonb_typeof(previous_state) = 'object'),
  new_state jsonb not null check (jsonb_typeof(new_state) = 'object'),
  reverts_event_id uuid references public.progress_events(id) on delete restrict,
  undone_at timestamptz,
  created_at timestamptz not null default now()
);

create index chapter_progress_user_updated_idx on public.chapter_progress (user_id, updated_at desc);
create index chapter_progress_chapter_idx on public.chapter_progress (chapter_id);
create index progress_events_user_created_idx on public.progress_events (user_id, created_at desc);
create index progress_events_user_chapter_created_idx on public.progress_events (user_id, chapter_id, created_at desc);
create index progress_events_chapter_created_idx on public.progress_events (chapter_id, created_at desc);
create unique index progress_events_one_undo_idx on public.progress_events (reverts_event_id) where reverts_event_id is not null;

create trigger chapter_progress_set_updated_at
before update on public.chapter_progress
for each row execute function public.set_updated_at();

alter table public.chapter_progress enable row level security;
alter table public.progress_events enable row level security;

create policy "chapter_progress_read_own"
on public.chapter_progress
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "progress_events_read_own"
on public.progress_events
for select
to authenticated
using ((select auth.uid()) = user_id);

revoke all on public.chapter_progress from anon;
revoke all on public.progress_events from anon;
revoke insert, update, delete, truncate, references, trigger on public.chapter_progress from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.progress_events from authenticated;
grant select on public.chapter_progress, public.progress_events to authenticated;
grant all on public.chapter_progress, public.progress_events to service_role;

create or replace function public.progress_state_json(p_row public.chapter_progress)
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'completed_at', p_row.completed_at,
    'revision_1_at', p_row.revision_1_at,
    'revision_2_at', p_row.revision_2_at,
    'test_1_at', p_row.test_1_at,
    'test_2_at', p_row.test_2_at
  );
$$;

create or replace function public.progress_validate_state(p_state jsonb)
returns void
language plpgsql
immutable
set search_path = public, pg_temp
as $$
begin
  if p_state ->> 'revision_1_at' is not null and p_state ->> 'completed_at' is null then
    raise exception 'Revision 1 requires Completed first.' using errcode = '23514';
  end if;
  if p_state ->> 'revision_2_at' is not null and p_state ->> 'revision_1_at' is null then
    raise exception 'Revision 2 requires Revision 1 first.' using errcode = '23514';
  end if;
  if p_state ->> 'test_1_at' is not null and p_state ->> 'completed_at' is null then
    raise exception 'Test 1 requires Completed first.' using errcode = '23514';
  end if;
  if p_state ->> 'test_2_at' is not null and p_state ->> 'test_1_at' is null then
    raise exception 'Test 2 requires Test 1 first.' using errcode = '23514';
  end if;
end;
$$;

create or replace function public.progress_chapter_is_applicable(p_user_id uuid, p_chapter_id text)
returns boolean
language sql
stable
security definer
set search_path = public, auth, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    join public.course_levels l on l.code = p.ca_level
    join public.chapters c on c.id = p_chapter_id
    join public.attempt_syllabus_map asm
      on asm.syllabus_version_id = c.syllabus_version_id
     and asm.level_id = l.id
     and asm.attempt_key = p.attempt_key
    join public.course_groups g on g.id = asm.group_id
    where p.user_id = p_user_id
      and p.onboarding_completed_at is not null
      and (
        p.ca_level = 'foundation'
        or p.group_choice in ('both', 'not_applicable')
        or g.code = p.group_choice
      )
  );
$$;

create or replace function public.progress_set_stage(
  p_chapter_id text,
  p_stage text,
  p_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.chapter_progress;
  v_previous jsonb;
  v_next jsonb;
  v_event_id uuid;
  v_now timestamptz := now();
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if p_stage not in ('completed', 'revision_1', 'revision_2', 'test_1', 'test_2') then
    raise exception 'Unknown progress stage.' using errcode = '22023';
  end if;
  if not public.progress_chapter_is_applicable(v_user_id, p_chapter_id) then
    raise exception 'Chapter is not applicable to the current academic profile.' using errcode = '42501';
  end if;

  insert into public.chapter_progress (user_id, chapter_id)
  values (v_user_id, p_chapter_id)
  on conflict (user_id, chapter_id) do nothing;

  select * into v_row
  from public.chapter_progress
  where user_id = v_user_id and chapter_id = p_chapter_id
  for update;

  v_previous := public.progress_state_json(v_row);
  v_next := v_previous;

  if p_stage = 'completed' then
    v_next := jsonb_set(v_next, '{completed_at}', case when p_enabled then to_jsonb(v_now) else 'null'::jsonb end, true);
  elsif p_stage = 'revision_1' then
    v_next := jsonb_set(v_next, '{revision_1_at}', case when p_enabled then to_jsonb(v_now) else 'null'::jsonb end, true);
  elsif p_stage = 'revision_2' then
    v_next := jsonb_set(v_next, '{revision_2_at}', case when p_enabled then to_jsonb(v_now) else 'null'::jsonb end, true);
  elsif p_stage = 'test_1' then
    v_next := jsonb_set(v_next, '{test_1_at}', case when p_enabled then to_jsonb(v_now) else 'null'::jsonb end, true);
  elsif p_stage = 'test_2' then
    v_next := jsonb_set(v_next, '{test_2_at}', case when p_enabled then to_jsonb(v_now) else 'null'::jsonb end, true);
  end if;

  perform public.progress_validate_state(v_next);

  if v_next = v_previous then
    return jsonb_build_object('chapter_id', p_chapter_id, 'state', v_previous, 'event_id', null, 'saved_at', v_row.updated_at);
  end if;

  update public.chapter_progress
  set completed_at = (v_next ->> 'completed_at')::timestamptz,
      revision_1_at = (v_next ->> 'revision_1_at')::timestamptz,
      revision_2_at = (v_next ->> 'revision_2_at')::timestamptz,
      test_1_at = (v_next ->> 'test_1_at')::timestamptz,
      test_2_at = (v_next ->> 'test_2_at')::timestamptz
  where user_id = v_user_id and chapter_id = p_chapter_id
  returning * into v_row;

  insert into public.progress_events (user_id, chapter_id, stage, action, previous_state, new_state)
  values (v_user_id, p_chapter_id, p_stage, case when p_enabled then 'set' else 'clear' end, v_previous, v_next)
  returning id into v_event_id;

  return jsonb_build_object('chapter_id', p_chapter_id, 'state', public.progress_state_json(v_row), 'event_id', v_event_id, 'saved_at', v_row.updated_at);
end;
$$;

create or replace function public.progress_undo_event(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_event public.progress_events;
  v_row public.chapter_progress;
  v_current jsonb;
  v_undo_event_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select * into v_event
  from public.progress_events
  where id = p_event_id and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Progress event not found.' using errcode = 'P0002';
  end if;
  if v_event.action = 'undo' or v_event.undone_at is not null then
    raise exception 'This progress change cannot be undone again.' using errcode = '22023';
  end if;

  select * into v_row
  from public.chapter_progress
  where user_id = v_user_id and chapter_id = v_event.chapter_id
  for update;

  if not found then
    raise exception 'Current chapter progress was not found.' using errcode = 'P0002';
  end if;

  v_current := public.progress_state_json(v_row);
  if v_current <> v_event.new_state then
    raise exception 'Progress changed after this event; undo would overwrite a newer change.' using errcode = '40001';
  end if;

  perform public.progress_validate_state(v_event.previous_state);

  update public.chapter_progress
  set completed_at = (v_event.previous_state ->> 'completed_at')::timestamptz,
      revision_1_at = (v_event.previous_state ->> 'revision_1_at')::timestamptz,
      revision_2_at = (v_event.previous_state ->> 'revision_2_at')::timestamptz,
      test_1_at = (v_event.previous_state ->> 'test_1_at')::timestamptz,
      test_2_at = (v_event.previous_state ->> 'test_2_at')::timestamptz
  where user_id = v_user_id and chapter_id = v_event.chapter_id
  returning * into v_row;

  insert into public.progress_events (user_id, chapter_id, stage, action, previous_state, new_state, reverts_event_id)
  values (v_user_id, v_event.chapter_id, v_event.stage, 'undo', v_current, v_event.previous_state, v_event.id)
  returning id into v_undo_event_id;

  update public.progress_events set undone_at = now() where id = v_event.id;

  return jsonb_build_object('chapter_id', v_event.chapter_id, 'state', public.progress_state_json(v_row), 'event_id', v_undo_event_id, 'saved_at', v_row.updated_at, 'reverted_event_id', v_event.id);
end;
$$;

revoke all on function public.progress_state_json(public.chapter_progress) from public, anon, authenticated;
revoke all on function public.progress_validate_state(jsonb) from public, anon, authenticated;
revoke all on function public.progress_chapter_is_applicable(uuid, text) from public, anon, authenticated;
revoke all on function public.progress_set_stage(text, text, boolean) from public, anon;
revoke all on function public.progress_undo_event(uuid) from public, anon;
grant execute on function public.progress_set_stage(text, text, boolean) to authenticated, service_role;
grant execute on function public.progress_undo_event(uuid) to authenticated, service_role;

insert into public.app_settings (key, value, is_public)
values (
  'progress.phase5',
  '{"stages":["completed","revision_1","revision_2","test_1","test_2"],"dependencies":{"revision_1":["completed"],"revision_2":["revision_1"],"test_1":["completed"],"test_2":["test_1"]},"source_of_truth":"chapter_progress","history":"progress_events","analytics":"derived"}'::jsonb,
  true
)
on conflict (key) do update
set value = excluded.value,
    is_public = excluded.is_public,
    updated_at = now();

insert into public.app_settings (key, value, is_public)
values ('app.phase', '{"phase":5,"status":"progress_tracker_analytics_foundation"}'::jsonb, true)
on conflict (key) do update
set value = excluded.value,
    is_public = excluded.is_public,
    updated_at = now();
