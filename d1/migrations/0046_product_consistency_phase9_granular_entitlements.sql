-- Product Consistency Phase 9: granular, versioned plan and entitlement policies.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS plan_policy_versions (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL CHECK(version > 0),
  state TEXT NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','published','retired')),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price_subunits INTEGER CHECK(price_subunits IS NULL OR price_subunits >= 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  billing_duration_value INTEGER NOT NULL CHECK(billing_duration_value >= 0),
  billing_duration_unit TEXT NOT NULL CHECK(billing_duration_unit IN ('day','week','month','year','lifetime')),
  trial_days INTEGER NOT NULL DEFAULT 0 CHECK(trial_days BETWEEN 0 AND 365),
  grace_days INTEGER NOT NULL DEFAULT 0 CHECK(grace_days BETWEEN 0 AND 90),
  effective_at TEXT,
  created_by TEXT REFERENCES app_users(user_id) ON DELETE SET NULL,
  change_reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at TEXT,
  UNIQUE(plan_id,version)
);

CREATE TABLE IF NOT EXISTS plan_policy_pages (
  policy_version_id TEXT NOT NULL REFERENCES plan_policy_versions(id) ON DELETE CASCADE,
  page_key TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  PRIMARY KEY(policy_version_id,page_key)
);

CREATE TABLE IF NOT EXISTS plan_policy_features (
  policy_version_id TEXT NOT NULL REFERENCES plan_policy_versions(id) ON DELETE CASCADE,
  page_key TEXT NOT NULL,
  feature_key TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  quantity_limit REAL CHECK(quantity_limit IS NULL OR quantity_limit >= 0),
  time_limit_minutes REAL CHECK(time_limit_minutes IS NULL OR time_limit_minutes >= 0),
  storage_limit_bytes INTEGER CHECK(storage_limit_bytes IS NULL OR storage_limit_bytes >= 0),
  file_size_limit_bytes INTEGER CHECK(file_size_limit_bytes IS NULL OR file_size_limit_bytes >= 0),
  reset_period TEXT NOT NULL DEFAULT 'lifetime' CHECK(reset_period IN ('daily','weekly','monthly','lifetime')),
  retention_days INTEGER CHECK(retention_days IS NULL OR retention_days >= 0),
  upgrade_message TEXT NOT NULL DEFAULT 'Upgrade your plan to use this feature.',
  dependencies_json TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY(policy_version_id,feature_key),
  FOREIGN KEY(policy_version_id,page_key) REFERENCES plan_policy_pages(policy_version_id,page_key) ON DELETE CASCADE,
  CHECK(json_valid(dependencies_json))
);

CREATE TABLE IF NOT EXISTS plan_policy_publications (
  plan_id TEXT PRIMARY KEY REFERENCES subscription_plans(id) ON DELETE RESTRICT,
  policy_version_id TEXT NOT NULL REFERENCES plan_policy_versions(id) ON DELETE RESTRICT,
  published_by TEXT REFERENCES app_users(user_id) ON DELETE SET NULL,
  published_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subscription_policy_contracts (
  subscription_id TEXT PRIMARY KEY REFERENCES user_subscriptions(id) ON DELETE CASCADE,
  policy_version_id TEXT NOT NULL REFERENCES plan_policy_versions(id) ON DELETE RESTRICT,
  grandfathered INTEGER NOT NULL DEFAULT 1 CHECK(grandfathered IN (0,1)),
  decision_reason TEXT NOT NULL DEFAULT 'Policy active when subscription started',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payment_order_policy_snapshots (
  payment_order_id TEXT PRIMARY KEY REFERENCES payment_orders(id) ON DELETE CASCADE,
  policy_version_id TEXT NOT NULL REFERENCES plan_policy_versions(id) ON DELETE RESTRICT,
  price_subunits INTEGER NOT NULL CHECK(price_subunits >= 0),
  currency TEXT NOT NULL,
  duration_value INTEGER NOT NULL,
  duration_unit TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS entitlement_overrides (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
  quantity_limit REAL,
  expires_at TEXT,
  reason TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS plan_promotions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  policy_version_id TEXT NOT NULL REFERENCES plan_policy_versions(id) ON DELETE RESTRICT,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_by TEXT REFERENCES app_users(user_id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS plan_promotion_grants (
  promotion_id TEXT NOT NULL REFERENCES plan_promotions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  granted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(promotion_id,user_id)
);

CREATE TABLE IF NOT EXISTS scheduled_plan_changes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  from_plan_id TEXT REFERENCES subscription_plans(id) ON DELETE RESTRICT,
  to_plan_id TEXT NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
  effective_at TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'scheduled' CHECK(state IN ('scheduled','applied','cancelled','failed')),
  reason TEXT NOT NULL,
  created_by TEXT REFERENCES app_users(user_id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  applied_at TEXT
);

CREATE TABLE IF NOT EXISTS entitlement_usage_buckets (
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  bucket_key TEXT NOT NULL,
  used_value REAL NOT NULL DEFAULT 0 CHECK(used_value >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id,feature_key,bucket_key)
);
CREATE TABLE IF NOT EXISTS entitlement_reservations (
  idempotency_key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  bucket_key TEXT NOT NULL,
  reserved_value REAL NOT NULL CHECK(reserved_value > 0),
  state TEXT NOT NULL DEFAULT 'committed' CHECK(state IN ('committed','released')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS policy_versions_plan_state_idx ON plan_policy_versions(plan_id,state,version DESC);
CREATE INDEX IF NOT EXISTS entitlement_overrides_user_idx ON entitlement_overrides(user_id,feature_key,expires_at,revoked_at);
CREATE INDEX IF NOT EXISTS scheduled_plan_changes_due_idx ON scheduled_plan_changes(state,effective_at);

-- Preserve the current Free/Pro/Premium definitions as version 1.
INSERT OR IGNORE INTO plan_policy_versions(id,plan_id,version,state,name,description,price_subunits,currency,billing_duration_value,billing_duration_unit,change_reason,published_at)
SELECT 'policy-v1-'||id,id,1,'published',name,tagline,price_subunits,currency,duration_value,duration_unit,'Imported from existing production plan',CURRENT_TIMESTAMP FROM subscription_plans;
INSERT OR IGNORE INTO plan_policy_pages(policy_version_id,page_key,enabled)
SELECT DISTINCT 'policy-v1-'||plan_id,'general',1 FROM plan_entitlements;
INSERT OR IGNORE INTO plan_policy_features(policy_version_id,page_key,feature_key,enabled,quantity_limit,reset_period,upgrade_message)
SELECT 'policy-v1-'||plan_id,'general',feature_key,enabled,limit_value,
  CASE reset_period WHEN 'never' THEN 'lifetime' ELSE reset_period END,upgrade_message FROM plan_entitlements;
INSERT OR IGNORE INTO plan_policy_publications(plan_id,policy_version_id)
SELECT id,'policy-v1-'||id FROM subscription_plans;
INSERT OR IGNORE INTO subscription_policy_contracts(subscription_id,policy_version_id,grandfathered,decision_reason)
SELECT id,'policy-v1-'||plan_id,1,'Existing subscriber retained on imported production policy' FROM user_subscriptions;

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0046','product consistency phase 9 granular plans pricing and entitlements','phase-12-operations-admin-platform');
