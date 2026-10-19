PRAGMA foreign_keys = ON;

ALTER TABLE sessions ADD COLUMN client_kind TEXT NOT NULL DEFAULT 'web' CHECK(client_kind IN ('web','mobile'));
ALTER TABLE sessions ADD COLUMN device_label TEXT;
ALTER TABLE sessions ADD COLUMN last_rotated_at TEXT;

CREATE INDEX IF NOT EXISTS idx_sessions_user_devices
  ON sessions(application_user_id,revoked_at,last_seen_at DESC);

CREATE TABLE IF NOT EXISTS auth_session_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  application_user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK(event_type IN ('issued','rotated','revoked','revoked_others','revoked_all')),
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_auth_session_events_user
  ON auth_session_events(application_user_id,created_at DESC);
CREATE TRIGGER IF NOT EXISTS auth_session_events_no_update BEFORE UPDATE ON auth_session_events BEGIN SELECT RAISE(ABORT,'auth session events are append-only'); END;
CREATE TRIGGER IF NOT EXISTS auth_session_events_no_delete BEFORE DELETE ON auth_session_events BEGIN SELECT RAISE(ABORT,'auth session events are append-only'); END;

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0059','mobile phase 3 unified sessions and device revocation','mobile-phase2-versioned-api');
