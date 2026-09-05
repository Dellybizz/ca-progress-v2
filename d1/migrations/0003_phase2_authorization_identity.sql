-- Phase 2 explicit application authorization metadata.
-- Authentication still comes from Supabase Auth during this phase; this role is a
-- target-side application authorization projection, never a browser-controlled claim.
PRAGMA foreign_keys = ON;

ALTER TABLE app_users ADD COLUMN role TEXT NOT NULL DEFAULT 'student'
  CHECK(role IN ('student','moderator','admin','owner','parent_owner'));
CREATE INDEX IF NOT EXISTS app_users_role_state_idx ON app_users(role,account_state);

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0003','trusted application role projection','a319690718454caa11edebdf4b32a5730071a02d');
