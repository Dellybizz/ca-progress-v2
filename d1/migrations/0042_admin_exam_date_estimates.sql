PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS admin_exam_date_estimates (
  level_code TEXT NOT NULL CHECK (level_code IN ('foundation','intermediate','final')),
  attempt_key TEXT NOT NULL,
  group_choice TEXT NOT NULL CHECK (group_choice IN ('group_1','group_2','both','not_applicable')),
  estimated_date TEXT NOT NULL CHECK (
    estimated_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    AND substr(estimated_date,1,7)=attempt_key
  ),
  note TEXT,
  entered_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (level_code,attempt_key,group_choice)
);

CREATE INDEX IF NOT EXISTS idx_admin_exam_date_estimates_attempt
  ON admin_exam_date_estimates(attempt_key,level_code,group_choice);

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0042','admin-managed provisional exam dates until official ICAI verification','phase-12-operations-admin-platform');
