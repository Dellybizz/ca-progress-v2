-- Phase 6 hardening: persist the user's IANA timezone and prevent planner rows from linking to out-of-scope academic entities.

alter table public.profiles
add column timezone text not null default 'UTC';

create or replace function public.phase6_set_timezone(p_timezone text)
returns void
language plpgsql
security definer
set search_path = public, auth, pg_catalog, pg_temp
as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'Authentication required.' using errcode = '42501'; end if;
  if not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'Unknown timezone.' using errcode = '22023';
  end if;
  update public.profiles set timezone = p_timezone where user_id = v_user_id;
end;
$$;

create or replace function public.phase6_sync_timer_timezone()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.profiles set timezone = new.timezone where user_id = new.user_id;
  return new;
end;
$$;

create trigger study_timer_state_sync_timezone
after insert or update of timezone on public.study_timer_state
for each row execute function public.phase6_sync_timer_timezone();

create or replace function public.phase6_validate_task_scope()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_chapter_subject text;
begin
  if new.subject_id is not null and not public.study_subject_is_applicable(new.user_id, new.subject_id) then
    raise exception 'Task subject is not applicable to the current academic profile.' using errcode = '42501';
  end if;
  if new.chapter_id is not null then
    if not public.progress_chapter_is_applicable(new.user_id, new.chapter_id) then
      raise exception 'Task chapter is not applicable to the current academic profile.' using errcode = '42501';
    end if;
    select sv.subject_id into v_chapter_subject
    from public.chapters c
    join public.syllabus_versions sv on sv.id = c.syllabus_version_id
    where c.id = new.chapter_id;
    if new.subject_id is not null and v_chapter_subject is distinct from new.subject_id then
      raise exception 'Task chapter does not belong to the selected subject.' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

create trigger tasks_validate_academic_scope
before insert or update of user_id, subject_id, chapter_id on public.tasks
for each row execute function public.phase6_validate_task_scope();

revoke all on function public.phase6_set_timezone(text) from public, anon;
grant execute on function public.phase6_set_timezone(text) to authenticated, service_role;
revoke all on function public.phase6_sync_timer_timezone() from public, anon, authenticated;
revoke all on function public.phase6_validate_task_scope() from public, anon, authenticated;
