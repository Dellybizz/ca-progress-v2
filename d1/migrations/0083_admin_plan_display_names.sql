-- Store the chosen product defaults so names can subsequently be edited in admin.
-- Preserve every custom admin name and all prices, contracts and provider IDs.
UPDATE subscription_plans SET name=CASE tier_key WHEN 'free' THEN 'Explorer' WHEN 'basic' THEN 'Striver' WHEN 'pro' THEN 'Ranker' END
WHERE lower(trim(name))=tier_key AND tier_key IN ('free','basic','pro');
UPDATE plan_policy_versions SET name=CASE (SELECT tier_key FROM subscription_plans WHERE id=plan_id) WHEN 'free' THEN 'Explorer' WHEN 'basic' THEN 'Striver' WHEN 'pro' THEN 'Ranker' END
WHERE lower(trim(name))=(SELECT tier_key FROM subscription_plans WHERE id=plan_id)
AND (SELECT tier_key FROM subscription_plans WHERE id=plan_id) IN ('free','basic','pro');
INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit) VALUES('0083','admin managed plan display names','payment-system-p5');
