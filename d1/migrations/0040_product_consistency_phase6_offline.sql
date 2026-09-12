-- Additive. Receipts share the same atomic D1 batch as the domain writes.
CREATE TABLE IF NOT EXISTS offline_mutation_receipts (
  user_id TEXT NOT NULL,
  mutation_id TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  entity_key TEXT NOT NULL,
  entity_after_json TEXT,
  response_json TEXT NOT NULL,
  response_status INTEGER NOT NULL,
  guard_ok INTEGER NOT NULL CHECK (guard_ok = 1),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, mutation_id)
);
INSERT OR IGNORE INTO _ca_schema_migrations(version,description,source_freeze_commit) VALUES ('0040','product consistency phase 6 atomic offline receipts','ebfc37e26c2d4240d2e65874fa1ca03e4bf6666b');
