-- CA Progress V2 — CA Mentor / Think Engine Phase 1
-- Mentor Intelligence Foundation only. Phase 2 Academic Catalog Normalisation is NOT started here.
-- Reuses the existing Phase 3 academic catalog and Phase 8 attempt/ICAI source-of-truth tables.

create table public.mentor_model_versions (
  id uuid primary key default gen_random_uuid(),
  model_key text not null check (model_key in ('exam_intelligence','preparation_intelligence','student_model','forecast_model','source_weights')),
  version text not null,
  status text not null default 'draft' check (status in ('draft','active','retired')),
  config jsonb not null default '{}'::jsonb,
  public_metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  activated_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (model_key, version),
  check (status <> 'active' or activated_at is not null),
  check (status <> 'retired' or retired_at is not null)
);

create unique index mentor_one_active_model_per_key_idx
  on public.mentor_model_versions (model_key)
  where status = 'active';

create table public.mentor_intelligence_sources (
  id uuid primary key default gen_random_uuid(),
  source_kind text not null check (source_kind in (
    'icai_study_material','icai_syllabus','icai_rtp','icai_mtp_series_1','icai_mtp_series_2',
    'icai_question_paper','icai_suggested_answer','icai_mcq','icai_amendment','icai_bos_learning',
    'trusted_faculty','community','internal_user_outcome','verified_high_performer','verified_air'
  )),
  title text not null,
  source_url text,
  authority_tier text not null default 'untrusted' check (authority_tier in (
    'untrusted','official_icai','trusted_external','community','internal_unverified','internal_verified'
  )),
  authority_weight numeric(6,5) not null default 0 check (authority_weight >= 0 and authority_weight <= 1),
  verification_tier text not null default 'unverified' check (verification_tier in (
    'unverified','self_reported','evidence_uploaded','admin_verified','official_verified'
  )),
  verification_status text not null default 'pending' check (verification_status in ('pending','verified','rejected')),
  ingestion_status text not null default 'registered' check (ingestion_status in (
    'registered','processing','processed','manual_review','failed','rejected'
  )),
  attempt_id text references public.exam_attempts(id) on delete restrict,
  level_id text references public.course_levels(id) on delete restrict,
  group_id text references public.course_groups(id) on delete restrict,
  subject_id text references public.subjects(id) on delete restrict,
  syllabus_version_id text references public.syllabus_versions(id) on delete restrict,
  chapter_id text references public.chapters(id) on delete restrict,
  topic_id text references public.topics(id) on delete restrict,
  icai_resource_id text references public.icai_resources(id) on delete restrict,
  contributor_user_id uuid references auth.users(id) on delete set null,
  published_on date,
  attempt_relevance numeric(5,4) not null default 0 check (attempt_relevance >= 0 and attempt_relevance <= 1),
  mapping_confidence numeric(5,4) not null default 0 check (mapping_confidence >= 0 and mapping_confidence <= 1),
  evidence_quality numeric(5,4) not null default 0 check (evidence_quality >= 0 and evidence_quality <= 1),
  processing_version text not null default 'mentor-phase1',
  metadata jsonb not null default '{}'::jsonb,
  visibility text not null default 'internal' check (visibility in ('internal','published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (visibility = 'internal' or contributor_user_id is null)
);

create index mentor_sources_kind_attempt_idx on public.mentor_intelligence_sources (source_kind, attempt_id, verification_status);
create index mentor_sources_subject_idx on public.mentor_intelligence_sources (subject_id, chapter_id, topic_id);
create index mentor_sources_visibility_idx on public.mentor_intelligence_sources (visibility, authority_tier);

create table public.mentor_evidence (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.mentor_intelligence_sources(id) on delete restrict,
  attempt_id text references public.exam_attempts(id) on delete restrict,
  subject_id text references public.subjects(id) on delete restrict,
  syllabus_version_id text references public.syllabus_versions(id) on delete restrict,
  chapter_id text references public.chapters(id) on delete restrict,
  topic_id text references public.topics(id) on delete restrict,
  evidence_kind text not null check (evidence_kind in (
    'weightage','occurrence','marks','amendment','effort','strategy','difficulty','outcome_pattern','other'
  )),
  normalized_value numeric,
  normalized_unit text,
  evidence_text text,
  source_authority_tier text not null check (source_authority_tier in (
    'untrusted','official_icai','trusted_external','community','internal_unverified','internal_verified'
  )),
  confidence_level text not null default 'insufficient' check (confidence_level in ('insufficient','experimental','low','medium','high')),
  confidence_score numeric(5,4) not null default 0 check (confidence_score >= 0 and confidence_score <= 1),
  mapping_confidence numeric(5,4) not null default 0 check (mapping_confidence >= 0 and mapping_confidence <= 1),
  evidence_quality_score numeric(5,4) not null default 0 check (evidence_quality_score >= 0 and evidence_quality_score <= 1),
  sample_size integer not null default 0 check (sample_size >= 0),
  extraction_status text not null default 'pending' check (extraction_status in ('pending','extracted','manual_review','rejected')),
  contributor_user_id uuid references auth.users(id) on delete set null,
  raw_payload jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  visibility text not null default 'internal' check (visibility in ('internal','published')),
  observed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (visibility = 'internal' or contributor_user_id is null)
);

create index mentor_evidence_scope_idx on public.mentor_evidence (attempt_id, subject_id, chapter_id, topic_id);
create index mentor_evidence_kind_idx on public.mentor_evidence (evidence_kind, visibility, confidence_level);
create index mentor_evidence_source_idx on public.mentor_evidence (source_id, created_at desc);

create table public.mentor_exam_intelligence (
  id uuid primary key default gen_random_uuid(),
  attempt_id text not null references public.exam_attempts(id) on delete restrict,
  subject_id text not null references public.subjects(id) on delete restrict,
  syllabus_version_id text references public.syllabus_versions(id) on delete restrict,
  chapter_id text references public.chapters(id) on delete restrict,
  topic_id text references public.topics(id) on delete restrict,
  scope_kind text not null check (scope_kind in ('subject','chapter','topic')),
  model_version_id uuid not null references public.mentor_model_versions(id) on delete restrict,
  exam_importance_score numeric(6,3) not null check (exam_importance_score >= 0 and exam_importance_score <= 100),
  confidence_level text not null check (confidence_level in ('insufficient','experimental','low','medium','high')),
  confidence_score numeric(5,4) not null default 0 check (confidence_score >= 0 and confidence_score <= 1),
  evidence_summary jsonb not null default '{}'::jsonb,
  explanation text,
  is_published boolean not null default false,
  calculated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((scope_kind = 'subject' and chapter_id is null and topic_id is null)
      or (scope_kind = 'chapter' and chapter_id is not null and topic_id is null)
      or (scope_kind = 'topic' and chapter_id is not null and topic_id is not null))
);

create unique index mentor_exam_intelligence_scope_version_idx on public.mentor_exam_intelligence
  (attempt_id, subject_id, coalesce(chapter_id, ''), coalesce(topic_id, ''), model_version_id);
create index mentor_exam_intelligence_published_idx on public.mentor_exam_intelligence (attempt_id, subject_id, is_published, exam_importance_score desc);

create table public.mentor_learning_intelligence (
  id uuid primary key default gen_random_uuid(),
  attempt_id text references public.exam_attempts(id) on delete restrict,
  subject_id text not null references public.subjects(id) on delete restrict,
  syllabus_version_id text references public.syllabus_versions(id) on delete restrict,
  chapter_id text references public.chapters(id) on delete restrict,
  topic_id text references public.topics(id) on delete restrict,
  scope_kind text not null check (scope_kind in ('subject','chapter','topic')),
  model_version_id uuid not null references public.mentor_model_versions(id) on delete restrict,
  baseline_metrics jsonb not null default '{}'::jsonb,
  confidence_level text not null check (confidence_level in ('insufficient','experimental','low','medium','high')),
  confidence_score numeric(5,4) not null default 0 check (confidence_score >= 0 and confidence_score <= 1),
  evidence_summary jsonb not null default '{}'::jsonb,
  explanation text,
  is_published boolean not null default false,
  calculated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((scope_kind = 'subject' and chapter_id is null and topic_id is null)
      or (scope_kind = 'chapter' and chapter_id is not null and topic_id is null)
      or (scope_kind = 'topic' and chapter_id is not null and topic_id is not null))
);

create unique index mentor_learning_intelligence_scope_version_idx on public.mentor_learning_intelligence
  (coalesce(attempt_id, ''), subject_id, coalesce(chapter_id, ''), coalesce(topic_id, ''), model_version_id);
create index mentor_learning_intelligence_published_idx on public.mentor_learning_intelligence (subject_id, is_published, calculated_at desc);

create table public.mentor_personalization_rules (
  metric_key text primary key check (metric_key in (
    'pace_estimate','weak_area','revision_timing','workload_forecast','sustainable_capacity','retention_risk','similar_students'
  )),
  display_name text not null,
  is_enabled boolean not null default true,
  minimum_observation_days integer not null default 0 check (minimum_observation_days >= 0),
  minimum_study_minutes integer not null default 0 check (minimum_study_minutes >= 0),
  minimum_timed_sessions integer not null default 0 check (minimum_timed_sessions >= 0),
  minimum_completed_chapters integer not null default 0 check (minimum_completed_chapters >= 0),
  minimum_revision_events integer not null default 0 check (minimum_revision_events >= 0),
  minimum_tests integer not null default 0 check (minimum_tests >= 0),
  minimum_distinct_subjects integer not null default 0 check (minimum_distinct_subjects >= 0),
  minimum_cohort_sample_size integer not null default 0 check (minimum_cohort_sample_size >= 0),
  requirements jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.mentor_personalization_rules (
  metric_key, display_name, minimum_observation_days, minimum_study_minutes, minimum_timed_sessions,
  minimum_completed_chapters, minimum_revision_events, minimum_tests, minimum_distinct_subjects, minimum_cohort_sample_size
) values
  ('pace_estimate', 'Personal pace estimate', 3, 180, 5, 0, 0, 0, 0, 0),
  ('weak_area', 'Performance-based weak areas', 7, 0, 0, 2, 0, 3, 0, 0),
  ('revision_timing', 'Personal revision timing', 3, 120, 3, 1, 1, 0, 0, 0),
  ('workload_forecast', 'Personal workload forecast', 7, 300, 7, 3, 0, 0, 0, 0),
  ('sustainable_capacity', 'Sustainable study capacity', 7, 300, 5, 0, 0, 0, 0, 0),
  ('retention_risk', 'Personal retention risk', 7, 180, 0, 1, 2, 2, 0, 0),
  ('similar_students', 'Students-like-you intelligence', 14, 600, 10, 5, 0, 3, 0, 100)
on conflict (metric_key) do nothing;

create table public.mentor_personalization_eligibility (
  user_id uuid not null references auth.users(id) on delete cascade,
  metric_key text not null references public.mentor_personalization_rules(metric_key) on delete restrict,
  state text not null default 'unavailable' check (state in ('unavailable','collecting_data','early_estimate','personalized','high_confidence')),
  confidence_level text not null default 'insufficient' check (confidence_level in ('insufficient','experimental','low','medium','high')),
  observed_from timestamptz,
  observation_days integer not null default 0 check (observation_days >= 0),
  study_minutes integer not null default 0 check (study_minutes >= 0),
  timed_sessions integer not null default 0 check (timed_sessions >= 0),
  completed_chapters integer not null default 0 check (completed_chapters >= 0),
  revision_events integer not null default 0 check (revision_events >= 0),
  tests_completed integer not null default 0 check (tests_completed >= 0),
  distinct_subjects integer not null default 0 check (distinct_subjects >= 0),
  cohort_sample_size integer not null default 0 check (cohort_sample_size >= 0),
  evidence_summary jsonb not null default '{}'::jsonb,
  evaluated_at timestamptz not null default now(),
  eligible_since timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, metric_key),
  check (state not in ('personalized','high_confidence') or eligible_since is not null)
);

create index mentor_personalization_state_idx on public.mentor_personalization_eligibility (metric_key, state, evaluated_at desc);

create or replace function public.mentor_personalization_is_eligible(p_user_id uuid, p_metric_key text)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.mentor_personalization_eligibility e
    join public.mentor_personalization_rules r on r.metric_key = e.metric_key
    where e.user_id = p_user_id
      and e.metric_key = p_metric_key
      and r.is_enabled = true
      and e.state in ('personalized','high_confidence')
  );
$$;

create table public.mentor_recommendation_explanations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  metric_key text references public.mentor_personalization_rules(metric_key) on delete restrict,
  provenance text not null check (provenance in ('preprocessed','personalized','cohort')),
  attempt_id text references public.exam_attempts(id) on delete restrict,
  subject_id text references public.subjects(id) on delete restrict,
  chapter_id text references public.chapters(id) on delete restrict,
  topic_id text references public.topics(id) on delete restrict,
  action_key text not null,
  priority_score numeric(6,3) check (priority_score is null or (priority_score >= 0 and priority_score <= 100)),
  confidence_level text not null default 'insufficient' check (confidence_level in ('insufficient','experimental','low','medium','high')),
  summary text not null,
  reasons jsonb not null default '[]'::jsonb,
  evidence_refs jsonb not null default '[]'::jsonb,
  model_version_id uuid references public.mentor_model_versions(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (provenance = 'preprocessed' or metric_key is not null)
);

create index mentor_recommendations_user_idx on public.mentor_recommendation_explanations (user_id, created_at desc);
create index mentor_recommendations_metric_idx on public.mentor_recommendation_explanations (metric_key, provenance, created_at desc);

create trigger mentor_model_versions_set_updated_at before update on public.mentor_model_versions for each row execute function public.set_updated_at();
create trigger mentor_intelligence_sources_set_updated_at before update on public.mentor_intelligence_sources for each row execute function public.set_updated_at();
create trigger mentor_evidence_set_updated_at before update on public.mentor_evidence for each row execute function public.set_updated_at();
create trigger mentor_exam_intelligence_set_updated_at before update on public.mentor_exam_intelligence for each row execute function public.set_updated_at();
create trigger mentor_learning_intelligence_set_updated_at before update on public.mentor_learning_intelligence for each row execute function public.set_updated_at();
create trigger mentor_personalization_rules_set_updated_at before update on public.mentor_personalization_rules for each row execute function public.set_updated_at();
create trigger mentor_personalization_eligibility_set_updated_at before update on public.mentor_personalization_eligibility for each row execute function public.set_updated_at();

alter table public.mentor_model_versions enable row level security;
alter table public.mentor_intelligence_sources enable row level security;
alter table public.mentor_evidence enable row level security;
alter table public.mentor_exam_intelligence enable row level security;
alter table public.mentor_learning_intelligence enable row level security;
alter table public.mentor_personalization_rules enable row level security;
alter table public.mentor_personalization_eligibility enable row level security;
alter table public.mentor_recommendation_explanations enable row level security;

create policy "mentor_sources_read_published" on public.mentor_intelligence_sources
  for select to anon, authenticated
  using (visibility = 'published' and contributor_user_id is null);

create policy "mentor_evidence_read_published" on public.mentor_evidence
  for select to anon, authenticated
  using (visibility = 'published' and contributor_user_id is null);

create policy "mentor_exam_intelligence_read_published" on public.mentor_exam_intelligence
  for select to anon, authenticated using (is_published = true);

create policy "mentor_learning_intelligence_read_published" on public.mentor_learning_intelligence
  for select to anon, authenticated using (is_published = true);

create policy "mentor_personalization_rules_read" on public.mentor_personalization_rules
  for select to authenticated using (is_enabled = true);

create policy "mentor_personalization_eligibility_read_own" on public.mentor_personalization_eligibility
  for select to authenticated using (auth.uid() = user_id);

create policy "mentor_recommendations_read_own_gated" on public.mentor_recommendation_explanations
  for select to authenticated
  using (
    auth.uid() = user_id
    and (
      provenance = 'preprocessed'
      or (metric_key is not null and public.mentor_personalization_is_eligible(auth.uid(), metric_key))
    )
  );

grant select on public.mentor_intelligence_sources, public.mentor_evidence, public.mentor_exam_intelligence, public.mentor_learning_intelligence to anon, authenticated;
grant select on public.mentor_personalization_rules, public.mentor_personalization_eligibility, public.mentor_recommendation_explanations to authenticated;
grant execute on function public.mentor_personalization_is_eligible(uuid, text) to authenticated;

revoke all on public.mentor_model_versions from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.mentor_intelligence_sources, public.mentor_evidence, public.mentor_exam_intelligence, public.mentor_learning_intelligence from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.mentor_personalization_rules, public.mentor_personalization_eligibility, public.mentor_recommendation_explanations from anon, authenticated;

insert into public.app_settings (key, value, is_public)
values (
  'mentor.foundation',
  '{"phase":1,"status":"foundation_ready","personalization":"metric_specific_gating","rankings":"not_started","academic_catalog":"reuse_phase3","attempt_truth":"reuse_phase8"}'::jsonb,
  false
)
on conflict (key) do update set value = excluded.value, is_public = false, updated_at = now();
