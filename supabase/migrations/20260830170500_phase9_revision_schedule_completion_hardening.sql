-- Phase 9 revision schedule completion hardening.
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
    and r.revision_number > array_length(v_rules.interval_days, 1);

  insert into public.revision_due_items (user_id, chapter_id, revision_number, source_completed_at, due_at, status, completed_at)
  select cp.user_id,
         cp.chapter_id,
         x.ordinality::smallint,
         cp.completed_at,
         public.phase9_align_preferred_day(cp.completed_at + make_interval(days => x.interval_day), v_rules.preferred_weekdays),
         case when x.ordinality = 1 and cp.revision_1_at is not null then 'completed'
              when x.ordinality = 2 and cp.revision_2_at is not null then 'completed'
              else 'pending' end,
         case when x.ordinality = 1 then cp.revision_1_at
              when x.ordinality = 2 then cp.revision_2_at
              else null end
  from public.chapter_progress cp
  cross join lateral unnest(v_rules.interval_days) with ordinality as x(interval_day, ordinality)
  where cp.user_id = p_user_id and cp.completed_at is not null
  on conflict (user_id, chapter_id, revision_number, source_completed_at)
  do update set
    due_at = case when public.revision_due_items.manual_due_at is null then excluded.due_at else public.revision_due_items.due_at end,
    status = case when public.revision_due_items.status = 'completed' then 'completed' else excluded.status end,
    completed_at = case when public.revision_due_items.status = 'completed' then public.revision_due_items.completed_at else excluded.completed_at end;
end;
$$;
