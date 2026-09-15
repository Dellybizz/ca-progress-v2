-- CA Progress revised product plan — Product Phase 8
-- Unified planner/calendar/goals/countdown/actionable in-app notifications.
-- Additive and idempotent on the retained Cloudflare D1 database.
PRAGMA foreign_keys = ON;

-- Existing task rows remain valid. A missing extension row means the historical
-- fixed-time behaviour; flexible rows add a canonical local target date without
-- rewriting or losing the original task record.
CREATE TABLE IF NOT EXISTS planner_task_phase8 (
  task_id TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  schedule_mode TEXT NOT NULL DEFAULT 'fixed' CHECK(schedule_mode IN ('fixed','flexible')),
  target_date TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(schedule_mode='fixed' OR (target_date IS NOT NULL AND length(target_date)=10)),
  UNIQUE(user_id,task_id)
);
CREATE INDEX IF NOT EXISTS idx_planner_task_phase8_owner_date
  ON planner_task_phase8(user_id,schedule_mode,target_date,task_id);

-- Goal semantics are additive as well. Historical goals without an extension row
-- are treated as custom one-step goals, preserving their existing active/completed state.
CREATE TABLE IF NOT EXISTS planner_goal_phase8 (
  goal_id TEXT PRIMARY KEY REFERENCES goals(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  goal_kind TEXT NOT NULL DEFAULT 'custom' CHECK(goal_kind IN ('daily_study','weekly_study','completion','revision','test','custom')),
  target_value INTEGER NOT NULL DEFAULT 1 CHECK(target_value BETWEEN 1 AND 100000),
  target_unit TEXT NOT NULL DEFAULT 'count' CHECK(target_unit IN ('minutes','count')),
  starts_on TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(starts_on IS NULL OR length(starts_on)=10),
  UNIQUE(user_id,goal_id)
);
CREATE INDEX IF NOT EXISTS idx_planner_goal_phase8_owner_kind
  ON planner_goal_phase8(user_id,goal_kind,goal_id);

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id TEXT PRIMARY KEY REFERENCES app_users(user_id) ON DELETE CASCADE,
  revision_due INTEGER NOT NULL DEFAULT 1 CHECK(revision_due IN (0,1)),
  test_tomorrow INTEGER NOT NULL DEFAULT 1 CHECK(test_tomorrow IN (0,1)),
  goal_near_completion INTEGER NOT NULL DEFAULT 1 CHECK(goal_near_completion IN (0,1)),
  doubt_answered INTEGER NOT NULL DEFAULT 1 CHECK(doubt_answered IN (0,1)),
  buddy_activity INTEGER NOT NULL DEFAULT 0 CHECK(buddy_activity IN (0,1)),
  frequency TEXT NOT NULL DEFAULT 'realtime' CHECK(frequency IN ('realtime','daily_digest','off')),
  max_per_day INTEGER NOT NULL DEFAULT 8 CHECK(max_per_day BETWEEN 1 AND 20),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS in_app_notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL CHECK(notification_type IN ('revision_due','test_tomorrow','goal_near_completion','doubt_answered','buddy_activity')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  action_href TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  dedupe_key TEXT NOT NULL,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id,dedupe_key)
);
CREATE INDEX IF NOT EXISTS idx_in_app_notifications_owner_recent
  ON in_app_notifications(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_in_app_notifications_owner_unread
  ON in_app_notifications(user_id,read_at,created_at DESC);

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0019','product phase 8 unified planning countdown goals and actionable notifications','b5beed3280943bd69d956bd7e2ede74bc8c8d46a');
