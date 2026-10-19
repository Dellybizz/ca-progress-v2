-- New policy records are additive. Existing subscriptions retain their snapshots.
CREATE TABLE IF NOT EXISTS subscription_lifecycle_policies (
 id TEXT PRIMARY KEY, version INTEGER NOT NULL UNIQUE, state TEXT NOT NULL CHECK(state IN ('draft','published','retired')),
 access_grace_days INTEGER NOT NULL CHECK(access_grace_days>=0), storage_grace_days INTEGER NOT NULL CHECK(storage_grace_days>=0),
 important_storage_percent INTEGER NOT NULL CHECK(important_storage_percent>=0), price_lock_months INTEGER NOT NULL CHECK(price_lock_months>0),
 created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT OR IGNORE INTO subscription_lifecycle_policies(id,version,state,access_grace_days,storage_grace_days,important_storage_percent,price_lock_months) VALUES('confirmed-2026-10-11',1,'published',3,10,10,12);
CREATE TABLE IF NOT EXISTS resource_importance (
 resource_id TEXT PRIMARY KEY REFERENCES uploaded_resources(id) ON DELETE CASCADE,
 owner_user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
 marked_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS resource_importance_owner ON resource_importance(owner_user_id);
CREATE TABLE IF NOT EXISTS subscription_purchase_groups (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES app_users(user_id), plan_id TEXT NOT NULL REFERENCES subscription_plans(id),
 policy_snapshot_json TEXT NOT NULL, quoted_amount_subunits INTEGER NOT NULL CHECK(quoted_amount_subunits>=0), currency TEXT NOT NULL,
 winning_payment_id TEXT UNIQUE, state TEXT NOT NULL CHECK(state IN ('open','paid','closed','review')),
 created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS subscription_refund_obligations (
 payment_id TEXT PRIMARY KEY, purchase_group_id TEXT NOT NULL REFERENCES subscription_purchase_groups(id),
 amount_subunits INTEGER NOT NULL CHECK(amount_subunits>0), currency TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('pending','requested','processed','failed','review')), provider_refund_id TEXT UNIQUE,
 request_key TEXT NOT NULL UNIQUE, last_error TEXT, created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS subscription_grant_offers (
 id TEXT PRIMARY KEY, plan_id TEXT NOT NULL REFERENCES subscription_plans(id), user_id TEXT REFERENCES app_users(user_id),
 created_by TEXT NOT NULL REFERENCES app_users(user_id), audience TEXT NOT NULL CHECK(audience IN ('everyone','never_claimed')),
 duration_seconds INTEGER NOT NULL CHECK(duration_seconds>0), claim_by TEXT, reason TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'offered' CHECK(state IN ('offered','revoked')), created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS subscription_grant_claims (
 id TEXT PRIMARY KEY, offer_id TEXT NOT NULL REFERENCES subscription_grant_offers(id), user_id TEXT NOT NULL REFERENCES app_users(user_id),
 state TEXT NOT NULL CHECK(state IN ('saved','queued','active','completed','review')), starts_at TEXT, ends_at TEXT,
 renewal_before TEXT, renewal_after TEXT, provider_confirmed_at TEXT, claimed_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(offer_id,user_id)
);
CREATE INDEX IF NOT EXISTS subscription_grant_claim_user ON subscription_grant_claims(user_id,state);
CREATE TABLE IF NOT EXISTS subscription_storage_transitions (
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES app_users(user_id),target_plan_id TEXT NOT NULL REFERENCES subscription_plans(id),
 reason TEXT NOT NULL CHECK(reason IN ('downgrade','failed_renewal')),effective_at TEXT NOT NULL,deadline TEXT NOT NULL,
 limit_bytes INTEGER NOT NULL CHECK(limit_bytes>=0),important_percent INTEGER NOT NULL CHECK(important_percent>=0),
 state TEXT NOT NULL CHECK(state IN ('grace','cleared','superseded','processing','completed','review')),
 policy_id TEXT NOT NULL REFERENCES subscription_lifecycle_policies(id), created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS subscription_storage_deadlines ON subscription_storage_transitions(state,deadline);
INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit) VALUES('0075','Confirmed subscription lifecycle policy and durable purchase grant storage records','subscription-lifecycle');
