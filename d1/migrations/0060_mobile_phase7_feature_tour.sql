PRAGMA foreign_keys = ON;

ALTER TABLE profiles ADD COLUMN feature_tour_step INTEGER NOT NULL DEFAULT 0 CHECK(feature_tour_step BETWEEN 0 AND 14);
ALTER TABLE profiles ADD COLUMN feature_tour_completed_at TEXT;

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0060','mobile phase 7 cross-device feature tour progress','mobile-phase6-offline-sync');
