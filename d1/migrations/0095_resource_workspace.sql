-- Additive organization and recoverable deletion; existing content stays in place.
CREATE TABLE IF NOT EXISTS resource_folders (
  id TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES resource_folders(id), name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  trashed_at TEXT, trash_expires_at TEXT,
  CHECK(parent_id IS NULL OR parent_id<>id)
);
CREATE INDEX IF NOT EXISTS resource_folders_owner_parent ON resource_folders(owner_user_id,parent_id);
CREATE TABLE IF NOT EXISTS resource_workspace_entries (
  owner_user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE, entity_kind TEXT NOT NULL CHECK(entity_kind IN ('note','upload')),
  entity_id TEXT NOT NULL, folder_id TEXT REFERENCES resource_folders(id),
  starred INTEGER NOT NULL DEFAULT 0 CHECK(starred IN (0,1)), last_opened_at TEXT,
  trashed_at TEXT, trash_expires_at TEXT, purge_started_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(entity_kind,entity_id), CHECK((trashed_at IS NULL)=(trash_expires_at IS NULL))
);
CREATE INDEX IF NOT EXISTS resource_workspace_owner_folder ON resource_workspace_entries(owner_user_id,folder_id,trashed_at);
CREATE INDEX IF NOT EXISTS resource_workspace_trash ON resource_workspace_entries(trash_expires_at) WHERE trashed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS notes_owner_updated_workspace ON notes(user_id,updated_at,id);
CREATE INDEX IF NOT EXISTS uploads_owner_updated_workspace ON uploaded_resources(owner_user_id,updated_at,id);
CREATE TABLE IF NOT EXISTS note_create_receipts (
 note_id TEXT PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE,
 owner_user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
 request_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS resource_processing_outbox (
 resource_id TEXT PRIMARY KEY REFERENCES uploaded_resources(id) ON DELETE CASCADE,
 owner_user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, dispatched_at TEXT, last_error TEXT
);
CREATE TRIGGER IF NOT EXISTS resource_folder_parent_owner_insert BEFORE INSERT ON resource_folders
WHEN NEW.parent_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM resource_folders WHERE id=NEW.parent_id AND owner_user_id=NEW.owner_user_id)
BEGIN SELECT RAISE(ABORT,'Folder parent belongs to another owner'); END;
CREATE TRIGGER IF NOT EXISTS resource_folder_parent_owner_update BEFORE UPDATE OF parent_id,owner_user_id ON resource_folders
WHEN NEW.parent_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM resource_folders WHERE id=NEW.parent_id AND owner_user_id=NEW.owner_user_id)
BEGIN SELECT RAISE(ABORT,'Folder parent belongs to another owner'); END;
CREATE TRIGGER IF NOT EXISTS resource_folder_cycle BEFORE UPDATE OF parent_id ON resource_folders
WHEN NEW.parent_id IS NOT NULL AND EXISTS(
  WITH RECURSIVE descendants(id) AS (SELECT OLD.id UNION ALL SELECT f.id FROM resource_folders f JOIN descendants d ON f.parent_id=d.id)
  SELECT 1 FROM descendants WHERE id=NEW.parent_id
)
BEGIN SELECT RAISE(ABORT,'Folder move creates a cycle'); END;
CREATE TRIGGER IF NOT EXISTS resource_folder_trash_nonempty BEFORE UPDATE OF trashed_at ON resource_folders
WHEN NEW.trashed_at IS NOT NULL AND (EXISTS(SELECT 1 FROM resource_folders WHERE parent_id=OLD.id) OR EXISTS(SELECT 1 FROM resource_workspace_entries WHERE folder_id=OLD.id))
BEGIN SELECT RAISE(ABORT,'Move every item before deleting this folder'); END;
CREATE TRIGGER IF NOT EXISTS resource_folder_nonempty BEFORE DELETE ON resource_folders
WHEN EXISTS(SELECT 1 FROM app_users WHERE user_id=OLD.owner_user_id) AND (EXISTS(SELECT 1 FROM resource_folders WHERE parent_id=OLD.id) OR EXISTS(SELECT 1 FROM resource_workspace_entries WHERE folder_id=OLD.id))
BEGIN SELECT RAISE(ABORT,'Move every item before deleting this folder'); END;
CREATE TRIGGER IF NOT EXISTS resource_workspace_owner_insert BEFORE INSERT ON resource_workspace_entries
WHEN (NEW.entity_kind='note' AND NOT EXISTS(SELECT 1 FROM notes WHERE id=NEW.entity_id AND user_id=NEW.owner_user_id))
 OR (NEW.entity_kind='upload' AND NOT EXISTS(SELECT 1 FROM uploaded_resources WHERE id=NEW.entity_id AND owner_user_id=NEW.owner_user_id))
 OR (NEW.folder_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM resource_folders WHERE id=NEW.folder_id AND owner_user_id=NEW.owner_user_id AND trashed_at IS NULL))
BEGIN SELECT RAISE(ABORT,'File or folder ownership mismatch'); END;
CREATE TRIGGER IF NOT EXISTS resource_workspace_owner_update BEFORE UPDATE ON resource_workspace_entries
WHEN NEW.owner_user_id<>OLD.owner_user_id OR NEW.entity_kind<>OLD.entity_kind OR NEW.entity_id<>OLD.entity_id
 OR (NEW.folder_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM resource_folders WHERE id=NEW.folder_id AND owner_user_id=NEW.owner_user_id AND trashed_at IS NULL))
BEGIN SELECT RAISE(ABORT,'File or folder ownership mismatch'); END;

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit) VALUES('0095','Resource folders, searchable workspace and recoverable Trash','resources-phase1');
