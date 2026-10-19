-- Once per student, across tiers. Consumption follows verified actual discount,
-- not mandate authorization, a quoted discount, or full-price offer fallback.
CREATE TABLE IF NOT EXISTS student_introductory_consumptions (
 user_id TEXT PRIMARY KEY REFERENCES app_users(user_id) ON DELETE CASCADE,
 payment_id TEXT NOT NULL,
 source TEXT NOT NULL CHECK(source IN ('subscription_cycle','independent_purchase','legacy_order')),
 consumed_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT INTO student_introductory_consumptions(user_id,payment_id,source)
 SELECT s.user_id,c.provider_payment_id,'subscription_cycle'
 FROM payment_subscription_cycles c JOIN razorpay_subscriptions s ON s.id=c.razorpay_subscription_id
 WHERE c.status IN ('verified','refunded') AND c.provider_payment_id IS NOT NULL
 AND c.amount_subunits>0 AND c.amount_subunits<s.recurring_price_subunits
 AND s.intro_billing_cycles>0 AND c.cycle_number<=s.intro_billing_cycles
 AND s.billing_cycle='monthly' AND s.campaign_claim_id IS NULL AND c.currency=s.currency ON CONFLICT(user_id) DO NOTHING;
CREATE TRIGGER IF NOT EXISTS intro_consumption_cycle_insert AFTER INSERT ON payment_subscription_cycles
 WHEN NEW.status IN ('verified','refunded') AND NEW.provider_payment_id IS NOT NULL
 BEGIN
 INSERT INTO student_introductory_consumptions(user_id,payment_id,source)
 SELECT s.user_id,NEW.provider_payment_id,'subscription_cycle' FROM razorpay_subscriptions s
 WHERE s.id=NEW.razorpay_subscription_id AND s.billing_cycle='monthly' AND s.campaign_claim_id IS NULL
 AND NEW.amount_subunits>0 AND NEW.amount_subunits<s.recurring_price_subunits
 AND s.intro_billing_cycles>0 AND NEW.cycle_number<=s.intro_billing_cycles AND NEW.currency=s.currency ON CONFLICT(user_id) DO NOTHING;
 END;
CREATE TRIGGER IF NOT EXISTS intro_consumption_cycle_update AFTER UPDATE ON payment_subscription_cycles
 WHEN NEW.status IN ('verified','refunded') AND NEW.provider_payment_id IS NOT NULL
 BEGIN
 INSERT INTO student_introductory_consumptions(user_id,payment_id,source)
 SELECT s.user_id,NEW.provider_payment_id,'subscription_cycle' FROM razorpay_subscriptions s
 WHERE s.id=NEW.razorpay_subscription_id AND s.billing_cycle='monthly' AND s.campaign_claim_id IS NULL
 AND NEW.amount_subunits>0 AND NEW.amount_subunits<s.recurring_price_subunits
 AND s.intro_billing_cycles>0 AND NEW.cycle_number<=s.intro_billing_cycles AND NEW.currency=s.currency ON CONFLICT(user_id) DO NOTHING;
 END;
INSERT INTO student_introductory_consumptions(user_id,payment_id,source)
 SELECT g.user_id,g.winning_payment_id,'independent_purchase' FROM subscription_purchase_groups g
 WHERE g.winning_payment_id IS NOT NULL
 AND (json_extract(g.policy_snapshot_json,'$.kind')='intro' OR json_extract(g.policy_snapshot_json,'$.quote.mode')='intro_full_month') ON CONFLICT(user_id) DO NOTHING;
CREATE TRIGGER IF NOT EXISTS intro_consumption_purchase_update AFTER UPDATE OF winning_payment_id ON subscription_purchase_groups
 WHEN NEW.winning_payment_id IS NOT NULL
 AND (json_extract(NEW.policy_snapshot_json,'$.kind')='intro' OR json_extract(NEW.policy_snapshot_json,'$.quote.mode')='intro_full_month')
 BEGIN
 INSERT INTO student_introductory_consumptions(user_id,payment_id,source)
 VALUES(NEW.user_id,NEW.winning_payment_id,'independent_purchase') ON CONFLICT(user_id) DO NOTHING;
 END;
INSERT INTO student_introductory_consumptions(user_id,payment_id,source)
 SELECT po.user_id,po.provider_payment_id,'legacy_order' FROM payment_orders po
 JOIN payment_order_offer_snapshots snap ON snap.payment_order_id=po.id
 WHERE po.status IN ('paid','refunded') AND po.provider_payment_id IS NOT NULL
 AND snap.intro_applied=1 AND snap.charged_price_subunits<snap.recurring_price_subunits ON CONFLICT(user_id) DO NOTHING;
CREATE TRIGGER IF NOT EXISTS intro_consumption_legacy_update AFTER UPDATE OF status ON payment_orders
 WHEN NEW.status='paid' AND NEW.provider_payment_id IS NOT NULL
 BEGIN
 INSERT INTO student_introductory_consumptions(user_id,payment_id,source)
 SELECT NEW.user_id,NEW.provider_payment_id,'legacy_order' FROM payment_order_offer_snapshots snap
 WHERE snap.payment_order_id=NEW.id AND snap.intro_applied=1
 AND snap.charged_price_subunits<snap.recurring_price_subunits ON CONFLICT(user_id) DO NOTHING;
 END;
-- Capture itself consumes eligibility, including abandoned purchases later refunded.
CREATE TRIGGER IF NOT EXISTS intro_consumption_independent_capture AFTER INSERT ON subscription_upgrade_payments
 WHEN NEW.status='captured'
 BEGIN
 INSERT INTO student_introductory_consumptions(user_id,payment_id,source)
 SELECT g.user_id,NEW.payment_id,'independent_purchase' FROM subscription_purchase_groups g
 WHERE g.id=NEW.purchase_group_id
 AND (json_extract(g.policy_snapshot_json,'$.kind')='intro' OR json_extract(g.policy_snapshot_json,'$.quote.mode')='intro_full_month') ON CONFLICT(user_id) DO NOTHING;
 END;
CREATE TRIGGER IF NOT EXISTS intro_consumption_purchase_insert AFTER INSERT ON subscription_purchase_groups
 WHEN NEW.winning_payment_id IS NOT NULL
 AND (json_extract(NEW.policy_snapshot_json,'$.kind')='intro' OR json_extract(NEW.policy_snapshot_json,'$.quote.mode')='intro_full_month')
 BEGIN
 INSERT INTO student_introductory_consumptions(user_id,payment_id,source)
 VALUES(NEW.user_id,NEW.winning_payment_id,'independent_purchase') ON CONFLICT(user_id) DO NOTHING;
 END;
CREATE TRIGGER IF NOT EXISTS intro_consumption_legacy_snapshot AFTER INSERT ON payment_order_offer_snapshots
 WHEN NEW.intro_applied=1 AND NEW.charged_price_subunits<NEW.recurring_price_subunits
 BEGIN
 INSERT INTO student_introductory_consumptions(user_id,payment_id,source)
 SELECT po.user_id,po.provider_payment_id,'legacy_order' FROM payment_orders po
 WHERE po.id=NEW.payment_order_id AND po.status IN ('paid','refunded') AND po.provider_payment_id IS NOT NULL ON CONFLICT(user_id) DO NOTHING;
 END;
INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
 VALUES('0085','Permanent student-wide verified introductory offer consumption','payment-rules-phase1');
