-- Independent annual defaults. No existing policy, contract or mandate is overwritten.
-- These drafts require admin provider validation and publication before checkout.
INSERT OR IGNORE INTO subscription_plans(id,tier_key,billing_cycle,name,tagline,rank,price_subunits,currency,duration_value,duration_unit,active,checkout_enabled,sort_order)
 VALUES('striver-annual','basic','annual','Striver','Yearly AutoPay',1,50000,'INR',1,'year',1,1,21),
 ('ranker-annual','pro','annual','Ranker','Yearly AutoPay',2,125000,'INR',1,'year',1,1,31);
INSERT OR IGNORE INTO plan_policy_versions(id,plan_id,version,state,name,description,price_subunits,currency,billing_duration_value,billing_duration_unit,trial_days,grace_days,change_reason)
 SELECT 'owner-20261013-'||tier_key||'-annual',id,
 (SELECT COALESCE(MAX(version),0)+1 FROM plan_policy_versions WHERE plan_id=sp.id),
 'draft',name,'Yearly AutoPay',CASE tier_key WHEN 'basic' THEN 50000 ELSE 125000 END,
 'INR',1,'year',0,10,'Owner-approved annual AutoPay pricing: 13 October 2026'
 FROM subscription_plans sp WHERE billing_cycle='annual' AND tier_key IN ('basic','pro');
INSERT OR IGNORE INTO plan_policy_offer_terms(policy_version_id,intro_price_subunits,intro_billing_cycles,cancellation_mode,terms_note)
 SELECT id,NULL,0,'period_end','Renews yearly until cancelled.' FROM plan_policy_versions
 WHERE id IN ('owner-20261013-basic-annual','owner-20261013-pro-annual');
INSERT OR IGNORE INTO plan_policy_pages(policy_version_id,page_key,enabled)
 SELECT a.id,p.page_key,p.enabled FROM plan_policy_versions a
 JOIN subscription_plans annual ON annual.id=a.plan_id
 JOIN subscription_plans monthly ON monthly.tier_key=annual.tier_key AND monthly.billing_cycle='monthly'
 JOIN plan_policy_versions m ON m.plan_id=monthly.id AND m.state='published'
 JOIN plan_policy_pages p ON p.policy_version_id=m.id
 WHERE a.id IN ('owner-20261013-basic-annual','owner-20261013-pro-annual')
 AND m.id=(SELECT id FROM plan_policy_versions WHERE plan_id=monthly.id AND state='published' AND (effective_at IS NULL OR effective_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now')) ORDER BY COALESCE(effective_at,published_at,created_at) DESC,version DESC LIMIT 1);
INSERT OR IGNORE INTO plan_policy_features(policy_version_id,page_key,feature_key,enabled,quantity_limit,time_limit_minutes,storage_limit_bytes,file_size_limit_bytes,reset_period,retention_days,upgrade_message,dependencies_json)
 SELECT a.id,f.page_key,f.feature_key,f.enabled,f.quantity_limit,f.time_limit_minutes,f.storage_limit_bytes,f.file_size_limit_bytes,f.reset_period,f.retention_days,f.upgrade_message,f.dependencies_json
 FROM plan_policy_versions a JOIN subscription_plans annual ON annual.id=a.plan_id
 JOIN subscription_plans monthly ON monthly.tier_key=annual.tier_key AND monthly.billing_cycle='monthly'
 JOIN plan_policy_versions m ON m.plan_id=monthly.id AND m.state='published'
 JOIN plan_policy_features f ON f.policy_version_id=m.id
 WHERE a.id IN ('owner-20261013-basic-annual','owner-20261013-pro-annual')
 AND m.id=(SELECT id FROM plan_policy_versions WHERE plan_id=monthly.id AND state='published' AND (effective_at IS NULL OR effective_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now')) ORDER BY COALESCE(effective_at,published_at,created_at) DESC,version DESC LIMIT 1);
CREATE TRIGGER IF NOT EXISTS annual_intro_publish_validation BEFORE UPDATE OF state ON plan_policy_versions
 WHEN NEW.state='published'
 BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM subscription_plans sp JOIN plan_policy_offer_terms ot ON ot.policy_version_id=NEW.id
 WHERE sp.id=NEW.plan_id AND sp.billing_cycle='annual' AND ot.intro_price_subunits IS NOT NULL)
 THEN RAISE(ABORT,'Annual introductory discounts are disabled') END;
 END;
INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
 VALUES('0086','Admin editable Striver 500 Ranker 1250 annual AutoPay drafts','payment-rules-phase1');
