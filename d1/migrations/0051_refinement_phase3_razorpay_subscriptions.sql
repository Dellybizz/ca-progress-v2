-- Refinement Phase 3: Razorpay recurring subscription lifecycle.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS razorpay_plan_mappings (
  id TEXT PRIMARY KEY,
  policy_version_id TEXT NOT NULL REFERENCES plan_policy_versions(id) ON DELETE RESTRICT,
  internal_plan_id TEXT NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
  price_kind TEXT NOT NULL CHECK(price_kind IN ('recurring','intro')),
  provider_plan_id TEXT UNIQUE,
  period TEXT NOT NULL CHECK(period IN ('monthly','yearly')),
  interval_value INTEGER NOT NULL CHECK(interval_value > 0),
  amount_subunits INTEGER NOT NULL CHECK(amount_subunits >= 100),
  currency TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'creating' CHECK(state IN ('creating','ready','mismatch','failed','retired')),
  provider_snapshot_json TEXT NOT NULL DEFAULT '{}',
  sync_token TEXT,
  lease_until TEXT,
  last_checked_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(policy_version_id,price_kind),
  CHECK(json_valid(provider_snapshot_json))
);

CREATE TABLE IF NOT EXISTS razorpay_subscriptions (
  id TEXT PRIMARY KEY,
  checkout_key TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
  policy_version_id TEXT NOT NULL REFERENCES plan_policy_versions(id) ON DELETE RESTRICT,
  provider_subscription_id TEXT NOT NULL UNIQUE,
  provider_plan_id TEXT NOT NULL,
  recurring_provider_plan_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('created','authenticated','active','pending','halted','paused','cancelled','completed','expired')),
  financial_state TEXT NOT NULL DEFAULT 'unpaid' CHECK(financial_state IN ('unpaid','paid','failed','mismatch','refunded','disputed')),
  recurring_price_subunits INTEGER NOT NULL CHECK(recurring_price_subunits >= 100),
  initial_price_subunits INTEGER NOT NULL CHECK(initial_price_subunits >= 100),
  currency TEXT NOT NULL,
  billing_cycle TEXT NOT NULL CHECK(billing_cycle IN ('monthly','annual')),
  billing_duration_value INTEGER NOT NULL CHECK(billing_duration_value > 0),
  billing_duration_unit TEXT NOT NULL CHECK(billing_duration_unit IN ('month','year')),
  trial_days INTEGER NOT NULL DEFAULT 0 CHECK(trial_days BETWEEN 0 AND 365),
  grace_days INTEGER NOT NULL DEFAULT 0 CHECK(grace_days BETWEEN 0 AND 90),
  intro_billing_cycles INTEGER NOT NULL DEFAULT 0 CHECK(intro_billing_cycles BETWEEN 0 AND 24),
  intro_remaining_cycles INTEGER NOT NULL DEFAULT 0 CHECK(intro_remaining_cycles BETWEEN 0 AND 24),
  cancellation_mode TEXT NOT NULL CHECK(cancellation_mode IN ('period_end','immediate_if_unpaid')),
  total_count INTEGER NOT NULL CHECK(total_count > 0),
  paid_count INTEGER NOT NULL DEFAULT 0 CHECK(paid_count >= 0),
  remaining_count INTEGER CHECK(remaining_count IS NULL OR remaining_count >= 0),
  auth_attempts INTEGER NOT NULL DEFAULT 0 CHECK(auth_attempts >= 0),
  start_at TEXT,
  current_start TEXT,
  current_end TEXT,
  charge_at TEXT,
  ended_at TEXT,
  paid_through_at TEXT,
  grace_until TEXT,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0 CHECK(cancel_at_period_end IN (0,1)),
  scheduled_target_plan_id TEXT REFERENCES subscription_plans(id) ON DELETE RESTRICT,
  scheduled_target_policy_version_id TEXT REFERENCES plan_policy_versions(id) ON DELETE RESTRICT,
  scheduled_target_provider_plan_id TEXT,
  provider_verified INTEGER NOT NULL DEFAULT 0 CHECK(provider_verified IN (0,1)),
  provider_state_json TEXT NOT NULL DEFAULT '{}',
  linked_access_subscription_id TEXT REFERENCES user_subscriptions(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_reconciled_at TEXT,
  CHECK(json_valid(provider_state_json))
);

CREATE TABLE IF NOT EXISTS razorpay_subscription_events (
  id TEXT PRIMARY KEY,
  provider_event_id TEXT NOT NULL UNIQUE,
  razorpay_subscription_id TEXT REFERENCES razorpay_subscriptions(id) ON DELETE CASCADE,
  provider_subscription_id TEXT,
  provider_payment_id TEXT,
  provider_invoice_id TEXT,
  event_type TEXT NOT NULL,
  provider_created_at TEXT,
  payload_sha256 TEXT NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  outcome TEXT NOT NULL DEFAULT 'received' CHECK(outcome IN ('received','reconciled','ignored','mismatch','failed')),
  error_code TEXT,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at TEXT,
  CHECK(json_valid(evidence_json))
);

CREATE TABLE IF NOT EXISTS razorpay_subscription_charges (
  provider_payment_id TEXT PRIMARY KEY,
  razorpay_subscription_id TEXT NOT NULL REFERENCES razorpay_subscriptions(id) ON DELETE CASCADE,
  provider_subscription_id TEXT NOT NULL,
  provider_invoice_id TEXT,
  amount_subunits INTEGER NOT NULL CHECK(amount_subunits >= 0),
  currency TEXT NOT NULL,
  status TEXT NOT NULL,
  refund_state TEXT NOT NULL DEFAULT 'none' CHECK(refund_state IN ('none','partial','full','failed')),
  dispute_state TEXT NOT NULL DEFAULT 'none',
  provider_created_at TEXT,
  captured_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS subscription_action_requests (
  request_key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  razorpay_subscription_id TEXT NOT NULL REFERENCES razorpay_subscriptions(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK(action IN ('sync','pause','resume','cancel_period_end','cancel_immediate','change_plan')),
  target_plan_id TEXT REFERENCES subscription_plans(id) ON DELETE RESTRICT,
  state TEXT NOT NULL DEFAULT 'started' CHECK(state IN ('started','completed','failed')),
  effective_at TEXT,
  decision_json TEXT NOT NULL DEFAULT '{}',
  error_code TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  CHECK(json_valid(decision_json))
);

ALTER TABLE user_subscriptions ADD COLUMN provider_subscription_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_subscriptions_provider_subscription
  ON user_subscriptions(provider_subscription_id) WHERE provider_subscription_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_razorpay_subscriptions_user_state
  ON razorpay_subscriptions(user_id,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_razorpay_subscriptions_provider_plan
  ON razorpay_subscriptions(provider_plan_id,status);
CREATE INDEX IF NOT EXISTS idx_razorpay_subscription_events_subscription
  ON razorpay_subscription_events(provider_subscription_id,provider_created_at,received_at);
CREATE INDEX IF NOT EXISTS idx_razorpay_subscription_charges_subscription
  ON razorpay_subscription_charges(razorpay_subscription_id,provider_created_at DESC);

-- Paid access must be attributable either to a verified legacy Order settlement or
-- to a server-created, provider-verified recurring subscription.
DROP TRIGGER IF EXISTS trg_user_subscriptions_payment_attribution;
CREATE TRIGGER trg_user_subscriptions_payment_attribution
BEFORE INSERT ON user_subscriptions
WHEN NEW.source='razorpay'
BEGIN
  SELECT CASE WHEN
    (NEW.provider_subscription_id IS NOT NULL AND NOT EXISTS(
      SELECT 1 FROM razorpay_subscriptions rs
      WHERE rs.provider_subscription_id=NEW.provider_subscription_id
        AND rs.user_id=NEW.user_id AND rs.plan_id=NEW.plan_id AND rs.provider_verified=1
    ))
    OR
    (NEW.provider_subscription_id IS NULL AND NOT EXISTS(
      SELECT 1 FROM payment_orders po
      JOIN payment_events pe ON pe.payment_order_id=po.id AND pe.verified=1
      WHERE po.provider_order_id=NEW.source_order_id
        AND po.user_id=NEW.user_id AND po.plan_id=NEW.plan_id AND po.status='paid'
        AND (NEW.source_payment_id IS NULL OR po.provider_payment_id=NEW.source_payment_id)
    ))
  THEN RAISE(ABORT,'Razorpay access requires verified provider evidence') END;
END;

-- Provider-confirmed cycle-end plan movement closes the matching internal schedule.
-- This trigger is deliberately provider-state driven, so an out-of-order webhook cannot
-- mark a requested change applied until reconciliation actually changes the subscription plan.
CREATE TRIGGER IF NOT EXISTS trg_razorpay_subscription_plan_change_applied
AFTER UPDATE OF plan_id ON razorpay_subscriptions
WHEN OLD.plan_id<>NEW.plan_id
BEGIN
  UPDATE scheduled_plan_changes
  SET state='applied',applied_at=CURRENT_TIMESTAMP
  WHERE user_id=NEW.user_id AND to_plan_id=NEW.plan_id AND state='scheduled';
END;

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0051','refinement phase 3 Razorpay recurring subscription lifecycle','hotfix/dark-mode-ae0cb36d');
