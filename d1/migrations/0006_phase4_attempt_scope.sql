-- CA Progress V2 — Cloudflare migration Phase 4 compatibility repair
-- Align exam-attempt identity with the authoritative PostgreSQL schema.
-- Supabase permits the same attempt_key at different CA levels; the stable ID remains the source id.
-- This migration only resets partially copied SHADOW target rows. Source data and the failed-row audit ledger are untouched.

DELETE FROM attempt_syllabus_map;
DROP TABLE attempt_syllabus_map;
DELETE FROM exam_attempts;
DROP TABLE exam_attempts;

CREATE TABLE exam_attempts (
  id TEXT PRIMARY KEY,
  level_id TEXT NOT NULL REFERENCES course_levels(id) ON DELETE RESTRICT,
  attempt_key TEXT NOT NULL,
  label TEXT NOT NULL,
  start_date TEXT,
  end_date TEXT,
  status TEXT NOT NULL CHECK(status IN ('scheduled','open','completed','cancelled')),
  verification_status TEXT NOT NULL CHECK(verification_status IN ('verified','pending_review','rejected')),
  verification_method TEXT NOT NULL CHECK(verification_method IN ('phase3_verified_bootstrap','official_sync','admin_review')),
  source_id TEXT REFERENCES icai_sources(id) ON DELETE RESTRICT,
  source_url TEXT NOT NULL,
  source_snapshot_id TEXT REFERENCES icai_source_snapshots(id) ON DELETE RESTRICT,
  content_hash TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  last_changed_at TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(level_id, attempt_key),
  CHECK(end_date IS NULL OR start_date IS NULL OR end_date >= start_date),
  CHECK(json_valid(metadata))
);

-- SQLite composite foreign keys require a matching unique parent key. PostgreSQL already
-- exposes the equivalent UNIQUE(subject_id,id) relationship on syllabus_versions.
CREATE UNIQUE INDEX IF NOT EXISTS syllabus_versions_subject_id_id_uq
  ON syllabus_versions(subject_id,id);

CREATE TABLE attempt_syllabus_map (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attempt_key TEXT NOT NULL,
  level_id TEXT NOT NULL,
  group_id TEXT NOT NULL REFERENCES course_groups(id) ON DELETE RESTRICT,
  subject_id TEXT NOT NULL,
  syllabus_version_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(level_id, attempt_key) REFERENCES exam_attempts(level_id, attempt_key) ON DELETE CASCADE,
  FOREIGN KEY(level_id) REFERENCES course_levels(id) ON DELETE RESTRICT,
  FOREIGN KEY(subject_id) REFERENCES subjects(id) ON DELETE RESTRICT,
  FOREIGN KEY(subject_id, syllabus_version_id) REFERENCES syllabus_versions(subject_id, id) ON DELETE RESTRICT,
  UNIQUE(attempt_key, syllabus_version_id)
);

-- The first live Phase 4 attempt exposed the overly strict D1 key after four rows had been
-- recorded in phase4_migration_failures. Keep those audit rows, but restart only the two
-- affected copy checkpoints so the normal idempotent upsert path retries every source row.
UPDATE phase4_migration_checkpoints
SET next_offset = 0,
    migrated_count = 0,
    failed_count = 0,
    target_hash = NULL,
    status = 'pending',
    updated_at = CURRENT_TIMESTAMP
WHERE source_table IN ('exam_attempts','attempt_syllabus_map');

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0006','phase 4 level-scoped exam attempt compatibility repair','71968e00466ab647b9dbb4265a90b59f266a8de6');
