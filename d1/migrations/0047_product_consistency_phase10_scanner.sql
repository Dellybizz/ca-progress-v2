-- Product Consistency Programme Phase 10: durable consistency scans and guarded repairs.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS consistency_scan_runs (
  id TEXT PRIMARY KEY,
  trigger_type TEXT NOT NULL CHECK(trigger_type IN ('scheduled','manual','deployment')),
  status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running','completed','failed')),
  checks_total INTEGER NOT NULL DEFAULT 0,
  findings_total INTEGER NOT NULL DEFAULT 0,
  critical_total INTEGER NOT NULL DEFAULT 0,
  started_by TEXT,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  error_summary TEXT
);

CREATE TABLE IF NOT EXISTS consistency_findings (
  id TEXT PRIMARY KEY,
  scan_id TEXT NOT NULL REFERENCES consistency_scan_runs(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,
  check_key TEXT NOT NULL,
  severity TEXT NOT NULL CHECK(severity IN ('info','warning','critical')),
  affected_scope TEXT NOT NULL,
  summary TEXT NOT NULL,
  evidence_json TEXT NOT NULL DEFAULT '{}',
  proposed_resolution TEXT NOT NULL,
  repair_preview TEXT,
  safe_auto_fix TEXT CHECK(safe_auto_fix IN ('stale_job_fail')),
  state TEXT NOT NULL DEFAULT 'open' CHECK(state IN ('open','acknowledged','resolved')),
  acknowledged_by TEXT REFERENCES app_users(user_id) ON DELETE SET NULL,
  acknowledged_at TEXT,
  acknowledgement_note TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(json_valid(evidence_json)),
  UNIQUE(scan_id,fingerprint)
);

CREATE TABLE IF NOT EXISTS consistency_repair_receipts (
  idempotency_key TEXT PRIMARY KEY,
  finding_id TEXT NOT NULL REFERENCES consistency_findings(id) ON DELETE RESTRICT,
  repair_key TEXT NOT NULL,
  actor_user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE RESTRICT,
  result_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(json_valid(result_json))
);

CREATE INDEX IF NOT EXISTS consistency_scan_runs_recent_idx ON consistency_scan_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS consistency_findings_report_idx ON consistency_findings(state,severity,created_at DESC);
CREATE INDEX IF NOT EXISTS consistency_findings_scan_idx ON consistency_findings(scan_id,severity);
CREATE TRIGGER IF NOT EXISTS consistency_repair_receipts_no_update BEFORE UPDATE ON consistency_repair_receipts BEGIN SELECT RAISE(ABORT,'consistency repair receipts are immutable'); END;
CREATE TRIGGER IF NOT EXISTS consistency_repair_receipts_no_delete BEFORE DELETE ON consistency_repair_receipts BEGIN SELECT RAISE(ABORT,'consistency repair receipts are immutable'); END;

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0047','product consistency phase 10 automated consistency scanner','phase-12-operations-admin-platform');
