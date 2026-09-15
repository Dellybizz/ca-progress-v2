import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("ICAI sync run acquisition is atomic and records started_at", () => {
  const engine = read("workers/icai-sync/sync-engine.ts");
  assert.match(engine, /started_at,source_total,details/);
  assert.match(engine, /WHERE NOT EXISTS \(SELECT 1 FROM icai_sync_runs WHERE status IN \('queued','running'\)\)/);
  assert.match(engine, /RETURNING id/);
  assert.match(engine, /IcaiSyncAlreadyRunningError/);
});

test("ICAI source redirects are manually followed and every hop is revalidated", () => {
  const engine = read("workers/icai-sync/sync-engine.ts");
  assert.match(engine, /redirect:"manual"/);
  assert.match(engine, /MAX_REDIRECTS = 5/);
  assert.match(engine, /Rejected redirect outside approved ICAI hosts/);
  assert.doesNotMatch(engine, /redirect:"follow"/);
});

test("date-less attempt discoveries preserve an existing verified exam date", () => {
  const engine = read("workers/icai-sync/sync-engine.ts");
  assert.match(engine, /parsedAttempt\.startDate\?\?existingAttempt\?\.start_date/);
  assert.match(engine, /parsedAttempt\.endDate\?\?existingAttempt\?\.end_date/);
});

test("ICAI review action uses canonical review decisions and dedicated patch application", () => {
  const action = read("app/(admin)/admin/icai-sync/actions.ts");
  const review = read("lib/icai/review.ts");
  assert.match(action, /normalizeIcaiReviewDecision/);
  assert.match(action, /decideIcaiReview\(/);
  assert.doesNotMatch(action, /admin\.rpc\("icai_review_decide"/);
  assert.match(review, /raw==="approve"\|\|raw==="approved"/);
  assert.match(review, /raw==="reject"\|\|raw==="rejected"/);
  assert.match(review, /decision_notes/);
  assert.doesNotMatch(review, /UPDATE icai_review_queue SET review_notes/);
});

test("approval is restricted to known high-impact ICAI entities and updates the audit event", () => {
  const review = read("lib/icai/review.ts");
  assert.match(review, /review\.entity_type==="exam_attempt"/);
  assert.match(review, /review\.entity_type==="exam_event"/);
  assert.match(review, /Unsupported ICAI review entity type/);
  assert.match(review, /UPDATE icai_change_events SET decision_status=/);
  assert.match(review, /applied_at=/);
  assert.match(review, /status='applying'/);
  assert.match(review, /status='pending'/);
});
