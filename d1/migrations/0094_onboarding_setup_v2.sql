-- Versioned account-scoped drafts. Existing profiles/preparation/study records are untouched.
CREATE TABLE IF NOT EXISTS onboarding_setup (
 user_id TEXT PRIMARY KEY REFERENCES app_users(user_id) ON DELETE CASCADE,
 schema_version INTEGER NOT NULL DEFAULT 2 CHECK(schema_version=2),
 draft_json TEXT NOT NULL CHECK(json_valid(draft_json)),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
 write_id TEXT NOT NULL,
 completed_at TEXT,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES('0094','Versioned onboarding choices, support and tentative attempt','onboarding-design-phase4');
