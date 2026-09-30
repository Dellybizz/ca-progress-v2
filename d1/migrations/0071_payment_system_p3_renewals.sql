PRAGMA foreign_keys=ON;
ALTER TABLE razorpay_subscriptions ADD COLUMN mandate_schedule_version TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE razorpay_subscriptions ADD COLUMN provider_end_at TEXT;
ALTER TABLE razorpay_subscriptions ADD COLUMN renewal_evidence_error TEXT;
ALTER TABLE razorpay_subscriptions ADD COLUMN checkout_payment_method TEXT CHECK(checkout_payment_method IS NULL OR checkout_payment_method IN ('upi','card','emandate'));
CREATE TABLE IF NOT EXISTS payment_subscription_cycles(
  provider_invoice_id TEXT PRIMARY KEY,
  razorpay_subscription_id TEXT NOT NULL REFERENCES razorpay_subscriptions(id) ON DELETE CASCADE,
  provider_subscription_id TEXT NOT NULL,
  cycle_number INTEGER NOT NULL CHECK(cycle_number>0),
  provider_payment_id TEXT UNIQUE,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  expected_amount_subunits INTEGER NOT NULL CHECK(expected_amount_subunits>=100),
  amount_subunits INTEGER NOT NULL CHECK(amount_subunits>=0),
  currency TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','verified','refunded','mismatch')),
  payment_method TEXT,
  provider_mode TEXT NOT NULL CHECK(provider_mode IN ('live','test')),
  verified_at TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE(provider_subscription_id,cycle_number),
  CHECK(ends_at>starts_at)
);
CREATE INDEX IF NOT EXISTS renewal_verified_periods ON payment_subscription_cycles(provider_subscription_id,status,ends_at);
INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES('0071','finite mandates and verified subscription invoice cycles','payment-system-p3');
