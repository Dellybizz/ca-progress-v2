-- CA Progress V2 - Phase 6 Study Timer, Planner Basics, Goals & Calendar
-- Apply only to the isolated V2 Supabase project.
-- Timer/session data and planner entities are normalized; calendar/activity are composed views in application services.

create table public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id text references public.subjects(id) on delete restrict,
  chapter_id text references public.chapters(id) on delete restrict,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  duration_seconds integer not null check (duration_seconds between 1 and 43200),
  mode text not null check (mode in ('stopwatch', 'pomodoro')),
  focus_target_seconds integer check (focus_target_seconds is null or focus_target_seconds between 60 and 43200),
  break_target_seconds integer check (break_target_seconds is null or break_target_seconds between 0 and 7200),
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  constraint study_sessions_time_order check (ended_at >= started_at)
);

create table public.study_timer_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  subject_id text references public.subjects(id) on delete restrict,
  chapter_id text references public.chapters(id) on delete restrict,
  status text not null check (status in ('running', 'paused')),
  mode text not null check (mode in ('stopwatch', 'pomodoro')),
  focus_target_seconds integer check (focus_target_seconds is null or focus_target_seconds between 60 and 43200),
  break_target_seconds integer check (break_target_seconds is null or break_target_seconds between 0 and 7200),
  started_at timestamptz not null,
  running_since timestamptz,
  elapsed_seconds integer not null default 0 check (elapsed_seconds between 0 and 43200),
  paused_at timestamptz,
  timezone text not null default 'UTC',
  last_interaction_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint study_timer_running_shape check (
    (status = 'running' and running_since is not null and paused_at is null)
    or (status = 'paused' and running_since is null and paused_at is not null)
  )
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  notes text check (notes is null or char_length(notes) <= 4000),
  task_kind text not null default 'study' check (task_kind in ('study', 'revision', 'test', 'other')),
  subject_id text references public.subjects(id) on delete restrict,
  chapter_id text references public.chapters(id) on delete restrict,
  due_at timestamptz not null,
  estimated_minutes integer not null default 30 check (estimated_minutes between 1 and 720),
  status text not null default 'todo' check (status in ('todo', 'done', 'cancelled')),
  completed_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_completion_shape check (
    (status = 'done' and completed_at is not null)
    or (status <> 'done' and completed_at is null)
  )
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  description text check (description is null or char_length(description) <= 4000),
  due_date date not null,
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint goals_completion_shape check (
    (status = 'completed' and completed_at is not null)
    or (status <> 'completed' and completed_at is null)
  )
);

create table public.user_calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  notes text check (notes is null or char_length(notes) <= 4000),
  starts_at timestamptz not null,
  ends_at timestamptz,
  all_day boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_event_time_order check (ends_at is null or ends_at >= starts_at)
);

create index study_sessions_user_ended_idx on public.study_sessions (user_id, ended_at desc);
create index study_sessions_user_subject_idx on public.study_sessions (user_id, subject_id, ended_at desc);
create index study_sessions_user_chapter_idx on public.study_sessions (user_id, chapter_id, ended_at desc);
create index tasks_user_due_idx on public.tasks (user_id, due_at, status);
create index tasks_user_kind_due_idx on public.tasks (user_id, task_kind, due_at);
create index goals_user_due_idx on public.goals (user_id, due_date, status);
create index user_calendar_events_user_start_idx on public.user_calendar_events (user_id, starts_at);

create trigger study_timer_state_set_updated_at
before update on public.study_timer_state
for each row execute function public.set_updated_at();
create trigger tasks_set_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();
create trigger goals_set_updated_at
before update on public.goals
for each row execute function public.set_updated_at();
create trigger user_calendar_events_set_updated_at
before update on public.user_calendar_events
for each row execute function public.set_updated_at();

alter table public.study_sessions enable row level security;
alter table public.study_timer_state enable row level security;
alter table public.tasks enable row level security;
alter table public.goals enable row level security;
alter table public.user_calendar_events enable row level security;

create policy "study_sessions_read_own" on public.study_sessions
for select to authenticated using ((select auth.uid()) = user_id);
create policy "study_timer_state_read_own" on public.study_timer_state
for select to authenticated using ((select auth.uid()) = user_id);

create policy "tasks_select_own" on public.tasks
for select to authenticated using ((select auth.uid()) = user_id);
create policy "tasks_insert_own" on public.tasks
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "tasks_update_own" on public.tasks
for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "tasks_delete_own" on public.tasks
for delete to authenticated using ((select auth.uid()) = user_id);

create policy "goals_select_own" on public.goals
for select to authenticated using ((select auth.uid()) = user_id);
create policy "goals_insert_own" on public.goals
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "goals_update_own" on public.goals
for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "goals_delete_own" on public.goals
for delete to authenticated using ((select auth.uid()) = user_id);

create policy "user_calendar_events_select_own" on public.user_calendar_events
for select to authenticated using ((select auth.uid()) = user_id);
create policy "user_calendar_events_insert_own" on public.user_calendar_events
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "user_calendar_events_update_own" on public.user_calendar_events
for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "user_calendar_events_delete_own" on public.user_calendar_events
for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.study_sessions, public.study_timer_state, public.tasks, public.goals, public.user_calendar_events from anon;
revoke insert, update, delete, truncate, references, trigger on public.study_sessions from authenticated;
revoke insert, update, delete, truncate, references, trigger on public.study_timer_state from authenticated;
grant select on public.study_sessions, public.study_timer_state to authenticated;
grant select, insert, update, delete on public.tasks, public.goals, public.user_calendar_events to authenticated;
grant all on public.study_sessions, public.study_timer_state, public.tasks, public.goals, public.user_calendar_events to service_role;

create or replace function public.study_subject_is_applicable(p_user_id uuid, p_subject_id text)
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
    join public.attempt_syllabus_map asm
      on asm.level_id = l.id
     and asm.attempt_key = p.attempt_key
     and asm.subject_id = p_subject_id
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

create or replace function public.study_timezone_is_valid(p_timezone text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select exists (select 1 from pg_timezone_names where name = p_timezone);
$$;

create or replace function public.study_timer_current_elapsed(
  p_elapsed integer,
  p_running_since timestamptz,
  p_now timestamptz
)
returns integer
language sql
immutable
set search_path = public, pg_temp
as $$
  select least(
    43200,
    greatest(0, coalesce(p_elapsed, 0)) +
    case when p_running_since is null then 0 else greatest(0, floor(extract(epoch from (p_now - p_running_since)))::integer) end
  );
$$;

create or replace function public.study_timer_start(
  p_subject_id text default null,
  p_chapter_id text default null,
  p_mode text default 'stopwatch',
  p_focus_target_seconds integer default null,
  p_break_target_seconds integer default null,
  p_timezone text default 'UTC'
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := now();
  v_chapter_subject text;
begin
  if v_user_id is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if p_mode not in ('stopwatch', 'pomodoro') then raise exception 'Unsupported timer mode.' using errcode = '22023'; end if;
  if p_focus_target_seconds is not null and (p_focus_target_seconds < 60 or p_focus_target_seconds > 43200) then raise exception 'Focus duration must be between 1 minute and 12 hours.' using errcode = '22023'; end if;
  if p_break_target_seconds is not null and (p_break_target_seconds < 0 or p_break_target_seconds > 7200) then raise exception 'Break duration is invalid.' using errcode = '22023'; end if;
  if not public.study_timezone_is_valid(p_timezone) then raise exception 'Unknown timezone.' using errcode = '22023'; end if;
  if p_subject_id is not null and not public.study_subject_is_applicable(v_user_id, p_subject_id) then raise exception 'Subject is not applicable to the current academic profile.' using errcode = '42501'; end if;
  if p_chapter_id is not null then
    if not public.progress_chapter_is_applicable(v_user_id, p_chapter_id) then raise exception 'Chapter is not applicable to the current academic profile.' using errcode = '42501'; end if;
    select sv.subject_id into v_chapter_subject from public.chapters c join public.syllabus_versions sv on sv.id = c.syllabus_version_id where c.id = p_chapter_id;
    if p_subject_id is not null and v_chapter_subject is distinct from p_subject_id then raise exception 'Chapter does not belong to the selected subject.' using errcode = '22023'; end if;
  end if;
  if exists (select 1 from public.study_timer_state where user_id = v_user_id) then raise exception 'A study timer is already active.' using errcode = '23505'; end if;

  insert into public.study_timer_state (
    user_id, subject_id, chapter_id, status, mode, focus_target_seconds, break_target_seconds,
    started_at, running_since, elapsed_seconds, paused_at, timezone, last_interaction_at
  ) values (
    v_user_id, p_subject_id, p_chapter_id, 'running', p_mode, p_focus_target_seconds, p_break_target_seconds,
    v_now, v_now, 0, null, p_timezone, v_now
  );

  return jsonb_build_object('status','running','started_at',v_now,'elapsed_seconds',0,'saved_at',v_now);
end;
$$;

create or replace function public.study_timer_pause()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.study_timer_state;
  v_now timestamptz := now();
  v_elapsed integer;
begin
  if v_user_id is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  select * into v_row from public.study_timer_state where user_id = v_user_id for update;
  if not found then raise exception 'No active study timer.' using errcode = 'P0002'; end if;
  if v_row.status <> 'running' then raise exception 'Timer is already paused.' using errcode = '22023'; end if;
  v_elapsed := public.study_timer_current_elapsed(v_row.elapsed_seconds, v_row.running_since, v_now);
  update public.study_timer_state
  set status='paused', elapsed_seconds=v_elapsed, running_since=null, paused_at=v_now, last_interaction_at=v_now
  where user_id=v_user_id;
  return jsonb_build_object('status','paused','elapsed_seconds',v_elapsed,'saved_at',v_now);
end;
$$;

create or replace function public.study_timer_resume()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.study_timer_state;
  v_now timestamptz := now();
begin
  if v_user_id is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  select * into v_row from public.study_timer_state where user_id = v_user_id for update;
  if not found then raise exception 'No paused study timer.' using errcode = 'P0002'; end if;
  if v_row.status <> 'paused' then raise exception 'Timer is already running.' using errcode = '22023'; end if;
  if v_row.elapsed_seconds >= 43200 then raise exception 'Timer reached the 12 hour safety limit. Finish or discard it.' using errcode = '22023'; end if;
  update public.study_timer_state
  set status='running', running_since=v_now, paused_at=null, last_interaction_at=v_now
  where user_id=v_user_id;
  return jsonb_build_object('status','running','elapsed_seconds',v_row.elapsed_seconds,'running_since',v_now,'saved_at',v_now);
end;
$$;

create or replace function public.study_timer_touch()
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  update public.study_timer_state set last_interaction_at=now() where user_id=v_user_id;
end;
$$;

create or replace function public.study_timer_finish()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.study_timer_state;
  v_now timestamptz := now();
  v_elapsed integer;
  v_session_id uuid;
begin
  if v_user_id is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  select * into v_row from public.study_timer_state where user_id=v_user_id for update;
  if not found then raise exception 'No active study timer.' using errcode = 'P0002'; end if;
  if v_row.status='running' and v_row.last_interaction_at < v_now - interval '16 hours' then
    raise exception 'This timer appears abandoned. Discard it instead of adding accidental study time.' using errcode = '22023';
  end if;
  v_elapsed := case when v_row.status='running'
    then public.study_timer_current_elapsed(v_row.elapsed_seconds, v_row.running_since, v_now)
    else least(43200, greatest(0, v_row.elapsed_seconds)) end;
  v_elapsed := greatest(1, v_elapsed);

  insert into public.study_sessions (
    user_id, subject_id, chapter_id, started_at, ended_at, duration_seconds,
    mode, focus_target_seconds, break_target_seconds, timezone
  ) values (
    v_user_id, v_row.subject_id, v_row.chapter_id, v_row.started_at, v_now, v_elapsed,
    v_row.mode, v_row.focus_target_seconds, v_row.break_target_seconds, v_row.timezone
  ) returning id into v_session_id;

  delete from public.study_timer_state where user_id=v_user_id;
  return jsonb_build_object('session_id',v_session_id,'duration_seconds',v_elapsed,'ended_at',v_now);
end;
$$;

create or replace function public.study_timer_discard()
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  delete from public.study_timer_state where user_id=v_user_id;
end;
$$;

revoke all on function public.study_subject_is_applicable(uuid, text) from public, anon, authenticated;
revoke all on function public.study_timezone_is_valid(text) from public, anon, authenticated;
revoke all on function public.study_timer_current_elapsed(integer, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.study_timer_start(text, text, text, integer, integer, text) from public, anon;
revoke all on function public.study_timer_pause() from public, anon;
revoke all on function public.study_timer_resume() from public, anon;
revoke all on function public.study_timer_touch() from public, anon;
revoke all on function public.study_timer_finish() from public, anon;
revoke all on function public.study_timer_discard() from public, anon;
grant execute on function public.study_timer_start(text, text, text, integer, integer, text) to authenticated, service_role;
grant execute on function public.study_timer_pause() to authenticated, service_role;
grant execute on function public.study_timer_resume() to authenticated, service_role;
grant execute on function public.study_timer_touch() to authenticated, service_role;
grant execute on function public.study_timer_finish() to authenticated, service_role;
grant execute on function public.study_timer_discard() to authenticated, service_role;

insert into public.app_settings (key, value, is_public)
values (
  'study.phase6',
  '{"max_session_seconds":43200,"abandoned_after_hours":16,"timer_modes":["stopwatch","pomodoro"],"pomodoro_presets":[{"focus":25,"break":5},{"focus":50,"break":10}],"calendar":"composed"}'::jsonb,
  true
)
on conflict (key) do update set value=excluded.value,is_public=excluded.is_public,updated_at=now();

insert into public.app_settings (key, value, is_public)
values ('app.phase', '{"phase":6,"status":"study_planner_goals_calendar"}'::jsonb, true)
on conflict (key) do update set value=excluded.value,is_public=excluded.is_public,updated_at=now();
