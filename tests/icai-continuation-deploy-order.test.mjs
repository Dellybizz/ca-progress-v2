import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("ICAI continuation migration is mandatory before live continuation execution", () => {
  const packageJson = JSON.parse(read("package.json"));
  const deployment = read(".github/workflows/deploy-staging.yml");
  const migration = packageJson.scripts["cf:migrate:icai-continuation"];
  const icaiDeploy = packageJson.scripts["cf:deploy:icai"];
  const webDeploy = packageJson.scripts["cf:deploy:web"];

  assert.match(migration, /0028_icai_sync_continuation\.sql/);
  assert.ok(
    icaiDeploy.indexOf("cf:migrate:icai-continuation") < icaiDeploy.indexOf("wrangler deploy"),
    "Direct ICAI deployment must apply migration 0028 before deploying the private Worker.",
  );
  assert.ok(
    webDeploy.indexOf("cf:migrate:icai-continuation") < webDeploy.indexOf("opennextjs-cloudflare deploy"),
    "Canonical web deployment must apply migration 0028 before publishing the web/Queue runtime.",
  );

  const webStep = deployment.indexOf("- name: Deploy web runtime");
  const liveProof = deployment.indexOf("- name: ICAI Phase 5 live pipeline proof");
  assert.ok(webStep >= 0 && liveProof > webStep, "Live ICAI proof must run after cf:deploy:web applies migration 0028.");
  assert.match(deployment, /run: npm run cf:deploy:web/);
});
