-- Owner-bound retry groups retain every original financial snapshot.
ALTER TABLE payment_checkout_attempts ADD COLUMN retry_superseded INTEGER NOT NULL DEFAULT 0 CHECK(retry_superseded IN (0,1));
DROP INDEX checkout_one_unresolved_per_user;
CREATE UNIQUE INDEX checkout_one_unresolved_per_user ON payment_checkout_attempts(user_id)
 WHERE retry_superseded=0 AND state IN ('reserved','preparing','dispatching','uncertain','provider_created','ready','pending');
CREATE TABLE payment_checkout_retry_groups(
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES app_users(user_id),
 winner_attempt_id TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL
);
CREATE TABLE payment_checkout_retry_members(
 attempt_id TEXT PRIMARY KEY REFERENCES payment_checkout_attempts(id),
 group_id TEXT NOT NULL REFERENCES payment_checkout_retry_groups(id),
 choice_sequence INTEGER NOT NULL,UNIQUE(group_id,choice_sequence)
);
CREATE TABLE subscription_retry_refunds(
 payment_id TEXT PRIMARY KEY,purchase_group_id TEXT NOT NULL REFERENCES payment_checkout_retry_groups(id),
 amount_subunits INTEGER NOT NULL CHECK(amount_subunits>0),currency TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('pending','requested','processed','failed','review')),
 provider_refund_id TEXT UNIQUE,request_key TEXT NOT NULL UNIQUE,last_error TEXT,
 created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),lease_token TEXT,lease_until TEXT
);
CREATE TABLE checkout_retry_closures(
 provider_subscription_id TEXT PRIMARY KEY,group_id TEXT NOT NULL REFERENCES payment_checkout_retry_groups(id),
 user_id TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','closed')),
 last_error TEXT,updated_at TEXT NOT NULL
);
-- Recompute the winner in the projection transaction; stale concurrent projections
-- cannot reactivate a losing payment while its refund is pending.
CREATE TRIGGER checkout_retry_access_insert BEFORE INSERT ON user_subscriptions
WHEN EXISTS(SELECT 1 FROM payment_checkout_attempts a JOIN payment_checkout_retry_members m ON m.attempt_id=a.id JOIN payment_checkout_retry_groups g ON g.id=m.group_id WHERE a.provider_subscription_id=NEW.provider_subscription_id AND g.winner_attempt_id IS NOT a.id)
BEGIN SELECT RAISE(IGNORE); END;
CREATE TRIGGER checkout_retry_access_update BEFORE UPDATE ON user_subscriptions
WHEN NEW.status IN ('active','paused','cancelled') AND EXISTS(SELECT 1 FROM payment_checkout_attempts a JOIN payment_checkout_retry_members m ON m.attempt_id=a.id JOIN payment_checkout_retry_groups g ON g.id=m.group_id WHERE a.provider_subscription_id=NEW.provider_subscription_id AND g.winner_attempt_id IS NOT a.id)
BEGIN SELECT RAISE(IGNORE); END;
INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit) VALUES('0084','owner bound checkout retries and full duplicate refunds','payment-system-p5');
