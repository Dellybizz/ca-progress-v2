import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("Phase 2 seeds one durable official ICAI source for each CA level", () => {
  const migration = read("d1/migrations/0024_icai_source_bootstrap.sql");
  for (const [id, url, level] of [
    ["icai-foundation-course", "https://www.icai.org/category/foundation-course", "foundation"],
    ["icai-intermediate-course", "https://www.icai.org/category/intermediate-course", "intermediate"],
    ["icai-final-course", "https://www.icai.org/category/final-course", "final"],
  ]) {
    assert.match(migration, new RegExp(id));
    assert.match(migration, new RegExp(url.replaceAll(".", "\\.")));
    assert.match(migration, new RegExp(`\\[\\"${level}\\"\\]`));
  }
  assert.match(migration, /resource_hub/);
});

test("Phase 2 source bootstrap is idempotent without erasing sync health history", () => {
  const migration = read("d1/migrations/0024_icai_source_bootstrap.sql");
  assert.match(migration, /INSERT INTO icai_sources/);
  assert.match(migration, /ON CONFLICT\(id\) DO UPDATE SET/);
  const updateClause = migration.split(/ON CONFLICT\(id\) DO UPDATE SET/)[1] ?? "";
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
  const migrator = read("scripts/apply-retained-d1-migrations.mjs");
  const migrationStep = workflow.indexOf("- name: Apply missing retained D1 migrations");
  const workerIndex = workflow.indexOf("- name: Deploy ICAI service");
  assert.match(migrator, /\["0024", "d1\/migrations\/0024_icai_source_bootstrap\.sql"\]/);
  assert.match(migrator, /_ca_schema_migrations/);
  assert.ok(migrationStep >= 0, "retained D1 deployment must invoke the ledger-aware migrator");
  assert.ok(workerIndex > migrationStep, "retained migrations, including 0024, must be verified before the ICAI Worker is deployed");
  assert.match(workflow, /version BETWEEN '0012' AND '0028'/);
  assert.match(workflow, /icai_active_seeded_sources/);
  assert.match(workflow, /icai-foundation-course/);
  assert.match(workflow, /icai-intermediate-course/);
  assert.match(workflow, /icai-final-course/);
});
