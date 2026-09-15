-- CA Progress revised product plan — Product Phase 2
-- Durable, non-personalising onboarding context for Today / first-week experience.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS onboarding_experience (
  user_id TEXT PRIMARY KEY REFERENCES app_users(user_id) ON DELETE CASCADE,
  preparation_state TEXT NOT NULL CHECK(preparation_state IN ('starting','studying','revising','practice')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0013','product phase 2 onboarding preparation state and first-week contract','fcd80804e49a23956c077ad5e9c013c61b9c345e');
