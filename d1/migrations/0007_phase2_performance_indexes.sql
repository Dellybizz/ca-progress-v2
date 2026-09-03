-- Phase 2 dashboard performance indexes.
-- All statements are idempotent so this migration is safe to resume.

CREATE INDEX IF NOT EXISTS idx_app_users_user_id ON app_users(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);

CREATE INDEX IF NOT EXISTS idx_course_levels_code_active ON course_levels(code,is_active);
CREATE INDEX IF NOT EXISTS idx_course_groups_level_active_sort ON course_groups(level_id,is_active,sort_order);
CREATE INDEX IF NOT EXISTS idx_subjects_level_active_sort ON subjects(level_id,is_active,sort_order);
CREATE INDEX IF NOT EXISTS idx_attempt_syllabus_level_attempt_group ON attempt_syllabus_map(level_id,attempt_key,group_id);
CREATE INDEX IF NOT EXISTS idx_attempt_syllabus_level_attempt_subject ON attempt_syllabus_map(level_id,attempt_key,subject_id);
CREATE INDEX IF NOT EXISTS idx_chapters_version_sort ON chapters(syllabus_version_id,sort_order);

CREATE INDEX IF NOT EXISTS idx_exam_attempts_level_attempt_verified ON exam_attempts(level_id,attempt_key,verification_status);
CREATE INDEX IF NOT EXISTS idx_exam_events_attempt_verified_date ON exam_events(attempt_id,verification_status,event_date);
CREATE INDEX IF NOT EXISTS idx_icai_resources_verified_status_changed ON icai_resources(verification_status,status,last_changed_at);
CREATE INDEX IF NOT EXISTS idx_resource_attempt_map_attempt_resource ON resource_attempt_map(attempt_id,resource_id);
CREATE INDEX IF NOT EXISTS idx_resource_subject_map_subject_resource ON resource_subject_map(subject_id,resource_id);

CREATE INDEX IF NOT EXISTS idx_chapter_progress_user_chapter ON chapter_progress(user_id,chapter_id);
CREATE INDEX IF NOT EXISTS idx_progress_events_user_chapter_created ON progress_events(user_id,chapter_id,created_at);
CREATE INDEX IF NOT EXISTS idx_study_sessions_user_ended ON study_sessions(user_id,ended_at);
CREATE INDEX IF NOT EXISTS idx_tasks_user_status_due ON tasks(user_id,status,due_at);
