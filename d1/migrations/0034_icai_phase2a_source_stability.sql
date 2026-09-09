-- ICAI Phase 2A: bounded source execution with durable item-level recovery.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS icai_sync_item_skips (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES icai_sources(id) ON DELETE CASCADE,
  item_url TEXT NOT NULL,
  scope TEXT NOT NULL CHECK(scope IN ('temporary','permanent')),
  reason TEXT NOT NULL,
  skipped_until TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  created_by TEXT REFERENCES app_users(user_id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source_id,item_url)
);

CREATE INDEX IF NOT EXISTS icai_sync_item_skips_active_idx
ON icai_sync_item_skips(source_id,is_active,skipped_until);

CREATE TABLE IF NOT EXISTS icai_sync_item_failures (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES icai_sync_runs(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES icai_sources(id) ON DELETE CASCADE,
  item_url TEXT NOT NULL,
  stage TEXT NOT NULL,
  failure_kind TEXT NOT NULL,
  error_message TEXT NOT NULL,
  skipped INTEGER NOT NULL DEFAULT 1 CHECK(skipped IN (0,1)),
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS icai_sync_item_failures_run_source_idx
ON icai_sync_item_failures(run_id,source_id,occurred_at DESC);

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0034','icai phase2a bounded source and item recovery','phase-12-operations-admin-platform');
