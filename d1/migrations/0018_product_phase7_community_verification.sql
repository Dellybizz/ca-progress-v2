-- CA Progress revised product plan — Product Phase 7
-- Community 2.0: structured doubts, evidence-backed verification, follows and saved feed state.
-- Additive and idempotent on the retained Cloudflare D1 database.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS community_verifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  badge_kind TEXT NOT NULL CHECK(badge_kind IN ('verified_result','exemption','score_70','score_75','score_80','ranker','air')),
  badge_value TEXT,
  evidence_source TEXT NOT NULL CHECK(length(evidence_source) BETWEEN 2 AND 160),
  evidence_reference TEXT NOT NULL CHECK(length(evidence_reference) BETWEEN 2 AND 500),
  review_note TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')),
  granted_by TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE RESTRICT,
  granted_by_role TEXT NOT NULL CHECK(granted_by_role IN ('admin','owner','parent_owner')),
  granted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_by TEXT REFERENCES app_users(user_id) ON DELETE RESTRICT,
  revoked_by_role TEXT CHECK(revoked_by_role IN ('admin','owner','parent_owner')),
  revoked_reason TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK((status='active' AND revoked_by IS NULL AND revoked_at IS NULL)
     OR (status='revoked' AND revoked_by IS NOT NULL AND revoked_at IS NOT NULL)),
  CHECK((badge_kind='air' AND badge_value IS NOT NULL AND length(trim(badge_value))>0)
     OR badge_kind<>'air')
);

CREATE INDEX IF NOT EXISTS idx_community_verifications_user_active
  ON community_verifications(user_id,status,badge_kind,granted_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_verifications_kind_active
  ON community_verifications(status,badge_kind,user_id);

CREATE TABLE IF NOT EXISTS community_verification_audit (
  id TEXT PRIMARY KEY,
  verification_id TEXT NOT NULL REFERENCES community_verifications(id) ON DELETE CASCADE,
  target_user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  actor_user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE RESTRICT,
  actor_role TEXT NOT NULL CHECK(actor_role IN ('admin','owner','parent_owner')),
  action TEXT NOT NULL CHECK(action IN ('grant','revoke')),
  evidence_source TEXT,
  evidence_reference TEXT,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_community_verification_audit_target
  ON community_verification_audit(target_user_id,created_at DESC);

CREATE TABLE IF NOT EXISTS community_follows (
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  followed_user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id,followed_user_id),
  CHECK(user_id<>followed_user_id)
);
CREATE INDEX IF NOT EXISTS idx_community_follows_target
  ON community_follows(followed_user_id,user_id);

CREATE TABLE IF NOT EXISTS community_saved_messages (
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  message_id TEXT NOT NULL REFERENCES community_messages(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id,message_id)
);
CREATE INDEX IF NOT EXISTS idx_community_saved_messages_recent
  ON community_saved_messages(user_id,created_at DESC);

-- Existing Phase 3 session-created doubts are the canonical structured-doubt store.
-- This index makes their Community projection/filter hydration cheap without duplicating doubt data.
CREATE INDEX IF NOT EXISTS idx_study_session_doubts_community_message
  ON study_session_doubts(community_message_id,status,created_at DESC)
  WHERE community_message_id IS NOT NULL;

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0018','product phase 7 community verification filters and structured doubt reconciliation','7f40234cf13dee5af8a647a1a2310567d7c363ab');
