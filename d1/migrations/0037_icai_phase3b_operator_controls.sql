-- ICAI Phase 3B: durable, non-destructive operator recovery controls.
PRAGMA foreign_keys = ON;
ALTER TABLE icai_sync_runtime ADD COLUMN pause_requested INTEGER NOT NULL DEFAULT 0 CHECK(pause_requested IN (0,1));
ALTER TABLE icai_sync_runtime ADD COLUMN paused_at TEXT;
ALTER TABLE icai_sources ADD COLUMN excluded_until TEXT;
ALTER TABLE icai_sources ADD COLUMN exclusion_reason TEXT;
CREATE INDEX IF NOT EXISTS icai_sources_exclusion_idx ON icai_sources(is_active,excluded_until,id);
INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0037','icai phase3b durable operator recovery controls','phase-12-operations-admin-platform');
