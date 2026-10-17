-- Restore the operator-approved Ranker offer in the standard checkout catalog.
-- Only repair the original missing terms, using its already verified UPI binding.
-- Existing subscription contracts and introductory consumption are untouched.
UPDATE plan_policy_offer_terms
SET intro_price_subunits=5000,intro_billing_cycles=1,
    provider_offer_id='offer_Tmm4dnEyOmuBaO',
    provider_offer_verified_at=(SELECT verified_at FROM subscription_mandate_offers WHERE policy_version_id=plan_policy_offer_terms.policy_version_id AND payment_method='upi'),
    provider_offer_snapshot_json='{"verification_mode":"dashboard_attestation_provider_enforced_at_authorisation","payment_method":"upi","expected_discount_subunits":10000,"minimum_amount_subunits":15000,"redemptions":1,"evidence":"operator-approved live Ranker offer; migration 0081"}',
    updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE policy_version_id='policy-0053-price-repair-d125a4ca-d670-4023-8863-dc172955f74a'
AND intro_price_subunits IS NULL AND intro_billing_cycles=0
AND EXISTS(SELECT 1 FROM plan_policy_versions pv JOIN subscription_plans sp ON sp.id=pv.plan_id
JOIN subscription_mandate_offers mo ON mo.policy_version_id=pv.id AND mo.plan_id=sp.id
WHERE pv.id=plan_policy_offer_terms.policy_version_id AND pv.state='published'
AND sp.tier_key='pro' AND sp.billing_cycle='monthly' AND pv.price_subunits=15000 AND pv.currency='INR'
AND pv.billing_duration_value=1 AND pv.billing_duration_unit='month' AND pv.trial_days=0
AND mo.payment_method='upi' AND mo.provider_offer_id='offer_Tmm4dnEyOmuBaO'
AND mo.intro_price_subunits=5000 AND mo.recurring_price_subunits=15000 AND mo.currency='INR'
AND mo.verified_at IS NOT NULL AND mo.verified_at<>''
AND pv.id=(SELECT id FROM plan_policy_versions WHERE plan_id=sp.id AND state='published'
AND (effective_at IS NULL OR effective_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now'))
ORDER BY COALESCE(effective_at,published_at,created_at) DESC,version DESC LIMIT 1));
INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES('0092','Restore approved Ranker first-month offer in standard checkout','ranker-standard-intro-offer');
