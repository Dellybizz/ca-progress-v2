-- Product Consistency Phase 8: versioned, operator-safe control centre.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS admin_control_versions (
  id TEXT PRIMARY KEY,
  area_key TEXT NOT NULL CHECK(area_key IN ('system','academic','attempts','icai','resources','accounts','plans','community','notifications')),
  document_key TEXT NOT NULL,
  version INTEGER NOT NULL CHECK(version > 0),
  title TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','published','superseded')),
  config_json TEXT NOT NULL DEFAULT '{}',
  change_reason TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at TEXT,
  CHECK(json_valid(config_json)),
  UNIQUE(area_key,document_key,version)
);

CREATE TABLE IF NOT EXISTS admin_control_publications (
  area_key TEXT NOT NULL,
  document_key TEXT NOT NULL,
  version_id TEXT NOT NULL REFERENCES admin_control_versions(id) ON DELETE RESTRICT,
  updated_by TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE RESTRICT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(area_key,document_key)
);

CREATE TABLE IF NOT EXISTS admin_control_requests (
  idempotency_key TEXT PRIMARY KEY,
  actor_user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE RESTRICT,
  action TEXT NOT NULL,
  target_id TEXT NOT NULL,
  result_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(json_valid(result_json))
);

CREATE INDEX IF NOT EXISTS admin_control_versions_area_state_idx
  ON admin_control_versions(area_key,state,created_at DESC);

CREATE TRIGGER IF NOT EXISTS admin_control_versions_no_delete
BEFORE DELETE ON admin_control_versions BEGIN
  SELECT RAISE(ABORT,'admin control version history is append-only');
END;

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0045','product consistency phase 8 operator control centre','phase-12-operations-admin-platform');
