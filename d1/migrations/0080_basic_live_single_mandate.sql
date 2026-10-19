-- Operator supplied this live Basic UPI Subscription Offer and requested activation.
-- Attach only to the current eligible policy; never change existing contracts.
CREATE TABLE _basic_mandate_activation_guard (matched INTEGER CHECK(matched=1));
INSERT INTO _basic_mandate_activation_guard
SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM subscription_plans WHERE tier_key='basic' AND billing_cycle='monthly')
THEN 1 ELSE COUNT(*) END FROM subscription_plans sp
JOIN plan_policy_versions pv ON pv.plan_id=sp.id
JOIN subscription_upgrade_offers o ON o.plan_id=sp.id
WHERE sp.tier_key='basic' AND sp.billing_cycle='monthly' AND sp.active=1
AND sp.checkout_enabled=1 AND pv.price_subunits=5000 AND pv.currency='INR'
AND pv.trial_days=0 AND pv.billing_duration_value=1 AND pv.billing_duration_unit='month'
AND o.state='published' AND o.intro_price_subunits=2500 AND o.currency='INR'
AND pv.state='published' AND (pv.effective_at IS NULL OR pv.effective_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now'))
AND pv.id=(SELECT p.id FROM plan_policy_versions p WHERE p.plan_id=sp.id AND p.state='published'
AND (p.effective_at IS NULL OR p.effective_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now'))
ORDER BY COALESCE(p.effective_at,p.published_at,p.created_at) DESC,p.version DESC LIMIT 1);

INSERT INTO subscription_mandate_offers
(plan_id,payment_method,policy_version_id,provider_offer_id,intro_price_subunits,recurring_price_subunits,currency,evidence_reference,verified_by,verified_at)
SELECT sp.id,'upi',pv.id,'offer_TmiyM56nUFR5PJ',2500,5000,'INR',
'https://dashboard.razorpay.com/app/offers/offer_TmiyM56nUFR5PJ; operator-created Basic offer, activation requested 2026-10-12',
'operator-authorized-deployment',strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM subscription_plans sp JOIN plan_policy_versions pv ON pv.plan_id=sp.id
WHERE sp.tier_key='basic' AND sp.billing_cycle='monthly' AND sp.active=1
AND pv.id=(SELECT p.id FROM plan_policy_versions p WHERE p.plan_id=sp.id AND p.state='published'
AND (p.effective_at IS NULL OR p.effective_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now'))
ORDER BY COALESCE(p.effective_at,p.published_at,p.created_at) DESC,p.version DESC LIMIT 1)
ON CONFLICT(plan_id,payment_method) DO UPDATE SET
policy_version_id=excluded.policy_version_id,provider_offer_id=excluded.provider_offer_id,
intro_price_subunits=excluded.intro_price_subunits,recurring_price_subunits=excluded.recurring_price_subunits,
currency=excluded.currency,evidence_reference=excluded.evidence_reference,
verified_by=excluded.verified_by,verified_at=excluded.verified_at;
DROP TABLE _basic_mandate_activation_guard;
INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES('0080','Operator-authorized live Basic UPI single-mandate offer activation','basic-live-offer-TmiyM56nUFR5PJ');
