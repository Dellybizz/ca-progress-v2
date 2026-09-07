-- ICAI Sync Phase 3 — trusted review decisions and audit enforcement.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS icai_review_decisions (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL UNIQUE,
  change_event_id INTEGER NOT NULL,
  run_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('approved','rejected')),
  reviewer_user_id TEXT NOT NULL,
  decision_notes TEXT,
  proposed_patch TEXT NOT NULL,
  canonical_before TEXT NOT NULL,
  canonical_after TEXT NOT NULL,
  decided_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (json_valid(proposed_patch)),
  CHECK (json_valid(canonical_before)),
  CHECK (json_valid(canonical_after))
);

CREATE INDEX IF NOT EXISTS idx_icai_review_decisions_entity
  ON icai_review_decisions(entity_type, entity_id, decided_at DESC);
CREATE INDEX IF NOT EXISTS idx_icai_review_decisions_change_event
  ON icai_review_decisions(change_event_id);

-- Any approved/rejected queue transition must be accompanied by the append-only
-- decision record inserted in the same D1 batch. This closes the legacy direct-RPC
-- path and makes canonical application + decision history one atomic unit.
CREATE TRIGGER IF NOT EXISTS icai_review_queue_requires_audit
BEFORE UPDATE OF status ON icai_review_queue
WHEN OLD.status IN ('pending','applying')
  AND NEW.status IN ('approved','rejected')
  AND NOT EXISTS (
    SELECT 1
    FROM icai_review_decisions d
    WHERE d.review_id = OLD.id AND d.decision = NEW.status
  )
BEGIN
  SELECT RAISE(ABORT, 'ICAI review decision requires audit record');
END;

CREATE TRIGGER IF NOT EXISTS icai_review_queue_blocks_dismissal
BEFORE UPDATE OF status ON icai_review_queue
WHEN OLD.status IN ('pending','applying') AND NEW.status = 'dismissed'
BEGIN
  SELECT RAISE(ABORT, 'ICAI review items must be approved, rejected, or superseded');
END;

-- Decision rows are append-only. Corrections are represented by a later review item,
-- never by rewriting the historical decision record.
CREATE TRIGGER IF NOT EXISTS icai_review_decisions_no_update
BEFORE UPDATE ON icai_review_decisions
BEGIN
  SELECT RAISE(ABORT, 'ICAI review decisions are append-only');
END;

CREATE TRIGGER IF NOT EXISTS icai_review_decisions_no_delete
BEFORE DELETE ON icai_review_decisions
BEGIN
  SELECT RAISE(ABORT, 'ICAI review decisions are append-only');
END;

INSERT OR IGNORE INTO _ca_schema_migrations(version, description, source_freeze_commit)
VALUES ('0025', 'icai trusted review decisions and audit enforcement', 'phase3-icai-review-audit');
