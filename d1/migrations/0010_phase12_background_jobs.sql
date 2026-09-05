-- Phase 12 background execution: durable job state for Queues/Workflows.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS background_jobs (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  job_type TEXT NOT NULL CHECK(job_type IN ('icai-sync','notification-fanout','analytics-aggregate','attachment-process','cleanup','ai-plan-generation')),
  payload_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','succeeded','failed','dead_letter')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 5 CHECK(max_attempts BETWEEN 1 AND 20),
  available_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TEXT,
  finished_at TEXT,
  last_error TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS background_jobs_status_idx ON background_jobs(status, available_at, updated_at);
CREATE INDEX IF NOT EXISTS background_jobs_type_status_idx ON background_jobs(job_type, status, updated_at);

CREATE TABLE IF NOT EXISTS background_job_dead_letters (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES background_jobs(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  job_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  attempts INTEGER NOT NULL,
  error TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS background_job_dead_letters_open_idx ON background_job_dead_letters(resolved_at, created_at);

CREATE TABLE IF NOT EXISTS student_plan_snapshots (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  plan_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('ready','stale','failed')),
  plan_json TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  source_job_id TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, plan_date)
);
CREATE INDEX IF NOT EXISTS student_plan_snapshots_user_date_idx ON student_plan_snapshots(user_id, plan_date DESC);

CREATE TABLE IF NOT EXISTS analytics_daily_rollups (
  rollup_date TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(rollup_date, event_type)
);

CREATE TABLE IF NOT EXISTS notification_outbox (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','failed')),
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TEXT,
  last_error TEXT
);
CREATE INDEX IF NOT EXISTS notification_outbox_status_idx ON notification_outbox(status, created_at);

CREATE TABLE IF NOT EXISTS attachment_processing_jobs (
  id TEXT PRIMARY KEY,
  resource_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','ready','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(resource_id)
);
CREATE INDEX IF NOT EXISTS attachment_processing_status_idx ON attachment_processing_jobs(status, updated_at);

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0010','phase 12 durable background jobs, stored plans, rollups, notifications and attachment processing','phase-12-operations-admin-platform');
