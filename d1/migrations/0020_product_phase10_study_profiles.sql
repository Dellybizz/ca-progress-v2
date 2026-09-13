-- CA Progress Product Phase 10 — private-by-default Study Profiles
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS study_profiles (
  user_id TEXT PRIMARY KEY REFERENCES app_users(user_id) ON DELETE CASCADE,
  public_bio TEXT,
  profile_visibility TEXT NOT NULL DEFAULT 'private' CHECK(profile_visibility IN ('private','buddies','public')),
  progress_visibility TEXT NOT NULL DEFAULT 'private' CHECK(progress_visibility IN ('private','buddies','public')),
  streak_visibility TEXT NOT NULL DEFAULT 'private' CHECK(streak_visibility IN ('private','buddies','public')),
  show_level INTEGER NOT NULL DEFAULT 0 CHECK(show_level IN (0,1)),
  show_attempt INTEGER NOT NULL DEFAULT 0 CHECK(show_attempt IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(public_bio IS NULL OR length(public_bio) <= 240)
);

-- This is an explicit privacy ACL, not a discovery/follow graph. The owner grants
-- one known application user access to fields whose visibility is set to `buddies`.
CREATE TABLE IF NOT EXISTS study_profile_buddies (
  owner_user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  buddy_user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(owner_user_id,buddy_user_id),
  CHECK(owner_user_id <> buddy_user_id)
);

CREATE INDEX IF NOT EXISTS study_profile_buddies_viewer_idx
  ON study_profile_buddies(buddy_user_id,owner_user_id);

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0020','product phase 10 private-by-default study profiles and buddy privacy ACL','6a02a3c553db8128c8d46de0f76b7f3144aead32');
