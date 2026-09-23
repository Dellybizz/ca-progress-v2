PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS native_auth_transactions (
  transaction_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK(provider IN ('google','linkedin_oidc')),
  pkce_challenge TEXT NOT NULL,
  application_user_id TEXT REFERENCES app_users(user_id) ON DELETE CASCADE,
  auth_identity_id TEXT REFERENCES auth_identities(identity_id) ON DELETE SET NULL,
  exchange_code_hash TEXT UNIQUE,
  device_label TEXT NOT NULL,
  app_build INTEGER NOT NULL CHECK(app_build > 0),
  next_path TEXT NOT NULL DEFAULT '/dashboard',
  expires_at TEXT NOT NULL,
  completed_at TEXT,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_native_auth_expiry ON native_auth_transactions(expires_at,consumed_at);
CREATE INDEX IF NOT EXISTS idx_native_auth_user ON native_auth_transactions(application_user_id,created_at DESC);

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0064','mobile phase 15 native PKCE exchange and bearer sessions','mobile-phase14-bundled-shell');
