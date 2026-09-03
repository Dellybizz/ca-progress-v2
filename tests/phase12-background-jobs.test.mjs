import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Phase 12 has durable queue job types and dead-letter persistence", () => {
  const migration = read("d1/migrations/0010_phase12_background_jobs.sql");
  const worker = read("custom-worker.ts");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS background_jobs/);
  assert.match(migration, /dead_letter/);
  for (const type of ["icai-sync", "notification-fanout", "analytics-aggregate", "attachment-process", "cleanup", "ai-plan-generation"]) {
    assert.match(migration, new RegExp(type.replace("-", "\\-")));
    assert.match(worker, new RegExp(type.replace("-", "\\-")));
  }
  assert.match(worker, /background_job_dead_letters/);
  assert.match(worker, /message\.retry\(\)/);
});

test("dashboard and planner use persisted plans without doing AI work in page request", () => {
  const dashboard = read("lib/dashboard/service.ts");
  const planner = read("lib/planner/dashboard.ts");
  const route = read("app/api/planner/today/route.ts");
  assert.match(dashboard, /getLatestStoredPlanRecommendation/);
  assert.match(planner, /daily_plan_items/);
  assert.match(route, /type: "ai-plan-generation"/);
  assert.match(route, /latest saved plan remains available/);
});

test("uploads enqueue attachment processing after durable metadata commit", () => {
  const upload = read("app/api/resources/upload/route.ts");
  assert.match(upload, /type: "attachment-process"/);
  assert.match(upload, /processing: "queued"/);
});

test("admin job visibility is available privately", () => {
  assert.match(read("app/api/admin/jobs/route.ts"), /requireAdminOperator/);
  assert.match(read("app/api/admin/jobs/route.ts"), /getOpenDeadLetters/);
  assert.match(read("app/(admin)/admin/jobs/page.tsx"), /Open dead letters/);
});
