-- Phase 9 trigger-safety hardening.
-- Avoid reading NEW on DELETE or OLD on INSERT while preserving the same event behavior.

create or replace function public.phase9_progress_schedule_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_user_id uuid;
  v_chapter_id text;
begin
  if tg_op = 'DELETE' then
    v_user_id := old.user_id;
    v_chapter_id := old.chapter_id;

    delete from public.revision_due_items
    where user_id = old.user_id
      and chapter_id = old.chapter_id
      and status <> 'completed';

    perform public.phase9_record_planner_event(
      old.user_id,
      'progress_changed',
      'chapter_progress',
      old.chapter_id,
      jsonb_build_object('operation', 'delete')
    );
    return old;
  end if;

  v_user_id := new.user_id;
  v_chapter_id := new.chapter_id;

  if tg_op = 'INSERT' then
    if new.completed_at is not null then
      delete from public.revision_due_items
      where user_id = new.user_id
        and chapter_id = new.chapter_id
        and status <> 'completed'
        and source_completed_at <> new.completed_at;

      perform public.phase9_rebuild_revision_schedule(new.user_id);
    end if;

    perform public.phase9_record_planner_event(
      v_user_id,
      'progress_changed',
      'chapter_progress',
      v_chapter_id,
      jsonb_build_object(
        'completed_at', new.completed_at,
        'revision_1_at', new.revision_1_at,
        'revision_2_at', new.revision_2_at,
        'test_1_at', new.test_1_at,
        'test_2_at', new.test_2_at
      )
    );
    return new;
  end if;

  if new.completed_at is distinct from old.completed_at then
    if new.completed_at is null then
      delete from public.revision_due_items
      where user_id = new.user_id
        and chapter_id = new.chapter_id
        and status <> 'completed';
    else
      delete from public.revision_due_items
      where user_id = new.user_id
        and chapter_id = new.chapter_id
        and status <> 'completed'
        and source_completed_at <> new.completed_at;

      perform public.phase9_rebuild_revision_schedule(new.user_id);
    end if;
  end if;

  if new.completed_at is distinct from old.completed_at
     or new.revision_1_at is distinct from old.revision_1_at
     or new.revision_2_at is distinct from old.revision_2_at
     or new.test_1_at is distinct from old.test_1_at
     or new.test_2_at is distinct from old.test_2_at then
    perform public.phase9_rebuild_revision_schedule(new.user_id);
    perform public.phase9_record_planner_event(
      v_user_id,
      'progress_changed',
      'chapter_progress',
      v_chapter_id,
      jsonb_build_object(
        'completed_at', new.completed_at,
        'revision_1_at', new.revision_1_at,
        'revision_2_at', new.revision_2_at,
        'test_1_at', new.test_1_at,
        'test_2_at', new.test_2_at
      )
    );
  end if;

  return new;
end;
$$;
