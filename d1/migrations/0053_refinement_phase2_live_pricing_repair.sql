-- Refinement Phase 2 production repair: restore chargeable monthly pricing without rewriting published contracts.
-- Scope is deliberately narrow: only active monthly paid plans whose current published policy is below Razorpay's ₹1 minimum.
PRAGMA foreign_keys = ON;

-- Create a new immutable policy version. Existing published versions remain available to historical contracts.
INSERT OR IGNORE INTO plan_policy_versions(
  id,plan_id,version,state,name,description,price_subunits,currency,
  billing_duration_value,billing_duration_unit,trial_days,grace_days,
  effective_at,created_by,change_reason,created_at,published_at
)
SELECT
  'policy-0053-price-repair-' || sp.id,
  sp.id,
  COALESCE((SELECT MAX(v.version) FROM plan_policy_versions v WHERE v.plan_id=sp.id),0)+1,
  'published',
  source.name,
  source.description,
  CASE sp.tier_key WHEN 'basic' THEN 5000 WHEN 'pro' THEN 15000 END,
  'INR',
  1,
  'month',
  source.trial_days,
  source.grace_days,
  CURRENT_TIMESTAMP,
  source.created_by,
  'Repair legacy zero-priced monthly policy imported before paid checkout validation',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM subscription_plans sp
JOIN plan_policy_versions source ON source.id=(
  SELECT active.id
  FROM plan_policy_versions active
  WHERE active.plan_id=sp.id
    AND active.state='published'
    AND (active.effective_at IS NULL OR active.effective_at<=CURRENT_TIMESTAMP)
  ORDER BY COALESCE(active.effective_at,active.published_at,active.created_at) DESC,active.version DESC
  LIMIT 1
)
WHERE sp.active=1
  AND sp.billing_cycle='monthly'
  AND sp.tier_key IN ('basic','pro')
  AND (source.price_subunits IS NULL OR source.price_subunits<100);

-- Carry forward the exact page/feature entitlement contract from the prior published policy.
INSERT OR IGNORE INTO plan_policy_pages(policy_version_id,page_key,enabled)
SELECT repair.id,pages.page_key,pages.enabled
FROM subscription_plans sp
JOIN plan_policy_versions repair ON repair.id='policy-0053-price-repair-' || sp.id
JOIN plan_policy_versions source ON source.id=(
  SELECT previous.id
  FROM plan_policy_versions previous
  WHERE previous.plan_id=sp.id
    AND previous.id<>repair.id
    AND previous.state='published'
    AND (previous.effective_at IS NULL OR previous.effective_at<=CURRENT_TIMESTAMP)
  ORDER BY COALESCE(previous.effective_at,previous.published_at,previous.created_at) DESC,previous.version DESC
  LIMIT 1
)
JOIN plan_policy_pages pages ON pages.policy_version_id=source.id
WHERE sp.active=1 AND sp.billing_cycle='monthly' AND sp.tier_key IN ('basic','pro');

INSERT OR IGNORE INTO plan_policy_features(
  policy_version_id,page_key,feature_key,enabled,quantity_limit,time_limit_minutes,
  storage_limit_bytes,file_size_limit_bytes,reset_period,retention_days,
  upgrade_message,dependencies_json
)
SELECT repair.id,features.page_key,features.feature_key,features.enabled,
       features.quantity_limit,features.time_limit_minutes,features.storage_limit_bytes,
       features.file_size_limit_bytes,features.reset_period,features.retention_days,
       features.upgrade_message,features.dependencies_json
FROM subscription_plans sp
JOIN plan_policy_versions repair ON repair.id='policy-0053-price-repair-' || sp.id
JOIN plan_policy_versions source ON source.id=(
  SELECT previous.id
  FROM plan_policy_versions previous
  WHERE previous.plan_id=sp.id
    AND previous.id<>repair.id
    AND previous.state='published'
    AND (previous.effective_at IS NULL OR previous.effective_at<=CURRENT_TIMESTAMP)
  ORDER BY COALESCE(previous.effective_at,previous.published_at,previous.created_at) DESC,previous.version DESC
  LIMIT 1
)
JOIN plan_policy_features features ON features.policy_version_id=source.id
WHERE sp.active=1 AND sp.billing_cycle='monthly' AND sp.tier_key IN ('basic','pro');

-- Preserve an existing valid intro offer. The legacy Pro row had no usable offer, so restore the approved ₹25 first period / ₹50 recurring launch policy.
INSERT OR IGNORE INTO plan_policy_offer_terms(
  policy_version_id,intro_price_subunits,intro_billing_cycles,cancellation_mode,
  terms_note,updated_by,updated_at
)
SELECT
  repair.id,
  CASE
    WHEN old_terms.intro_price_subunits IS NOT NULL
      AND old_terms.intro_price_subunits<=repair.price_subunits
      THEN old_terms.intro_price_subunits
    WHEN sp.tier_key='basic' THEN 2500
    ELSE NULL
  END,
  CASE
    WHEN old_terms.intro_price_subunits IS NOT NULL
      AND old_terms.intro_price_subunits<=repair.price_subunits
      THEN old_terms.intro_billing_cycles
    WHEN sp.tier_key='basic' THEN 1
    ELSE 0
  END,
  COALESCE(old_terms.cancellation_mode,'period_end'),
  CASE
    WHEN sp.tier_key='basic' AND old_terms.intro_price_subunits IS NULL
      THEN 'Launch introductory price: first monthly period ₹25, then ₹50 recurring.'
    ELSE COALESCE(old_terms.terms_note,'')
  END,
  old_terms.updated_by,
  CURRENT_TIMESTAMP
FROM subscription_plans sp
JOIN plan_policy_versions repair ON repair.id='policy-0053-price-repair-' || sp.id
JOIN plan_policy_versions source ON source.id=(
  SELECT previous.id
  FROM plan_policy_versions previous
  WHERE previous.plan_id=sp.id
    AND previous.id<>repair.id
    AND previous.state='published'
    AND (previous.effective_at IS NULL OR previous.effective_at<=CURRENT_TIMESTAMP)
  ORDER BY COALESCE(previous.effective_at,previous.published_at,previous.created_at) DESC,previous.version DESC
  LIMIT 1
)
LEFT JOIN plan_policy_offer_terms old_terms ON old_terms.policy_version_id=source.id
WHERE sp.active=1 AND sp.billing_cycle='monthly' AND sp.tier_key IN ('basic','pro');

-- Point the explicit publication record at the repair version as well.
INSERT INTO plan_policy_publications(plan_id,policy_version_id,published_by,published_at)
SELECT sp.id,repair.id,NULL,CURRENT_TIMESTAMP
FROM subscription_plans sp
JOIN plan_policy_versions repair ON repair.id='policy-0053-price-repair-' || sp.id
WHERE sp.active=1 AND sp.billing_cycle='monthly' AND sp.tier_key IN ('basic','pro')
ON CONFLICT(plan_id) DO UPDATE SET
  policy_version_id=excluded.policy_version_id,
  published_by=excluded.published_by,
  published_at=excluded.published_at;

-- Only the legacy zero-price footprint is automatically re-enabled. A valid-priced plan that an admin disabled remains disabled.
UPDATE subscription_plans
SET checkout_enabled=1,updated_at=CURRENT_TIMESTAMP
WHERE active=1
  AND billing_cycle='monthly'
  AND tier_key IN ('basic','pro')
  AND (price_subunits IS NULL OR price_subunits<100)
  AND EXISTS(
    SELECT 1 FROM plan_policy_versions repair
    WHERE repair.id='policy-0053-price-repair-' || subscription_plans.id
  );

UPDATE subscription_plans
SET price_subunits=CASE tier_key WHEN 'basic' THEN 5000 WHEN 'pro' THEN 15000 END,
    currency='INR',
    duration_value=1,
    duration_unit='month',
    updated_at=CURRENT_TIMESTAMP
WHERE active=1
  AND billing_cycle='monthly'
  AND tier_key IN ('basic','pro')
  AND (price_subunits IS NULL OR price_subunits<100)
  AND EXISTS(
    SELECT 1 FROM plan_policy_versions repair
    WHERE repair.id='policy-0053-price-repair-' || subscription_plans.id
  );

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0053','repair legacy zero-priced monthly paid policies without overwriting configured pricing','hotfix/dark-mode-ae0cb36d');
