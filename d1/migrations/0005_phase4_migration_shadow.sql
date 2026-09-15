-- CA Progress V2 — Cloudflare migration Phase 4
-- Production-shadow migration bookkeeping, operational parity and storage/shadow verification.
-- This migration does NOT switch production reads/writes to D1 and does NOT retire Supabase.
PRAGMA foreign_keys = ON;

-- Source operational/admin tables that were outside the Phase 2 data-domain schema.
CREATE TABLE IF NOT EXISTS admin_users (
  user_id TEXT PRIMARY KEY REFERENCES app_users(user_id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('moderator','admin','owner','parent_owner')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  granted_by TEXT REFERENCES app_users(user_id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id INTEGER PRIMARY KEY,
  actor_user_id TEXT REFERENCES app_users(user_id) ON DELETE SET NULL,
  actor_role TEXT NOT NULL,
  action_key TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  request_id TEXT NOT NULL,
  before_state TEXT NOT NULL DEFAULT '{}',
  after_state TEXT NOT NULL DEFAULT '{}',
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(json_valid(before_state)), CHECK(json_valid(after_state)), CHECK(json_valid(metadata))
);
CREATE TABLE IF NOT EXISTS feature_flags (
  flag_key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  updated_by TEXT REFERENCES app_users(user_id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS maintenance_settings (
  id INTEGER PRIMARY KEY CHECK(id IN (0,1)),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  message TEXT NOT NULL,
  starts_at TEXT,
  ends_at TEXT,
  updated_by TEXT REFERENCES app_users(user_id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS notification_templates (
  id TEXT PRIMARY KEY,
  template_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  updated_by TEXT REFERENCES app_users(user_id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Phase 12 profile fields already active on the Supabase source are preserved verbatim.
ALTER TABLE profiles ADD COLUMN primary_use TEXT;
ALTER TABLE profiles ADD COLUMN feature_guide_completed_at TEXT;
ALTER TABLE profiles ADD COLUMN primary_use_priority TEXT CHECK(primary_use_priority IS NULL OR json_valid(primary_use_priority));

CREATE TABLE IF NOT EXISTS phase4_migration_runs (
  run_id TEXT PRIMARY KEY,
  source_project TEXT NOT NULL,
  target_database_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('running','failed','reconciled','rolled_back')),
  source_fingerprint TEXT,
  target_fingerprint TEXT,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  failure_count INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '{}',
  CHECK(json_valid(notes))
);
CREATE TABLE IF NOT EXISTS phase4_migration_checkpoints (
  run_id TEXT NOT NULL REFERENCES phase4_migration_runs(run_id) ON DELETE CASCADE,
  source_table TEXT NOT NULL,
  target_table TEXT NOT NULL,
  next_offset INTEGER NOT NULL DEFAULT 0 CHECK(next_offset >= 0),
  source_count INTEGER,
  migrated_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  source_hash TEXT,
  target_hash TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','complete','failed','source_absent')),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(run_id,source_table,target_table)
);
CREATE TABLE IF NOT EXISTS phase4_migration_failures (
  run_id TEXT NOT NULL REFERENCES phase4_migration_runs(run_id) ON DELETE CASCADE,
  source_table TEXT NOT NULL,
  row_key TEXT NOT NULL,
  row_hash TEXT,
  error_code TEXT NOT NULL,
  error_message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(run_id,source_table,row_key)
);
CREATE TABLE IF NOT EXISTS phase4_storage_objects (
  source_bucket TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_object_id TEXT,
  owner_user_id TEXT,
  r2_bucket TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  size_bytes INTEGER,
  content_type TEXT,
  source_etag TEXT,
  sha256 TEXT,
  migrated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status TEXT NOT NULL CHECK(status IN ('copied','verified','failed')),
  PRIMARY KEY(source_bucket,source_name),
  UNIQUE(r2_bucket,r2_key)
);
CREATE TABLE IF NOT EXISTS phase4_shadow_comparisons (
  id TEXT PRIMARY KEY,
  request_key TEXT NOT NULL,
  domain TEXT NOT NULL,
  actor_hash TEXT,
  source_hash TEXT NOT NULL,
  target_hash TEXT NOT NULL,
  equivalent INTEGER NOT NULL CHECK(equivalent IN (0,1)),
  compared_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS phase4_shadow_equivalence_idx ON phase4_shadow_comparisons(domain,equivalent,compared_at);

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0005','phase 4 production-shadow migration bookkeeping and operational parity','7b1a5707231bff1fdeb2bb4cc4b1d364e3439eeb');
