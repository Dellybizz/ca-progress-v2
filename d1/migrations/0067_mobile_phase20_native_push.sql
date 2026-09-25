CREATE TABLE IF NOT EXISTS native_push_devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  device_id TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL CHECK(platform IN ('android','ios')),
  token_hash TEXT NOT NULL UNIQUE,
  token_ciphertext TEXT NOT NULL,
  app_build INTEGER NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES app_users(user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_native_push_owner_active ON native_push_devices(user_id,revoked_at,updated_at DESC);

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0067','mobile phase 20 native push devices','48c14a8c');
