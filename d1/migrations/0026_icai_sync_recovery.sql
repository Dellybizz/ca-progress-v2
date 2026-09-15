-- ICAI Sync Recovery Phase 1: durable execution state and cooperative controls.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS icai_sync_runtime (
  run_id TEXT PRIMARY KEY REFERENCES icai_sync_runs(id) ON DELETE CASCADE,
  stage TEXT NOT NULL DEFAULT 'queued',
  current_source_id TEXT REFERENCES icai_sources(id) ON DELETE SET NULL,
  current_item_url TEXT,
  stage_started_at TEXT NOT NULL,
  heartbeat_at TEXT NOT NULL,
  cancel_requested INTEGER NOT NULL DEFAULT 0 CHECK(cancel_requested IN (0,1)),
  skip_source_requested INTEGER NOT NULL DEFAULT 0 CHECK(skip_source_requested IN (0,1)),
  control_requested_by TEXT REFERENCES app_users(user_id) ON DELETE SET NULL,
  control_reason TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS icai_sync_runtime_heartbeat_idx
ON icai_sync_runtime(heartbeat_at, stage);

-- Make pre-migration queued/running jobs visible and recoverable in the panel.
INSERT OR IGNORE INTO icai_sync_runtime(
  run_id, stage, stage_started_at, heartbeat_at, updated_at
)
SELECT id, 'acquiring_lock', started_at, started_at, CURRENT_TIMESTAMP
FROM icai_sync_runs
WHERE status IN ('queued', 'running');

INSERT OR IGNORE INTO _ca_schema_migrations(version, description, source_freeze_commit)
VALUES ('0026', 'ICAI sync durable stages heartbeat cooperative controls and stale recovery', 'phase-12-operations-admin-platform');
