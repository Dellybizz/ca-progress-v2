-- CA Progress V2 — Admin Platform Phase 1
-- Unified immutable privileged-action audit ledger.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS admin_audit_events (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT NOT NULL,
  actor_role TEXT NOT NULL CHECK(actor_role IN ('moderator','admin','owner','parent_owner')),
  capability TEXT NOT NULL CHECK(length(capability) BETWEEN 3 AND 120),
  action TEXT NOT NULL CHECK(length(action) BETWEEN 1 AND 120),
  target_type TEXT NOT NULL CHECK(length(target_type) BETWEEN 1 AND 80),
  target_id TEXT,
  reason TEXT,
  previous_value TEXT,
  new_value TEXT,
  trace_id TEXT,
  reversible INTEGER NOT NULL DEFAULT 0 CHECK(reversible IN (0,1)),
  created_at TEXT NOT NULL,
  CHECK(target_id IS NULL OR length(target_id) <= 240),
  CHECK(reason IS NULL OR length(reason) <= 1000),
  CHECK(previous_value IS NULL OR json_valid(previous_value)),
  CHECK(new_value IS NULL OR json_valid(new_value))
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_recent ON admin_audit_events(created_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_actor ON admin_audit_events(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_target ON admin_audit_events(target_type, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_capability ON admin_audit_events(capability, created_at DESC);

CREATE TRIGGER IF NOT EXISTS trg_admin_audit_no_update
BEFORE UPDATE ON admin_audit_events
BEGIN
  SELECT RAISE(ABORT, 'Admin audit events are immutable.');
END;

CREATE TRIGGER IF NOT EXISTS trg_admin_audit_no_delete
BEFORE DELETE ON admin_audit_events
BEGIN
  SELECT RAISE(ABORT, 'Admin audit events cannot be deleted.');
END;

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0027','admin phase 1 capability security and immutable audit ledger','phase-12-operations-admin-platform');
