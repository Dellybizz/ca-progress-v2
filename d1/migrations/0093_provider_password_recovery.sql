-- Additive recovery proofs. Never modifies existing users, credentials or study data.
CREATE TABLE IF NOT EXISTS password_recovery_proofs (
 token_hash TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
 identity_id TEXT NOT NULL REFERENCES auth_identities(identity_id) ON DELETE CASCADE,
 credential_hash TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 consumed_by TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_password_recovery_user ON password_recovery_proofs(user_id,expires_at);
INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES('0093','Single-use linked-provider password recovery','onboarding-design-phase3');
