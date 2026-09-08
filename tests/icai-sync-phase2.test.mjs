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

test("fresh D1 validation preserves the original three Phase 2 level sources inside the six-source Phase 1 registry", () => {
  const validator = read("scripts/validate-d1-hot-indexes.mjs");
  assert.match(validator, /0024_icai_source_bootstrap\.sql/);
  assert.match(validator, /seededSourceIds/);
  for (const id of ["icai-foundation-course", "icai-intermediate-course", "icai-final-course"]) {
    assert.match(validator, new RegExp(id));
  }
  assert.match(validator, /ICAI Phase 1 bootstrap did not retain exactly six active current sources/);
  assert.match(validator, /0024_icai_source_bootstrap\.sql.*Wrangler migration was not recorded exactly once/s);
});

test("retained Cloudflare D1 deployment applies and verifies ICAI source bootstrap before Worker rollout", () => {
  const workflow = read(".github/workflows/deploy-staging.yml");
  const migrator = read("scripts/apply-retained-d1-migrations.mjs");
  const migrationStep = workflow.indexOf("- name: Apply missing retained D1 migrations");
  const workerIndex = workflow.indexOf("- name: Deploy ICAI service");
  assert.match(migrator, /\["0024", "d1\/migrations\/0024_icai_source_bootstrap\.sql"\]/);
  assert.match(migrator, /\["0030", "d1\/migrations\/0030_icai_phase1_current_sources\.sql"\]/);
  assert.match(migrator, /_ca_schema_migrations/);
  assert.ok(migrationStep >= 0, "retained D1 deployment must invoke the ledger-aware migrator");
  assert.ok(workerIndex > migrationStep, "retained migrations, including the current Phase 1 source registry, must be verified before the ICAI Worker is deployed");
  assert.match(workflow, /icai_active_seeded_sources/);
  assert.match(workflow, /icai-foundation-course/);
  assert.match(workflow, /icai-intermediate-course/);
  assert.match(workflow, /icai-final-course/);
});
