-- ICAI Sync Optimisation Phase 6: durable item validators and bounded retry state.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS icai_sync_item_state (
  source_id TEXT NOT NULL REFERENCES icai_sources(id) ON DELETE CASCADE,
  item_url TEXT NOT NULL,
  etag TEXT,
  last_modified TEXT,
  content_hash TEXT,
  last_http_status INTEGER,
  last_bytes_fetched INTEGER NOT NULL DEFAULT 0,
  last_checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_success_at TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  next_retry_at TEXT,
  last_error TEXT,
  parser_version TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(source_id,item_url)
);

CREATE INDEX IF NOT EXISTS idx_icai_sync_item_state_retry
ON icai_sync_item_state(next_retry_at,consecutive_failures,source_id);

CREATE INDEX IF NOT EXISTS idx_icai_sync_item_state_checked
ON icai_sync_item_state(source_id,last_checked_at DESC);

INSERT OR IGNORE INTO _ca_schema_migrations(version, description, source_freeze_commit)
VALUES ('0029', 'ICAI sync incremental item validators hashes and bounded retry state', 'phase-12-operations-admin-platform');
