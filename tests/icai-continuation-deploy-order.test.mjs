import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("ICAI continuation migration is mandatory before live continuation execution", () => {
  const packageJson = JSON.parse(read("package.json"));
  const deployment = read(".github/workflows/deploy-staging.yml");
  const migrator = read("scripts/apply-retained-d1-migrations.mjs");
  const icaiDeploy = packageJson.scripts["cf:deploy:icai"];
  const webDeploy = packageJson.scripts["cf:deploy:web"];

  assert.match(migrator, /0028_icai_sync_continuation\.sql/);
  assert.match(migrator, /_ca_schema_migrations/);
  assert.match(migrator, /already applied; skipping replay/);
  assert.match(migrator, /PRAGMA foreign_key_check/);
  assert.ok(
    icaiDeploy.indexOf("cf:migrate:retained") < icaiDeploy.indexOf("wrangler deploy"),
    "Direct ICAI deployment must verify/apply retained migrations before deploying the private Worker.",
  );
  assert.ok(
    webDeploy.indexOf("cf:migrate:retained") < webDeploy.indexOf("opennextjs-cloudflare deploy"),
    "Canonical web deployment must verify/apply retained migrations before publishing the web/Queue runtime.",
  );

  const migrationStep = deployment.indexOf("- name: Apply missing retained D1 migrations");
  const privateWorker = deployment.indexOf("- name: Deploy ICAI service");
  const webStep = deployment.indexOf("- name: Deploy web runtime");
  const liveProof = deployment.indexOf("- name: ICAI Phase 5 live pipeline proof");
  assert.ok(migrationStep >= 0, "Deployment must run the ledger-aware retained migration step.");
  assert.ok(privateWorker > migrationStep, "Private ICAI Worker must deploy after retained migration verification.");
  assert.ok(webStep > privateWorker && liveProof > webStep, "Live ICAI proof must run after private and web rollout.");
  assert.match(deployment, /run: npm run cf:migrate:retained/);
  assert.doesNotMatch(
    deployment,
    /--file=d1\/migrations\/0015_product_phase4_progress_test_integration\.sql/,
    "Deployment must not blindly replay already-applied migration 0015.",
  );
});
