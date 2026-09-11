PRAGMA foreign_keys = ON;

ALTER TABLE admin_exam_date_estimates ADD COLUMN estimated_end_date TEXT;
UPDATE admin_exam_date_estimates SET estimated_end_date=estimated_date WHERE estimated_end_date IS NULL;

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0043','from-through exam windows for admin provisional countdowns','phase-12-operations-admin-platform');
