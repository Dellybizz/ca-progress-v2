-- CA Progress revised product plan — Product Phase 11
-- Opt-in Study Buddy accountability, shared weekly goals, Study Together and safety controls.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS study_buddy_relationships (
  id TEXT PRIMARY KEY,
  member_a_user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  member_b_user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  requester_user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  recipient_user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected','removed')),
  requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  responded_at TEXT,
  ended_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(member_a_user_id,member_b_user_id),
  CHECK(member_a_user_id < member_b_user_id),
  CHECK(requester_user_id <> recipient_user_id),
  CHECK((requester_user_id=member_a_user_id AND recipient_user_id=member_b_user_id)
     OR (requester_user_id=member_b_user_id AND recipient_user_id=member_a_user_id))
);

CREATE INDEX IF NOT EXISTS idx_study_buddy_relationship_member_a ON study_buddy_relationships(member_a_user_id,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_study_buddy_relationship_member_b ON study_buddy_relationships(member_b_user_id,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_study_buddy_pending_recipient ON study_buddy_relationships(recipient_user_id,status,requested_at DESC);

-- Sharing is directional. Acceptance alone grants no private accountability fields.
CREATE TABLE IF NOT EXISTS study_buddy_sharing (
  relationship_id TEXT NOT NULL REFERENCES study_buddy_relationships(id) ON DELETE CASCADE,
  owner_user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  share_profile INTEGER NOT NULL DEFAULT 0 CHECK(share_profile IN (0,1)),
  share_progress INTEGER NOT NULL DEFAULT 0 CHECK(share_progress IN (0,1)),
  share_streak INTEGER NOT NULL DEFAULT 0 CHECK(share_streak IN (0,1)),
  share_goals INTEGER NOT NULL DEFAULT 0 CHECK(share_goals IN (0,1)),
  share_study_status INTEGER NOT NULL DEFAULT 0 CHECK(share_study_status IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(relationship_id,owner_user_id)
);

CREATE TABLE IF NOT EXISTS study_buddy_safety (
  owner_user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  target_user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  muted INTEGER NOT NULL DEFAULT 0 CHECK(muted IN (0,1)),
  blocked INTEGER NOT NULL DEFAULT 0 CHECK(blocked IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(owner_user_id,target_user_id),
  CHECK(owner_user_id <> target_user_id)
);
CREATE INDEX IF NOT EXISTS idx_study_buddy_safety_target ON study_buddy_safety(target_user_id,owner_user_id,blocked,muted);

CREATE TABLE IF NOT EXISTS study_buddy_nudges (
  id TEXT PRIMARY KEY,
  relationship_id TEXT NOT NULL REFERENCES study_buddy_relationships(id) ON DELETE CASCADE,
  sender_user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  recipient_user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  message TEXT NOT NULL CHECK(length(message) BETWEEN 1 AND 160),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(sender_user_id <> recipient_user_id)
);
CREATE INDEX IF NOT EXISTS idx_study_buddy_nudges_rate ON study_buddy_nudges(sender_user_id,recipient_user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_study_buddy_nudges_recipient ON study_buddy_nudges(recipient_user_id,created_at DESC);

CREATE TABLE IF NOT EXISTS study_buddy_goals (
  id TEXT PRIMARY KEY,
  relationship_id TEXT NOT NULL REFERENCES study_buddy_relationships(id) ON DELETE CASCADE,
  created_by_user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 120),
  week_start TEXT NOT NULL,
  target_minutes_per_person INTEGER NOT NULL CHECK(target_minutes_per_person BETWEEN 1 AND 10080),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','cancelled')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_study_buddy_goals_relationship ON study_buddy_goals(relationship_id,week_start DESC,status);

-- Contributions are immutable per user + canonical study session. Totals are derived,
-- never stored in one mutable shared counter, preserving each person's contribution.
CREATE TABLE IF NOT EXISTS study_buddy_goal_contributions (
  goal_id TEXT NOT NULL REFERENCES study_buddy_goals(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  study_session_id TEXT NOT NULL REFERENCES study_sessions(id) ON DELETE CASCADE,
  minutes INTEGER NOT NULL CHECK(minutes > 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(goal_id,user_id,study_session_id)
);
CREATE INDEX IF NOT EXISTS idx_study_buddy_goal_contrib_user ON study_buddy_goal_contributions(user_id,created_at DESC);

CREATE TABLE IF NOT EXISTS study_together_sessions (
  id TEXT PRIMARY KEY,
  relationship_id TEXT NOT NULL REFERENCES study_buddy_relationships(id) ON DELETE CASCADE,
  created_by_user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','cancelled')),
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_study_together_relationship ON study_together_sessions(relationship_id,status,started_at DESC);

CREATE TABLE IF NOT EXISTS study_together_participants (
  study_together_id TEXT NOT NULL REFERENCES study_together_sessions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  joined_at TEXT,
  canonical_study_session_id TEXT UNIQUE REFERENCES study_sessions(id) ON DELETE SET NULL,
  completed_at TEXT,
  PRIMARY KEY(study_together_id,user_id)
);

CREATE TABLE IF NOT EXISTS study_buddy_reports (
  id TEXT PRIMARY KEY,
  reporter_user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  target_user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  relationship_id TEXT REFERENCES study_buddy_relationships(id) ON DELETE SET NULL,
  reason TEXT NOT NULL CHECK(length(reason) BETWEEN 1 AND 80),
  details TEXT CHECK(details IS NULL OR length(details) <= 600),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','reviewed','closed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(reporter_user_id <> target_user_id)
);
CREATE INDEX IF NOT EXISTS idx_study_buddy_reports_status ON study_buddy_reports(status,created_at DESC);

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0021','product phase 11 opt-in study buddy accountability shared goals study together and safety','8be4fdd7a58293a136e8ba055fb67195178c157a');
