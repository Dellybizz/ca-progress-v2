-- ICAI sync production continuation: durable per-run/source state.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS icai_sync_source_states (
  run_id TEXT NOT NULL REFERENCES icai_sync_runs(id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES icai_sources(id) ON DELETE CASCADE,
  source_index INTEGER NOT NULL CHECK(source_index >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','succeeded','failed','skipped','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
  started_at TEXT,
  finished_at TEXT,
  last_error TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(run_id, source_id),
  UNIQUE(run_id, source_index)
);
CREATE INDEX IF NOT EXISTS icai_sync_source_states_run_status_idx
  ON icai_sync_source_states(run_id, status, source_index);

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0028','bounded sequential ICAI queue continuation source state','phase-12-operations-admin-platform');
