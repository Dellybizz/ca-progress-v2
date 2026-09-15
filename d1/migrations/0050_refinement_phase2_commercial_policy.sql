-- Refinement Phase 2: commercial policy and pricing control centre.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS plan_policy_offer_terms (
  policy_version_id TEXT PRIMARY KEY REFERENCES plan_policy_versions(id) ON DELETE CASCADE,
  intro_price_subunits INTEGER CHECK(intro_price_subunits IS NULL OR intro_price_subunits >= 100),
  intro_billing_cycles INTEGER NOT NULL DEFAULT 0 CHECK(intro_billing_cycles BETWEEN 0 AND 24),
  cancellation_mode TEXT NOT NULL DEFAULT 'period_end' CHECK(cancellation_mode IN ('period_end','immediate_if_unpaid')),
  terms_note TEXT NOT NULL DEFAULT '',
  updated_by TEXT REFERENCES app_users(user_id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK((intro_price_subunits IS NULL AND intro_billing_cycles = 0) OR (intro_price_subunits IS NOT NULL AND intro_billing_cycles > 0))
);

INSERT OR IGNORE INTO plan_policy_offer_terms(
  policy_version_id,intro_price_subunits,intro_billing_cycles,cancellation_mode,terms_note,updated_by
)
SELECT id,NULL,0,'period_end','',created_by FROM plan_policy_versions;

CREATE TABLE IF NOT EXISTS payment_order_offer_snapshots (
  payment_order_id TEXT PRIMARY KEY REFERENCES payment_orders(id) ON DELETE CASCADE,
  policy_version_id TEXT NOT NULL REFERENCES plan_policy_versions(id) ON DELETE RESTRICT,
  charged_price_subunits INTEGER NOT NULL CHECK(charged_price_subunits >= 100),
  recurring_price_subunits INTEGER NOT NULL CHECK(recurring_price_subunits >= 100),
  currency TEXT NOT NULL,
  billing_cycle TEXT NOT NULL CHECK(billing_cycle IN ('monthly','annual')),
  duration_value INTEGER NOT NULL CHECK(duration_value > 0),
  duration_unit TEXT NOT NULL CHECK(duration_unit IN ('day','week','month','year')),
  trial_days INTEGER NOT NULL DEFAULT 0 CHECK(trial_days BETWEEN 0 AND 365),
  grace_days INTEGER NOT NULL DEFAULT 0 CHECK(grace_days BETWEEN 0 AND 90),
  intro_price_subunits INTEGER CHECK(intro_price_subunits IS NULL OR intro_price_subunits >= 100),
  intro_billing_cycles INTEGER NOT NULL DEFAULT 0 CHECK(intro_billing_cycles BETWEEN 0 AND 24),
  intro_applied INTEGER NOT NULL DEFAULT 0 CHECK(intro_applied IN (0,1)),
  cancellation_mode TEXT NOT NULL CHECK(cancellation_mode IN ('period_end','immediate_if_unpaid')),
  terms_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(json_valid(terms_json))
);

CREATE INDEX IF NOT EXISTS idx_payment_offer_snapshot_policy
  ON payment_order_offer_snapshots(policy_version_id,created_at DESC);

-- Defence in depth: a paid policy cannot become published with an invalid commercial contract.
CREATE TRIGGER IF NOT EXISTS trg_plan_policy_publish_commercial_validation
BEFORE UPDATE OF state ON plan_policy_versions
WHEN NEW.state='published'
BEGIN
  SELECT CASE WHEN EXISTS(
    SELECT 1 FROM subscription_plans sp
    WHERE sp.id=NEW.plan_id AND sp.tier_key<>'free'
      AND (NEW.price_subunits IS NULL OR NEW.price_subunits<100 OR NEW.currency<>'INR' OR NEW.billing_duration_value<=0 OR NEW.billing_duration_unit='lifetime')
  ) THEN RAISE(ABORT,'Paid policy has invalid recurring pricing or billing duration') END;
  SELECT CASE WHEN EXISTS(
    SELECT 1 FROM plan_policy_offer_terms ot
    WHERE ot.policy_version_id=NEW.id AND ot.intro_price_subunits IS NOT NULL
      AND (ot.intro_billing_cycles<=0 OR ot.intro_price_subunits>NEW.price_subunits)
  ) THEN RAISE(ABORT,'Introductory pricing is invalid for this policy') END;
END;

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0050','refinement phase 2 commercial policy pricing and immutable offer snapshots','hotfix/dark-mode-ae0cb36d');
