-- Phase 17: bounded, account/context-scoped mobile synchronization journal.
CREATE TABLE IF NOT EXISTS mobile_sync_entities (
  user_id TEXT NOT NULL,
  academic_context_key TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_version INTEGER NOT NULL DEFAULT 1,
  payload_json TEXT,
  deleted_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, academic_context_key, entity_type, entity_id)
);

CREATE TABLE IF NOT EXISTS mobile_sync_changes (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  academic_context_key TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_version INTEGER NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('upsert','delete')),
  payload_json TEXT,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mobile_sync_mutation_receipts (
  user_id TEXT NOT NULL,
  mutation_id TEXT NOT NULL,
  academic_context_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_json TEXT NOT NULL,
  response_status INTEGER NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_version INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, mutation_id)
);

CREATE INDEX IF NOT EXISTS idx_mobile_sync_changes_pull
  ON mobile_sync_changes(user_id, academic_context_key, sequence);
CREATE INDEX IF NOT EXISTS idx_mobile_sync_entities_bootstrap
  ON mobile_sync_entities(user_id, academic_context_key, entity_type, updated_at);
CREATE INDEX IF NOT EXISTS idx_mobile_sync_receipts_user_created
  ON mobile_sync_mutation_receipts(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_mobile_sync_changes_retention
  ON mobile_sync_changes(occurred_at, sequence);

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0065','mobile phase 17 server change journal and synchronization engine','b49443c6');
