-- Preserve existing upgrades while sharing their payment and renewal recovery with direct Pro purchases.
DROP TRIGGER trg_user_subscriptions_payment_attribution;
CREATE TABLE subscription_upgrades_next (
 purchase_group_id TEXT PRIMARY KEY REFERENCES subscription_purchase_groups(id),
 user_id TEXT NOT NULL REFERENCES app_users(user_id),
 source_subscription_id TEXT REFERENCES razorpay_subscriptions(provider_subscription_id),
 source_invoice_id TEXT REFERENCES payment_subscription_cycles(provider_invoice_id),
 state TEXT NOT NULL CHECK(state IN ('accepted','dispatching','uncertain','ready','paid','renewal_ready','completed','failed','review')),
 provider_order_id TEXT UNIQUE, receipt TEXT NOT NULL UNIQUE,
 replacement_request_id TEXT NOT NULL UNIQUE, replacement_subscription_id TEXT UNIQUE,
 source_cancelled_at TEXT, activated_at TEXT, lease_token TEXT, lease_until TEXT,
 last_error TEXT, last_checked_at TEXT, updated_at TEXT NOT NULL,
 kind TEXT NOT NULL DEFAULT 'upgrade' CHECK(kind IN ('upgrade','intro')),
 access_starts_at TEXT, access_ends_at TEXT,
 CHECK((kind='upgrade' AND source_subscription_id IS NOT NULL AND source_invoice_id IS NOT NULL)
    OR (kind='intro' AND source_subscription_id IS NULL AND source_invoice_id IS NULL))
);
INSERT INTO subscription_upgrades_next(purchase_group_id,user_id,source_subscription_id,source_invoice_id,state,provider_order_id,receipt,replacement_request_id,replacement_subscription_id,source_cancelled_at,activated_at,lease_token,lease_until,last_error,last_checked_at,updated_at)
 SELECT purchase_group_id,user_id,source_subscription_id,source_invoice_id,state,provider_order_id,receipt,replacement_request_id,replacement_subscription_id,source_cancelled_at,activated_at,lease_token,lease_until,last_error,last_checked_at,updated_at FROM subscription_upgrades;
DROP TABLE subscription_upgrades;
ALTER TABLE subscription_upgrades_next RENAME TO subscription_upgrades;
CREATE UNIQUE INDEX subscription_upgrade_open_user ON subscription_upgrades(user_id) WHERE state NOT IN ('completed','failed');
CREATE UNIQUE INDEX subscription_upgrade_credit_once ON subscription_upgrades(source_invoice_id) WHERE state<>'failed';
CREATE INDEX subscription_upgrades_reconcile ON subscription_upgrades(state,updated_at);
CREATE TRIGGER trg_user_subscriptions_payment_attribution BEFORE INSERT ON user_subscriptions WHEN NEW.source='razorpay'
BEGIN
 SELECT CASE WHEN
 (NEW.provider_subscription_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM razorpay_subscriptions rs WHERE rs.provider_subscription_id=NEW.provider_subscription_id AND rs.user_id=NEW.user_id AND rs.plan_id=NEW.plan_id AND rs.provider_verified=1))
 OR
 (NEW.provider_subscription_id IS NULL AND NOT EXISTS(
  SELECT 1 FROM payment_orders po JOIN payment_events pe ON pe.payment_order_id=po.id AND pe.verified=1
  WHERE po.provider_order_id=NEW.source_order_id AND po.user_id=NEW.user_id AND po.plan_id=NEW.plan_id AND po.status='paid' AND (NEW.source_payment_id IS NULL OR po.provider_payment_id=NEW.source_payment_id)
 ) AND NOT EXISTS(
  SELECT 1 FROM subscription_upgrades u JOIN subscription_purchase_groups g ON g.id=u.purchase_group_id
  LEFT JOIN subscription_upgrade_payments p ON p.payment_id=g.winning_payment_id AND p.purchase_group_id=g.id
  LEFT JOIN payment_subscription_cycles c ON c.provider_invoice_id=u.source_invoice_id
  LEFT JOIN razorpay_subscriptions rs ON rs.id=c.razorpay_subscription_id
  LEFT JOIN razorpay_subscription_charges ch ON ch.provider_payment_id=c.provider_payment_id
  WHERE g.state='paid' AND g.user_id=NEW.user_id AND g.plan_id=NEW.plan_id AND u.user_id=g.user_id
   AND g.winning_payment_id=NEW.source_payment_id AND COALESCE(u.provider_order_id,g.id)=NEW.source_order_id
   AND ((u.kind='upgrade' AND rs.user_id=g.user_id
    AND json_extract(g.policy_snapshot_json,'$.quote.effectiveAt')=NEW.starts_at
    AND json_extract(g.policy_snapshot_json,'$.quote.nextRenewalAt')=NEW.ends_at
    AND c.status='verified' AND c.provider_mode='live' AND ch.refund_state='none' AND ch.dispute_state='none'
    AND ((p.status='captured' AND p.amount_subunits=g.quoted_amount_subunits AND p.currency=g.currency AND p.amount_refunded=0)
      OR (g.quoted_amount_subunits=0 AND g.winning_payment_id='credit_'||c.provider_payment_id AND ch.status='captured')))
   OR (u.kind='intro' AND u.source_subscription_id IS NULL AND u.source_invoice_id IS NULL
    AND json_extract(g.policy_snapshot_json,'$.kind')='intro'
    AND u.access_starts_at=NEW.starts_at AND u.access_ends_at=NEW.ends_at
    AND p.provider_order_id=u.provider_order_id AND p.status='captured' AND p.amount_subunits=g.quoted_amount_subunits
    AND p.currency=g.currency AND p.amount_refunded=0 AND p.dispute_state='none'
    AND g.quoted_amount_subunits>=100))
 )) THEN RAISE(ABORT,'Razorpay access requires verified provider evidence') END;
END;
-- Serialize direct purchases with recurring checkout reservations, including lost responses.
CREATE TRIGGER subscription_intro_checkout_conflict BEFORE INSERT ON subscription_upgrades
WHEN NEW.kind='intro' AND EXISTS(
 SELECT 1 FROM payment_checkout_attempts a LEFT JOIN razorpay_subscriptions rs ON rs.provider_subscription_id=a.provider_subscription_id
 WHERE a.user_id=NEW.user_id AND a.state IN ('reserved','preparing','dispatching','uncertain','provider_created','ready','pending')
 AND (rs.provider_subscription_id IS NULL OR rs.status NOT IN ('cancelled','completed','expired')))
BEGIN SELECT RAISE(ABORT,'An existing recurring checkout requires recovery');END;
CREATE TRIGGER subscription_paid_checkout_conflict BEFORE INSERT ON payment_checkout_attempts
WHEN EXISTS(SELECT 1 FROM subscription_upgrades u WHERE u.user_id=NEW.user_id AND u.state NOT IN ('completed','failed')
 AND NOT(u.replacement_request_id=NEW.request_key AND u.activated_at IS NOT NULL AND u.source_cancelled_at IS NOT NULL))
BEGIN SELECT RAISE(ABORT,'Continue the saved Pro payment before another checkout');END;
INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit) VALUES('0077','Direct Pro introductory purchases with verified access and future renewals','pro-intro-purchases');
