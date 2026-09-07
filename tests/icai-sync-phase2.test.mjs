import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");
const migrationPath = "d1/migrations/0024_icai_source_bootstrap.sql";

test("Phase 2 seeds one durable official ICAI source for each CA level", () => {
  const migration = read(migrationPath);
  assert.match(migration, /icai-foundation-course/);
  assert.match(migration, /https:\/\/www\.icai\.org\/category\/foundation-course/);
  assert.match(migration, /\["foundation"\]/);
  assert.match(migration, /icai-intermediate-course/);
  assert.match(migration, /https:\/\/www\.icai\.org\/category\/intermediate-course/);
  assert.match(migration, /\["intermediate"\]/);
  assert.match(migration, /icai-final-course/);
  assert.match(migration, /https:\/\/www\.icai\.org\/category\/final-course/);
  assert.match(migration, /\["final"\]/);
  assert.equal((migration.match(/'resource_hub'/g) ?? []).length, 3);
  assert.equal((migration.match(/'course_resource_hub'/g) ?? []).length, 3);
});

test("Phase 2 source bootstrap is idempotent without erasing sync health history", () => {
  const migration = read(migrationPath);
  const updateClause = migration.split("ON CONFLICT(id) DO UPDATE SET")[1]?.split("INSERT OR IGNORE INTO _ca_schema_migrations")[0] ?? "";
  assert.match(updateClause, /is_active=1/);
  assert.match(updateClause, /updated_at=CURRENT_TIMESTAMP/);
  assert.doesNotMatch(updateClause, /etag\s*=/);
  assert.doesNotMatch(updateClause, /last_modified\s*=/);
  assert.doesNotMatch(updateClause, /last_content_hash\s*=/);
  assert.doesNotMatch(updateClause, /last_attempt_at\s*=/);
  assert.doesNotMatch(updateClause, /last_success_at\s*=/);
  assert.doesNotMatch(updateClause, /last_error_at\s*=/);
  assert.doesNotMatch(updateClause, /last_error\s*=/);
  assert.doesNotMatch(updateClause, /consecutive_failures\s*=/);
  assert.match(migration, /VALUES \('0024'/);
});

test("fresh D1 validation reapplies the source bootstrap and verifies all three seeded sources", () => {
  const validator = read("scripts/validate-d1-hot-indexes.mjs");
  assert.match(validator, /0024_icai_source_bootstrap\.sql/);
  assert.match(validator, /seededSourceIds/);
  assert.match(validator, /ICAI source bootstrap did not retain exactly three seeded active sources/);
  assert.match(validator, /ICAI source bootstrap migration was not recorded exactly once/);
});

test("retained Cloudflare D1 deployment applies and verifies ICAI source bootstrap before Worker rollout", () => {
  const workflow = read(".github/workflows/deploy-staging.yml");
  const migrationIndex = workflow.indexOf("0024_icai_source_bootstrap.sql");
  const workerIndex = workflow.indexOf("- name: Deploy ICAI service");
  assert.ok(migrationIndex >= 0, "0024 must be in the retained D1 deployment path");
  assert.ok(workerIndex > migrationIndex, "0024 must apply before the ICAI Worker is deployed");
  assert.match(workflow, /'0024'/);
  assert.match(workflow, /icai_active_seeded_sources/);
  assert.match(workflow, /icai-foundation-course/);
  assert.match(workflow, /icai-intermediate-course/);
  assert.match(workflow, /icai-final-course/);
});
