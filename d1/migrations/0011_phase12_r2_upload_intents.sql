-- Phase 12 direct-to-R2 uploads. D1 stores only short-lived upload metadata and object keys.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS r2_upload_intents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  expected_size_bytes INTEGER NOT NULL CHECK(expected_size_bytes > 0),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  expires_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'issued' CHECK(status IN ('issued','completed','abandoned','failed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS r2_upload_intents_expiry_idx ON r2_upload_intents(status, expires_at);
CREATE INDEX IF NOT EXISTS r2_upload_intents_user_idx ON r2_upload_intents(user_id, created_at DESC);

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0011','phase 12 direct-to-R2 upload intents and abandoned object cleanup','phase-12-operations-admin-platform');
