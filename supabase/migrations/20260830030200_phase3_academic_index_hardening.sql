-- Phase 3 performance hardening for normalized academic foreign keys.
create index if not exists attempt_syllabus_level_idx on public.attempt_syllabus_map(level_id);
create index if not exists attempt_syllabus_group_idx on public.attempt_syllabus_map(group_id);
create index if not exists attempt_syllabus_subject_idx on public.attempt_syllabus_map(subject_id);
create index if not exists attempt_syllabus_subject_version_idx on public.attempt_syllabus_map(subject_id, syllabus_version_id);
create index if not exists syllabus_versions_supersedes_idx on public.syllabus_versions(supersedes_version_id) where supersedes_version_id is not null;
