-- ICAI Phase 5 production repair — separate uploaded-resource and ICAI-resource mapping parents.
--
-- The historical resource_*_map tables were created with resource_id referencing
-- uploaded_resources(id), while the ICAI sync engine also intentionally uses those
-- logical map names for icai_resources. SQLite cannot express a foreign key to two
-- possible parent tables, so real ICAI writes failed with SQLITE_CONSTRAINT_FOREIGNKEY.
--
-- Preserve the logical resource_*_map contract as writable compatibility views,
-- but keep physical rows in parent-specific tables with real foreign keys.
PRAGMA foreign_keys = ON;

ALTER TABLE resource_attempt_map RENAME TO uploaded_resource_attempt_map;
ALTER TABLE resource_subject_map RENAME TO uploaded_resource_subject_map;

CREATE TABLE icai_resource_attempt_map (
  resource_id TEXT NOT NULL REFERENCES icai_resources(id) ON DELETE CASCADE,
  attempt_id TEXT NOT NULL REFERENCES exam_attempts(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(resource_id, attempt_id)
);

CREATE TABLE icai_resource_subject_map (
  resource_id TEXT NOT NULL REFERENCES icai_resources(id) ON DELETE CASCADE,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(resource_id, subject_id)
);

CREATE INDEX icai_resource_attempt_map_attempt_idx
  ON icai_resource_attempt_map(attempt_id, resource_id);
CREATE INDEX icai_resource_subject_map_subject_idx
  ON icai_resource_subject_map(subject_id, resource_id);

CREATE VIEW resource_attempt_map AS
SELECT resource_id, attempt_id, created_at FROM uploaded_resource_attempt_map
UNION ALL
SELECT resource_id, attempt_id, created_at FROM icai_resource_attempt_map;

CREATE VIEW resource_subject_map AS
SELECT resource_id, subject_id, created_at FROM uploaded_resource_subject_map
UNION ALL
SELECT resource_id, subject_id, created_at FROM icai_resource_subject_map;

-- Route writes to the correct physical parent table. ICAI wins only when an
-- identical ID exists in both domains, which preserves the ICAI sync caller's
-- explicit resource identity without weakening either physical foreign key.
CREATE TRIGGER resource_attempt_map_insert_icai
INSTEAD OF INSERT ON resource_attempt_map
WHEN EXISTS (SELECT 1 FROM icai_resources WHERE id = NEW.resource_id)
BEGIN
  INSERT OR IGNORE INTO icai_resource_attempt_map(resource_id, attempt_id, created_at)
  VALUES(NEW.resource_id, NEW.attempt_id, COALESCE(NEW.created_at, CURRENT_TIMESTAMP));
END;

CREATE TRIGGER resource_attempt_map_insert_uploaded
INSTEAD OF INSERT ON resource_attempt_map
WHEN NOT EXISTS (SELECT 1 FROM icai_resources WHERE id = NEW.resource_id)
 AND EXISTS (SELECT 1 FROM uploaded_resources WHERE id = NEW.resource_id)
BEGIN
  INSERT OR IGNORE INTO uploaded_resource_attempt_map(resource_id, attempt_id, created_at)
  VALUES(NEW.resource_id, NEW.attempt_id, COALESCE(NEW.created_at, CURRENT_TIMESTAMP));
END;

CREATE TRIGGER resource_attempt_map_insert_invalid
INSTEAD OF INSERT ON resource_attempt_map
WHEN NOT EXISTS (SELECT 1 FROM icai_resources WHERE id = NEW.resource_id)
 AND NOT EXISTS (SELECT 1 FROM uploaded_resources WHERE id = NEW.resource_id)
BEGIN
  SELECT RAISE(ABORT, 'resource_attempt_map resource parent not found');
END;

CREATE TRIGGER resource_attempt_map_delete
INSTEAD OF DELETE ON resource_attempt_map
BEGIN
  DELETE FROM uploaded_resource_attempt_map
   WHERE resource_id = OLD.resource_id AND attempt_id = OLD.attempt_id;
  DELETE FROM icai_resource_attempt_map
   WHERE resource_id = OLD.resource_id AND attempt_id = OLD.attempt_id;
END;

CREATE TRIGGER resource_subject_map_insert_icai
INSTEAD OF INSERT ON resource_subject_map
WHEN EXISTS (SELECT 1 FROM icai_resources WHERE id = NEW.resource_id)
BEGIN
  INSERT OR IGNORE INTO icai_resource_subject_map(resource_id, subject_id, created_at)
  VALUES(NEW.resource_id, NEW.subject_id, COALESCE(NEW.created_at, CURRENT_TIMESTAMP));
END;

CREATE TRIGGER resource_subject_map_insert_uploaded
INSTEAD OF INSERT ON resource_subject_map
WHEN NOT EXISTS (SELECT 1 FROM icai_resources WHERE id = NEW.resource_id)
 AND EXISTS (SELECT 1 FROM uploaded_resources WHERE id = NEW.resource_id)
BEGIN
  INSERT OR IGNORE INTO uploaded_resource_subject_map(resource_id, subject_id, created_at)
  VALUES(NEW.resource_id, NEW.subject_id, COALESCE(NEW.created_at, CURRENT_TIMESTAMP));
END;

CREATE TRIGGER resource_subject_map_insert_invalid
INSTEAD OF INSERT ON resource_subject_map
WHEN NOT EXISTS (SELECT 1 FROM icai_resources WHERE id = NEW.resource_id)
 AND NOT EXISTS (SELECT 1 FROM uploaded_resources WHERE id = NEW.resource_id)
BEGIN
  SELECT RAISE(ABORT, 'resource_subject_map resource parent not found');
END;

CREATE TRIGGER resource_subject_map_delete
INSTEAD OF DELETE ON resource_subject_map
BEGIN
  DELETE FROM uploaded_resource_subject_map
   WHERE resource_id = OLD.resource_id AND subject_id = OLD.subject_id;
  DELETE FROM icai_resource_subject_map
   WHERE resource_id = OLD.resource_id AND subject_id = OLD.subject_id;
END;

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0032','icai resource mapping parent integrity repair','phase-12-operations-admin-platform');
