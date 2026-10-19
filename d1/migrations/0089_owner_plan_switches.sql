-- Fresh mandates for scheduled downgrades; immediate paid replacements otherwise.
ALTER TABLE subscription_checkout_switches ADD COLUMN switch_kind TEXT NOT NULL DEFAULT 'immediate' CHECK(switch_kind IN ('immediate','downgrade'));
ALTER TABLE subscription_checkout_switches ADD COLUMN effective_at TEXT;
ALTER TABLE subscription_checkout_switches ADD COLUMN approved_at TEXT;
ALTER TABLE subscription_checkout_switches ADD COLUMN reversal_requested_at TEXT;
ALTER TABLE subscription_checkout_switches ADD COLUMN source_paid_count INTEGER;
ALTER TABLE subscription_checkout_switches ADD COLUMN source_paid_start TEXT;
CREATE INDEX subscription_switches_boundary ON subscription_checkout_switches(switch_kind,state,effective_at);
INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit) VALUES('0089','Owner approved mandate gated downgrades and immediate billing switches','payment-rules-phase3');
