-- CA Progress V2 - Phase 2 onboarding refinement
-- Apply only to the isolated V2 Supabase project.

alter table public.profiles
  add column if not exists primary_use text,
  add column if not exists feature_guide_completed_at timestamptz;

alter table public.profiles
  drop constraint if exists profiles_onboarding_step_check;

alter table public.profiles
  add constraint profiles_onboarding_step_check check (onboarding_step between 1 and 5),
  add constraint profiles_primary_use_check check (
    primary_use is null or primary_use in ('plan', 'progress', 'focus', 'updates', 'tests', 'community')
  );

-- Existing completed users should not be forced through a newly-added guide.
-- New users retain NULL until they finish or explicitly skip the guide.
update public.profiles
set feature_guide_completed_at = onboarding_completed_at
where onboarding_completed_at is not null
  and feature_guide_completed_at is null;
