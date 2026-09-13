-- ICAI Phase 3E/3F: durable nested-item lifecycle and targeted recovery.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS icai_sync_items (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES icai_sync_runs(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES icai_sources(id) ON DELETE CASCADE,
  item_url TEXT NOT NULL,
  item_type TEXT NOT NULL DEFAULT 'nested_page',
  item_title TEXT,
  status TEXT NOT NULL CHECK(status IN ('running','succeeded','failed','timed_out','skipped')),
  stage TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 20),
  started_at TEXT,
  completed_at TEXT,
  duration_ms INTEGER,
  bytes_fetched INTEGER NOT NULL DEFAULT 0,
  parsed_count INTEGER NOT NULL DEFAULT 0,
  failure_category TEXT,
  failure_message TEXT,
  skip_reason TEXT,
  retry_eligible INTEGER NOT NULL DEFAULT 0 CHECK(retry_eligible IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(run_id,source_id,item_url)
);

CREATE INDEX IF NOT EXISTS icai_sync_items_run_status_idx
ON icai_sync_items(run_id,status,updated_at DESC);

CREATE INDEX IF NOT EXISTS icai_sync_items_source_status_idx
ON icai_sync_items(source_id,status,updated_at DESC);

ALTER TABLE icai_sync_runtime ADD COLUMN current_item_id TEXT;

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0038','icai phase3ef durable item isolation and recovery','phase-12-operations-admin-platform');
