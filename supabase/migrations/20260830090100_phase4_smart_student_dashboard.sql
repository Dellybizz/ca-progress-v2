-- CA Progress V2 - Phase 4 Smart Student Dashboard
-- Apply only to the isolated V2 Supabase project.
-- Phase 4 aggregates existing profile/academic/ICAI data. It does not pre-create
-- Phase 5 progress, Phase 6 study/task, or Phase 9 planner source-of-truth tables.

create table public.dashboard_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('dashboard_view', 'quick_action')),
  action_key text,
  context jsonb not null default '{}'::jsonb check (jsonb_typeof(context) = 'object'),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint dashboard_events_action_check check (
    (event_type = 'dashboard_view' and action_key is null)
    or
    (event_type = 'quick_action' and action_key in ('start_study', 'add_task', 'add_note', 'open_progress'))
  )
);

create index dashboard_events_user_occurred_idx
  on public.dashboard_events (user_id, occurred_at desc);
create index dashboard_events_type_occurred_idx
  on public.dashboard_events (event_type, occurred_at desc);

alter table public.dashboard_events enable row level security;

create policy "dashboard_events_insert_own"
on public.dashboard_events
for insert
to authenticated
with check ((select auth.uid()) = user_id);

revoke all on public.dashboard_events from anon;
revoke select, update, delete, truncate, references, trigger on public.dashboard_events from authenticated;
grant insert on public.dashboard_events to authenticated;
grant all on public.dashboard_events to service_role;

insert into public.app_settings (key, value, is_public)
values (
  'dashboard.phase4',
  '{"academic_cache_seconds":900,"icai_cache_seconds":60,"recommendation_slots":["next_study"],"analytics_events":["dashboard_view","quick_action"],"future_sources":{"progress":"phase5","study_tasks":"phase6","smart_planner":"phase9"}}'::jsonb,
  true
)
on conflict (key) do update
set value = excluded.value,
    is_public = excluded.is_public,
    updated_at = now();
