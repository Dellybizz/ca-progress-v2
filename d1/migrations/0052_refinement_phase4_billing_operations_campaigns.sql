-- Refinement P4 — billing operations, reconciliation and versioned campaigns.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS billing_reconciliation_runs (
  id TEXT PRIMARY KEY,
  trigger_kind TEXT NOT NULL CHECK(trigger_kind IN ('scheduled','admin','webhook')),
  state TEXT NOT NULL DEFAULT 'running' CHECK(state IN ('running','completed','partial','failed')),
  scanned_count INTEGER NOT NULL DEFAULT 0 CHECK(scanned_count>=0),
  queued_count INTEGER NOT NULL DEFAULT 0 CHECK(queued_count>=0),
  reconciled_count INTEGER NOT NULL DEFAULT 0 CHECK(reconciled_count>=0),
  mismatch_count INTEGER NOT NULL DEFAULT 0 CHECK(mismatch_count>=0),
  error_count INTEGER NOT NULL DEFAULT 0 CHECK(error_count>=0),
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata_json)),
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS billing_reconciliation_cases (
  id TEXT PRIMARY KEY,
  case_key TEXT NOT NULL UNIQUE,
  user_id TEXT REFERENCES app_users(user_id) ON DELETE SET NULL,
  razorpay_subscription_id TEXT REFERENCES razorpay_subscriptions(id) ON DELETE SET NULL,
  provider_subscription_id TEXT,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  reason_code TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning' CHECK(severity IN ('info','warning','critical')),
  state TEXT NOT NULL DEFAULT 'open' CHECK(state IN ('open','acknowledged','resolved')),
  expected_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(expected_json)),
  observed_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(observed_json)),
  first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  acknowledged_by TEXT REFERENCES app_users(user_id) ON DELETE SET NULL,
  acknowledged_at TEXT,
  resolved_by TEXT REFERENCES app_users(user_id) ON DELETE SET NULL,
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS billing_cases_state_seen_idx ON billing_reconciliation_cases(state,severity,last_seen_at DESC);
CREATE INDEX IF NOT EXISTS billing_cases_user_idx ON billing_reconciliation_cases(user_id,state,last_seen_at DESC);

CREATE TABLE IF NOT EXISTS billing_operational_alerts (
  id TEXT PRIMARY KEY,
  alert_key TEXT NOT NULL UNIQUE,
  reconciliation_case_id TEXT REFERENCES billing_reconciliation_cases(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES app_users(user_id) ON DELETE SET NULL,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK(severity IN ('info','warning','critical')),
  state TEXT NOT NULL DEFAULT 'open' CHECK(state IN ('open','acknowledged','resolved')),
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  acknowledged_by TEXT REFERENCES app_users(user_id) ON DELETE SET NULL,
  acknowledged_at TEXT,
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS billing_alerts_state_idx ON billing_operational_alerts(state,severity,updated_at DESC);

-- Execution/idempotency state only. Durable human audit remains admin_audit_events.
CREATE TABLE IF NOT EXISTS billing_operation_requests (
  request_key TEXT PRIMARY KEY,
  actor_user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE RESTRICT,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  confirmation_text TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'started' CHECK(state IN ('started','queued','completed','failed')),
  before_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(before_json)),
  result_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(result_json)),
  error_code TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS billing_ops_actor_idx ON billing_operation_requests(actor_user_id,created_at DESC);

CREATE TABLE IF NOT EXISTS billing_campaigns (
  id TEXT PRIMARY KEY,
  campaign_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_by TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS billing_campaign_versions (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES billing_campaigns(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK(version>0),
  state TEXT NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','published','retired')),
  campaign_type TEXT NOT NULL CHECK(campaign_type IN ('discount','intro','free_access','reward')),
  discount_kind TEXT NOT NULL DEFAULT 'none' CHECK(discount_kind IN ('none','fixed','percentage')),
  discount_value INTEGER NOT NULL DEFAULT 0 CHECK(discount_value>=0),
  provider_offer_id TEXT,
  promo_code TEXT,
  target_plan_id TEXT REFERENCES subscription_plans(id) ON DELETE RESTRICT,
  attempt_key TEXT,
  eligibility_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(eligibility_json)),
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  claim_starts_at TEXT NOT NULL,
  claim_ends_at TEXT NOT NULL,
  max_redemptions INTEGER CHECK(max_redemptions IS NULL OR max_redemptions>0),
  per_user_limit INTEGER NOT NULL DEFAULT 1 CHECK(per_user_limit>0),
  first_n_limit INTEGER CHECK(first_n_limit IS NULL OR first_n_limit>0),
  free_access_days INTEGER NOT NULL DEFAULT 0 CHECK(free_access_days>=0),
  discount_cycles INTEGER NOT NULL DEFAULT 1 CHECK(discount_cycles>0),
  require_allowlist INTEGER NOT NULL DEFAULT 0 CHECK(require_allowlist IN (0,1)),
  priority INTEGER NOT NULL DEFAULT 100,
  claimed_count INTEGER NOT NULL DEFAULT 0 CHECK(claimed_count>=0),
  change_reason TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at TEXT,
  retired_at TEXT,
  UNIQUE(campaign_id,version),
  CHECK(datetime(ends_at)>datetime(starts_at)),
  CHECK(datetime(claim_ends_at)>datetime(claim_starts_at)),
  CHECK((discount_kind='none' AND discount_value=0) OR discount_kind<>'none'),
  CHECK(discount_kind<>'percentage' OR discount_value<=10000),
  CHECK(provider_offer_id IS NULL OR provider_offer_id GLOB 'offer_*')
);
CREATE UNIQUE INDEX IF NOT EXISTS billing_campaign_promo_code_idx
  ON billing_campaign_versions(lower(promo_code)) WHERE promo_code IS NOT NULL AND state='published';
CREATE INDEX IF NOT EXISTS billing_campaign_live_idx ON billing_campaign_versions(state,claim_starts_at,claim_ends_at,priority);

CREATE TABLE IF NOT EXISTS billing_campaign_allowlist (
  campaign_version_id TEXT NOT NULL REFERENCES billing_campaign_versions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  added_by TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE RESTRICT,
  added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(campaign_version_id,user_id)
);

CREATE TABLE IF NOT EXISTS billing_campaign_claims (
  id TEXT PRIMARY KEY,
  claim_key TEXT NOT NULL UNIQUE,
  campaign_version_id TEXT NOT NULL REFERENCES billing_campaign_versions(id) ON DELETE RESTRICT,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  plan_id TEXT REFERENCES subscription_plans(id) ON DELETE RESTRICT,
  policy_version_id TEXT REFERENCES plan_policy_versions(id) ON DELETE RESTRICT,
  provider_offer_id TEXT,
  base_price_subunits INTEGER NOT NULL DEFAULT 0 CHECK(base_price_subunits>=0),
  campaign_adjustment_subunits INTEGER NOT NULL DEFAULT 0 CHECK(campaign_adjustment_subunits>=0),
  promo_adjustment_subunits INTEGER NOT NULL DEFAULT 0 CHECK(promo_adjustment_subunits>=0),
  admin_override_subunits INTEGER CHECK(admin_override_subunits IS NULL OR admin_override_subunits>=0),
  final_price_subunits INTEGER NOT NULL DEFAULT 0 CHECK(final_price_subunits>=0),
  discount_cycles INTEGER NOT NULL DEFAULT 1 CHECK(discount_cycles>0),
  grant_subscription_id TEXT REFERENCES user_subscriptions(id) ON DELETE SET NULL,
  provider_subscription_id TEXT,
  state TEXT NOT NULL DEFAULT 'reserved' CHECK(state IN ('reserved','applied','failed','revoked')),
  reserved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  applied_at TEXT,
  failed_at TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata_json))
);
CREATE INDEX IF NOT EXISTS billing_claims_campaign_state_idx ON billing_campaign_claims(campaign_version_id,state,reserved_at DESC);
CREATE INDEX IF NOT EXISTS billing_claims_user_idx ON billing_campaign_claims(user_id,state,reserved_at DESC);

CREATE TRIGGER IF NOT EXISTS billing_campaign_claim_validate
BEFORE INSERT ON billing_campaign_claims
BEGIN
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM billing_campaign_versions cv JOIN billing_campaigns c ON c.id=cv.campaign_id
    WHERE cv.id=NEW.campaign_version_id AND cv.state='published' AND c.active=1
      AND datetime('now') BETWEEN datetime(cv.claim_starts_at) AND datetime(cv.claim_ends_at)
      AND datetime('now') BETWEEN datetime(cv.starts_at) AND datetime(cv.ends_at)
      AND (cv.target_plan_id IS NULL OR cv.target_plan_id=NEW.plan_id)
      AND (cv.max_redemptions IS NULL OR cv.claimed_count<cv.max_redemptions)
      AND (cv.first_n_limit IS NULL OR cv.claimed_count<cv.first_n_limit)
      AND (cv.require_allowlist=0 OR EXISTS(SELECT 1 FROM billing_campaign_allowlist a WHERE a.campaign_version_id=cv.id AND a.user_id=NEW.user_id))
      AND (cv.attempt_key IS NULL OR EXISTS(SELECT 1 FROM profiles p WHERE p.user_id=NEW.user_id AND p.attempt_key=cv.attempt_key))
      AND (SELECT COUNT(*) FROM billing_campaign_claims prior WHERE prior.campaign_version_id=cv.id AND prior.user_id=NEW.user_id AND prior.state IN ('reserved','applied')) < cv.per_user_limit
  ) THEN RAISE(ABORT,'campaign_claim_ineligible_or_exhausted') END;
END;

CREATE TRIGGER IF NOT EXISTS billing_campaign_claim_count_insert
AFTER INSERT ON billing_campaign_claims WHEN NEW.state IN ('reserved','applied')
BEGIN
  UPDATE billing_campaign_versions SET claimed_count=claimed_count+1 WHERE id=NEW.campaign_version_id;
END;

CREATE TRIGGER IF NOT EXISTS billing_campaign_claim_count_failed
AFTER UPDATE OF state ON billing_campaign_claims
WHEN OLD.state='reserved' AND NEW.state IN ('failed','revoked')
BEGIN
  UPDATE billing_campaign_versions SET claimed_count=MAX(0,claimed_count-1) WHERE id=NEW.campaign_version_id;
END;

ALTER TABLE razorpay_subscriptions ADD COLUMN campaign_claim_id TEXT REFERENCES billing_campaign_claims(id) ON DELETE SET NULL;
ALTER TABLE razorpay_subscriptions ADD COLUMN provider_offer_id TEXT;

CREATE INDEX IF NOT EXISTS razorpay_subscriptions_ops_idx ON razorpay_subscriptions(status,financial_state,last_reconciled_at);
CREATE INDEX IF NOT EXISTS razorpay_subscription_events_ops_idx ON razorpay_subscription_events(outcome,received_at DESC);

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0052','refinement P4 billing operations reconciliation and campaigns','hotfix/dark-mode-ae0cb36d');