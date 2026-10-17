PRAGMA foreign_keys = ON;

ALTER TABLE account_deletion_requests ADD COLUMN processing_started_at TEXT;
ALTER TABLE account_deletion_requests ADD COLUMN failure_code TEXT;
ALTER TABLE account_deletion_requests ADD COLUMN updated_at TEXT;
UPDATE account_deletion_requests SET updated_at=COALESCE(updated_at,requested_at,CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS account_deletion_receipts (
  request_id TEXT PRIMARY KEY,
  subject_hash TEXT NOT NULL UNIQUE,
  deleted_object_count INTEGER NOT NULL DEFAULT 0 CHECK(deleted_object_count >= 0),
  retained_categories TEXT NOT NULL DEFAULT '["payment","tax","fraud_prevention","immutable_audit"]' CHECK(json_valid(retained_categories)),
  completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_account_deletion_processing
  ON account_deletion_requests(status,processing_started_at);

-- Historical study ledgers remain immutable for active accounts. The deletion
-- processor first marks the owner deleted, allowing only that privacy workflow
-- to remove private study history while fraud/payment/audit evidence is retained.
DROP TRIGGER IF EXISTS trg_phase5_test_attempt_no_delete;
CREATE TRIGGER trg_phase5_test_attempt_no_delete BEFORE DELETE ON test_attempts
WHEN EXISTS (SELECT 1 FROM app_users u WHERE u.user_id=OLD.user_id AND u.account_state<>'deleted')
BEGIN SELECT RAISE(ABORT,'Test attempts are append-only and cannot be deleted.'); END;
DROP TRIGGER IF EXISTS trg_phase12_xp_ledger_no_delete;
CREATE TRIGGER trg_phase12_xp_ledger_no_delete BEFORE DELETE ON xp_ledger
WHEN EXISTS (SELECT 1 FROM app_users u WHERE u.user_id=OLD.user_id AND u.account_state<>'deleted')
BEGIN SELECT RAISE(ABORT,'XP ledger entries are append-only.'); END;
DROP TRIGGER IF EXISTS trg_phase12_streak_day_no_delete;
CREATE TRIGGER trg_phase12_streak_day_no_delete BEFORE DELETE ON study_streak_days
WHEN EXISTS (SELECT 1 FROM app_users u WHERE u.user_id=OLD.user_id AND u.account_state<>'deleted')
BEGIN SELECT RAISE(ABORT,'Streak evidence is append-only.'); END;
DROP TRIGGER IF EXISTS trg_phase12_achievement_no_delete;
CREATE TRIGGER trg_phase12_achievement_no_delete BEFORE DELETE ON user_achievements
WHEN EXISTS (SELECT 1 FROM app_users u WHERE u.user_id=OLD.user_id AND u.account_state<>'deleted')
BEGIN SELECT RAISE(ABORT,'Achievement unlocks are append-only.'); END;
DROP TRIGGER IF EXISTS trg_phase13_bonus_no_delete;
CREATE TRIGGER trg_phase13_bonus_no_delete BEFORE DELETE ON gamification_bonus_ledger
WHEN EXISTS (SELECT 1 FROM app_users u WHERE u.user_id=OLD.user_id AND u.account_state<>'deleted')
BEGIN SELECT RAISE(ABORT,'Gamification bonus ledger entries are append-only.'); END;

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0063','mobile phase 12 release operations and deletion receipts','mobile-phase11-native-packaging');
