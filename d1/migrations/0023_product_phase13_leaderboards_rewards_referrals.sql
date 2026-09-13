-- CA Progress revised product plan — Product Phase 13
-- Opt-in monthly leaderboards, reviewable anti-cheat flags, bounded subscription rewards,
-- privacy-safe sharing metadata and activation-based referrals.
-- Academic progress/readiness remains authoritative in existing tables.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS leaderboard_profiles (
  user_id TEXT PRIMARY KEY REFERENCES app_users(user_id) ON DELETE CASCADE,
  opted_in INTEGER NOT NULL DEFAULT 0 CHECK(opted_in IN (0,1)),
  public_alias TEXT,
  opted_in_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(public_alias IS NULL OR length(public_alias) BETWEEN 1 AND 40)
);
CREATE INDEX IF NOT EXISTS idx_phase13_leaderboard_profiles_optin
  ON leaderboard_profiles(opted_in,user_id);

CREATE TABLE IF NOT EXISTS gamification_bonus_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  event_key TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type='referral_activation'),
  source_id TEXT NOT NULL,
  xp_amount INTEGER NOT NULL CHECK(xp_amount BETWEEN 1 AND 500),
  occurred_at TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id,event_key),
  CHECK(length(event_key) BETWEEN 1 AND 240),
  CHECK(length(source_id) BETWEEN 1 AND 240),
  CHECK(json_valid(metadata))
);
CREATE INDEX IF NOT EXISTS idx_phase13_bonus_owner_recent
  ON gamification_bonus_ledger(user_id,occurred_at DESC,event_key);

CREATE TABLE IF NOT EXISTS referral_codes (
  user_id TEXT PRIMARY KEY REFERENCES app_users(user_id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(length(code) BETWEEN 8 AND 32)
);

CREATE TABLE IF NOT EXISTS referrals (
  id TEXT PRIMARY KEY,
  referrer_user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  referred_user_id TEXT NOT NULL UNIQUE REFERENCES app_users(user_id) ON DELETE CASCADE,
  referral_code TEXT NOT NULL REFERENCES referral_codes(code) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','activated','cancelled')),
  qualifying_session_count INTEGER NOT NULL DEFAULT 0 CHECK(qualifying_session_count >= 0),
  joined_at TEXT NOT NULL,
  activated_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(referrer_user_id <> referred_user_id)
);
CREATE INDEX IF NOT EXISTS idx_phase13_referrals_referrer_status
  ON referrals(referrer_user_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS anti_cheat_flags (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  signal_type TEXT NOT NULL CHECK(signal_type IN (
    'impossible_timer','repeated_impossible_sessions','rapid_chapter_completion','fake_test_pattern',
    'delete_reenter_xp_loop','simultaneous_timers','excessive_daily_xp'
  )),
  evidence_key TEXT NOT NULL,
  severity TEXT NOT NULL CHECK(severity IN ('low','medium','high')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','cleared','upheld')),
  evidence TEXT NOT NULL DEFAULT '{}',
  detected_at TEXT NOT NULL,
  reviewed_by TEXT REFERENCES app_users(user_id) ON DELETE SET NULL,
  reviewed_at TEXT,
  review_notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id,signal_type,evidence_key),
  CHECK(length(evidence_key) BETWEEN 1 AND 240),
  CHECK(json_valid(evidence))
);
CREATE INDEX IF NOT EXISTS idx_phase13_flags_status_recent
  ON anti_cheat_flags(status,detected_at DESC,user_id);
CREATE INDEX IF NOT EXISTS idx_phase13_flags_owner_status
  ON anti_cheat_flags(user_id,status,detected_at DESC);

CREATE TABLE IF NOT EXISTS leaderboard_reward_grants (
  id TEXT PRIMARY KEY,
  competition_period TEXT NOT NULL,
  reward_period TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  rank INTEGER NOT NULL CHECK(rank BETWEEN 1 AND 3),
  reward_tier TEXT NOT NULL CHECK(reward_tier IN ('premium','pro')),
  plan_id TEXT NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK(status IN ('scheduled','withheld','active','expired','revoked')),
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  anti_cheat_snapshot TEXT NOT NULL DEFAULT '{}',
  activated_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(competition_period,user_id),
  UNIQUE(competition_period,rank),
  CHECK(length(competition_period)=7),
  CHECK(length(reward_period)=7),
  CHECK(starts_at < ends_at),
  CHECK(json_valid(anti_cheat_snapshot))
);
CREATE INDEX IF NOT EXISTS idx_phase13_rewards_owner_window
  ON leaderboard_reward_grants(user_id,status,starts_at,ends_at);
CREATE INDEX IF NOT EXISTS idx_phase13_rewards_period_rank
  ON leaderboard_reward_grants(competition_period,rank);

-- Referral bonus history is additive and immutable just like Phase 12 XP history.
CREATE TRIGGER IF NOT EXISTS trg_phase13_bonus_no_update
BEFORE UPDATE ON gamification_bonus_ledger
BEGIN
  SELECT RAISE(ABORT,'Gamification bonus ledger entries are immutable.');
END;
CREATE TRIGGER IF NOT EXISTS trg_phase13_bonus_no_delete
BEFORE DELETE ON gamification_bonus_ledger
WHEN EXISTS (SELECT 1 FROM app_users u WHERE u.user_id=OLD.user_id)
BEGIN
  SELECT RAISE(ABORT,'Gamification bonus ledger entries are append-only.');
END;

-- Review evidence may be cleared/upheld but cannot be erased while the account exists.
CREATE TRIGGER IF NOT EXISTS trg_phase13_flag_no_delete
BEFORE DELETE ON anti_cheat_flags
WHEN EXISTS (SELECT 1 FROM app_users u WHERE u.user_id=OLD.user_id)
BEGIN
  SELECT RAISE(ABORT,'Anti-cheat review evidence cannot be deleted.');
END;

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0023','product phase 13 opt-in leaderboards reviewable anti-cheat bounded rewards and activated referrals','ecfd57933ab63166b38d634eae116fc20f435821');
