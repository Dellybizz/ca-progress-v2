import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("Product Phase 4 stores one current Test 1/Test 2 marks record per chapter milestone", () => {
  const migration = read("d1/migrations/0015_product_phase4_progress_test_integration.sql");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS test_stage_records/);
  assert.match(migration, /UNIQUE\(user_id,chapter_id,test_stage\)/);
  assert.match(migration, /CHECK\(test_stage IN \('test_1','test_2'\)\)/);
  assert.match(migration, /CHECK\(marks_scored <= marks_total\)/);
  assert.match(migration, /progress_event_id TEXT UNIQUE REFERENCES progress_events/);
  assert.match(migration, /VALUES \('0015'/);
  assert.doesNotMatch(migration, /CREATE TABLE IF NOT EXISTS test_attempts/);
});

test("Product Phase 4 enforces the progression graph in D1 as well as the service", () => {
  const migration = read("d1/migrations/0015_product_phase4_progress_test_integration.sql");
  const hot = read("lib/data/d1/hot-screens.ts");
  assert.match(migration, /trg_phase4_progress_insert_guard/);
  assert.match(migration, /trg_phase4_progress_update_guard/);
  assert.match(migration, /NEW\.revision_1_at IS NOT NULL AND NEW\.completed_at IS NULL/);
  assert.match(migration, /NEW\.test_2_at IS NOT NULL AND NEW\.test_1_at IS NULL/);
  assert.match(hot, /Revision 1 requires Completed first/);
  assert.match(hot, /Test 2 requires Test 1 first/);
});

test("Product Phase 4 marks save validates ownership, applicability, marks and prerequisites server-side", () => {
  const service = read("lib/tests/phase4.ts");
  const route = read("app/api/tests/stage/route.ts");
  assert.match(service, /assertApplicableChapter/);
  assert.match(service, /p\.user_id=\?2/);
  assert.match(service, /First Completion is required before saving a test/);
  assert.match(service, /Test 2 requires Test 1 first/);
  assert.match(service, /Marks scored cannot exceed total marks/);
  assert.match(service, /completed test cannot be dated in the future/);
  assert.match(route, /optionalUser\(\)/);
  assert.match(route, /status: 401/);
});

test("Product Phase 4 saving marks updates progress once and emits the shared progress event boundary", () => {
  const service = read("lib/tests/phase4.ts");
  assert.match(service, /INSERT INTO progress_events/);
  assert.match(service, /'progress_changed','chapter_progress'/);
  assert.match(service, /source: "test_stage_record"/);
  assert.match(service, /if \(existing && state\[field\]\)/);
  assert.match(service, /progressChanged: false/);
  assert.match(service, /UPDATE test_stage_records/);
});

test("Product Phase 4 removes the second manual Test 1/Test 2 checkbox path", () => {
  const progressRoute = read("app/api/progress/route.ts");
  const tracker = read("components/progress/progress-tracker.tsx");
  const testsPage = read("app/(student)/tests/page.tsx");
  const testsUi = read("components/tests/test-progress-workspace.tsx");
  assert.match(progressRoute, /body\.stage === "test_1" \|\| body\.stage === "test_2"/);
  assert.match(progressRoute, /Progress updates automatically; no second checkbox is required/);
  assert.match(tracker, /router\.push\(`\/tests\?chapterId=/);
  assert.match(testsPage, /getPhase4TestStageRecords/);
  assert.match(testsUi, /There is no second progress checkbox/);
});

test("Product Phase 4 keeps safe recovery and prevents clearing a marks-backed milestone generically", () => {
  const migration = read("d1/migrations/0015_product_phase4_progress_test_integration.sql");
  const service = read("lib/tests/phase4.ts");
  assert.match(migration, /trg_phase4_test1_backed_progress_guard/);
  assert.match(migration, /trg_phase4_test2_backed_progress_guard/);
  assert.match(service, /Undo Test 2 before removing Test 1/);
  assert.match(service, /Progress changed after this test; undo would overwrite a newer change/);
  assert.match(service, /DELETE FROM test_stage_records/);
  assert.match(service, /action,previous_state,new_state,reverts_event_id/);
});

test("Product Phase 4 shows completion and last-revision dates while percentages stay state-derived and XP-independent", () => {
  const tracker = read("components/progress/progress-tracker.tsx");
  const progress = read("lib/progress/service.ts");
  assert.match(tracker, /First completion:/);
  assert.match(tracker, /Last revision:/);
  assert.match(progress, /Number\(Boolean\(row\.completed_at\)\)/);
  assert.match(progress, /Number\(Boolean\(row\.revision_1_at\)\)/);
  assert.match(progress, /Number\(Boolean\(row\.test_2_at\)\)/);
  assert.doesNotMatch(progress, /\bxp\b|experience_points|xp_total/i);
});

test("Product Phase 4 exposes the same progress truth to Today, Analytics and Chapter Hub", () => {
  const service = read("lib/tests/phase4.ts");
  const analytics = read("app/(student)/analytics/page.tsx");
  const hub = read("lib/chapter-hub/service.ts");
  assert.match(service, /'progress_changed','chapter_progress'/);
  assert.match(analytics, /getProgressPageModel\(\)/);
  assert.match(analytics, /analytics\.testPercent/);
  assert.match(analytics, /analytics\.revisionPercent/);
  assert.match(hub, /FROM chapter_progress WHERE user_id=\?1 AND chapter_id=\?2/);
  assert.match(hub, /FROM progress_events WHERE user_id=\?1 AND chapter_id=\?2/);
});

test("Product Phase 4 production deployment applies and verifies migration 0015 before web rollout", () => {
  const workflow = read(".github/workflows/deploy-staging.yml");
  const retainedMigrations = read("scripts/apply-retained-d1-migrations.mjs");
  const migration = read("d1/migrations/0015_product_phase4_progress_test_integration.sql");
  assert.match(workflow, /npm run cf:migrate:retained/);
  assert.match(retainedMigrations, /0015_product_phase4_progress_test_integration\.sql/);
  assert.match(retainedMigrations, /\["0012"[\s\S]*\["0013"[\s\S]*\["0014"[\s\S]*\["0015"/);
  assert.match(workflow, /phase4_test_stage_records/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS/);
  assert.match(migration, /CREATE TRIGGER IF NOT EXISTS/);
  assert.match(migration, /INSERT OR IGNORE INTO _ca_schema_migrations/);
});
