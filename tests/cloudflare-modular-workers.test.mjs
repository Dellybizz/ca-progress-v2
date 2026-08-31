import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("heavy ICAI background processing lives outside the Next OpenNext Workers", () => {
  const proxy = read("lib/icai/sync.ts");
  const engine = read("workers/icai-sync/sync-engine.ts");
  assert.match(engine, /parseOfficialSource/);
  assert.match(engine, /icai_sync_apply_source_batch/);
  assert.match(proxy, /ICAI_SYNC_SERVICE/);
  assert.doesNotMatch(proxy, /parseOfficialSource|retryDelay|MAX_HTML_BYTES|icai_sync_apply_source_batch/);
  assert.doesNotMatch(proxy, /@supabase\/supabase-js/);
});

test("ICAI service stays private behind the public ingress and private Next domains", () => {
  const localRouter = read("wrangler.jsonc");
  const publicRouter = read("wrangler.web.jsonc");
  const service = read("workers/icai-sync/wrangler.jsonc");
  for (const router of [localRouter, publicRouter]) {
    assert.match(router, /"services"\s*:\s*\[/);
    assert.match(router, /"binding"\s*:\s*"ICAI_SYNC_SERVICE"/);
    assert.match(router, /"service"\s*:\s*"ca-progress-v2-icai-sync"/);
  }
  assert.match(publicRouter, /"binding"\s*:\s*"CORE_WEB_SERVICE"/);
  assert.match(publicRouter, /"binding"\s*:\s*"ADMIN_WEB_SERVICE"/);
  assert.match(publicRouter, /"binding"\s*:\s*"COMMUNITY_WEB_SERVICE"/);
  assert.match(publicRouter, /"binding"\s*:\s*"PLANNING_WEB_SERVICE"/);
  assert.match(service, /"name"\s*:\s*"ca-progress-v2-icai-sync"/);
  assert.match(service, /"workers_dev"\s*:\s*false/);
  assert.doesNotMatch(service, /"routes"\s*:/);
});

test("deployment publishes service Workers and split Next servers before the public ingress", () => {
  const pkg = JSON.parse(read("package.json"));
  const splitDeploy = read("scripts/deploy-split-web.mjs");
  assert.equal(pkg.scripts.deploy, "npm run cf:deploy");
  assert.match(pkg.scripts["cf:deploy"], /cf:deploy:icai[\s\S]*cf:deploy:billing[\s\S]*cf:deploy:admin[\s\S]*cf:deploy:web/);
  assert.match(pkg.scripts["cf:deploy:icai"], /workers\/icai-sync\/wrangler\.jsonc/);
  assert.equal(pkg.scripts["cf:deploy:web"], "node scripts/deploy-split-web.mjs");
  const core = splitDeploy.indexOf("workers/web-core/wrangler.jsonc");
  const admin = splitDeploy.indexOf("workers/web-admin/wrangler.jsonc");
  const community = splitDeploy.indexOf("workers/web-community/wrangler.jsonc");
  const planning = splitDeploy.indexOf("workers/web-planning/wrangler.jsonc");
  const router = splitDeploy.indexOf("wrangler.web.jsonc");
  assert.ok(core >= 0 && admin > core && community > admin && planning > community && router > planning);
  assert.match(pkg.scripts["cf:preview:multi"], /wrangler dev --local[\s\S]*wrangler\.jsonc[\s\S]*workers\/web-core\/wrangler\.jsonc[\s\S]*workers\/icai-sync\/wrangler\.jsonc/);
});

test("repository enforces independent headroom below Cloudflare hard bundle limits", () => {
  const pkg = JSON.parse(read("package.json"));
  const gate = read("scripts/check-cloudflare-size-budget.mjs");
  for (const domain of ["core", "admin", "community", "planning"]) {
    assert.match(pkg.scripts[`cf:check:web-${domain}`], new RegExp(`workers/web-${domain}/wrangler\\.jsonc --budget-mib 2\\.70`));
  }
  assert.match(pkg.scripts["cf:check:web-router"], /wrangler\.web\.jsonc --budget-mib 0\.90/);
  assert.match(pkg.scripts["cf:check:icai"], /--budget-mib 1\.50/);
  assert.match(pkg.scripts["cf:check"], /cf:check:icai[\s\S]*cf:check:web-core[\s\S]*cf:check:web-router/);
  assert.match(gate, /compressedMiB > budgetMiB/);
  assert.match(gate, /exceeds the repository budget/);
});
