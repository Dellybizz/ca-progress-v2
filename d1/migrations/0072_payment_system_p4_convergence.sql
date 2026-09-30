-- Persist accepted signed work before acknowledgement; queues contain references only.
CREATE TABLE billing_webhook_inbox (
 event_key TEXT PRIMARY KEY, payload_sha256 TEXT NOT NULL, raw_body TEXT NOT NULL,
 signature TEXT NOT NULL, secret_version TEXT NOT NULL, event_type TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'received' CHECK(state IN ('received','processing','retry','processed','review')),
 attempts INTEGER NOT NULL DEFAULT 0, lease_token TEXT, lease_until TEXT,
 available_at TEXT NOT NULL, received_at TEXT NOT NULL, processed_at TEXT,
 last_error TEXT, updated_at TEXT NOT NULL
);
CREATE INDEX billing_inbox_due ON billing_webhook_inbox(state,available_at,lease_until);
CREATE TABLE billing_webhook_rate_windows (window_start INTEGER PRIMARY KEY,accepted_count INTEGER NOT NULL);
CREATE TABLE billing_inbox_replays (
 request_key TEXT PRIMARY KEY,event_key TEXT NOT NULL REFERENCES billing_webhook_inbox(event_key),
 actor_user_id TEXT NOT NULL,reason TEXT NOT NULL,replayed_at TEXT NOT NULL
);
CREATE TABLE billing_subscription_leases (
 provider_subscription_id TEXT PRIMARY KEY, token TEXT NOT NULL, lease_until TEXT NOT NULL
);
ALTER TABLE razorpay_subscriptions ADD COLUMN projection_version INTEGER NOT NULL DEFAULT 0;
CREATE TABLE billing_projection_guards (
 token TEXT PRIMARY KEY, subscription_id TEXT NOT NULL, expected_version INTEGER NOT NULL
);
CREATE TRIGGER billing_projection_guard BEFORE INSERT ON billing_projection_guards
BEGIN
 SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM razorpay_subscriptions rs JOIN billing_subscription_leases l
   ON l.provider_subscription_id=rs.provider_subscription_id
  WHERE rs.id=NEW.subscription_id AND rs.projection_version=NEW.expected_version
   AND rs.financial_state NOT IN ('refunded','disputed')
   AND l.token=NEW.token AND julianday(l.lease_until)>julianday('now')
 ) THEN RAISE(ABORT,'billing_projection_conflict') END;
END;
CREATE TABLE user_feature_revisions (user_id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 0);
CREATE TABLE billing_access_outbox (
 id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, access_subscription_id TEXT NOT NULL,
 kind TEXT NOT NULL, payload_json TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending'
 CHECK(state IN ('pending','delivered','superseded')), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- These writes are part of the same SQL transaction as the access change.
CREATE TRIGGER billing_access_insert AFTER INSERT ON user_subscriptions
BEGIN
 INSERT INTO user_feature_revisions(user_id,revision) VALUES(NEW.user_id,1)
 ON CONFLICT(user_id) DO UPDATE SET revision=revision+1;
 INSERT INTO billing_access_outbox(user_id,access_subscription_id,kind,payload_json)
 SELECT NEW.user_id,NEW.id,'billing.access.changed',json_object('subscriptionId',NEW.id,'planId',NEW.plan_id,'status',NEW.status,'startsAt',NEW.starts_at,'endsAt',NEW.ends_at)
 WHERE NEW.provider_subscription_id IS NOT NULL;
END;
CREATE TRIGGER billing_access_update AFTER UPDATE OF plan_id,status,starts_at,ends_at ON user_subscriptions
WHEN OLD.plan_id IS NOT NEW.plan_id OR OLD.status IS NOT NEW.status OR OLD.starts_at IS NOT NEW.starts_at OR OLD.ends_at IS NOT NEW.ends_at
BEGIN
 INSERT INTO user_feature_revisions(user_id,revision) VALUES(NEW.user_id,1)
 ON CONFLICT(user_id) DO UPDATE SET revision=revision+1;
 UPDATE billing_access_outbox SET state='superseded' WHERE access_subscription_id=NEW.id AND state='pending';
 INSERT INTO billing_access_outbox(user_id,access_subscription_id,kind,payload_json)
 SELECT NEW.user_id,NEW.id,'billing.access.changed',json_object('subscriptionId',NEW.id,'planId',NEW.plan_id,'status',NEW.status,'startsAt',NEW.starts_at,'endsAt',NEW.ends_at)
 WHERE NEW.provider_subscription_id IS NOT NULL;
END;
CREATE TRIGGER billing_access_delete AFTER DELETE ON user_subscriptions
BEGIN
 INSERT INTO user_feature_revisions(user_id,revision) VALUES(OLD.user_id,1)
 ON CONFLICT(user_id) DO UPDATE SET revision=revision+1;
 UPDATE billing_access_outbox SET state='superseded' WHERE access_subscription_id=OLD.id AND state='pending';
END;
CREATE TRIGGER billing_policy_update AFTER UPDATE OF policy_version_id ON subscription_policy_contracts
WHEN OLD.policy_version_id IS NOT NEW.policy_version_id
BEGIN
 INSERT INTO user_feature_revisions(user_id,revision) SELECT user_id,1 FROM user_subscriptions WHERE id=NEW.subscription_id
 ON CONFLICT(user_id) DO UPDATE SET revision=revision+1;
END;
CREATE TRIGGER billing_policy_insert AFTER INSERT ON subscription_policy_contracts
BEGIN
 INSERT INTO user_feature_revisions(user_id,revision) SELECT user_id,1 FROM user_subscriptions WHERE id=NEW.subscription_id
 ON CONFLICT(user_id) DO UPDATE SET revision=revision+1;
END;
INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES('0072','payment system P4 signed durable inbox, fenced projection, atomic outbox and feature revisions','payment-system-p4');
