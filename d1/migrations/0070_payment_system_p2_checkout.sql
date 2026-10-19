-- Durable subscription checkout intent. No existing financial record is rewritten.
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS payment_checkout_attempts(
  id TEXT PRIMARY KEY,
  request_key TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,
  input_json TEXT NOT NULL CHECK(json_valid(input_json)),
  state TEXT NOT NULL CHECK(state IN ('reserved','preparing','dispatching','uncertain','provider_created','ready','pending','succeeded','failed','cancelled')),
  contract_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(contract_json)),
  payload_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(payload_json)),
  provider_subscription_id TEXT,
  provider_snapshot_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(provider_snapshot_json)),
  lease_token TEXT,
  lease_until TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS checkout_one_unresolved_per_user ON payment_checkout_attempts(user_id)
  WHERE state IN ('reserved','preparing','dispatching','uncertain','provider_created','ready','pending');
CREATE INDEX IF NOT EXISTS checkout_user_history ON payment_checkout_attempts(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS checkout_recovery_due ON payment_checkout_attempts(state,lease_until);
CREATE UNIQUE INDEX IF NOT EXISTS checkout_provider_identity ON payment_checkout_attempts(provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;
-- A repeated webhook/callback can never create a second access row for one mandate.
CREATE UNIQUE INDEX IF NOT EXISTS subscription_access_provider_unique ON user_subscriptions(provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;
INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES('0070','durable checkout reservation and provider access uniqueness','payment-system-p2');
