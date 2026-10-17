-- Owner-approved renewal windows and durable cancellation/payment-race records.
CREATE TABLE subscription_cancel_intents (
 source_subscription_id TEXT PRIMARY KEY REFERENCES razorpay_subscriptions(id),
 user_id TEXT NOT NULL REFERENCES app_users(user_id),
 reason TEXT NOT NULL CHECK(reason IN ('user_grace','price_decrease','plan_retirement')),
 boundary_at TEXT NOT NULL, paid_count_before INTEGER NOT NULL, paid_start_before TEXT,
 requested_at TEXT NOT NULL, provider_confirmed_at TEXT
);
CREATE TABLE subscription_cancellation_refunds (
 payment_id TEXT PRIMARY KEY, purchase_group_id TEXT NOT NULL,
 amount_subunits INTEGER NOT NULL CHECK(amount_subunits>0),currency TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('pending','requested','processed','failed','review')),
 provider_refund_id TEXT,request_key TEXT NOT NULL UNIQUE,last_error TEXT,
 lease_token TEXT,lease_until TEXT,created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE subscription_collection_stops (
 source_subscription_id TEXT PRIMARY KEY REFERENCES razorpay_subscriptions(id),
 deadline_at TEXT NOT NULL, confirmed_at TEXT, last_error TEXT,
 lease_token TEXT,lease_until TEXT
);
CREATE TABLE commercial_checkout_replacements (
 job_id TEXT PRIMARY KEY REFERENCES subscription_policy_change_jobs(id),
 attempt_id TEXT UNIQUE REFERENCES payment_checkout_attempts(id),
 provider_subscription_id TEXT UNIQUE,
 created_at TEXT NOT NULL,updated_at TEXT NOT NULL
);
ALTER TABLE subscription_policy_change_jobs ADD COLUMN lease_token TEXT;
ALTER TABLE subscription_policy_change_jobs ADD COLUMN lease_until TEXT;
ALTER TABLE subscription_policy_change_jobs ADD COLUMN last_error TEXT;
-- Respect a grace period already underway; future failures use the approved cycle defaults.
UPDATE razorpay_subscriptions SET grace_days=CASE billing_cycle WHEN 'annual' THEN 10 ELSE 3 END
WHERE failure_paid_through_at IS NULL AND billing_cycle IN ('monthly','annual');
DROP TRIGGER billing_failure_anchor;
CREATE TRIGGER billing_failure_anchor AFTER UPDATE OF status,paid_through_at ON razorpay_subscriptions BEGIN
 UPDATE razorpay_subscriptions SET failure_paid_through_at=CASE
  WHEN NEW.financial_state IN ('refunded','disputed','mismatch') OR NEW.status IN ('paused','cancelled','completed','expired') THEN NULL
  WHEN OLD.failure_paid_through_at IS NOT NULL AND julianday(NEW.paid_through_at)>julianday(OLD.failure_paid_through_at) THEN CASE WHEN NEW.status IN ('pending','halted') THEN NEW.paid_through_at ELSE NULL END
  WHEN NEW.status IN ('pending','halted') AND NEW.paid_through_at IS NOT NULL THEN COALESCE(OLD.failure_paid_through_at,NEW.paid_through_at)
  ELSE OLD.failure_paid_through_at END WHERE id=NEW.id;
 UPDATE razorpay_subscriptions SET grace_until=CASE WHEN failure_paid_through_at IS NOT NULL AND grace_days>0
 THEN strftime('%Y-%m-%dT%H:%M:%fZ',failure_paid_through_at,'+'||grace_days||' days') ELSE NULL END WHERE id=NEW.id;
 INSERT OR IGNORE INTO billing_notifications(id,user_id,provider_subscription_id,cycle_key,notification_type,title,body,created_at)
 SELECT lower(hex(randomblob(16))),NEW.user_id,NEW.provider_subscription_id,failure_paid_through_at,'billing_payment_failed','Renewal payment needs attention',
 'Your renewal is unpaid. Open Billing for the fixed access deadline and payment-method recovery instructions.',NEW.updated_at
 FROM razorpay_subscriptions WHERE id=NEW.id AND failure_paid_through_at IS NOT NULL;
 INSERT OR IGNORE INTO billing_notifications(id,user_id,provider_subscription_id,cycle_key,notification_type,title,body,created_at)
 SELECT lower(hex(randomblob(16))),NEW.user_id,NEW.provider_subscription_id,NEW.paid_through_at,'billing_payment_recovered','Renewal payment verified',
 'A captured invoice has been verified. Access follows its service dates; your study data is preserved.',NEW.updated_at
 WHERE NEW.paid_through_at IS NOT NULL AND (OLD.paid_through_at IS NULL OR julianday(NEW.paid_through_at)>julianday(OLD.paid_through_at)) AND NEW.financial_state='paid';
 INSERT OR IGNORE INTO billing_notifications(id,user_id,provider_subscription_id,cycle_key,notification_type,title,body,created_at)
 SELECT lower(hex(randomblob(16))),NEW.user_id,NEW.provider_subscription_id,'initial:'||NEW.created_at,'billing_payment_failed','Payment needs attention','The first payment is unpaid. No paid access or renewal grace has been granted. Open Billing for recovery instructions.',NEW.updated_at
 WHERE NEW.paid_through_at IS NULL AND NEW.status IN ('pending','halted') AND NEW.financial_state NOT IN ('refunded','disputed','mismatch');
 UPDATE billing_notifications SET suppressed_at=NEW.updated_at WHERE provider_subscription_id=NEW.provider_subscription_id AND suppressed_at IS NULL
 AND ((notification_type IN ('billing_payment_failed','billing_grace_ending','billing_grace_expired') AND NOT EXISTS(SELECT 1 FROM razorpay_subscriptions WHERE id=NEW.id AND (failure_paid_through_at=billing_notifications.cycle_key OR billing_notifications.cycle_key LIKE failure_paid_through_at||':day:%')) AND NOT (NEW.status IN ('pending','halted') AND NEW.paid_through_at IS NULL AND cycle_key='initial:'||NEW.created_at))
 OR (notification_type='billing_renewal_due' AND (NEW.status<>'active' OR NEW.cancel_at_period_end=1 OR NEW.charge_at IS NULL OR cycle_key<>NEW.charge_at)));
END;

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES('0088','Owner renewal recovery windows cancellation race refunds and approval replacements','payment-rules-phase2');
