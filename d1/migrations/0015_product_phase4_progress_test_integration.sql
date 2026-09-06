-- CA Progress revised product plan — Product Phase 4
-- Progress, revision and test-state integration.
-- Phase 5 owns append-only retake history; this table stores only the current T1/T2 milestone record.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS test_stage_records (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  test_stage TEXT NOT NULL CHECK(test_stage IN ('test_1','test_2')),
  marks_scored REAL NOT NULL CHECK(marks_scored >= 0),
  marks_total REAL NOT NULL CHECK(marks_total > 0),
  completed_at TEXT NOT NULL,
  progress_event_id TEXT UNIQUE REFERENCES progress_events(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id,chapter_id,test_stage),
  CHECK(marks_scored <= marks_total)
);

CREATE INDEX IF NOT EXISTS idx_test_stage_records_owner_chapter
  ON test_stage_records(user_id,chapter_id,test_stage);

-- Keep the prerequisite graph true even if a future caller bypasses the HTTP route.
CREATE TRIGGER IF NOT EXISTS trg_phase4_progress_insert_guard
BEFORE INSERT ON chapter_progress
WHEN (NEW.revision_1_at IS NOT NULL AND NEW.completed_at IS NULL)
   OR (NEW.revision_2_at IS NOT NULL AND NEW.revision_1_at IS NULL)
   OR (NEW.test_1_at IS NOT NULL AND NEW.completed_at IS NULL)
   OR (NEW.test_2_at IS NOT NULL AND NEW.test_1_at IS NULL)
BEGIN
  SELECT RAISE(ABORT,'Invalid progress transition.');
END;

CREATE TRIGGER IF NOT EXISTS trg_phase4_progress_update_guard
BEFORE UPDATE OF completed_at,revision_1_at,revision_2_at,test_1_at,test_2_at ON chapter_progress
WHEN (NEW.revision_1_at IS NOT NULL AND NEW.completed_at IS NULL)
   OR (NEW.revision_2_at IS NOT NULL AND NEW.revision_1_at IS NULL)
   OR (NEW.test_1_at IS NOT NULL AND NEW.completed_at IS NULL)
   OR (NEW.test_2_at IS NOT NULL AND NEW.test_1_at IS NULL)
BEGIN
  SELECT RAISE(ABORT,'Invalid progress transition.');
END;

-- Once a marks record owns a test milestone, generic progress toggles may not clear it.
-- The dedicated test recovery flow removes the owned record and reverts the event together.
CREATE TRIGGER IF NOT EXISTS trg_phase4_test1_backed_progress_guard
BEFORE UPDATE OF test_1_at ON chapter_progress
WHEN OLD.test_1_at IS NOT NULL AND NEW.test_1_at IS NULL
 AND EXISTS (
   SELECT 1 FROM test_stage_records r
   WHERE r.user_id=OLD.user_id AND r.chapter_id=OLD.chapter_id AND r.test_stage='test_1'
 )
BEGIN
  SELECT RAISE(ABORT,'Saved Test 1 record must be removed before clearing progress.');
END;

CREATE TRIGGER IF NOT EXISTS trg_phase4_test2_backed_progress_guard
BEFORE UPDATE OF test_2_at ON chapter_progress
WHEN OLD.test_2_at IS NOT NULL AND NEW.test_2_at IS NULL
 AND EXISTS (
   SELECT 1 FROM test_stage_records r
   WHERE r.user_id=OLD.user_id AND r.chapter_id=OLD.chapter_id AND r.test_stage='test_2'
 )
BEGIN
  SELECT RAISE(ABORT,'Saved Test 2 record must be removed before clearing progress.');
END;

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0015','product phase 4 progress revision and test-state integration','46b04d58fa49577606f2ad1edd97cb5e042c6f82');