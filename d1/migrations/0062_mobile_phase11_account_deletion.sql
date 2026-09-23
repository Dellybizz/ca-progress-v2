PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS account_deletion_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','cancelled','processing','completed','blocked')),
  requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  scheduled_for TEXT NOT NULL,
  cancelled_at TEXT,
  completed_at TEXT,
  retention_note TEXT NOT NULL DEFAULT 'Payment, tax, fraud-prevention and immutable audit evidence may be retained where legally required.'
);
CREATE INDEX IF NOT EXISTS idx_account_deletion_due ON account_deletion_requests(status,scheduled_for);
CREATE UNIQUE INDEX IF NOT EXISTS idx_account_deletion_one_open ON account_deletion_requests(user_id) WHERE status IN ('scheduled','processing');

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0062','mobile phase 11 account deletion requests','mobile-phase10-store-billing');
