-- Additive transfer receipts and derived-asset lifecycle.
CREATE TABLE IF NOT EXISTS resource_completion_claims(
 intent_id TEXT PRIMARY KEY REFERENCES r2_upload_intents(id) ON DELETE CASCADE,
 token TEXT NOT NULL, expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS resource_transfers(
 intent_id TEXT PRIMARY KEY REFERENCES r2_upload_intents(id) ON DELETE CASCADE,
 owner_user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
 client_id TEXT NOT NULL, request_hash TEXT NOT NULL, content_sha256 TEXT NOT NULL,
 multipart_id TEXT, state TEXT NOT NULL DEFAULT 'initializing' CHECK(state IN ('initializing','active','assembling','uploaded','completed','cancelled','quarantined')),
 lease_until TEXT, lease_token TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(owner_user_id,client_id)
);
CREATE TABLE IF NOT EXISTS resource_transfer_parts(
 intent_id TEXT NOT NULL REFERENCES resource_transfers(intent_id) ON DELETE CASCADE,
 part_number INTEGER NOT NULL CHECK(part_number BETWEEN 1 AND 2),
 etag TEXT NOT NULL, sha256 TEXT NOT NULL, size_bytes INTEGER NOT NULL,
 PRIMARY KEY(intent_id,part_number)
);
CREATE TABLE IF NOT EXISTS resource_inspections(
 resource_id TEXT PRIMARY KEY REFERENCES uploaded_resources(id) ON DELETE CASCADE,
 owner_user_id TEXT NOT NULL REFERENCES app_users(user_id) ON DELETE CASCADE,
 source_key TEXT NOT NULL, source_etag TEXT NOT NULL, content_sha256 TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('queued','processing','ready','unsupported','quarantined','failed')),
 scan_decision TEXT NOT NULL DEFAULT 'structural-only', text_content TEXT NOT NULL DEFAULT '',
 thumbnail_key TEXT, thumbnail_mime TEXT, thumbnail_bytes INTEGER NOT NULL DEFAULT 0,
 last_error TEXT, attempts INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS resource_inspections_owner_hash ON resource_inspections(owner_user_id,content_sha256);
CREATE INDEX IF NOT EXISTS resource_inspections_state ON resource_inspections(state,updated_at);
CREATE TABLE IF NOT EXISTS resource_derivative_cleanup(
 object_key TEXT PRIMARY KEY, owner_user_id TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER IF NOT EXISTS resource_derivative_delete BEFORE DELETE ON resource_inspections
WHEN OLD.thumbnail_key IS NOT NULL
BEGIN
 INSERT OR IGNORE INTO resource_derivative_cleanup(object_key,owner_user_id) VALUES(OLD.thumbnail_key,OLD.owner_user_id);
END;
INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES('0097','durable resource transfers inspection and private derivatives','resources-phase2');
