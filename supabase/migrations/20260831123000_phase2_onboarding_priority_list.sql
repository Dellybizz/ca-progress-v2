-- CA Progress V2 - ranked onboarding focus priorities.
-- Apply only to the isolated V2 Supabase project.

alter table public.profiles
  add column if not exists primary_use_priority text[];

-- Preserve existing single-focus onboarding choices as Priority 1.
update public.profiles
set primary_use_priority = array[primary_use]
where primary_use is not null
  and primary_use_priority is null;

alter table public.profiles
  drop constraint if exists profiles_primary_use_priority_check;

alter table public.profiles
  add constraint profiles_primary_use_priority_check check (
    primary_use_priority is null
    or (
      cardinality(primary_use_priority) between 1 and 6
      and array_position(primary_use_priority, null) is null
      and primary_use_priority <@ array['plan','progress','focus','updates','tests','community']::text[]
    )
  );
