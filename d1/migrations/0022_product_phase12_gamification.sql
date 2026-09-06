-- CA Progress revised product plan — Product Phase 12
-- Professional gamification: append-only XP ledger, timezone-stable streak evidence and idempotent achievements.
-- Academic progress remains authoritative in its existing tables; this migration adds no XP/progress coupling.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS xp_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  event_key TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN (
    'valid_session','today_task','chapter_completion','revision_1','revision_2','test',
    'daily_goal','weekly_goal','reflection','resolved_doubt','study_together'
  )),
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  xp_amount INTEGER NOT NULL CHECK(xp_amount BETWEEN 1 AND 100),
  occurred_at TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id,event_key),
  CHECK(length(event_key) BETWEEN 1 AND 240),
  CHECK(length(source_type) BETWEEN 1 AND 80),
  CHECK(length(source_id) BETWEEN 1 AND 240),
  CHECK(json_valid(metadata))
);
CREATE INDEX IF NOT EXISTS idx_xp_ledger_owner_recent
  ON xp_ledger(user_id,occurred_at DESC,event_key);
CREATE INDEX IF NOT EXISTS idx_xp_ledger_owner_type
  ON xp_ledger(user_id,event_type,occurred_at DESC);

-- A streak day is immutable evidence that a local calendar day met the Phase 12
-- meaningful-study rule. The local date is recorded using the source event's stored
-- timezone so later profile timezone changes cannot rewrite historical streak days.
CREATE TABLE IF NOT EXISTS study_streak_days (
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  local_date TEXT NOT NULL,
  source_timezone TEXT NOT NULL,
  qualification_type TEXT NOT NULL CHECK(qualification_type IN ('valid_session','today_task')),
  source_id TEXT NOT NULL,
  qualified_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id,local_date),
  CHECK(length(local_date)=10),
  CHECK(length(source_timezone) BETWEEN 1 AND 80),
  CHECK(length(source_id) BETWEEN 1 AND 240)
);
CREATE INDEX IF NOT EXISTS idx_study_streak_days_owner_date
  ON study_streak_days(user_id,local_date DESC);

CREATE TABLE IF NOT EXISTS user_achievements (
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  achievement_key TEXT NOT NULL,
  unlocked_at TEXT NOT NULL,
  evidence_snapshot TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id,achievement_key),
  CHECK(length(achievement_key) BETWEEN 1 AND 120),
  CHECK(json_valid(evidence_snapshot))
);
CREATE INDEX IF NOT EXISTS idx_user_achievements_owner_recent
  ON user_achievements(user_id,unlocked_at DESC,achievement_key);

-- XP and achievement history are append-only through application runtime. Account
-- deletion still cascades through the parent app_users row.
CREATE TRIGGER IF NOT EXISTS trg_phase12_xp_ledger_no_update
BEFORE UPDATE ON xp_ledger
BEGIN
  SELECT RAISE(ABORT,'XP ledger entries are immutable.');
END;
CREATE TRIGGER IF NOT EXISTS trg_phase12_xp_ledger_no_delete
BEFORE DELETE ON xp_ledger
WHEN EXISTS (SELECT 1 FROM app_users u WHERE u.user_id=OLD.user_id)
BEGIN
  SELECT RAISE(ABORT,'XP ledger entries are append-only.');
END;
CREATE TRIGGER IF NOT EXISTS trg_phase12_achievement_no_update
BEFORE UPDATE ON user_achievements
BEGIN
  SELECT RAISE(ABORT,'Achievement unlocks are immutable.');
END;
CREATE TRIGGER IF NOT EXISTS trg_phase12_achievement_no_delete
BEFORE DELETE ON user_achievements
WHEN EXISTS (SELECT 1 FROM app_users u WHERE u.user_id=OLD.user_id)
BEGIN
  SELECT RAISE(ABORT,'Achievement unlocks are append-only.');
END;

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0022','product phase 12 idempotent xp fair streaks professional levels and achievements','b4fa25a2c941fe06c61d9d5aaa4eea0bef8baf76');
