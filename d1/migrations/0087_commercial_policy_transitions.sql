-- Policy scheduling is durable; Phase 2 executes provider/access transitions.
-- Existing price/paid-period snapshots are never rewritten by publication.
CREATE TABLE IF NOT EXISTS subscription_policy_change_jobs (
 id TEXT PRIMARY KEY,
 source_subscription_id TEXT NOT NULL REFERENCES razorpay_subscriptions(id),
 user_id TEXT NOT NULL REFERENCES app_users(user_id),
 kind TEXT NOT NULL CHECK(kind IN ('price_decrease','plan_retirement')),
 target_policy_id TEXT REFERENCES plan_policy_versions(id),
 effective_at TEXT NOT NULL,
 target_price_subunits INTEGER,
 approval_grace_days INTEGER NOT NULL DEFAULT 0,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','awaiting_approval','applied','superseded','review')),
 reason TEXT NOT NULL,
 created_by TEXT REFERENCES app_users(user_id),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(source_subscription_id,kind,target_policy_id)
);
CREATE INDEX IF NOT EXISTS commercial_changes_due ON subscription_policy_change_jobs(state,effective_at);
CREATE TABLE IF NOT EXISTS plan_availability_policies (
 plan_id TEXT PRIMARY KEY REFERENCES subscription_plans(id),
 mode TEXT NOT NULL CHECK(mode IN ('enabled','stop_new_purchases','retire')),
 reason TEXT NOT NULL,
 updated_by TEXT NOT NULL REFERENCES app_users(user_id),
 updated_at TEXT NOT NULL
);
INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
 VALUES('0087','Audited plan availability and scheduled price decrease contracts','payment-rules-phase1');
