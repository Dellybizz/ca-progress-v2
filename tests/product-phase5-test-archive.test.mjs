import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("Product Phase 5 stores immutable numbered attempts instead of overwriting retakes", () => {
  const migration = read("d1/migrations/0016_product_phase5_test_archive.sql");
  const service = read("lib/tests/phase5.ts");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS test_attempts/);
  assert.match(migration, /UNIQUE\(user_id,chapter_id,test_stage,attempt_number\)/);
  assert.match(migration, /trg_phase5_test_attempt_no_update/);
  assert.match(migration, /trg_phase5_test_attempt_no_delete/);
  assert.match(service, /MAX\(attempt_number\),0\)\+1 AS next_number/);
  assert.doesNotMatch(service, /UPDATE test_attempts/);
});

test("Product Phase 5 backfills Phase 4 milestone records as Attempt 1 through canonical academic ownership without inventing duration", () => {
  const migration = read("d1/migrations/0016_product_phase5_test_archive.sql");
  const service = read("lib/tests/phase5.ts");
  const ui = read("components/tests/test-archive-workspace.tsx");
  assert.match(migration, /FROM test_stage_records r/);
  assert.match(migration, /'phase4-' \|\| r\.id/);
  assert.match(migration, /JOIN syllabus_versions sv ON sv\.id=c\.syllabus_version_id/);
  assert.match(migration, /sv\.subject_id/);
  assert.match(service, /SELECT c\.id,asm\.subject_id/);
  assert.match(service, /c\.chapter_number AS chapter_number/);
  assert.match(migration, /ROUND\(\(r\.marks_scored \* 100\.0\) \/ r\.marks_total, 2\)/);
  assert.match(migration, /Phase 4 did not store duration/);
  assert.match(migration, /\n  NULL,\n  r\.completed_at/);
  assert.match(ui, /Duration not recorded \(legacy\)/);
});

test("Product Phase 5 attempt saves record marks percentage duration date subject chapter and test number", () => {
  const migration = read("d1/migrations/0016_product_phase5_test_archive.sql");
  const ui = read("components/tests/test-archive-workspace.tsx");
  for (const field of ["marks_scored", "marks_total", "percentage", "duration_minutes", "completed_at", "subject_id", "chapter_id", "test_stage", "attempt_number"]) assert.match(migration, new RegExp(field));
  assert.match(ui, /Marks obtained/);
  assert.match(ui, /Maximum marks/);
  assert.match(ui, /Duration \(minutes\)/);
  assert.match(ui, /Save new attempt/);
});

test("Product Phase 5 first valid attempt advances progress once while later attempts preserve progress", () => {
  const service = read("lib/tests/phase5.ts");
  const migration = read("d1/migrations/0016_product_phase5_test_archive.sql");
  assert.match(service, /const progressChanged = !current\[field\]/);
  assert.match(service, /source: "test_attempt"/);
  assert.match(service, /INSERT INTO progress_events/);
  assert.match(service, /INSERT INTO planner_events/);
  assert.match(migration, /trg_phase5_test1_attempt_progress_guard/);
  assert.match(migration, /trg_phase5_test2_attempt_progress_guard/);
});

test("Product Phase 5 save retries are idempotent and allocation retries do not duplicate attempts", () => {
  const migration = read("d1/migrations/0016_product_phase5_test_archive.sql");
  const service = read("lib/tests/phase5.ts");
  const ui = read("components/tests/test-archive-workspace.tsx");
  assert.match(migration, /UNIQUE\(user_id,idempotency_key\)/);
  assert.match(service, /getAttemptByIdempotency/);
  assert.match(service, /retry: true/);
  assert.match(service, /allocationTry < 4/);
  assert.match(service, /looksUnique\(error\)/);
  assert.match(ui, /idempotencyKey/);
  assert.match(ui, /no duplicate was created/);
});

test("Product Phase 5 ownership is enforced in D1 and at every private attachment boundary", () => {
  const migration = read("d1/migrations/0016_product_phase5_test_archive.sql");
  const issue = read("app/api/tests/attachments/upload-url/route.ts");
  const complete = read("app/api/tests/attachments/upload-complete/route.ts");
  const access = read("app/api/tests/attachments/[id]/access/route.ts");
  assert.match(migration, /UNIQUE\(id,user_id\)/);
  assert.match(migration, /FOREIGN KEY\(attempt_id,user_id\) REFERENCES test_attempts\(id,user_id\)/);
  assert.match(issue, /getOwnedPhase5Attempt\(user\.id, attemptId\)/);
  assert.match(issue, /createR2PresignedUrl\(\{ key: objectKey, method: "PUT"/);
  assert.match(issue, /test-attempts\/\$\{user\.id\}\/\$\{attempt\.id\}/);
  assert.match(complete, /intent\.user_id !== user\.id/);
  assert.match(complete, /bucket\.head\(intent\.object_key\)/);
  assert.match(complete, /test_attempt_attachments/);
  assert.match(access, /getOwnedPhase5Attachment\(user\.id, id\)/);
  assert.match(access, /method: "GET"/);
});

test("Product Phase 5 attachment completion is retry-safe and never exposes public R2 objects", () => {
  const complete = read("app/api/tests/attachments/upload-complete/route.ts");
  const access = read("app/api/tests/attachments/[id]/access/route.ts");
  const ui = read("components/tests/test-archive-workspace.tsx");
  assert.match(complete, /intent\.status === "completed" && intent\.attachment_id/);
  assert.match(complete, /retry: true/);
  assert.match(complete, /OBJECT_SIZE_MISMATCH/);
  assert.match(complete, /OBJECT_MIME_MISMATCH/);
  assert.match(access, /expiresInSeconds: 300/);
  assert.doesNotMatch(access, /visibility|public/);
  assert.match(ui, /complete\.status >= 500/);
});

test("Product Phase 5 Mistake Journal stores the complete required category set and filters it", () => {
  const types = read("lib/tests/phase5-types.ts");
  const service = read("lib/tests/phase5.ts");
  const ui = read("components/tests/test-archive-workspace.tsx");
  for (const category of ["conceptual", "calculation", "forgot_provision_formula", "presentation", "time_management", "didnt_revise", "silly_mistake", "didnt_understand_question", "other"]) assert.match(types, new RegExp(category));
  assert.match(service, /mistakeNote && parsedMistakes\.length === 0 \? \["other"\]/);
  assert.match(ui, /Mistake Journal/);
  assert.match(ui, /journalSubject/);
  assert.match(ui, /journalChapter/);
  assert.match(ui, /journalCategory/);
  assert.match(ui, /Mistake note \(optional\)/);
});

test("Product Phase 5 reopen and review surfaces do not mutate historical attempts", () => {
  const legacyRoute = read("app/api/tests/stage/route.ts");
  const ui = read("components/tests/test-archive-workspace.tsx");
  const page = read("app/(student)/tests/page.tsx");
  assert.match(legacyRoute, /TEST_STAGE_MUTATION_RETIRED/);
  assert.match(legacyRoute, /status: 410/);
  assert.match(ui, /retake never overwrites an earlier result/i);
  assert.match(ui, /Attempt history/);
  assert.match(ui, /openAttachment/);
  assert.match(page, /TestArchiveWorkspace/);
  assert.doesNotMatch(page, /TestProgressWorkspace/);
});

test("Product Phase 5 production deployment applies and verifies migration 0016 before web rollout", () => {
  const workflow = read(".github/workflows/deploy-staging.yml");
  const retainedMigrations = read("scripts/apply-retained-d1-migrations.mjs");
  const migration = read("d1/migrations/0016_product_phase5_test_archive.sql");
  assert.match(workflow, /npm run cf:migrate:retained/);
  assert.match(retainedMigrations, /0016_product_phase5_test_archive\.sql/);
  assert.match(retainedMigrations, /\["0015"[\s\S]*\["0016"/);
  assert.match(workflow, /phase5_test_attempts/);
  assert.match(workflow, /phase5_test_mistakes/);
  assert.match(workflow, /phase5_test_attachments/);
  assert.match(migration, /VALUES \('0016'/);
  assert.match(migration, /INSERT OR IGNORE INTO _ca_schema_migrations/);
});
