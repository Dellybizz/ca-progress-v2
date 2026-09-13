-- CA Progress revised product plan — Product Phase 3
-- Connected study sessions, historical reflection and session-linked doubts.
-- Companion tables keep this migration additive and idempotent on the retained D1.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS study_timer_phase3 (
  user_id TEXT PRIMARY KEY REFERENCES study_timer_state(user_id) ON DELETE CASCADE,
  task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  plan_item_id TEXT REFERENCES daily_plan_items(id) ON DELETE SET NULL,
  pause_count INTEGER NOT NULL DEFAULT 0 CHECK(pause_count >= 0),
  paused_seconds INTEGER NOT NULL DEFAULT 0 CHECK(paused_seconds >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(task_id IS NULL OR plan_item_id IS NULL)
);

CREATE TABLE IF NOT EXISTS study_session_phase3 (
  session_id TEXT PRIMARY KEY REFERENCES study_sessions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  plan_item_id TEXT REFERENCES daily_plan_items(id) ON DELETE SET NULL,
  pause_count INTEGER NOT NULL DEFAULT 0 CHECK(pause_count >= 0),
  paused_seconds INTEGER NOT NULL DEFAULT 0 CHECK(paused_seconds >= 0),
  completion_state TEXT NOT NULL DEFAULT 'completed' CHECK(completion_state IN ('completed','recovered')),
  understanding_score INTEGER CHECK(understanding_score BETWEEN 0 AND 100),
  focus_rating TEXT CHECK(focus_rating IN ('poor','okay','focused')),
  reflection_saved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(task_id IS NULL OR plan_item_id IS NULL),
  CHECK((understanding_score IS NULL AND focus_rating IS NULL AND reflection_saved_at IS NULL)
     OR (understanding_score IS NOT NULL AND focus_rating IS NOT NULL AND reflection_saved_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_study_session_phase3_user_reflection
  ON study_session_phase3(user_id, reflection_saved_at, session_id);
CREATE INDEX IF NOT EXISTS idx_study_session_phase3_task
  ON study_session_phase3(user_id, task_id, plan_item_id);

CREATE TABLE IF NOT EXISTS study_session_doubts (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES study_sessions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
  chapter_id TEXT REFERENCES chapters(id) ON DELETE SET NULL,
  visibility TEXT NOT NULL CHECK(visibility IN ('private','community')),
  body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 1200),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','answered','resolved')),
  community_channel_id TEXT REFERENCES community_channels(id) ON DELETE SET NULL,
  community_message_id TEXT UNIQUE REFERENCES community_messages(id) ON DELETE SET NULL,
  answered_at TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_study_session_doubts_owner
  ON study_session_doubts(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_study_session_doubts_session
  ON study_session_doubts(session_id, user_id);

-- Community replies already generate a reply notification for the original message
-- author through the existing Community write path. This trigger keeps the linked
-- session-doubt state in sync when an answer is posted.
CREATE TRIGGER IF NOT EXISTS trg_study_session_doubt_answered
AFTER INSERT ON community_messages
WHEN NEW.reply_to_message_id IS NOT NULL
BEGIN
  UPDATE study_session_doubts
  SET status='answered', answered_at=NEW.created_at, updated_at=CURRENT_TIMESTAMP
  WHERE community_message_id=NEW.reply_to_message_id
    AND user_id<>NEW.user_id
    AND status='open';
END;

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0014','product phase 3 connected study sessions reflections and doubts','ac760b8f2a589b599118cfd4c6db43062b295eae');
