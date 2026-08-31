import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const deployHelper = fs.readFileSync("scripts/run-wrangler-deploy.mjs", "utf8");
const splitDeploy = fs.readFileSync("scripts/deploy-split-web.mjs", "utf8");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));

test("Cloudflare connected-build name override is removed for multi-worker deploys", () => {
  assert.match(deployHelper, /delete env\.WRANGLER_CI_OVERRIDE_NAME/);
  assert.match(splitDeploy, /delete env\.WRANGLER_CI_OVERRIDE_NAME/);
});

test("private service deploy scripts use the override-safe Wrangler helper", () => {
  assert.match(pkg.scripts["cf:deploy:icai"], /run-wrangler-deploy\.mjs workers\/icai-sync\/wrangler\.jsonc/);
  assert.match(pkg.scripts["cf:deploy:billing"], /run-wrangler-deploy\.mjs workers\/billing\/wrangler\.jsonc/);
  assert.match(pkg.scripts["cf:deploy:admin"], /run-wrangler-deploy\.mjs workers\/admin-ops\/wrangler\.jsonc/);
});
