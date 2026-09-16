-- Refinement Phase 2 production closure: enable checkout only for the exact legacy plans repaired by migration 0053.
-- A deliberately disabled valid-priced plan is untouched unless 0053 created its deterministic repair policy.
PRAGMA foreign_keys = ON;

UPDATE subscription_plans
SET checkout_enabled=1,
    updated_at=CURRENT_TIMESTAMP
WHERE active=1
  AND billing_cycle='monthly'
  AND tier_key IN ('basic','pro')
  AND COALESCE(checkout_enabled,0)=0
  AND EXISTS (
    SELECT 1
    FROM plan_policy_versions repair
    WHERE repair.id='policy-0053-price-repair-' || subscription_plans.id
      AND repair.plan_id=subscription_plans.id
      AND repair.state='published'
      AND repair.price_subunits>=100
      AND repair.currency='INR'
      AND repair.billing_duration_value=1
      AND repair.billing_duration_unit='month'
      AND (repair.effective_at IS NULL OR repair.effective_at<=CURRENT_TIMESTAMP)
      AND repair.id=(
        SELECT active_policy.id
        FROM plan_policy_versions active_policy
        WHERE active_policy.plan_id=subscription_plans.id
          AND active_policy.state='published'
          AND (active_policy.effective_at IS NULL OR active_policy.effective_at<=CURRENT_TIMESTAMP)
        ORDER BY COALESCE(active_policy.effective_at,active_policy.published_at,active_policy.created_at) DESC,
                 active_policy.version DESC
        LIMIT 1
      )
  );

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0054','enable checkout only for active monthly plans repaired by policy 0053','hotfix/dark-mode-ae0cb36d');
