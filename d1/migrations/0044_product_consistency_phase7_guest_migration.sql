CREATE TABLE IF NOT EXISTS guest_account_migrations (
  id TEXT PRIMARY KEY,
  guest_id TEXT NOT NULL,
  account_user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running','needs_review','completed')),
  summary_json TEXT NOT NULL,
  conflict_count INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(guest_id,account_user_id)
);
CREATE TABLE IF NOT EXISTS guest_account_migration_items (
  migration_id TEXT NOT NULL REFERENCES guest_account_migrations(id) ON DELETE CASCADE,
  mutation_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(migration_id,mutation_id)
);
CREATE TABLE IF NOT EXISTS guest_account_migration_audit (
  id TEXT PRIMARY KEY,
  migration_id TEXT NOT NULL REFERENCES guest_account_migrations(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK(event_type IN ('started','resumed','needs_review','completed')),
  detail_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_guest_migration_account_status ON guest_account_migrations(account_user_id,status,updated_at);
CREATE TRIGGER IF NOT EXISTS guest_account_migration_audit_no_update BEFORE UPDATE ON guest_account_migration_audit BEGIN SELECT RAISE(ABORT,'guest migration audit is append-only'); END;
CREATE TRIGGER IF NOT EXISTS guest_account_migration_audit_no_delete BEFORE DELETE ON guest_account_migration_audit BEGIN SELECT RAISE(ABORT,'guest migration audit is append-only'); END;
INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0044','product consistency phase 7 guest-to-account preservation','product-consistency-phase6-offline');
