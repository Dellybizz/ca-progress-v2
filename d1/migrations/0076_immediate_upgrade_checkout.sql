-- Independent upgrade payments do not alter existing bank authorizations.
CREATE TABLE subscription_upgrade_offers (
 plan_id TEXT PRIMARY KEY REFERENCES subscription_plans(id),
 intro_price_subunits INTEGER NOT NULL CHECK(intro_price_subunits>=0),
 currency TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('published','retired')),
 version INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT INTO subscription_upgrade_offers(plan_id,intro_price_subunits,currency,state,version)
 SELECT id,5000,'INR','published',1 FROM subscription_plans WHERE tier_key='pro' AND billing_cycle='monthly' AND currency='INR';
CREATE TABLE subscription_upgrades (
 purchase_group_id TEXT PRIMARY KEY REFERENCES subscription_purchase_groups(id),
 user_id TEXT NOT NULL REFERENCES app_users(user_id),
 source_subscription_id TEXT NOT NULL REFERENCES razorpay_subscriptions(provider_subscription_id),
 source_invoice_id TEXT NOT NULL REFERENCES payment_subscription_cycles(provider_invoice_id),
 state TEXT NOT NULL CHECK(state IN ('accepted','dispatching','uncertain','ready','paid','renewal_ready','completed','failed','review')),
 provider_order_id TEXT UNIQUE, receipt TEXT NOT NULL UNIQUE,
 replacement_request_id TEXT NOT NULL UNIQUE, replacement_subscription_id TEXT UNIQUE,
 source_cancelled_at TEXT, activated_at TEXT, lease_token TEXT, lease_until TEXT,
 last_error TEXT, last_checked_at TEXT, updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX subscription_upgrade_open_user ON subscription_upgrades(user_id) WHERE state NOT IN ('completed','failed');
CREATE UNIQUE INDEX subscription_upgrade_credit_once ON subscription_upgrades(source_invoice_id) WHERE state<>'failed';
CREATE INDEX subscription_upgrades_reconcile ON subscription_upgrades(state,updated_at);
CREATE TABLE subscription_upgrade_payments (
 payment_id TEXT PRIMARY KEY, purchase_group_id TEXT NOT NULL REFERENCES subscription_purchase_groups(id),
 provider_order_id TEXT NOT NULL, amount_subunits INTEGER NOT NULL, currency TEXT NOT NULL,
 status TEXT NOT NULL, amount_refunded INTEGER NOT NULL DEFAULT 0, dispute_state TEXT NOT NULL DEFAULT 'none',
 provider_created_at TEXT, verified_at TEXT NOT NULL
);
ALTER TABLE subscription_refund_obligations ADD COLUMN lease_token TEXT;
ALTER TABLE subscription_refund_obligations ADD COLUMN lease_until TEXT;
-- Retain legacy/recurring attribution and add the narrowly verified upgrade path.
DROP TRIGGER IF EXISTS trg_user_subscriptions_payment_attribution;
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
  JOIN payment_subscription_cycles c ON c.provider_invoice_id=u.source_invoice_id
  JOIN razorpay_subscriptions rs ON rs.id=c.razorpay_subscription_id
  JOIN razorpay_subscription_charges ch ON ch.provider_payment_id=c.provider_payment_id
  WHERE g.state='paid' AND g.user_id=NEW.user_id AND g.plan_id=NEW.plan_id AND u.user_id=g.user_id AND rs.user_id=g.user_id
   AND g.winning_payment_id=NEW.source_payment_id AND COALESCE(u.provider_order_id,g.id)=NEW.source_order_id
   AND json_extract(g.policy_snapshot_json,'$.quote.effectiveAt')=NEW.starts_at
   AND json_extract(g.policy_snapshot_json,'$.quote.nextRenewalAt')=NEW.ends_at
   AND c.status='verified' AND c.provider_mode='live' AND ch.refund_state='none' AND ch.dispute_state='none'
   AND ((p.status='captured' AND p.amount_subunits=g.quoted_amount_subunits AND p.currency=g.currency AND p.amount_refunded=0)
     OR (g.quoted_amount_subunits=0 AND g.winning_payment_id='credit_'||c.provider_payment_id AND ch.status='captured'))
 )) THEN RAISE(ABORT,'Razorpay access requires verified provider evidence') END;
END;
CREATE TRIGGER subscription_purchase_quotes_immutable BEFORE UPDATE OF user_id,plan_id,policy_snapshot_json,quoted_amount_subunits,currency ON subscription_purchase_groups
BEGIN SELECT RAISE(ABORT,'Accepted purchase quotes are immutable');END;
INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit) VALUES('0076','Immediate upgrade payments, credit reservation and replacement renewal coordination','subscription-upgrades');
