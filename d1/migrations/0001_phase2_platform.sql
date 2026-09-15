-- CA Progress V2 — Cloudflare migration Phase 2
-- D1/SQLite logical schema, part 1: identity, academics, progress, planner,
-- study, resources, community, ICAI and application settings.
-- This migration is NOT wired to the production application in Phase 2.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS _ca_schema_migrations (
  version TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  source_freeze_commit TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Supabase auth.users is external to the old public schema. D1 keeps an explicit,
-- stable application identity map. Imported user_id values MUST be preserved.
CREATE TABLE IF NOT EXISTS app_users (
  user_id TEXT PRIMARY KEY,
  auth_provider TEXT NOT NULL DEFAULT 'supabase-auth',
  provider_subject TEXT,
  account_state TEXT NOT NULL DEFAULT 'active' CHECK (account_state IN ('active','disabled','deleted')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(auth_provider, provider_subject)
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '{}',
  is_public INTEGER NOT NULL DEFAULT 0 CHECK (is_public IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (json_valid(value))
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY REFERENCES app_users(user_id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  ca_level TEXT,
  group_choice TEXT,
  attempt_key TEXT,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  daily_target_minutes INTEGER,
  onboarding_step INTEGER NOT NULL DEFAULT 0,
  onboarding_completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT PRIMARY KEY REFERENCES app_users(user_id) ON DELETE CASCADE,
  theme TEXT NOT NULL DEFAULT 'system',
  accent TEXT NOT NULL DEFAULT 'pink',
  density TEXT NOT NULL DEFAULT 'comfortable',
  reduce_motion INTEGER NOT NULL DEFAULT 0 CHECK (reduce_motion IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Academic engine. IDs are imported source IDs; titles are mutable presentation data.
CREATE TABLE IF NOT EXISTS course_levels (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS course_groups (
  id TEXT PRIMARY KEY,
  level_id TEXT NOT NULL REFERENCES course_levels(id) ON DELETE RESTRICT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0,1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(level_id, code)
);
CREATE TABLE IF NOT EXISTS subjects (
  id TEXT PRIMARY KEY,
  level_id TEXT NOT NULL REFERENCES course_levels(id) ON DELETE RESTRICT,
  group_id TEXT NOT NULL REFERENCES course_groups(id) ON DELETE RESTRICT,
  code TEXT NOT NULL,
  paper_label TEXT NOT NULL,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  subject_kind TEXT NOT NULL,
  source_url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(group_id, code), UNIQUE(level_id, slug)
);
CREATE TABLE IF NOT EXISTS syllabus_versions (
  id TEXT PRIMARY KEY,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
  version_key TEXT NOT NULL,
  title TEXT NOT NULL,
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  status TEXT NOT NULL,
  source_label TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_verified_at TEXT NOT NULL,
  verification_method TEXT NOT NULL,
  content_hash TEXT,
  supersedes_version_id TEXT REFERENCES syllabus_versions(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(subject_id, version_key)
);
CREATE TABLE IF NOT EXISTS exam_attempts (
  id TEXT PRIMARY KEY,
  level_id TEXT NOT NULL REFERENCES course_levels(id) ON DELETE RESTRICT,
  attempt_key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  start_date TEXT,
  end_date TEXT,
  status TEXT NOT NULL,
  source_id TEXT,
  source_snapshot_id TEXT,
  source_url TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  verification_status TEXT NOT NULL,
  verification_method TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  last_changed_at TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (json_valid(metadata))
);
CREATE TABLE IF NOT EXISTS chapters (
  id TEXT PRIMARY KEY,
  syllabus_version_id TEXT NOT NULL REFERENCES syllabus_versions(id) ON DELETE RESTRICT,
  stable_key TEXT NOT NULL,
  chapter_number TEXT NOT NULL,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  chapter_kind TEXT NOT NULL,
  section_key TEXT,
  source_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(syllabus_version_id, stable_key), UNIQUE(syllabus_version_id, slug)
);
CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE RESTRICT,
  stable_key TEXT NOT NULL,
  title TEXT NOT NULL,
  topic_kind TEXT NOT NULL,
  unit_number TEXT,
  source_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(chapter_id, stable_key)
);
CREATE TABLE IF NOT EXISTS attempt_syllabus_map (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attempt_key TEXT NOT NULL REFERENCES exam_attempts(attempt_key) ON DELETE CASCADE,
  level_id TEXT NOT NULL REFERENCES course_levels(id) ON DELETE RESTRICT,
  group_id TEXT NOT NULL REFERENCES course_groups(id) ON DELETE RESTRICT,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
  syllabus_version_id TEXT NOT NULL REFERENCES syllabus_versions(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(attempt_key, subject_id)
);
CREATE TABLE IF NOT EXISTS academic_change_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  summary TEXT NOT NULL,
  source_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Progress history. Existing chapter IDs and event IDs remain untouched on import.
CREATE TABLE IF NOT EXISTS chapter_progress (
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE RESTRICT,
  completed_at TEXT,
  revision_1_at TEXT,
  revision_2_at TEXT,
  test_1_at TEXT,
  test_2_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id, chapter_id)
);
CREATE TABLE IF NOT EXISTS progress_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE RESTRICT,
  action TEXT NOT NULL,
  stage TEXT NOT NULL,
  previous_state TEXT NOT NULL DEFAULT '{}',
  new_state TEXT NOT NULL DEFAULT '{}',
  reverts_event_id TEXT REFERENCES progress_events(id) ON DELETE SET NULL,
  undone_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (json_valid(previous_state)), CHECK (json_valid(new_state))
);

-- Planner / Today Plan / revision / goals / calendar.
CREATE TABLE IF NOT EXISTS planner_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (json_valid(payload))
);
CREATE TABLE IF NOT EXISTS daily_plans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  attempt_key TEXT NOT NULL,
  plan_date TEXT NOT NULL,
  timezone TEXT NOT NULL,
  target_minutes INTEGER NOT NULL,
  generated_at TEXT NOT NULL,
  generation_reason TEXT NOT NULL,
  generation_version TEXT NOT NULL,
  source_event_id TEXT REFERENCES planner_events(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, plan_date)
);
CREATE TABLE IF NOT EXISTS daily_plan_items (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES daily_plans(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  scheduled_for TEXT NOT NULL,
  scheduled_at TEXT,
  position INTEGER NOT NULL,
  item_kind TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT,
  source_key TEXT NOT NULL,
  subject_id TEXT REFERENCES subjects(id) ON DELETE RESTRICT,
  chapter_id TEXT REFERENCES chapters(id) ON DELETE RESTRICT,
  revision_number INTEGER,
  test_number INTEGER,
  title TEXT NOT NULL,
  manual_note TEXT,
  estimated_minutes INTEGER NOT NULL,
  priority_score REAL NOT NULL DEFAULT 0,
  reason_code TEXT NOT NULL,
  reason_text TEXT NOT NULL,
  status TEXT NOT NULL,
  manual_override INTEGER NOT NULL DEFAULT 0 CHECK (manual_override IN (0,1)),
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(plan_id, source_key)
);
CREATE TABLE IF NOT EXISTS revision_rules (
  user_id TEXT PRIMARY KEY REFERENCES app_users(user_id) ON DELETE CASCADE,
  interval_days TEXT NOT NULL DEFAULT '[]',
  preferred_weekdays TEXT NOT NULL DEFAULT '[]',
  revision_minutes INTEGER NOT NULL,
  new_chapter_minutes INTEGER NOT NULL,
  test_minutes INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (json_valid(interval_days)), CHECK (json_valid(preferred_weekdays))
);
CREATE TABLE IF NOT EXISTS revision_due_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE RESTRICT,
  revision_number INTEGER NOT NULL,
  source_completed_at TEXT NOT NULL,
  due_at TEXT NOT NULL,
  manual_due_at TEXT,
  status TEXT NOT NULL,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, chapter_id, revision_number)
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
  chapter_id TEXT REFERENCES chapters(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  notes TEXT,
  task_kind TEXT NOT NULL,
  due_at TEXT NOT NULL,
  estimated_minutes INTEGER NOT NULL,
  status TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  due_date TEXT NOT NULL,
  status TEXT NOT NULL,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS user_calendar_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  notes TEXT,
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  all_day INTEGER NOT NULL DEFAULT 0 CHECK (all_day IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS dashboard_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  action_key TEXT,
  context TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (json_valid(context))
);
CREATE TABLE IF NOT EXISTS forecast_snapshots (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  attempt_key TEXT NOT NULL,
  total_chapters INTEGER NOT NULL,
  completed_chapters INTEGER NOT NULL,
  remaining_chapters INTEGER NOT NULL,
  observed_chapters_per_week REAL NOT NULL,
  required_chapters_per_week REAL NOT NULL,
  target_completion_date TEXT,
  projected_completion_date TEXT,
  attempt_anchor_date TEXT,
  date_source TEXT NOT NULL,
  status TEXT NOT NULL,
  explanation TEXT NOT NULL,
  source_event_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Study sessions and timer state.
CREATE TABLE IF NOT EXISTS study_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
  chapter_id TEXT REFERENCES chapters(id) ON DELETE SET NULL,
  mode TEXT NOT NULL,
  timezone TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL,
  focus_target_seconds INTEGER,
  break_target_seconds INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS study_timer_state (
  user_id TEXT PRIMARY KEY REFERENCES app_users(user_id) ON DELETE CASCADE,
  subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
  chapter_id TEXT REFERENCES chapters(id) ON DELETE SET NULL,
  mode TEXT NOT NULL,
  timezone TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  running_since TEXT,
  paused_at TEXT,
  elapsed_seconds INTEGER NOT NULL DEFAULT 0,
  focus_target_seconds INTEGER,
  break_target_seconds INTEGER,
  last_interaction_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Notes and R2 resource metadata. Bytes remain in R2; D1 stores metadata only.
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  owner_label TEXT NOT NULL,
  title TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT NOT NULL,
  subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
  chapter_id TEXT REFERENCES chapters(id) ON DELETE SET NULL,
  visibility TEXT NOT NULL,
  moderation_status TEXT NOT NULL,
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS note_tags (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, normalized_name)
);
CREATE TABLE IF NOT EXISTS note_tag_map (
  note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES note_tags(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(note_id, tag_id)
);
CREATE TABLE IF NOT EXISTS uploaded_resources (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  owner_label TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
  chapter_id TEXT REFERENCES chapters(id) ON DELETE SET NULL,
  original_filename TEXT NOT NULL,
  safe_filename TEXT NOT NULL,
  storage_bucket TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  extension TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  visibility TEXT NOT NULL,
  moderation_status TEXT NOT NULL,
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(storage_bucket, storage_path)
);
CREATE TABLE IF NOT EXISTS resource_subject_map (
  resource_id TEXT NOT NULL REFERENCES uploaded_resources(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(resource_id, subject_id)
);
CREATE TABLE IF NOT EXISTS resource_attempt_map (
  resource_id TEXT NOT NULL REFERENCES uploaded_resources(id) ON DELETE CASCADE,
  attempt_id TEXT NOT NULL REFERENCES exam_attempts(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(resource_id, attempt_id)
);
CREATE TABLE IF NOT EXISTS resource_reports (
  id TEXT PRIMARY KEY,
  reporter_user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  note_id TEXT REFERENCES notes(id) ON DELETE CASCADE,
  uploaded_resource_id TEXT REFERENCES uploaded_resources(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL,
  reviewed_by TEXT REFERENCES app_users(user_id) ON DELETE SET NULL,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS resource_moderation (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES app_users(user_id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL,
  note_id TEXT REFERENCES notes(id) ON DELETE CASCADE,
  uploaded_resource_id TEXT REFERENCES uploaded_resources(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Community. Realtime transport remains Supabase in Phase 2; D1 models persistence only.
CREATE TABLE IF NOT EXISTS community_channels (
  id TEXT PRIMARY KEY,
  channel_key TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  scope_type TEXT NOT NULL,
  channel_kind TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  level_id TEXT REFERENCES course_levels(id) ON DELETE CASCADE,
  subject_id TEXT REFERENCES subjects(id) ON DELETE CASCADE,
  write_policy TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS community_messages (
  id TEXT PRIMARY KEY,
  sequence_id INTEGER NOT NULL,
  channel_id TEXT NOT NULL REFERENCES community_channels(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  author_label TEXT NOT NULL,
  body TEXT NOT NULL,
  reply_to_message_id TEXT REFERENCES community_messages(id) ON DELETE SET NULL,
  attached_resource_id TEXT REFERENCES uploaded_resources(id) ON DELETE SET NULL,
  moderation_status TEXT NOT NULL,
  edited_at TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(channel_id, sequence_id)
);
CREATE TABLE IF NOT EXISTS community_message_mentions (
  message_id TEXT NOT NULL REFERENCES community_messages(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(message_id, user_id)
);
CREATE TABLE IF NOT EXISTS message_reactions (
  message_id TEXT NOT NULL REFERENCES community_messages(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL REFERENCES community_channels(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(message_id, user_id, emoji)
);
CREATE TABLE IF NOT EXISTS pinned_messages (
  channel_id TEXT NOT NULL REFERENCES community_channels(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL REFERENCES community_messages(id) ON DELETE CASCADE,
  pinned_by TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE RESTRICT,
  pinned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(channel_id, message_id)
);
CREATE TABLE IF NOT EXISTS channel_read_state (
  channel_id TEXT NOT NULL REFERENCES community_channels(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  last_read_sequence INTEGER NOT NULL DEFAULT 0,
  last_read_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(channel_id, user_id)
);
CREATE TABLE IF NOT EXISTS community_notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL REFERENCES community_channels(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL REFERENCES community_messages(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS message_reports (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES community_messages(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL REFERENCES community_channels(id) ON DELETE CASCADE,
  reporter_user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL,
  reviewed_by TEXT REFERENCES app_users(user_id) ON DELETE SET NULL,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS chat_blocks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  channel_id TEXT REFERENCES community_channels(id) ON DELETE CASCADE,
  blocked_by TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE RESTRICT,
  reason TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS moderation_actions (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE RESTRICT,
  actor_role TEXT NOT NULL,
  action_type TEXT NOT NULL,
  target_user_id TEXT REFERENCES app_users(user_id) ON DELETE SET NULL,
  channel_id TEXT REFERENCES community_channels(id) ON DELETE SET NULL,
  message_id TEXT REFERENCES community_messages(id) ON DELETE SET NULL,
  report_id TEXT REFERENCES message_reports(id) ON DELETE SET NULL,
  reason TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (json_valid(metadata))
);

-- ICAI source-of-truth and sync metadata. Sync remains an internal Worker service.
CREATE TABLE IF NOT EXISTS icai_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  official_url TEXT NOT NULL,
  source_type TEXT NOT NULL,
  trust_level TEXT NOT NULL,
  adapter_key TEXT NOT NULL,
  adapter_config TEXT NOT NULL DEFAULT '{}',
  parser_version TEXT NOT NULL,
  authoritative_listing INTEGER NOT NULL DEFAULT 0 CHECK (authoritative_listing IN (0,1)),
  resource_types TEXT NOT NULL DEFAULT '[]',
  level_codes TEXT NOT NULL DEFAULT '[]',
  request_interval_seconds INTEGER NOT NULL,
  timeout_ms INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  etag TEXT,
  last_modified TEXT,
  last_content_hash TEXT,
  last_attempt_at TEXT,
  last_success_at TEXT,
  last_error_at TEXT,
  last_error TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (json_valid(adapter_config)), CHECK (json_valid(resource_types)), CHECK (json_valid(level_codes))
);
CREATE TABLE IF NOT EXISTS icai_sync_runs (
  id TEXT PRIMARY KEY,
  trigger_type TEXT NOT NULL,
  requested_by TEXT REFERENCES app_users(user_id) ON DELETE SET NULL,
  parser_version TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  source_total INTEGER NOT NULL DEFAULT 0,
  source_processed INTEGER NOT NULL DEFAULT 0,
  source_succeeded INTEGER NOT NULL DEFAULT 0,
  source_failed INTEGER NOT NULL DEFAULT 0,
  new_items INTEGER NOT NULL DEFAULT 0,
  changed_items INTEGER NOT NULL DEFAULT 0,
  unchanged_items INTEGER NOT NULL DEFAULT 0,
  removed_items INTEGER NOT NULL DEFAULT 0,
  pending_reviews INTEGER NOT NULL DEFAULT 0,
  error_summary TEXT,
  details TEXT NOT NULL DEFAULT '{}',
  CHECK (json_valid(details))
);
CREATE TABLE IF NOT EXISTS icai_source_snapshots (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES icai_sync_runs(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES icai_sources(id) ON DELETE CASCADE,
  fetched_at TEXT NOT NULL,
  http_status INTEGER NOT NULL,
  canonical_hash TEXT NOT NULL,
  is_changed INTEGER NOT NULL CHECK (is_changed IN (0,1)),
  parser_version TEXT NOT NULL,
  parsed_item_count INTEGER NOT NULL DEFAULT 0,
  etag TEXT,
  last_modified TEXT,
  content_length INTEGER,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (json_valid(metadata))
);
CREATE TABLE IF NOT EXISTS icai_resources (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES icai_sources(id) ON DELETE RESTRICT,
  source_snapshot_id TEXT REFERENCES icai_source_snapshots(id) ON DELETE SET NULL,
  resource_type TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  official_url TEXT NOT NULL,
  source_url TEXT,
  published_on TEXT,
  status TEXT NOT NULL,
  verification_status TEXT NOT NULL,
  parser_version TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  last_changed_at TEXT NOT NULL,
  replaced_by_resource_id TEXT REFERENCES icai_resources(id) ON DELETE SET NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (json_valid(metadata))
);
CREATE TABLE IF NOT EXISTS exam_events (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES icai_sources(id) ON DELETE RESTRICT,
  source_snapshot_id TEXT REFERENCES icai_source_snapshots(id) ON DELETE SET NULL,
  attempt_id TEXT NOT NULL REFERENCES exam_attempts(id) ON DELETE RESTRICT,
  subject_id TEXT REFERENCES subjects(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  event_date TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  source_url TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  verification_status TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  last_changed_at TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (json_valid(metadata))
);
CREATE TABLE IF NOT EXISTS icai_change_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES icai_sync_runs(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES icai_sources(id) ON DELETE RESTRICT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  change_type TEXT NOT NULL,
  field_name TEXT,
  old_value TEXT,
  new_value TEXT,
  risk_level TEXT NOT NULL,
  decision_status TEXT NOT NULL,
  review_notes TEXT,
  reviewed_by TEXT REFERENCES app_users(user_id) ON DELETE SET NULL,
  detected_at TEXT NOT NULL,
  applied_at TEXT,
  CHECK (old_value IS NULL OR json_valid(old_value)), CHECK (new_value IS NULL OR json_valid(new_value))
);
CREATE TABLE IF NOT EXISTS icai_review_queue (
  id TEXT PRIMARY KEY,
  change_event_id INTEGER NOT NULL REFERENCES icai_change_events(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL REFERENCES icai_sync_runs(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES icai_sources(id) ON DELETE RESTRICT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  title TEXT NOT NULL,
  reason TEXT NOT NULL,
  proposed_patch TEXT NOT NULL DEFAULT '{}',
  confidence REAL NOT NULL,
  status TEXT NOT NULL,
  reviewed_by TEXT REFERENCES app_users(user_id) ON DELETE SET NULL,
  reviewed_at TEXT,
  decision_notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (json_valid(proposed_patch))
);
CREATE TABLE IF NOT EXISTS system_health_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  component TEXT NOT NULL,
  status TEXT NOT NULL,
  correlation_id TEXT,
  details TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (json_valid(details))
);

INSERT OR IGNORE INTO _ca_schema_migrations(version, description, source_freeze_commit)
VALUES ('0001', 'identity academics progress planner study resources community icai', 'a319690718454caa11edebdf4b32a5730071a02d');
