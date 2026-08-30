-- CA Progress V2 - Phase 9 Smart Revision & Daily Planning Engine
-- Apply only to the isolated V2 Supabase project.
-- Phase 5 remains progress truth; Phase 6 remains study/task/goal truth.

create table public.revision_rules (
  user_id uuid primary key references auth.users(id) on delete cascade,
  interval_days integer[] not null default array[1,7,21],
  preferred_weekdays smallint[] not null default array[1,2,3,4,5,6],
  revision_minutes integer not null default 45 check (revision_minutes between 10 and 360),
  new_chapter_minutes integer not null default 90 check (new_chapter_minutes between 15 and 480),
  test_minutes integer not null default 60 check (test_minutes between 15 and 360),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint revision_rules_interval_count check (array_length(interval_days, 1) between 1 and 5),
  constraint revision_rules_interval_range check (0 < all(interval_days) and 180 >= all(interval_days)),
  constraint revision_rules_weekday_count check (array_length(preferred_weekdays, 1) between 1 and 7),
  constraint revision_rules_weekday_range check (0 <= all(preferred_weekdays) and 6 >= all(preferred_weekdays))
);

create table public.planner_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (char_length(event_type) between 1 and 80),
  entity_type text not null check (char_length(entity_type) between 1 and 80),
  entity_id text,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now()
);

create table public.revision_due_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  chapter_id text not null references public.chapters(id) on delete restrict,
  revision_number smallint not null check (revision_number between 1 and 5),
  source_completed_at timestamptz not null,
  due_at timestamptz not null,
  manual_due_at timestamptz,
  status text not null default 'pending' check (status in ('pending','completed','skipped')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, chapter_id, revision_number, source_completed_at),
  constraint revision_due_completion_shape check ((status = 'completed' and completed_at is not null) or (status <> 'completed' and completed_at is null))
);

create table public.daily_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_date date not null,
  attempt_key text not null,
  timezone text not null default 'UTC',
  target_minutes integer not null check (target_minutes between 1 and 1440),
  generation_reason text not null default 'meaningful_event',
  generation_version text not null default 'phase9-v1',
  source_event_id uuid references public.planner_events(id) on delete set null,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, plan_date)
);

create table public.daily_plan_items (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.daily_plans(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null check (source_type in ('revision_due','task','chapter','test')),
  source_key text not null,
  source_id text,
  chapter_id text references public.chapters(id) on delete restrict,
  subject_id text references public.subjects(id) on delete restrict,
  revision_number smallint check (revision_number is null or revision_number between 1 and 5),
  test_number smallint check (test_number is null or test_number between 1 and 2),
  title text not null check (char_length(title) between 1 and 200),
  item_kind text not null check (item_kind in ('revision','task','new_chapter','test')),
  estimated_minutes integer not null check (estimated_minutes between 1 and 720),
  priority_score numeric(8,2) not null,
  reason_code text not null check (char_length(reason_code) between 1 and 80),
  reason_text text not null check (char_length(reason_text) between 1 and 600),
  status text not null default 'planned' check (status in ('planned','completed','skipped','rescheduled')),
  scheduled_for date not null,
  scheduled_at timestamptz,
  manual_override boolean not null default false,
  manual_note text check (manual_note is null or char_length(manual_note) <= 500),
  position integer not null default 0,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, source_key),
  constraint daily_plan_item_completion_shape check ((status = 'completed' and completed_at is not null) or (status <> 'completed' and completed_at is null))
);

create table public.forecast_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  attempt_key text not null,
  attempt_anchor_date date,
  date_source text not null check (date_source in ('verified_exam_date','attempt_month','unavailable')),
  total_chapters integer not null check (total_chapters >= 0),
  completed_chapters integer not null check (completed_chapters >= 0),
  remaining_chapters integer not null check (remaining_chapters >= 0),
  observed_chapters_per_week numeric(8,2) not null default 0,
  required_chapters_per_week numeric(8,2) not null default 0,
  projected_completion_date date,
  target_completion_date date,
  status text not null check (status in ('complete','on_track','at_risk','behind','no_date')),
  explanation text not null check (char_length(explanation) between 1 and 800),
  source_event_id uuid references public.planner_events(id) on delete set null,
  created_at timestamptz not null default now()
);

create index planner_events_user_created_idx on public.planner_events (user_id, created_at desc);
create index revision_due_items_user_due_idx on public.revision_due_items (user_id, status, due_at);
create index revision_due_items_user_chapter_idx on public.revision_due_items (user_id, chapter_id, revision_number);
create index daily_plans_user_date_idx on public.daily_plans (user_id, plan_date desc);
create index daily_plan_items_user_date_idx on public.daily_plan_items (user_id, scheduled_for, status, position);
create index daily_plan_items_plan_position_idx on public.daily_plan_items (plan_id, position, priority_score desc);
create index forecast_snapshots_user_created_idx on public.forecast_snapshots (user_id, created_at desc);

create trigger revision_rules_set_updated_at before update on public.revision_rules for each row execute function public.set_updated_at();
create trigger revision_due_items_set_updated_at before update on public.revision_due_items for each row execute function public.set_updated_at();
create trigger daily_plans_set_updated_at before update on public.daily_plans for each row execute function public.set_updated_at();
create trigger daily_plan_items_set_updated_at before update on public.daily_plan_items for each row execute function public.set_updated_at();

alter table public.revision_rules enable row level security;
alter table public.planner_events enable row level security;
alter table public.revision_due_items enable row level security;
alter table public.daily_plans enable row level security;
alter table public.daily_plan_items enable row level security;
alter table public.forecast_snapshots enable row level security;

create policy "revision_rules_read_own" on public.revision_rules for select to authenticated using ((select auth.uid()) = user_id);
create policy "planner_events_read_own" on public.planner_events for select to authenticated using ((select auth.uid()) = user_id);
create policy "revision_due_items_read_own" on public.revision_due_items for select to authenticated using ((select auth.uid()) = user_id);
create policy "daily_plans_read_own" on public.daily_plans for select to authenticated using ((select auth.uid()) = user_id);
create policy "daily_plan_items_read_own" on public.daily_plan_items for select to authenticated using ((select auth.uid()) = user_id);
create policy "forecast_snapshots_read_own" on public.forecast_snapshots for select to authenticated using ((select auth.uid()) = user_id);

revoke all on public.revision_rules, public.planner_events, public.revision_due_items, public.daily_plans, public.daily_plan_items, public.forecast_snapshots from anon;
revoke insert, update, delete, truncate, references, trigger on public.revision_rules, public.planner_events, public.revision_due_items, public.daily_plans, public.daily_plan_items, public.forecast_snapshots from authenticated;
grant select on public.revision_rules, public.planner_events, public.revision_due_items, public.daily_plans, public.daily_plan_items, public.forecast_snapshots to authenticated;
grant all on public.revision_rules, public.planner_events, public.revision_due_items, public.daily_plans, public.daily_plan_items, public.forecast_snapshots to service_role;

create or replace function public.phase9_record_planner_event(
  p_user_id uuid,
  p_event_type text,
  p_entity_type text,
  p_entity_id text default null,
  p_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare v_id uuid;
begin
  if p_user_id is null then return null; end if;
  insert into public.planner_events (user_id, event_type, entity_type, entity_id, payload)
  values (p_user_id, left(coalesce(nullif(btrim(p_event_type),''),'unknown'),80), left(coalesce(nullif(btrim(p_entity_type),''),'unknown'),80), p_entity_id, coalesce(p_payload,'{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.phase9_align_preferred_day(p_due_at timestamptz, p_weekdays smallint[])
returns timestamptz
language plpgsql
immutable
set search_path = pg_catalog, pg_temp
as $$
declare
  v_due timestamptz := p_due_at;
  v_i integer := 0;
begin
  if p_weekdays is null or array_length(p_weekdays,1) is null then return p_due_at; end if;
  while v_i < 7 loop
    if extract(dow from v_due)::smallint = any(p_weekdays) then return v_due; end if;
    v_due := v_due + interval '1 day';
    v_i := v_i + 1;
  end loop;
  return p_due_at;
end;
$$;

create or replace function public.phase9_rebuild_revision_schedule(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare v_rules public.revision_rules;
begin
  insert into public.revision_rules (user_id) values (p_user_id) on conflict (user_id) do nothing;
  select * into v_rules from public.revision_rules where user_id = p_user_id;

  delete from public.revision_due_items r
  where r.user_id = p_user_id
    and r.status <> 'completed'
    and r.manual_due_at is null
    and r.revision_number > array_length(v_rules.interval_days,1);

  insert into public.revision_due_items (
    user_id, chapter_id, revision_number, source_completed_at, due_at, status
  )
  select cp.user_id,
         cp.chapter_id,
         ordinality::smallint,
         cp.completed_at,
         public.phase9_align_preferred_day(cp.completed_at + make_interval(days => interval_day), v_rules.preferred_weekdays),
         case
           when ordinality = 1 and cp.revision_1_at is not null then 'completed'
           when ordinality = 2 and cp.revision_2_at is not null then 'completed'
           else 'pending'
         end
  from public.chapter_progress cp
  cross join lateral unnest(v_rules.interval_days) with ordinality as x(interval_day, ordinality)
  where cp.user_id = p_user_id and cp.completed_at is not null
  on conflict (user_id, chapter_id, revision_number, source_completed_at)
  do update set
    due_at = excluded.due_at,
    status = case when public.revision_due_items.status = 'completed' then 'completed' else excluded.status end,
    completed_at = case when public.revision_due_items.status = 'completed' then public.revision_due_items.completed_at else excluded.completed_at end
  where public.revision_due_items.manual_due_at is null;

  update public.revision_due_items r
  set completed_at = coalesce(r.completed_at, now())
  from public.chapter_progress cp
  where r.user_id = p_user_id
    and cp.user_id = r.user_id
    and cp.chapter_id = r.chapter_id
    and cp.completed_at = r.source_completed_at
    and ((r.revision_number = 1 and cp.revision_1_at is not null) or (r.revision_number = 2 and cp.revision_2_at is not null))
    and r.status <> 'completed';

  update public.revision_due_items r
  set status = 'completed'
  from public.chapter_progress cp
  where r.user_id = p_user_id
    and cp.user_id = r.user_id
    and cp.chapter_id = r.chapter_id
    and cp.completed_at = r.source_completed_at
    and ((r.revision_number = 1 and cp.revision_1_at is not null) or (r.revision_number = 2 and cp.revision_2_at is not null))
    and r.status <> 'completed';
end;
$$;

create or replace function public.phase9_progress_schedule_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id uuid := coalesce(new.user_id, old.user_id);
  v_chapter_id text := coalesce(new.chapter_id, old.chapter_id);
begin
  if tg_op = 'DELETE' then
    delete from public.revision_due_items where user_id = old.user_id and chapter_id = old.chapter_id and status <> 'completed';
    perform public.phase9_record_planner_event(old.user_id, 'progress_changed', 'chapter_progress', old.chapter_id, jsonb_build_object('operation','delete'));
    return old;
  end if;

  if tg_op = 'INSERT' or new.completed_at is distinct from old.completed_at then
    if new.completed_at is null then
      delete from public.revision_due_items
      where user_id = new.user_id and chapter_id = new.chapter_id and status <> 'completed';
    else
      delete from public.revision_due_items
      where user_id = new.user_id and chapter_id = new.chapter_id and status <> 'completed' and source_completed_at <> new.completed_at;
      perform public.phase9_rebuild_revision_schedule(new.user_id);
    end if;
  end if;

  if tg_op = 'INSERT'
     or new.completed_at is distinct from old.completed_at
     or new.revision_1_at is distinct from old.revision_1_at
     or new.revision_2_at is distinct from old.revision_2_at
     or new.test_1_at is distinct from old.test_1_at
     or new.test_2_at is distinct from old.test_2_at then
    perform public.phase9_rebuild_revision_schedule(new.user_id);
    perform public.phase9_record_planner_event(v_user_id, 'progress_changed', 'chapter_progress', v_chapter_id,
      jsonb_build_object('completed_at',new.completed_at,'revision_1_at',new.revision_1_at,'revision_2_at',new.revision_2_at,'test_1_at',new.test_1_at,'test_2_at',new.test_2_at));
  end if;
  return new;
end;
$$;

create trigger phase9_chapter_progress_schedule
after insert or update or delete on public.chapter_progress
for each row execute function public.phase9_progress_schedule_trigger();

create or replace function public.phase9_rules_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  perform public.phase9_rebuild_revision_schedule(new.user_id);
  perform public.phase9_record_planner_event(new.user_id, 'revision_rules_changed', 'revision_rules', new.user_id::text,
    jsonb_build_object('interval_days',new.interval_days,'preferred_weekdays',new.preferred_weekdays));
  return new;
end;
$$;

create trigger phase9_revision_rules_changed
after insert or update on public.revision_rules
for each row execute function public.phase9_rules_trigger();

create or replace function public.phase9_capture_profile_event()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
begin
  if new.attempt_key is distinct from old.attempt_key
     or new.daily_target_minutes is distinct from old.daily_target_minutes
     or new.ca_level is distinct from old.ca_level
     or new.group_choice is distinct from old.group_choice
     or new.timezone is distinct from old.timezone then
    perform public.phase9_record_planner_event(new.user_id, 'profile_planning_changed', 'profile', new.user_id::text,
      jsonb_build_object('attempt_key',new.attempt_key,'daily_target_minutes',new.daily_target_minutes,'ca_level',new.ca_level,'group_choice',new.group_choice,'timezone',new.timezone));
  end if;
  return new;
end;
$$;

create trigger phase9_profile_planning_changed
after update on public.profiles
for each row execute function public.phase9_capture_profile_event();

create or replace function public.phase9_capture_related_event()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id uuid;
  v_id text;
  v_event text;
begin
  if tg_op = 'DELETE' then
    v_user_id := old.user_id;
    v_id := old.id::text;
  else
    v_user_id := new.user_id;
    v_id := new.id::text;
  end if;
  v_event := case tg_table_name
    when 'tasks' then 'task_changed'
    when 'goals' then 'goal_changed'
    when 'study_sessions' then 'study_session_completed'
    else 'planner_input_changed'
  end;
  perform public.phase9_record_planner_event(v_user_id, v_event, tg_table_name, v_id, jsonb_build_object('operation',lower(tg_op)));
  return coalesce(new, old);
end;
$$;

create trigger phase9_tasks_changed after insert or update or delete on public.tasks for each row execute function public.phase9_capture_related_event();
create trigger phase9_goals_changed after insert or update or delete on public.goals for each row execute function public.phase9_capture_related_event();
create trigger phase9_study_sessions_changed after insert on public.study_sessions for each row execute function public.phase9_capture_related_event();

create or replace function public.phase9_set_revision_rules(
  p_interval_days integer[],
  p_preferred_weekdays smallint[],
  p_revision_minutes integer,
  p_new_chapter_minutes integer,
  p_test_minutes integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare v_user_id uuid := auth.uid(); v_row public.revision_rules;
begin
  if v_user_id is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if p_interval_days is null or array_length(p_interval_days,1) not between 1 and 5 or not (0 < all(p_interval_days) and 180 >= all(p_interval_days)) then
    raise exception 'Revision intervals must contain 1 to 5 values between 1 and 180 days.' using errcode = '22023';
  end if;
  if p_preferred_weekdays is null or array_length(p_preferred_weekdays,1) not between 1 and 7 or not (0 <= all(p_preferred_weekdays) and 6 >= all(p_preferred_weekdays)) then
    raise exception 'Choose at least one valid study weekday.' using errcode = '22023';
  end if;
  if p_revision_minutes not between 10 and 360 or p_new_chapter_minutes not between 15 and 480 or p_test_minutes not between 15 and 360 then
    raise exception 'Planner duration values are outside the allowed range.' using errcode = '22023';
  end if;

  insert into public.revision_rules (user_id, interval_days, preferred_weekdays, revision_minutes, new_chapter_minutes, test_minutes)
  values (v_user_id, p_interval_days, p_preferred_weekdays, p_revision_minutes, p_new_chapter_minutes, p_test_minutes)
  on conflict (user_id) do update set
    interval_days = excluded.interval_days,
    preferred_weekdays = excluded.preferred_weekdays,
    revision_minutes = excluded.revision_minutes,
    new_chapter_minutes = excluded.new_chapter_minutes,
    test_minutes = excluded.test_minutes
  returning * into v_row;

  return jsonb_build_object(
    'interval_days',v_row.interval_days,
    'preferred_weekdays',v_row.preferred_weekdays,
    'revision_minutes',v_row.revision_minutes,
    'new_chapter_minutes',v_row.new_chapter_minutes,
    'test_minutes',v_row.test_minutes,
    'updated_at',v_row.updated_at
  );
end;
$$;

revoke all on function public.phase9_record_planner_event(uuid,text,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.phase9_align_preferred_day(timestamptz,smallint[]) from public, anon, authenticated;
revoke all on function public.phase9_rebuild_revision_schedule(uuid) from public, anon, authenticated;
revoke all on function public.phase9_progress_schedule_trigger() from public, anon, authenticated;
revoke all on function public.phase9_rules_trigger() from public, anon, authenticated;
revoke all on function public.phase9_capture_profile_event() from public, anon, authenticated;
revoke all on function public.phase9_capture_related_event() from public, anon, authenticated;
revoke all on function public.phase9_set_revision_rules(integer[],smallint[],integer,integer,integer) from public, anon;
grant execute on function public.phase9_set_revision_rules(integer[],smallint[],integer,integer,integer) to authenticated, service_role;

insert into public.revision_rules (user_id)
select p.user_id from public.profiles p where p.onboarding_completed_at is not null
on conflict (user_id) do nothing;

insert into public.revision_due_items (user_id, chapter_id, revision_number, source_completed_at, due_at, status, completed_at)
select cp.user_id,
       cp.chapter_id,
       x.ordinality::smallint,
       cp.completed_at,
       public.phase9_align_preferred_day(cp.completed_at + make_interval(days => x.interval_day), rr.preferred_weekdays),
       case
         when x.ordinality = 1 and cp.revision_1_at is not null then 'completed'
         when x.ordinality = 2 and cp.revision_2_at is not null then 'completed'
         else 'pending'
       end,
       case
         when x.ordinality = 1 then cp.revision_1_at
         when x.ordinality = 2 then cp.revision_2_at
         else null
       end
from public.chapter_progress cp
join public.revision_rules rr on rr.user_id = cp.user_id
cross join lateral unnest(rr.interval_days) with ordinality as x(interval_day, ordinality)
where cp.completed_at is not null
on conflict (user_id, chapter_id, revision_number, source_completed_at) do nothing;

insert into public.app_settings (key, value, is_public)
values (
  'planner.phase9',
  '{"source_progress":"chapter_progress","source_study":"study_sessions","source_tasks":"tasks","source_goals":"goals","recompute":"meaningful_events","manual_overrides":"preserved","forecast_attempt_date":"verified_or_attempt_month","engine_version":"phase9-v1"}'::jsonb,
  true
)
on conflict (key) do update set value = excluded.value, is_public = excluded.is_public, updated_at = now();

insert into public.app_settings (key, value, is_public)
values ('app.phase', '{"phase":9,"status":"smart_revision_daily_planning"}'::jsonb, true)
on conflict (key) do update set value = excluded.value, is_public = excluded.is_public, updated_at = now();
