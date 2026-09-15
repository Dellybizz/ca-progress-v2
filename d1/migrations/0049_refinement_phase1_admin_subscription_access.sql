-- Refinement Phase 1: explicit, auditable manual subscription access.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS admin_subscription_grants (
  id TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL UNIQUE REFERENCES user_subscriptions(id) ON DELETE RESTRICT,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
  state TEXT NOT NULL DEFAULT 'active' CHECK(state IN ('scheduled','active','expired','revoked')),
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  reason TEXT NOT NULL CHECK(length(reason) BETWEEN 8 AND 1000),
  created_by TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE RESTRICT,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TEXT,
  revoked_by TEXT REFERENCES app_users(user_id) ON DELETE RESTRICT,
  revoke_reason TEXT,
  CHECK(ends_at IS NULL OR starts_at < ends_at),
  CHECK(revoke_reason IS NULL OR length(revoke_reason) BETWEEN 8 AND 1000)
);

CREATE INDEX IF NOT EXISTS idx_admin_subscription_grants_user
  ON admin_subscription_grants(user_id,state,starts_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_subscription_grants_expiry
  ON admin_subscription_grants(state,ends_at);

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0049','refinement phase 1 explicit admin subscription access','refinement-phase1-admin-payment-priority');
