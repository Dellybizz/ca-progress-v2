import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");
const migrationPath = "d1/migrations/0025_icai_review_audit.sql";

test("Phase 3 review audit migration enforces an append-only decision before final queue state", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE _ca_schema_migrations(version TEXT PRIMARY KEY, description TEXT NOT NULL, source_freeze_commit TEXT NOT NULL, applied_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE icai_review_queue(id TEXT PRIMARY KEY, status TEXT NOT NULL);
  `);
  db.exec(read(migrationPath));
  db.prepare("INSERT INTO icai_review_queue(id,status) VALUES(?,?)").run("review-1", "pending");
  assert.throws(() => db.prepare("UPDATE icai_review_queue SET status='approved' WHERE id='review-1'").run(), /requires audit record/);

  db.prepare(`INSERT INTO icai_review_decisions(
    id,review_id,change_event_id,run_id,source_id,entity_type,entity_id,decision,reviewer_user_id,
    decision_notes,proposed_patch,canonical_before,canonical_after,decided_at
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    "decision-1","review-1",1,"run-1","source-1","exam_attempt","attempt-1","approved","admin-1",null,
    "{}","{}","{}","2026-09-08T00:00:00.000Z",
  );
  db.prepare("UPDATE icai_review_queue SET status='approved' WHERE id='review-1'").run();
  assert.equal(db.prepare("SELECT status FROM icai_review_queue WHERE id='review-1'").get().status, "approved");
  assert.throws(() => db.prepare("UPDATE icai_review_decisions SET decision_notes='changed' WHERE id='decision-1'").run(), /append-only/);
  assert.throws(() => db.prepare("DELETE FROM icai_review_decisions WHERE id='decision-1'").run(), /append-only/);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM _ca_schema_migrations WHERE version='0025'").get().count, 1);
  db.close();
});

test("approval validates queue/change linkage, stale canonical state, snapshot ownership and safe entity whitelists", () => {
  const review = read("lib/icai/review.ts");
  assert.match(review, /change\.run_id!==review\.run_id/);
  assert.match(review, /decision_status!=="pending_review"/);
  assert.match(review, /assertCurrentMatchesOld/);
  assert.match(review, /assertPatchMatchesNew/);
  assert.match(review, /icai_source_snapshots WHERE id=\?1 AND run_id=\?2 AND source_id=\?3/);
  assert.match(review, /ATTEMPT_PATCH_KEYS/);
  assert.match(review, /EVENT_PATCH_KEYS/);
  assert.match(review, /RESOURCE_PATCH_KEYS/);
  assert.match(review, /isApprovedIcaiUrl/);
  assert.match(review, /Only reviewed ICAI resource removal is supported/);
});

test("approval and rejection both append before-after audit snapshots while rejection never queues a canonical update statement", () => {
  const review = read("lib/icai/review.ts");
  const approvalBranch = review.indexOf('if(decision==="approve")');
  const rejectionBranch = review.indexOf("const snapshot=await rejectionSnapshot", approvalBranch);
  const auditInsert = review.indexOf("INSERT INTO icai_review_decisions", rejectionBranch);
  const queueFinalize = review.indexOf("UPDATE icai_review_queue SET status=?1", auditInsert);
  assert.ok(approvalBranch >= 0 && rejectionBranch > approvalBranch);
  assert.ok(auditInsert > rejectionBranch, "audit insert must follow construction of both approval/rejection snapshots");
  assert.ok(queueFinalize > auditInsert, "audit row must exist before terminal queue transition trigger runs");
  assert.match(review, /if\(decision==="approve"\).*statements\.push\(plan\.statement\)/s);
  assert.doesNotMatch(review.slice(rejectionBranch, auditInsert), /statements\.push\([^)]*UPDATE (exam_attempts|exam_events|icai_resources)/s);
  assert.match(review, /canonical_before,canonical_after/);
  assert.match(review, /reviewer_user_id/);
  assert.match(review, /decision_notes/);
});

test("low-confidence attempt/event changes and destructive resource removals require review", () => {
  const client = read("workers/icai-sync/d1-client.ts");
  assert.match(client, /Number\(item\.confidence\?\?1\)<0\.85/);
  assert.match(client, /dateChanged\|\|lowConfidence/g);
  assert.match(client, /An authoritative ICAI listing no longer contains this resource/);
  assert.match(client, /entityType:"resource"/);
  assert.match(client, /changeType:"removed"/);
  const authoritativeBlock = client.slice(client.indexOf("const authoritative="));
  assert.doesNotMatch(authoritativeBlock, /UPDATE icai_resources SET status='removed'/);
  assert.match(authoritativeBlock, /decision:"pending_review"/);
  assert.match(authoritativeBlock, /patch:\{status:"removed",source_snapshot_id:snapshotId\}/);
});

test("repeated review candidates are deduplicated and newer evidence supersedes stale pending candidates", () => {
  const client = read("workers/icai-sync/d1-client.ts");
  assert.match(client, /function candidateKey/);
  assert.match(client, /delete comparable\.source_snapshot_id/);
  assert.match(client, /decision_status='duplicate_suppressed'/);
  assert.match(client, /status='superseded'/);
  assert.match(client, /Superseded by newer official-source evidence/);
  assert.match(client, /return false/);
});
