-- ICAI Sync Optimisation Phase 3: per-item isolation, controls, exclusions and audit.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS icai_sync_items (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES icai_sync_runs(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES icai_sources(id) ON DELETE CASCADE,
  item_url TEXT NOT NULL,
  item_type TEXT NOT NULL,
  item_title TEXT,
  status TEXT NOT NULL CHECK(status IN ('pending','running','succeeded','failed','timed_out','skipped')),
  stage TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  http_status INTEGER,
  started_at TEXT,
  completed_at TEXT,
  duration_ms INTEGER,
  bytes_fetched INTEGER NOT NULL DEFAULT 0,
  parsed_count INTEGER NOT NULL DEFAULT 0,
  failure_category TEXT,
  failure_message TEXT,
  skip_reason TEXT,
  retry_eligible INTEGER NOT NULL DEFAULT 0 CHECK(retry_eligible IN (0,1)),
  admin_note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(run_id, source_id, item_url)
);

CREATE INDEX IF NOT EXISTS icai_sync_items_run_status_idx
ON icai_sync_items(run_id, status, source_id);

CREATE INDEX IF NOT EXISTS icai_sync_items_retry_idx
ON icai_sync_items(run_id, retry_eligible, failure_category, status);

CREATE INDEX IF NOT EXISTS icai_sync_items_source_url_idx
ON icai_sync_items(source_id, item_url, created_at DESC);

CREATE TABLE IF NOT EXISTS icai_sync_item_controls (
  run_id TEXT PRIMARY KEY REFERENCES icai_sync_runs(id) ON DELETE CASCADE,
  skip_item_requested INTEGER NOT NULL DEFAULT 0 CHECK(skip_item_requested IN (0,1)),
  skip_remaining_requested INTEGER NOT NULL DEFAULT 0 CHECK(skip_remaining_requested IN (0,1)),
  requested_by TEXT REFERENCES app_users(user_id) ON DELETE SET NULL,
  reason TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS icai_sync_item_exclusions (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES icai_sources(id) ON DELETE CASCADE,
  run_id TEXT REFERENCES icai_sync_runs(id) ON DELETE CASCADE,
  item_url TEXT NOT NULL,
  scope TEXT NOT NULL CHECK(scope IN ('run','temporary','permanent')),
  reason TEXT NOT NULL,
  expires_at TEXT,
  created_by TEXT REFERENCES app_users(user_id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TEXT,
  revoked_by TEXT REFERENCES app_users(user_id) ON DELETE SET NULL,
  CHECK(
    (scope='run' AND run_id IS NOT NULL) OR
    (scope='temporary' AND expires_at IS NOT NULL) OR
    scope='permanent'
  )
);

CREATE INDEX IF NOT EXISTS icai_sync_item_exclusions_lookup_idx
ON icai_sync_item_exclusions(source_id, item_url, scope, expires_at, revoked_at);

CREATE TABLE IF NOT EXISTS icai_source_controls (
  source_id TEXT PRIMARY KEY REFERENCES icai_sources(id) ON DELETE CASCADE,
  paused_until TEXT,
  pause_reason TEXT,
  updated_by TEXT REFERENCES app_users(user_id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS icai_source_controls_pause_idx
ON icai_source_controls(paused_until, source_id);

CREATE TABLE IF NOT EXISTS icai_sync_control_audit (
  id TEXT PRIMARY KEY,
  run_id TEXT REFERENCES icai_sync_runs(id) ON DELETE SET NULL,
  source_id TEXT REFERENCES icai_sources(id) ON DELETE SET NULL,
  item_id TEXT REFERENCES icai_sync_items(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  reason TEXT,
  actor_user_id TEXT REFERENCES app_users(user_id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS icai_sync_control_audit_run_idx
ON icai_sync_control_audit(run_id, created_at DESC);

INSERT OR IGNORE INTO _ca_schema_migrations(version, description, source_freeze_commit)
VALUES ('0027', 'ICAI sync per-item isolation retry exclusions source pause and control audit', 'phase-12-operations-admin-platform');
