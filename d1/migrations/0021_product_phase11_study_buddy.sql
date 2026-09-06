-- CA Progress Product Phase 11 — opt-in Study Buddy accountability
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS study_buddy_relationships (
  id TEXT PRIMARY KEY,
  user_low_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  user_high_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  requester_user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected','removed')),
  accepted_at TEXT,
  ended_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_low_id,user_high_id),
  CHECK(user_low_id <> user_high_id),
  CHECK(requester_user_id IN (user_low_id,user_high_id))
);

CREATE INDEX IF NOT EXISTS study_buddy_relationships_low_idx ON study_buddy_relationships(user_low_id,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS study_buddy_relationships_high_idx ON study_buddy_relationships(user_high_id,status,updated_at DESC);

CREATE TABLE IF NOT EXISTS study_buddy_sharing (
  relationship_id TEXT NOT NULL REFERENCES study_buddy_relationships(id) ON DELETE CASCADE,
  owner_user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  share_profile INTEGER NOT NULL DEFAULT 0 CHECK(share_profile IN (0,1)),
  share_progress INTEGER NOT NULL DEFAULT 0 CHECK(share_progress IN (0,1)),
  share_streak INTEGER NOT NULL DEFAULT 0 CHECK(share_streak IN (0,1)),
  share_level INTEGER NOT NULL DEFAULT 0 CHECK(share_level IN (0,1)),
  share_attempt INTEGER NOT NULL DEFAULT 0 CHECK(share_attempt IN (0,1)),
  share_weekly_goal INTEGER NOT NULL DEFAULT 0 CHECK(share_weekly_goal IN (0,1)),
  share_study_together INTEGER NOT NULL DEFAULT 0 CHECK(share_study_together IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(relationship_id,owner_user_id)
);

CREATE TABLE IF NOT EXISTS study_buddy_nudges (
  id TEXT PRIMARY KEY,
  relationship_id TEXT NOT NULL REFERENCES study_buddy_relationships(id) ON DELETE CASCADE,
  sender_user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  recipient_user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('start_studying','keep_going','weekly_goal')),
  status TEXT NOT NULL DEFAULT 'unread' CHECK(status IN ('unread','read','dismissed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(sender_user_id <> recipient_user_id)
);
CREATE INDEX IF NOT EXISTS study_buddy_nudges_rate_idx ON study_buddy_nudges(relationship_id,sender_user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS study_buddy_nudges_inbox_idx ON study_buddy_nudges(recipient_user_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS study_buddy_weekly_goals (
  id TEXT PRIMARY KEY,
  relationship_id TEXT NOT NULL REFERENCES study_buddy_relationships(id) ON DELETE CASCADE,
  week_start TEXT NOT NULL,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 80),
  target_minutes INTEGER NOT NULL CHECK(target_minutes BETWEEN 1 AND 10080),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','archived')),
  created_by_user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(relationship_id,week_start)
);
CREATE INDEX IF NOT EXISTS study_buddy_weekly_goals_rel_idx ON study_buddy_weekly_goals(relationship_id,week_start DESC);

CREATE TABLE IF NOT EXISTS study_buddy_goal_contributions (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL REFERENCES study_buddy_weekly_goals(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK(source_type IN ('manual','study_together')),
  source_key TEXT NOT NULL,
  minutes INTEGER NOT NULL CHECK(minutes BETWEEN 1 AND 1440),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(goal_id,user_id,source_type,source_key)
);
CREATE INDEX IF NOT EXISTS study_buddy_goal_contributions_goal_idx ON study_buddy_goal_contributions(goal_id,user_id,created_at ASC);

CREATE TABLE IF NOT EXISTS study_together_sessions (
  id TEXT PRIMARY KEY,
  relationship_id TEXT NOT NULL REFERENCES study_buddy_relationships(id) ON DELETE CASCADE,
  inviter_user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  invitee_user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  goal_id TEXT REFERENCES study_buddy_weekly_goals(id) ON DELETE SET NULL,
  scheduled_for TEXT,
  planned_minutes INTEGER NOT NULL CHECK(planned_minutes BETWEEN 5 AND 480),
  status TEXT NOT NULL DEFAULT 'invited' CHECK(status IN ('invited','accepted','declined','cancelled','completed')),
  responded_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(inviter_user_id <> invitee_user_id)
);
CREATE INDEX IF NOT EXISTS study_together_invite_rate_idx ON study_together_sessions(relationship_id,inviter_user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS study_together_user_idx ON study_together_sessions(invitee_user_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS study_together_completions (
  session_id TEXT NOT NULL REFERENCES study_together_sessions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  minutes INTEGER NOT NULL CHECK(minutes BETWEEN 1 AND 480),
  completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(session_id,user_id)
);

CREATE TABLE IF NOT EXISTS study_buddy_blocks (
  blocker_user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  blocked_user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(blocker_user_id,blocked_user_id),
  CHECK(blocker_user_id <> blocked_user_id)
);

CREATE TABLE IF NOT EXISTS study_buddy_mutes (
  owner_user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  muted_user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  mute_nudges INTEGER NOT NULL DEFAULT 1 CHECK(mute_nudges IN (0,1)),
  mute_invitations INTEGER NOT NULL DEFAULT 1 CHECK(mute_invitations IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(owner_user_id,muted_user_id),
  CHECK(owner_user_id <> muted_user_id)
);

CREATE TABLE IF NOT EXISTS study_buddy_reports (
  id TEXT PRIMARY KEY,
  relationship_id TEXT REFERENCES study_buddy_relationships(id) ON DELETE SET NULL,
  reporter_user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  reported_user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK(category IN ('spam','harassment','privacy','other')),
  details TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(reporter_user_id <> reported_user_id),
  CHECK(details IS NULL OR length(details) <= 500)
);
CREATE INDEX IF NOT EXISTS study_buddy_reports_target_idx ON study_buddy_reports(reported_user_id,created_at DESC);

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0021','product phase 11 opt-in Study Buddy accountability','8be4fdd7a58293a136e8ba055fb67195178c157a');
