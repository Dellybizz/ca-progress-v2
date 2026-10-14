CREATE TABLE IF NOT EXISTS resource_folder_details (
 folder_id TEXT PRIMARY KEY REFERENCES resource_folders(id) ON DELETE CASCADE,
 kind TEXT NOT NULL DEFAULT 'folder' CHECK(kind IN ('folder','notebook','section')),
 sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS resource_file_tags (
 owner_user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
 entity_kind TEXT NOT NULL CHECK(entity_kind IN ('note','upload')),entity_id TEXT NOT NULL,
 tag TEXT NOT NULL CHECK(length(tag) BETWEEN 1 AND 32),PRIMARY KEY(entity_kind,entity_id,tag)
);
CREATE TABLE IF NOT EXISTS resource_file_activity (
 id INTEGER PRIMARY KEY AUTOINCREMENT,owner_user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
 entity_kind TEXT NOT NULL,entity_id TEXT NOT NULL,action TEXT NOT NULL,detail TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS resource_activity_owner_file ON resource_file_activity(owner_user_id,entity_kind,entity_id,id DESC);
CREATE TABLE IF NOT EXISTS resource_file_versions (
 id TEXT PRIMARY KEY,owner_user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
 resource_id TEXT NOT NULL REFERENCES uploaded_resources(id) ON DELETE CASCADE,
 version_resource_id TEXT NOT NULL REFERENCES uploaded_resources(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,active INTEGER NOT NULL DEFAULT 0 CHECK(active IN (0,1)),
 UNIQUE(resource_id,version_resource_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS resource_version_one_active ON resource_file_versions(resource_id) WHERE active=1;
CREATE TRIGGER IF NOT EXISTS resource_version_owner BEFORE INSERT ON resource_file_versions
WHEN NOT EXISTS(SELECT 1 FROM uploaded_resources a JOIN uploaded_resources b ON b.id=NEW.version_resource_id WHERE a.id=NEW.resource_id AND a.owner_user_id=NEW.owner_user_id AND b.owner_user_id=NEW.owner_user_id AND a.visibility='private' AND b.visibility='private') OR EXISTS(SELECT 1 FROM storage_cleanup_deletions WHERE file_kind='resource' AND file_id IN (NEW.resource_id,NEW.version_resource_id) AND state IN ('deleting','deleted','review'))
BEGIN SELECT RAISE(ABORT,'Versions require private files owned by you');END;
CREATE TRIGGER IF NOT EXISTS resource_version_source_delete BEFORE DELETE ON uploaded_resources
WHEN EXISTS(SELECT 1 FROM app_users WHERE user_id=OLD.owner_user_id) AND EXISTS(SELECT 1 FROM resource_file_versions WHERE version_resource_id=OLD.id AND resource_id<>OLD.id)
BEGIN SELECT RAISE(ABORT,'File is retained by another file version');END;
CREATE TRIGGER IF NOT EXISTS resource_workspace_activity_insert AFTER INSERT ON resource_workspace_entries
BEGIN INSERT INTO resource_file_activity(owner_user_id,entity_kind,entity_id,action) VALUES(NEW.owner_user_id,NEW.entity_kind,NEW.entity_id,CASE WHEN NEW.trashed_at IS NOT NULL THEN 'trash' WHEN NEW.starred=1 THEN 'star' WHEN NEW.last_opened_at IS NOT NULL THEN 'opened' ELSE 'move' END);END;
CREATE TRIGGER IF NOT EXISTS resource_workspace_activity_update AFTER UPDATE ON resource_workspace_entries
BEGIN INSERT INTO resource_file_activity(owner_user_id,entity_kind,entity_id,action) VALUES(NEW.owner_user_id,NEW.entity_kind,NEW.entity_id,CASE WHEN OLD.trashed_at IS NULL AND NEW.trashed_at IS NOT NULL THEN 'trash' WHEN OLD.trashed_at IS NOT NULL AND NEW.trashed_at IS NULL THEN 'restore' WHEN NEW.folder_id IS NOT OLD.folder_id THEN 'move' WHEN NEW.starred<>OLD.starred THEN 'star' ELSE 'opened' END);END;
CREATE TRIGGER IF NOT EXISTS resource_upload_activity AFTER UPDATE OF title,subject_id,chapter_id,visibility,moderation_status ON uploaded_resources
BEGIN INSERT INTO resource_file_activity(owner_user_id,entity_kind,entity_id,action) VALUES(NEW.owner_user_id,'upload',NEW.id,'metadata');END;
CREATE TRIGGER IF NOT EXISTS resource_note_activity AFTER UPDATE OF title,body_html ON notes
BEGIN INSERT INTO resource_file_activity(owner_user_id,entity_kind,entity_id,action) VALUES(NEW.user_id,'note',NEW.id,'edit');END;
CREATE TRIGGER IF NOT EXISTS resource_note_workspace_cleanup AFTER DELETE ON notes
BEGIN DELETE FROM resource_file_tags WHERE entity_kind='note' AND entity_id=OLD.id;DELETE FROM resource_workspace_entries WHERE entity_kind='note' AND entity_id=OLD.id;END;
CREATE TRIGGER IF NOT EXISTS resource_upload_workspace_cleanup AFTER DELETE ON uploaded_resources
BEGIN DELETE FROM resource_file_tags WHERE entity_kind='upload' AND entity_id=OLD.id;DELETE FROM resource_workspace_entries WHERE entity_kind='upload' AND entity_id=OLD.id;END;
INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit) VALUES('0096','Notebook organization, file tags, activity and private file versions','resources-phase1');

CREATE TRIGGER IF NOT EXISTS resource_version_private_only BEFORE UPDATE OF visibility ON uploaded_resources
WHEN NEW.visibility<>'private' AND EXISTS(SELECT 1 FROM resource_file_versions WHERE resource_id=NEW.id OR version_resource_id=NEW.id)
BEGIN SELECT RAISE(ABORT,'Versioned files must remain private');END;

CREATE TRIGGER IF NOT EXISTS resource_upload_created AFTER INSERT ON uploaded_resources
BEGIN INSERT INTO resource_file_activity(owner_user_id,entity_kind,entity_id,action) VALUES(NEW.owner_user_id,'upload',NEW.id,'created');END;
CREATE TRIGGER IF NOT EXISTS resource_note_created AFTER INSERT ON notes
BEGIN INSERT INTO resource_file_activity(owner_user_id,entity_kind,entity_id,action) VALUES(NEW.user_id,'note',NEW.id,'created');END;
CREATE TABLE IF NOT EXISTS resource_save_guards (id TEXT PRIMARY KEY,ok INTEGER NOT NULL CHECK(ok=1));
