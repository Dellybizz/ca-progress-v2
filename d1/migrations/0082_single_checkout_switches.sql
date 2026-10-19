CREATE TABLE IF NOT EXISTS subscription_checkout_switches (
 request_key TEXT PRIMARY KEY,
 user_id TEXT NOT NULL,
 source_subscription_id TEXT NOT NULL,
 source_provider_plan_id TEXT NOT NULL,
 target_plan_id TEXT NOT NULL,
 target_subscription_id TEXT,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','closing_source','completed','cancelled')),
 lease_token TEXT,
 lease_until TEXT,
 last_error TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS subscription_checkout_switches_one_open
 ON subscription_checkout_switches(user_id) WHERE state IN ('pending','closing_source');

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit) VALUES('0082','single checkout subscription switches','payment-system-p5');

CREATE TABLE IF NOT EXISTS subscription_switch_refunds (
 payment_id TEXT PRIMARY KEY,
 purchase_group_id TEXT NOT NULL REFERENCES subscription_checkout_switches(request_key),
 amount_subunits INTEGER NOT NULL CHECK(amount_subunits>0),currency TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('pending','requested','processed','failed','review')),
 provider_refund_id TEXT UNIQUE,request_key TEXT NOT NULL UNIQUE,last_error TEXT,
 created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),lease_token TEXT,lease_until TEXT
);
