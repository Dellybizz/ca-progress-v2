-- CA Progress V2 — Cloudflare migration Phase 2
-- D1/SQLite logical schema, part 2: subscriptions/billing, Mentor Phase 1,
-- canonical Academic Catalog Phase 2, lineage, and query-critical indexes.
-- Production continues to use Supabase in this phase.
PRAGMA foreign_keys = ON;

-- Billing / subscriptions. All payment mutation remains service-only.
CREATE TABLE IF NOT EXISTS subscription_plans (
  id TEXT PRIMARY KEY,
  tier_key TEXT NOT NULL CHECK (tier_key IN ('free','basic','pro')),
  billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('free','monthly','annual')),
  name TEXT NOT NULL,
  tagline TEXT NOT NULL DEFAULT '',
  rank INTEGER NOT NULL CHECK (rank >= 0),
  price_subunits INTEGER CHECK (price_subunits IS NULL OR price_subunits >= 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  duration_value INTEGER NOT NULL CHECK (duration_value >= 0),
  duration_unit TEXT NOT NULL CHECK (duration_unit IN ('day','week','month','year','lifetime')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  checkout_enabled INTEGER NOT NULL DEFAULT 0 CHECK (checkout_enabled IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 100,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tier_key,billing_cycle),
  CHECK (json_valid(metadata))
);
CREATE TABLE IF NOT EXISTS plan_entitlements (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  limit_value REAL,
  limit_unit TEXT NOT NULL DEFAULT 'unlimited' CHECK (limit_unit IN ('unlimited','count','minutes','megabytes')),
  reset_period TEXT NOT NULL DEFAULT 'never' CHECK (reset_period IN ('never','daily','weekly','monthly')),
  upgrade_message TEXT NOT NULL DEFAULT 'Upgrade your plan to use this feature.',
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(plan_id,feature_key),
  CHECK (json_valid(metadata))
);
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled','expired','paused')),
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  source TEXT NOT NULL DEFAULT 'razorpay' CHECK (source IN ('razorpay','manual','migration')),
  source_order_id TEXT,
  source_payment_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source,source_order_id)
);
CREATE TABLE IF NOT EXISTS payment_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
  provider TEXT NOT NULL DEFAULT 'razorpay' CHECK (provider='razorpay'),
  provider_order_id TEXT NOT NULL UNIQUE,
  provider_payment_id TEXT,
  receipt TEXT NOT NULL UNIQUE,
  amount_subunits INTEGER NOT NULL CHECK (amount_subunits > 0),
  currency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created','attempted','paid','failed','refunded')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS payment_events (
  id TEXT PRIMARY KEY,
  payment_order_id TEXT NOT NULL REFERENCES payment_orders(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'razorpay' CHECK (provider='razorpay'),
  source TEXT NOT NULL CHECK (source IN ('verify','webhook')),
  event_type TEXT NOT NULL,
  provider_event_key TEXT NOT NULL,
  provider_order_id TEXT NOT NULL,
  provider_payment_id TEXT,
  provider_status TEXT NOT NULL,
  amount_subunits INTEGER,
  currency TEXT,
  verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0,1)),
  payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider,provider_event_key),
  CHECK (json_valid(payload))
);
CREATE TABLE IF NOT EXISTS subscription_events (
  id TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL REFERENCES user_subscriptions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
  payment_event_id TEXT REFERENCES payment_events(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('granted','extended','expired','cancelled','paused','resumed')),
  source TEXT NOT NULL DEFAULT 'payment',
  starts_at TEXT,
  ends_at TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(payment_event_id,event_type),
  CHECK (json_valid(metadata))
);

-- CA Mentor Phase 1. New IDs are Worker-generated; imported IDs are preserved.
CREATE TABLE IF NOT EXISTS mentor_model_versions (
  id TEXT PRIMARY KEY,
  model_key TEXT NOT NULL,
  version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','retired')),
  config TEXT NOT NULL DEFAULT '{}',
  public_metadata TEXT NOT NULL DEFAULT '{}',
  created_by TEXT REFERENCES app_users(user_id) ON DELETE SET NULL,
  activated_at TEXT,
  retired_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(model_key,version), CHECK(json_valid(config)), CHECK(json_valid(public_metadata))
);
CREATE TABLE IF NOT EXISTS mentor_intelligence_sources (
  id TEXT PRIMARY KEY,
  source_kind TEXT NOT NULL,
  title TEXT NOT NULL,
  source_url TEXT,
  authority_tier TEXT NOT NULL DEFAULT 'untrusted',
  authority_weight REAL NOT NULL DEFAULT 0 CHECK (authority_weight BETWEEN 0 AND 1),
  verification_tier TEXT NOT NULL DEFAULT 'unverified',
  verification_status TEXT NOT NULL DEFAULT 'pending',
  ingestion_status TEXT NOT NULL DEFAULT 'registered',
  attempt_id TEXT REFERENCES exam_attempts(id) ON DELETE RESTRICT,
  level_id TEXT REFERENCES course_levels(id) ON DELETE RESTRICT,
  group_id TEXT REFERENCES course_groups(id) ON DELETE RESTRICT,
  subject_id TEXT REFERENCES subjects(id) ON DELETE RESTRICT,
  syllabus_version_id TEXT REFERENCES syllabus_versions(id) ON DELETE RESTRICT,
  chapter_id TEXT REFERENCES chapters(id) ON DELETE RESTRICT,
  topic_id TEXT REFERENCES topics(id) ON DELETE RESTRICT,
  icai_resource_id TEXT REFERENCES icai_resources(id) ON DELETE RESTRICT,
  contributor_user_id TEXT REFERENCES app_users(user_id) ON DELETE SET NULL,
  published_on TEXT,
  attempt_relevance REAL NOT NULL DEFAULT 0 CHECK (attempt_relevance BETWEEN 0 AND 1),
  mapping_confidence REAL NOT NULL DEFAULT 0 CHECK (mapping_confidence BETWEEN 0 AND 1),
  evidence_quality REAL NOT NULL DEFAULT 0 CHECK (evidence_quality BETWEEN 0 AND 1),
  processing_version TEXT NOT NULL DEFAULT 'mentor-phase1',
  metadata TEXT NOT NULL DEFAULT '{}',
  visibility TEXT NOT NULL DEFAULT 'internal' CHECK (visibility IN ('internal','published')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(json_valid(metadata)), CHECK (visibility='internal' OR contributor_user_id IS NULL)
);
CREATE TABLE IF NOT EXISTS mentor_evidence (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES mentor_intelligence_sources(id) ON DELETE RESTRICT,
  attempt_id TEXT REFERENCES exam_attempts(id) ON DELETE RESTRICT,
  subject_id TEXT REFERENCES subjects(id) ON DELETE RESTRICT,
  syllabus_version_id TEXT REFERENCES syllabus_versions(id) ON DELETE RESTRICT,
  chapter_id TEXT REFERENCES chapters(id) ON DELETE RESTRICT,
  topic_id TEXT REFERENCES topics(id) ON DELETE RESTRICT,
  evidence_kind TEXT NOT NULL,
  normalized_value REAL,
  normalized_unit TEXT,
  evidence_text TEXT,
  source_authority_tier TEXT NOT NULL,
  confidence_level TEXT NOT NULL DEFAULT 'insufficient',
  confidence_score REAL NOT NULL DEFAULT 0 CHECK(confidence_score BETWEEN 0 AND 1),
  mapping_confidence REAL NOT NULL DEFAULT 0 CHECK(mapping_confidence BETWEEN 0 AND 1),
  evidence_quality_score REAL NOT NULL DEFAULT 0 CHECK(evidence_quality_score BETWEEN 0 AND 1),
  sample_size INTEGER NOT NULL DEFAULT 0 CHECK(sample_size >= 0),
  extraction_status TEXT NOT NULL DEFAULT 'pending',
  contributor_user_id TEXT REFERENCES app_users(user_id) ON DELETE SET NULL,
  raw_payload TEXT NOT NULL DEFAULT '{}',
  metadata TEXT NOT NULL DEFAULT '{}',
  visibility TEXT NOT NULL DEFAULT 'internal' CHECK (visibility IN ('internal','published')),
  observed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(json_valid(raw_payload)), CHECK(json_valid(metadata)), CHECK (visibility='internal' OR contributor_user_id IS NULL)
);
CREATE TABLE IF NOT EXISTS mentor_exam_intelligence (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES exam_attempts(id) ON DELETE RESTRICT,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
  syllabus_version_id TEXT REFERENCES syllabus_versions(id) ON DELETE RESTRICT,
  chapter_id TEXT REFERENCES chapters(id) ON DELETE RESTRICT,
  topic_id TEXT REFERENCES topics(id) ON DELETE RESTRICT,
  scope_kind TEXT NOT NULL CHECK(scope_kind IN ('subject','chapter','topic')),
  model_version_id TEXT NOT NULL REFERENCES mentor_model_versions(id) ON DELETE RESTRICT,
  exam_importance_score REAL NOT NULL CHECK(exam_importance_score BETWEEN 0 AND 100),
  confidence_level TEXT NOT NULL,
  confidence_score REAL NOT NULL DEFAULT 0 CHECK(confidence_score BETWEEN 0 AND 1),
  evidence_summary TEXT NOT NULL DEFAULT '{}',
  explanation TEXT,
  is_published INTEGER NOT NULL DEFAULT 0 CHECK(is_published IN (0,1)),
  calculated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(json_valid(evidence_summary))
);
CREATE TABLE IF NOT EXISTS mentor_learning_intelligence (
  id TEXT PRIMARY KEY,
  attempt_id TEXT REFERENCES exam_attempts(id) ON DELETE RESTRICT,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
  syllabus_version_id TEXT REFERENCES syllabus_versions(id) ON DELETE RESTRICT,
  chapter_id TEXT REFERENCES chapters(id) ON DELETE RESTRICT,
  topic_id TEXT REFERENCES topics(id) ON DELETE RESTRICT,
  scope_kind TEXT NOT NULL CHECK(scope_kind IN ('subject','chapter','topic')),
  model_version_id TEXT NOT NULL REFERENCES mentor_model_versions(id) ON DELETE RESTRICT,
  baseline_metrics TEXT NOT NULL DEFAULT '{}',
  confidence_level TEXT NOT NULL,
  confidence_score REAL NOT NULL DEFAULT 0 CHECK(confidence_score BETWEEN 0 AND 1),
  evidence_summary TEXT NOT NULL DEFAULT '{}',
  explanation TEXT,
  is_published INTEGER NOT NULL DEFAULT 0 CHECK(is_published IN (0,1)),
  calculated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(json_valid(baseline_metrics)), CHECK(json_valid(evidence_summary))
);
CREATE TABLE IF NOT EXISTS mentor_personalization_rules (
  metric_key TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  is_enabled INTEGER NOT NULL DEFAULT 1 CHECK(is_enabled IN (0,1)),
  minimum_observation_days INTEGER NOT NULL DEFAULT 0,
  minimum_study_minutes INTEGER NOT NULL DEFAULT 0,
  minimum_timed_sessions INTEGER NOT NULL DEFAULT 0,
  minimum_completed_chapters INTEGER NOT NULL DEFAULT 0,
  minimum_revision_events INTEGER NOT NULL DEFAULT 0,
  minimum_tests INTEGER NOT NULL DEFAULT 0,
  minimum_distinct_subjects INTEGER NOT NULL DEFAULT 0,
  minimum_cohort_sample_size INTEGER NOT NULL DEFAULT 0,
  requirements TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(json_valid(requirements))
);
CREATE TABLE IF NOT EXISTS mentor_personalization_eligibility (
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  metric_key TEXT NOT NULL REFERENCES mentor_personalization_rules(metric_key) ON DELETE RESTRICT,
  state TEXT NOT NULL DEFAULT 'unavailable',
  confidence_level TEXT NOT NULL DEFAULT 'insufficient',
  observed_from TEXT,
  observation_days INTEGER NOT NULL DEFAULT 0,
  study_minutes INTEGER NOT NULL DEFAULT 0,
  timed_sessions INTEGER NOT NULL DEFAULT 0,
  completed_chapters INTEGER NOT NULL DEFAULT 0,
  revision_events INTEGER NOT NULL DEFAULT 0,
  tests_completed INTEGER NOT NULL DEFAULT 0,
  distinct_subjects INTEGER NOT NULL DEFAULT 0,
  cohort_sample_size INTEGER NOT NULL DEFAULT 0,
  evidence_summary TEXT NOT NULL DEFAULT '{}',
  evaluated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  eligible_since TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id,metric_key), CHECK(json_valid(evidence_summary))
);
CREATE TABLE IF NOT EXISTS mentor_recommendation_explanations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  metric_key TEXT REFERENCES mentor_personalization_rules(metric_key) ON DELETE RESTRICT,
  provenance TEXT NOT NULL CHECK(provenance IN ('preprocessed','personalized','cohort')),
  attempt_id TEXT REFERENCES exam_attempts(id) ON DELETE RESTRICT,
  subject_id TEXT REFERENCES subjects(id) ON DELETE RESTRICT,
  chapter_id TEXT REFERENCES chapters(id) ON DELETE RESTRICT,
  topic_id TEXT REFERENCES topics(id) ON DELETE RESTRICT,
  action_key TEXT NOT NULL,
  priority_score REAL,
  confidence_level TEXT NOT NULL DEFAULT 'insufficient',
  summary TEXT NOT NULL,
  reasons TEXT NOT NULL DEFAULT '[]',
  evidence_refs TEXT NOT NULL DEFAULT '[]',
  model_version_id TEXT REFERENCES mentor_model_versions(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(json_valid(reasons)), CHECK(json_valid(evidence_refs)), CHECK(provenance='preprocessed' OR metric_key IS NOT NULL)
);

-- CA Mentor Phase 2 canonical academic catalog. canonical_id is DATA, not a
-- generated expression. Imported values are immutable migration invariants.
CREATE TABLE IF NOT EXISTS academic_catalog_nodes (
  canonical_id TEXT PRIMARY KEY,
  node_type TEXT NOT NULL CHECK(node_type IN ('course','group','subject','chapter','unit','accounting_standard','subtopic')),
  official_code TEXT,
  official_number TEXT,
  title TEXT NOT NULL,
  parent_canonical_id TEXT REFERENCES academic_catalog_nodes(canonical_id) ON DELETE RESTRICT,
  level_id TEXT REFERENCES course_levels(id) ON DELETE RESTRICT,
  group_id TEXT REFERENCES course_groups(id) ON DELETE RESTRICT,
  subject_id TEXT REFERENCES subjects(id) ON DELETE RESTRICT,
  current_state TEXT NOT NULL DEFAULT 'current' CHECK(current_state IN ('current','inactive')),
  first_applicable_from TEXT,
  last_applicable_to TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS academic_catalog_version_items (
  id TEXT PRIMARY KEY,
  canonical_id TEXT NOT NULL REFERENCES academic_catalog_nodes(canonical_id) ON DELETE RESTRICT,
  syllabus_version_id TEXT NOT NULL REFERENCES syllabus_versions(id) ON DELETE RESTRICT,
  source_entity_type TEXT NOT NULL CHECK(source_entity_type IN ('chapter','topic')),
  source_entity_id TEXT NOT NULL,
  source_stable_key TEXT NOT NULL,
  display_title TEXT NOT NULL,
  display_number TEXT,
  applicability_from TEXT,
  applicability_to TEXT,
  is_current INTEGER NOT NULL DEFAULT 0 CHECK(is_current IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(syllabus_version_id,source_entity_type,source_entity_id),
  UNIQUE(syllabus_version_id,canonical_id,source_entity_type)
);
CREATE TABLE IF NOT EXISTS academic_catalog_aliases (
  id TEXT PRIMARY KEY,
  canonical_id TEXT NOT NULL REFERENCES academic_catalog_nodes(canonical_id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  normalized_alias TEXT NOT NULL,
  alias_kind TEXT NOT NULL CHECK(alias_kind IN ('official_title','official_code','historical_title','stable_key','slug','paper_label','manual')),
  syllabus_version_id TEXT REFERENCES syllabus_versions(id) ON DELETE CASCADE,
  subject_id TEXT REFERENCES subjects(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(canonical_id,normalized_alias,alias_kind,syllabus_version_id)
);
CREATE TABLE IF NOT EXISTS academic_catalog_lineage (
  id TEXT PRIMARY KEY,
  predecessor_canonical_id TEXT NOT NULL REFERENCES academic_catalog_nodes(canonical_id) ON DELETE RESTRICT,
  successor_canonical_id TEXT NOT NULL REFERENCES academic_catalog_nodes(canonical_id) ON DELETE RESTRICT,
  relationship TEXT NOT NULL CHECK(relationship IN ('renamed_to','superseded_by','split_into','merged_into','equivalent_to')),
  effective_from TEXT,
  source_syllabus_version_id TEXT REFERENCES syllabus_versions(id) ON DELETE RESTRICT,
  target_syllabus_version_id TEXT REFERENCES syllabus_versions(id) ON DELETE RESTRICT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(predecessor_canonical_id,successor_canonical_id,relationship,source_syllabus_version_id,target_syllabus_version_id),
  CHECK(predecessor_canonical_id <> successor_canonical_id)
);

-- Major access paths. PostgreSQL GIN/array indexes are intentionally translated
-- to scalar/composite indexes; FTS is a separate future concern, not a security layer.
CREATE INDEX IF NOT EXISTS course_groups_level_idx ON course_groups(level_id,sort_order);
CREATE INDEX IF NOT EXISTS subjects_level_group_idx ON subjects(level_id,group_id,sort_order);
CREATE INDEX IF NOT EXISTS syllabus_subject_effective_idx ON syllabus_versions(subject_id,effective_from,effective_to,status);
CREATE INDEX IF NOT EXISTS attempt_syllabus_lookup_idx ON attempt_syllabus_map(attempt_key,subject_id,syllabus_version_id);
CREATE INDEX IF NOT EXISTS chapters_version_order_idx ON chapters(syllabus_version_id,sort_order);
CREATE INDEX IF NOT EXISTS topics_chapter_order_idx ON topics(chapter_id,sort_order);
CREATE INDEX IF NOT EXISTS progress_user_updated_idx ON chapter_progress(user_id,updated_at);
CREATE INDEX IF NOT EXISTS progress_events_user_created_idx ON progress_events(user_id,created_at);
CREATE INDEX IF NOT EXISTS planner_events_user_created_idx ON planner_events(user_id,created_at);
CREATE INDEX IF NOT EXISTS daily_plans_user_date_idx ON daily_plans(user_id,plan_date);
CREATE INDEX IF NOT EXISTS daily_plan_items_schedule_idx ON daily_plan_items(user_id,scheduled_for,status,position);
CREATE INDEX IF NOT EXISTS revision_due_user_due_idx ON revision_due_items(user_id,status,due_at);
CREATE INDEX IF NOT EXISTS tasks_user_due_idx ON tasks(user_id,status,due_at);
CREATE INDEX IF NOT EXISTS goals_user_due_idx ON goals(user_id,status,due_date);
CREATE INDEX IF NOT EXISTS calendar_user_start_idx ON user_calendar_events(user_id,starts_at);
CREATE INDEX IF NOT EXISTS study_sessions_user_started_idx ON study_sessions(user_id,started_at);
CREATE INDEX IF NOT EXISTS notes_user_updated_idx ON notes(user_id,updated_at);
CREATE INDEX IF NOT EXISTS resources_owner_created_idx ON uploaded_resources(owner_user_id,created_at);
CREATE INDEX IF NOT EXISTS community_messages_channel_sequence_idx ON community_messages(channel_id,sequence_id);
CREATE INDEX IF NOT EXISTS community_messages_user_created_idx ON community_messages(user_id,created_at);
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx ON community_notifications(user_id,read_at,created_at);
CREATE INDEX IF NOT EXISTS reports_status_created_idx ON message_reports(status,created_at);
CREATE INDEX IF NOT EXISTS chat_blocks_user_ends_idx ON chat_blocks(user_id,ends_at);
CREATE INDEX IF NOT EXISTS icai_sources_active_idx ON icai_sources(is_active,last_attempt_at);
CREATE INDEX IF NOT EXISTS icai_snapshots_source_fetched_idx ON icai_source_snapshots(source_id,fetched_at);
CREATE INDEX IF NOT EXISTS icai_resources_source_seen_idx ON icai_resources(source_id,last_seen_at);
CREATE INDEX IF NOT EXISTS icai_review_status_idx ON icai_review_queue(status,created_at);
CREATE INDEX IF NOT EXISTS subscription_plans_active_idx ON subscription_plans(active,tier_key,billing_cycle);
CREATE INDEX IF NOT EXISTS plan_entitlements_feature_idx ON plan_entitlements(feature_key,plan_id);
CREATE INDEX IF NOT EXISTS user_subscriptions_current_idx ON user_subscriptions(user_id,status,starts_at,ends_at);
CREATE INDEX IF NOT EXISTS payment_orders_user_created_idx ON payment_orders(user_id,created_at);
CREATE INDEX IF NOT EXISTS payment_events_user_created_idx ON payment_events(user_id,created_at);
CREATE INDEX IF NOT EXISTS subscription_events_user_created_idx ON subscription_events(user_id,created_at);
CREATE UNIQUE INDEX IF NOT EXISTS mentor_one_active_model_per_key_idx ON mentor_model_versions(model_key) WHERE status='active';
CREATE INDEX IF NOT EXISTS mentor_sources_kind_attempt_idx ON mentor_intelligence_sources(source_kind,attempt_id,verification_status);
CREATE INDEX IF NOT EXISTS mentor_sources_subject_idx ON mentor_intelligence_sources(subject_id,chapter_id,topic_id);
CREATE INDEX IF NOT EXISTS mentor_evidence_scope_idx ON mentor_evidence(attempt_id,subject_id,chapter_id,topic_id);
CREATE UNIQUE INDEX IF NOT EXISTS mentor_exam_scope_version_idx ON mentor_exam_intelligence(attempt_id,subject_id,ifnull(chapter_id,''),ifnull(topic_id,''),model_version_id);
CREATE UNIQUE INDEX IF NOT EXISTS mentor_learning_scope_version_idx ON mentor_learning_intelligence(ifnull(attempt_id,''),subject_id,ifnull(chapter_id,''),ifnull(topic_id,''),model_version_id);
CREATE INDEX IF NOT EXISTS mentor_personalization_state_idx ON mentor_personalization_eligibility(metric_key,state,evaluated_at);
CREATE INDEX IF NOT EXISTS mentor_recommendations_user_idx ON mentor_recommendation_explanations(user_id,created_at);
CREATE INDEX IF NOT EXISTS academic_catalog_parent_idx ON academic_catalog_nodes(parent_canonical_id,node_type);
CREATE INDEX IF NOT EXISTS academic_catalog_subject_idx ON academic_catalog_nodes(subject_id,node_type,current_state);
CREATE INDEX IF NOT EXISTS academic_catalog_version_canonical_idx ON academic_catalog_version_items(canonical_id,syllabus_version_id);
CREATE INDEX IF NOT EXISTS academic_catalog_alias_lookup_idx ON academic_catalog_aliases(normalized_alias,subject_id,syllabus_version_id);
CREATE INDEX IF NOT EXISTS academic_catalog_lineage_predecessor_idx ON academic_catalog_lineage(predecessor_canonical_id,relationship);
CREATE INDEX IF NOT EXISTS academic_catalog_lineage_successor_idx ON academic_catalog_lineage(successor_canonical_id,relationship);

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0002','billing mentor canonical academic catalog and indexes','a319690718454caa11edebdf4b32a5730071a02d');
