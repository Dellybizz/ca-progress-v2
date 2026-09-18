-- Temporary Razorpay website reviewer access. Student-only and auto-expiring.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS reviewer_credentials (
  credential_id TEXT PRIMARY KEY,
  application_user_id TEXT NOT NULL UNIQUE REFERENCES app_users(user_id) ON DELETE CASCADE,
  username_normalized TEXT NOT NULL UNIQUE,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_iterations INTEGER NOT NULL CHECK(password_iterations >= 100000),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  expires_at TEXT NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK(failed_attempts >= 0),
  locked_until TEXT,
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO app_users(user_id,auth_provider,provider_subject,account_state,role)
VALUES ('2526f2cb-da3f-49ff-860c-8e586a61ffb4','razorpay-reviewer','razorpay-review','active','student');

INSERT OR IGNORE INTO profiles(user_id,display_name,ca_level,group_choice,attempt_key,daily_target_minutes,onboarding_step,onboarding_completed_at)
SELECT
  '2526f2cb-da3f-49ff-860c-8e586a61ffb4',
  'Razorpay Reviewer',
  'intermediate',
  'both',
  COALESCE((SELECT attempt_key FROM exam_attempts WHERE verification_status='verified' ORDER BY start_date DESC LIMIT 1),'undecided'),
  120,
  4,
  CURRENT_TIMESTAMP;

INSERT OR IGNORE INTO user_preferences(user_id)
VALUES ('2526f2cb-da3f-49ff-860c-8e586a61ffb4');

INSERT OR IGNORE INTO reviewer_credentials(
  credential_id,application_user_id,username_normalized,password_salt,password_hash,password_iterations,active,expires_at
) VALUES (
  'aed45b2e-4fe6-41c4-b268-c439ae3892bf',
  '2526f2cb-da3f-49ff-860c-8e586a61ffb4',
  'razorpay-review',
  'UJ5l6OO2hoh_k11L8nt0nQ',
  'CMYtApGmy2pkQNzYpbu5d6KkdbllmYUeU9CELyZTo4Y',
  310000,
  1,
  '2026-11-02T03:00:04Z'
);

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0056','temporary student-only Razorpay reviewer access','hotfix/dark-mode-ae0cb36d');
