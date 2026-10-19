CREATE TABLE recurring_gifts (
 id TEXT PRIMARY KEY,purchaser_user_id TEXT NOT NULL REFERENCES app_users(user_id),recipient_user_id TEXT NOT NULL REFERENCES app_users(user_id),
 plan_id TEXT NOT NULL REFERENCES subscription_plans(id),request_key TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('offered','accepted','active','cancelled','rejected','expired','review')),
 accepted_at TEXT,activated_at TEXT,cancel_requested_at TEXT,cancelled_by TEXT,provider_subscription_id TEXT,
 created_at TEXT NOT NULL,updated_at TEXT NOT NULL,last_error TEXT,
 CHECK(purchaser_user_id<>recipient_user_id),UNIQUE(purchaser_user_id,request_key)
);
CREATE INDEX recurring_gifts_recipient ON recurring_gifts(recipient_user_id,state,created_at);
CREATE INDEX recurring_gifts_purchaser ON recurring_gifts(purchaser_user_id,created_at);
CREATE UNIQUE INDEX recurring_gifts_one_accepted ON recurring_gifts(recipient_user_id) WHERE state='accepted';
ALTER TABLE razorpay_subscriptions ADD COLUMN gift_id TEXT REFERENCES recurring_gifts(id);
ALTER TABLE subscription_checkout_switches ADD COLUMN source_owner_user_id TEXT;
CREATE TABLE recurring_gift_checkout_members (
 provider_subscription_id TEXT PRIMARY KEY,gift_id TEXT NOT NULL REFERENCES recurring_gifts(id),attempt_id TEXT NOT NULL UNIQUE REFERENCES payment_checkout_attempts(id),created_at TEXT NOT NULL
);
CREATE TABLE recurring_gift_stop_intents (
 source_subscription_id TEXT PRIMARY KEY REFERENCES razorpay_subscriptions(id),gift_id TEXT NOT NULL REFERENCES recurring_gifts(id),
 boundary_at TEXT,paid_count_before INTEGER NOT NULL,paid_start_before TEXT,requested_at TEXT NOT NULL,confirmed_at TEXT,last_error TEXT
);
CREATE TABLE recurring_gift_source_retirements (
 gift_id TEXT NOT NULL REFERENCES recurring_gifts(id),source_subscription_id TEXT NOT NULL REFERENCES razorpay_subscriptions(id),
 boundary_at TEXT NOT NULL,paid_count_before INTEGER NOT NULL,paid_start_before TEXT,
 state TEXT NOT NULL CHECK(state IN ('pending','closed')),last_error TEXT,lease_token TEXT,lease_until TEXT,
 PRIMARY KEY(gift_id,source_subscription_id)
);
CREATE TABLE billing_gift_projection_guards(token TEXT PRIMARY KEY,gift_id TEXT NOT NULL,recipient_user_id TEXT NOT NULL,source_subscription_id TEXT NOT NULL,ends_at TEXT NOT NULL);
CREATE TRIGGER validate_gift_projection BEFORE INSERT ON billing_gift_projection_guards BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM recurring_gifts g WHERE g.id=NEW.gift_id AND g.recipient_user_id=NEW.recipient_user_id AND g.accepted_at IS NOT NULL AND g.state IN ('accepted','active','cancelled','expired')) THEN RAISE(ABORT,'gift_acceptance_changed') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM recurring_gifts g WHERE g.id=NEW.gift_id AND g.state='cancelled' AND NOT EXISTS(SELECT 1 FROM recurring_gift_stop_intents i WHERE i.source_subscription_id=NEW.source_subscription_id AND i.paid_count_before>0 AND julianday(i.boundary_at)>=julianday(NEW.ends_at))) THEN RAISE(ABORT,'gift_cancellation_changed') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM recurring_gifts g JOIN subscription_plans target ON target.id=g.plan_id JOIN user_subscriptions us ON us.user_id=g.recipient_user_id JOIN subscription_plans current ON current.id=us.plan_id WHERE g.id=NEW.gift_id AND g.state='accepted' AND us.status IN ('active','paused','cancelled') AND julianday(us.starts_at)<=julianday('now') AND julianday(us.ends_at)>julianday('now') AND (CASE current.tier_key WHEN 'pro' THEN 2 WHEN 'basic' THEN 1 ELSE 0 END)>=(CASE target.tier_key WHEN 'pro' THEN 2 WHEN 'basic' THEN 1 ELSE 0 END) AND NOT EXISTS(SELECT 1 FROM razorpay_subscriptions s WHERE s.provider_subscription_id=us.provider_subscription_id AND s.gift_id=g.id)) THEN RAISE(ABORT,'gift_recipient_plan_changed') END;
END;
DROP TRIGGER IF EXISTS trg_user_subscriptions_payment_attribution;
CREATE TRIGGER trg_user_subscriptions_payment_attribution BEFORE INSERT ON user_subscriptions WHEN NEW.source='razorpay'
BEGIN
 SELECT CASE WHEN
 (NEW.provider_subscription_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM razorpay_subscriptions rs WHERE rs.provider_subscription_id=NEW.provider_subscription_id AND ((rs.gift_id IS NULL AND rs.user_id=NEW.user_id) OR EXISTS(SELECT 1 FROM recurring_gifts gift JOIN billing_gift_projection_guards guard ON guard.gift_id=gift.id AND guard.source_subscription_id=rs.id WHERE gift.id=rs.gift_id AND gift.purchaser_user_id=rs.user_id AND gift.recipient_user_id=NEW.user_id AND guard.recipient_user_id=NEW.user_id AND guard.ends_at=NEW.ends_at)) AND rs.plan_id=NEW.plan_id AND rs.provider_verified=1))
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

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit) VALUES('0091','Recurring gifted memberships separate payer and beneficiary roles','payment-rules-phase5');
