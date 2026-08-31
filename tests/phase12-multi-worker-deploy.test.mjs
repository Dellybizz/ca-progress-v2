import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const web = fs.readFileSync("wrangler.web.jsonc", "utf8");

test("normal Cloudflare deployment remains a single connected-build-safe web deploy", () => {
  assert.equal(pkg.scripts["cf:deploy"], "npm run cf:build && npm run cf:deploy:web");
  assert.equal(pkg.scripts["cf:deploy:web"], "opennextjs-cloudflare deploy --config=wrangler.web.jsonc");
  assert.match(web, /"name"\s*:\s*"ca-progress-v2"/);
  assert.doesNotMatch(web, /CORE_WEB_SERVICE|ADMIN_WEB_SERVICE|COMMUNITY_WEB_SERVICE|PLANNING_WEB_SERVICE/);
  assert.equal(fs.existsSync("scripts/run-wrangler-deploy.mjs"), false);
  assert.equal(fs.existsSync("scripts/deploy-split-web.mjs"), false);
});

test("specialist private services remain independently deployable when their code changes", () => {
  assert.equal(pkg.scripts["cf:deploy:icai"], "wrangler deploy -c workers/icai-sync/wrangler.jsonc");
  assert.equal(pkg.scripts["cf:deploy:billing"], "wrangler deploy -c workers/billing/wrangler.jsonc");
  assert.equal(pkg.scripts["cf:deploy:admin"], "wrangler deploy -c workers/admin-ops/wrangler.jsonc");
  assert.match(pkg.scripts["cf:deploy:services"], /cf:deploy:icai[\s\S]*cf:deploy:billing[\s\S]*cf:deploy:admin/);
  assert.match(pkg.scripts["cf:deploy:all"], /cf:build[\s\S]*cf:deploy:services[\s\S]*cf:deploy:web/);

  const configs = [
    ["workers/icai-sync/wrangler.jsonc", "ca-progress-v2-icai-sync"],
    ["workers/billing/wrangler.jsonc", "ca-progress-v2-billing"],
    ["workers/admin-ops/wrangler.jsonc", "ca-progress-v2-admin-ops"],
  ];
  for (const [path, name] of configs) {
    const config = fs.readFileSync(path, "utf8");
    assert.match(config, new RegExp(`"name"\\s*:\\s*"${name}"`));
    assert.match(config, /"workers_dev"\s*:\s*false/);
  }
});
