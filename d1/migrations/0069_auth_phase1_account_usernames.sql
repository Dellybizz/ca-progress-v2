PRAGMA foreign_keys = ON;

-- Usernames are aliases. All existing ownership keys remain app_users.user_id.
CREATE TABLE IF NOT EXISTS account_usernames (
  user_id TEXT PRIMARY KEY REFERENCES app_users(user_id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  is_temporary INTEGER NOT NULL DEFAULT 1 CHECK(is_temporary IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Preserve any previously created password username before assigning aliases.
INSERT OR IGNORE INTO account_usernames(user_id,username,is_temporary)
SELECT user_id,username,0 FROM password_credentials;

-- Random, non-personal aliases remain reserved even for guest-test accounts.
-- No password is set, no identity is linked, and no ownership key is changed.
INSERT INTO account_usernames(user_id,username,is_temporary)
SELECT u.user_id,'student_' || lower(hex(randomblob(8))),1
FROM app_users u LEFT JOIN account_usernames n ON n.user_id=u.user_id
WHERE n.user_id IS NULL;

CREATE TRIGGER IF NOT EXISTS account_usernames_new_user
AFTER INSERT ON app_users
BEGIN
  INSERT INTO account_usernames(user_id,username,is_temporary)
  VALUES(new.user_id,'student_' || lower(hex(randomblob(8))),1);
END;

-- The existing password registration path also receives the chosen username.
-- A collision with any reserved alias aborts the password registration atomically.
CREATE TRIGGER IF NOT EXISTS account_usernames_password_insert
AFTER INSERT ON password_credentials
BEGIN
  INSERT INTO account_usernames(user_id,username,is_temporary)
  VALUES(new.user_id,new.username,0)
  ON CONFLICT(user_id) DO UPDATE SET username=excluded.username,is_temporary=0,changed_at=CURRENT_TIMESTAMP;
END;

CREATE TRIGGER IF NOT EXISTS account_usernames_password_update
AFTER UPDATE OF username ON password_credentials
BEGIN
  UPDATE account_usernames SET username=new.username,is_temporary=0,changed_at=CURRENT_TIMESTAMP
  WHERE user_id=new.user_id;
END;

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0069','phase 1 stable account username aliases','auth-phase0-baseline');
