-- CA Progress V2 — Cloudflare migration Phase 3
-- Provider-independent application identity, Worker sessions and retryable-job ledger.
-- This migration prepares the Cloudflare runtime only; it does not migrate live users.
PRAGMA foreign_keys = ON;

-- `app_users.user_id` remains the permanent ownership key. The compatibility view
-- exposes the Phase 3 conceptual `users` model without rebuilding the Phase 2 table.
CREATE VIEW IF NOT EXISTS users AS
SELECT
  user_id AS application_user_id,
  role,
  account_state,
  created_at,
  updated_at
FROM app_users;

CREATE TABLE IF NOT EXISTS auth_identities (
  identity_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK(provider IN ('google','linkedin_oidc','supabase_auth')),
  provider_user_id TEXT NOT NULL,
  application_user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  email TEXT,
  phone TEXT,
  display_name TEXT,
  avatar_url TEXT,
  email_verified INTEGER NOT NULL DEFAULT 0 CHECK(email_verified IN (0,1)),
  last_seen_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider, provider_user_id)
);
CREATE INDEX IF NOT EXISTS auth_identities_user_idx ON auth_identities(application_user_id, provider);

CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  application_user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  auth_identity_id TEXT REFERENCES auth_identities(identity_id) ON DELETE SET NULL,
  token_hash TEXT NOT NULL UNIQUE,
  remember_device INTEGER NOT NULL DEFAULT 0 CHECK(remember_device IN (0,1)),
  expires_at TEXT NOT NULL,
  absolute_expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TEXT,
  rotated_from_session_id TEXT REFERENCES sessions(session_id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(julianday(absolute_expires_at) >= julianday(expires_at))
);
CREATE INDEX IF NOT EXISTS sessions_user_active_idx ON sessions(application_user_id, revoked_at, expires_at);
CREATE INDEX IF NOT EXISTS sessions_absolute_expiry_idx ON sessions(absolute_expires_at, revoked_at);

CREATE TABLE IF NOT EXISTS background_job_executions (
  idempotency_key TEXT PRIMARY KEY,
  job_type TEXT NOT NULL CHECK(job_type IN ('icai-sync')),
  payload_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','succeeded','failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
  started_at TEXT,
  finished_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS background_job_status_idx ON background_job_executions(job_type, status, updated_at);

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0004','phase 3 provider identities, Worker sessions and background job idempotency','737617e0612f7e0353078d06a138bcefc3ea966e');
