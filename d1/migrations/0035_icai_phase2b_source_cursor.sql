-- ICAI Phase 2B: durable, bounded within-source continuation.
PRAGMA foreign_keys = ON;

ALTER TABLE icai_sync_source_states ADD COLUMN cursor_offset INTEGER NOT NULL DEFAULT 0 CHECK(cursor_offset >= 0);
ALTER TABLE icai_sync_source_states ADD COLUMN cursor_total INTEGER NOT NULL DEFAULT 0 CHECK(cursor_total >= 0);
ALTER TABLE icai_sync_source_states ADD COLUMN continuation_count INTEGER NOT NULL DEFAULT 0 CHECK(continuation_count >= 0);
ALTER TABLE icai_sync_source_states ADD COLUMN listing_hash TEXT;
ALTER TABLE icai_sync_source_states ADD COLUMN partial_resources TEXT NOT NULL DEFAULT '[]';
ALTER TABLE icai_sync_source_states ADD COLUMN partial_events TEXT NOT NULL DEFAULT '[]';
ALTER TABLE icai_sync_source_states ADD COLUMN resolved_count INTEGER NOT NULL DEFAULT 0 CHECK(resolved_count >= 0);
ALTER TABLE icai_sync_source_states ADD COLUMN dropped_count INTEGER NOT NULL DEFAULT 0 CHECK(dropped_count >= 0);
ALTER TABLE icai_sync_source_states ADD COLUMN unavailable_count INTEGER NOT NULL DEFAULT 0 CHECK(unavailable_count >= 0);

INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit)
VALUES ('0035','icai phase2b durable within-source continuation cursor','phase-12-operations-admin-platform');
