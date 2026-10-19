-- Additive expansion: keep all legacy receipts and support the multipart range.
-- Keep the old table writable during Worker rollout; forward its first two
-- receipts into the expanded table before the backfill to avoid a copy race.
CREATE TABLE IF NOT EXISTS resource_transfer_part_receipts(
 intent_id TEXT NOT NULL REFERENCES resource_transfers(intent_id) ON DELETE CASCADE,
 part_number INTEGER NOT NULL CHECK(part_number BETWEEN 1 AND 10000),
 etag TEXT NOT NULL, sha256 TEXT NOT NULL, size_bytes INTEGER NOT NULL,
 PRIMARY KEY(intent_id,part_number)
);
CREATE TRIGGER IF NOT EXISTS resource_parts_legacy_insert AFTER INSERT ON resource_transfer_parts
BEGIN
 INSERT INTO resource_transfer_part_receipts(intent_id,part_number,etag,sha256,size_bytes)
 VALUES(NEW.intent_id,NEW.part_number,NEW.etag,NEW.sha256,NEW.size_bytes)
 ON CONFLICT(intent_id,part_number) DO UPDATE SET etag=excluded.etag,sha256=excluded.sha256,size_bytes=excluded.size_bytes;
END;
CREATE TRIGGER IF NOT EXISTS resource_parts_legacy_update AFTER UPDATE ON resource_transfer_parts
BEGIN
 INSERT INTO resource_transfer_part_receipts(intent_id,part_number,etag,sha256,size_bytes)
 VALUES(NEW.intent_id,NEW.part_number,NEW.etag,NEW.sha256,NEW.size_bytes)
 ON CONFLICT(intent_id,part_number) DO UPDATE SET etag=excluded.etag,sha256=excluded.sha256,size_bytes=excluded.size_bytes;
END;
INSERT OR IGNORE INTO resource_transfer_part_receipts(intent_id,part_number,etag,sha256,size_bytes)
SELECT intent_id,part_number,etag,sha256,size_bytes FROM resource_transfer_parts;
INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES('0098','expanded multipart receipts preserving legacy rollout writes','resources-upload-fk-repair');
