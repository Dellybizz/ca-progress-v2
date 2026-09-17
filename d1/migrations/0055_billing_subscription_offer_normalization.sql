-- Billing subscription repair Phase 3: stable recurring plan + Razorpay Subscription Offer.
PRAGMA foreign_keys = ON;

ALTER TABLE plan_policy_offer_terms ADD COLUMN provider_offer_id TEXT;
ALTER TABLE plan_policy_offer_terms ADD COLUMN provider_offer_verified_at TEXT;
ALTER TABLE plan_policy_offer_terms ADD COLUMN provider_offer_snapshot_json TEXT NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS plan_policy_offer_provider_idx
  ON plan_policy_offer_terms(provider_offer_id)
  WHERE provider_offer_id IS NOT NULL;

CREATE TRIGGER IF NOT EXISTS trg_plan_policy_publish_provider_offer_validation
BEFORE UPDATE OF state ON plan_policy_versions
WHEN NEW.state='published'
BEGIN
  SELECT CASE WHEN EXISTS(
    SELECT 1
    FROM plan_policy_offer_terms ot
    WHERE ot.policy_version_id=NEW.id
      AND ot.intro_price_subunits IS NOT NULL
      AND (ot.provider_offer_id IS NULL OR ot.provider_offer_id NOT GLOB 'offer_*')
  ) THEN RAISE(ABORT,'Introductory subscription pricing requires a Razorpay Subscription Offer') END;
END;

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0055','normalize intro pricing onto stable Razorpay recurring plan plus subscription offer','hotfix/dark-mode-ae0cb36d');
