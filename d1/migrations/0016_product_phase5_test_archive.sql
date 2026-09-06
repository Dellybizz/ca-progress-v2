-- CA Progress revised product plan — Product Phase 5
-- Append-only test archive, private test attachments and Mistake Journal.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS test_attempts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  test_stage TEXT NOT NULL CHECK(test_stage IN ('test_1','test_2')),
  attempt_number INTEGER NOT NULL CHECK(attempt_number >= 1),
  marks_scored REAL NOT NULL CHECK(marks_scored >= 0),
  marks_total REAL NOT NULL CHECK(marks_total > 0),
  percentage REAL NOT NULL CHECK(percentage >= 0 AND percentage <= 100),
  duration_minutes INTEGER CHECK(duration_minutes IS NULL OR (duration_minutes >= 1 AND duration_minutes <= 1440)),
  completed_at TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  progress_event_id TEXT REFERENCES progress_events(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id,chapter_id,test_stage,attempt_number),
  UNIQUE(user_id,idempotency_key),
  CHECK(marks_scored <= marks_total)
);

CREATE INDEX IF NOT EXISTS idx_test_attempts_owner_chapter_stage
  ON test_attempts(user_id,chapter_id,test_stage,attempt_number DESC);
CREATE INDEX IF NOT EXISTS idx_test_attempts_owner_subject_date
  ON test_attempts(user_id,subject_id,completed_at DESC);

CREATE TABLE IF NOT EXISTS test_attempt_mistakes (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES test_attempts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK(category IN (
    'conceptual','calculation','forgot_provision_formula','presentation','time_management',
    'didnt_revise','silly_mistake','didnt_understand_question','other'
  )),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_test_mistakes_owner_category
  ON test_attempt_mistakes(user_id,category,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_test_mistakes_attempt
  ON test_attempt_mistakes(attempt_id);

CREATE TABLE IF NOT EXISTS test_attempt_attachments (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES test_attempts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  attachment_kind TEXT NOT NULL CHECK(attachment_kind IN ('question_paper','my_answer_sheet','checked_paper','suggested_answer')),
  object_key TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK(size_bytes > 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_test_attachments_owner_attempt
  ON test_attempt_attachments(user_id,attempt_id,created_at DESC);

CREATE TABLE IF NOT EXISTS test_attachment_upload_intents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  attempt_id TEXT NOT NULL REFERENCES test_attempts(id) ON DELETE CASCADE,
  attachment_kind TEXT NOT NULL CHECK(attachment_kind IN ('question_paper','my_answer_sheet','checked_paper','suggested_answer')),
  object_key TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  expected_size_bytes INTEGER NOT NULL CHECK(expected_size_bytes > 0),
  status TEXT NOT NULL DEFAULT 'issued' CHECK(status IN ('issued','completed','failed','abandoned')),
  attachment_id TEXT REFERENCES test_attempt_attachments(id) ON DELETE SET NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_test_upload_intents_owner_status
  ON test_attachment_upload_intents(user_id,status,expires_at);

-- Preserve Phase 4 current milestone records as Attempt 1 history before Phase 5 takes over writes.
-- Phase 4 did not store duration, so legacy duration remains NULL instead of being fabricated.
INSERT OR IGNORE INTO test_attempts(
  id,user_id,subject_id,chapter_id,test_stage,attempt_number,marks_scored,marks_total,percentage,
  duration_minutes,completed_at,idempotency_key,progress_event_id,created_at
)
SELECT
  'phase4-' || r.id,
  r.user_id,
  c.subject_id,
  r.chapter_id,
  r.test_stage,
  1,
  r.marks_scored,
  r.marks_total,
  ROUND((r.marks_scored * 100.0) / r.marks_total, 2),
  NULL,
  r.completed_at,
  'phase4-' || r.id,
  r.progress_event_id,
  r.created_at
FROM test_stage_records r
JOIN chapters c ON c.id=r.chapter_id;

-- Historical attempts are immutable. Retakes must append a new row.
CREATE TRIGGER IF NOT EXISTS trg_phase5_test_attempt_no_update
BEFORE UPDATE ON test_attempts
BEGIN
  SELECT RAISE(ABORT,'Test attempts are immutable; create a new attempt.');
END;
CREATE TRIGGER IF NOT EXISTS trg_phase5_test_attempt_no_delete
BEFORE DELETE ON test_attempts
WHEN EXISTS (SELECT 1 FROM app_users u WHERE u.user_id=OLD.user_id)
BEGIN
  SELECT RAISE(ABORT,'Test attempts are append-only and cannot be deleted.');
END;
CREATE TRIGGER IF NOT EXISTS trg_phase5_test_mistake_no_update
BEFORE UPDATE ON test_attempt_mistakes
BEGIN
  SELECT RAISE(ABORT,'Mistake Journal history is immutable; append a new entry.');
END;

-- Once any historical attempt exists, generic progress clearing cannot erase the milestone.
CREATE TRIGGER IF NOT EXISTS trg_phase5_test1_attempt_progress_guard
BEFORE UPDATE OF test_1_at ON chapter_progress
WHEN OLD.test_1_at IS NOT NULL AND NEW.test_1_at IS NULL
 AND EXISTS (
   SELECT 1 FROM test_attempts a
   WHERE a.user_id=OLD.user_id AND a.chapter_id=OLD.chapter_id AND a.test_stage='test_1'
 )
BEGIN
  SELECT RAISE(ABORT,'Historical Test 1 attempts prevent clearing this milestone.');
END;
CREATE TRIGGER IF NOT EXISTS trg_phase5_test2_attempt_progress_guard
BEFORE UPDATE OF test_2_at ON chapter_progress
WHEN OLD.test_2_at IS NOT NULL AND NEW.test_2_at IS NULL
 AND EXISTS (
   SELECT 1 FROM test_attempts a
   WHERE a.user_id=OLD.user_id AND a.chapter_id=OLD.chapter_id AND a.test_stage='test_2'
 )
BEGIN
  SELECT RAISE(ABORT,'Historical Test 2 attempts prevent clearing this milestone.');
END;

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0016','product phase 5 append-only test archive files and mistake journal','91871b7f81251719e5eae7469347748328a3fd30');