ALTER TABLE razorpay_subscriptions ADD COLUMN failure_paid_through_at TEXT;
CREATE TABLE billing_notifications (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
 provider_subscription_id TEXT NOT NULL, cycle_key TEXT NOT NULL,
 notification_type TEXT NOT NULL CHECK(notification_type IN ('billing_renewal_due','billing_payment_failed','billing_grace_ending','billing_grace_expired','billing_payment_recovered')),
 title TEXT NOT NULL, body TEXT NOT NULL, action_href TEXT NOT NULL DEFAULT '/billing',
 read_at TEXT, created_at TEXT NOT NULL, suppressed_at TEXT,
 UNIQUE(provider_subscription_id,cycle_key,notification_type)
);
CREATE INDEX billing_notifications_owner ON billing_notifications(user_id,suppressed_at,created_at DESC);
CREATE INDEX billing_recovery_due ON razorpay_subscriptions(failure_paid_through_at,grace_until);
-- Anchors are invoice boundaries, never webhook or cron delivery times.
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
 AND ((notification_type IN ('billing_payment_failed','billing_grace_ending','billing_grace_expired') AND NOT EXISTS(SELECT 1 FROM razorpay_subscriptions WHERE id=NEW.id AND failure_paid_through_at=billing_notifications.cycle_key) AND NOT (NEW.status IN ('pending','halted') AND NEW.paid_through_at IS NULL AND cycle_key='initial:'||NEW.created_at))
 OR (notification_type='billing_renewal_due' AND (NEW.status<>'active' OR NEW.cancel_at_period_end=1 OR NEW.charge_at IS NULL OR cycle_key<>NEW.charge_at)));
END;
-- Suppression also applies to finance holds and cancellation-only changes.
CREATE TRIGGER billing_notice_financial_hold AFTER UPDATE OF financial_state,cancel_at_period_end ON razorpay_subscriptions
WHEN NEW.financial_state IN ('refunded','disputed','mismatch') OR NEW.cancel_at_period_end=1 BEGIN
 UPDATE billing_notifications SET suppressed_at=NEW.updated_at WHERE provider_subscription_id=NEW.provider_subscription_id AND suppressed_at IS NULL AND (NEW.financial_state IN ('refunded','disputed','mismatch') OR notification_type='billing_renewal_due');
END;
UPDATE razorpay_subscriptions SET status=status WHERE status IN ('pending','halted') AND paid_through_at IS NOT NULL;
