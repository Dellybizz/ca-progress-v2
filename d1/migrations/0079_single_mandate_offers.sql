-- No live offer is invented or enabled by this migration.
CREATE TABLE IF NOT EXISTS subscription_mandate_offers (
 plan_id TEXT NOT NULL REFERENCES subscription_plans(id),
 payment_method TEXT NOT NULL CHECK(payment_method IN ('upi','card')),
 policy_version_id TEXT NOT NULL REFERENCES plan_policy_versions(id),
 provider_offer_id TEXT NOT NULL,
 intro_price_subunits INTEGER NOT NULL CHECK(intro_price_subunits>=100),
 recurring_price_subunits INTEGER NOT NULL CHECK(recurring_price_subunits>intro_price_subunits),
 currency TEXT NOT NULL DEFAULT 'INR' CHECK(currency='INR'),
 evidence_reference TEXT NOT NULL,
 verified_by TEXT NOT NULL,
 verified_at TEXT NOT NULL,
 PRIMARY KEY(plan_id,payment_method)
);
INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit) VALUES('0079','Method-specific single-mandate first-cycle offers','single-mandate-offers');
