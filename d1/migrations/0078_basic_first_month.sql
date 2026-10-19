-- First-month Basic payments use the same independent, verified checkout as Pro.
-- Existing bank mandates retain their approved pricing and payment schedule.
INSERT INTO subscription_upgrade_offers(plan_id,intro_price_subunits,currency,state,version)
 SELECT id,2500,'INR','published',1 FROM subscription_plans WHERE tier_key='basic' AND billing_cycle='monthly' AND currency='INR'
 ON CONFLICT(plan_id) DO NOTHING;
INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit) VALUES('0078','Payment-method independent first-month Basic offer','basic-intro-purchases');
