-- Phase 5 hardening: undo must target the latest event for that chapter.
-- Equality of current state alone is insufficient when a newer event returns the
-- chapter to the same state. This guard prevents an old event from overwriting
-- newer multi-device history.

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
  v_latest_event_id uuid;
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

  select id into v_latest_event_id
  from public.progress_events
  where user_id = v_user_id and chapter_id = v_event.chapter_id
  order by created_at desc, id desc
  limit 1;

  if v_latest_event_id is distinct from v_event.id then
    raise exception 'Progress changed after this event; undo would overwrite a newer change.' using errcode = '40001';
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

  return jsonb_build_object(
    'chapter_id', v_event.chapter_id,
    'state', public.progress_state_json(v_row),
    'event_id', v_undo_event_id,
    'saved_at', v_row.updated_at,
    'reverted_event_id', v_event.id
  );
end;
$$;

revoke all on function public.progress_undo_event(uuid) from public, anon;
grant execute on function public.progress_undo_event(uuid) to authenticated, service_role;
