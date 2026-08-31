import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("heavy ICAI background processing lives outside the Next OpenNext Worker", () => {
  const proxy = read("lib/icai/sync.ts");
  const engine = read("workers/icai-sync/sync-engine.ts");
  assert.match(engine, /parseOfficialSource/);
  assert.match(engine, /icai_sync_apply_source_batch/);
  assert.match(proxy, /ICAI_SYNC_SERVICE/);
  assert.doesNotMatch(proxy, /parseOfficialSource|retryDelay|MAX_HTML_BYTES|icai_sync_apply_source_batch/);
  assert.doesNotMatch(proxy, /@supabase\/supabase-js/);
});

test("one OpenNext web Worker keeps heavy and privileged engines behind private service bindings", () => {
  const localWeb = read("wrangler.jsonc");
  const publicWeb = read("wrangler.web.jsonc");
  const openNext = read("open-next.config.ts");
  const customWorker = read("custom-worker.ts");

  for (const web of [localWeb, publicWeb]) {
    assert.match(web, /"binding"\s*:\s*"ICAI_SYNC_SERVICE"/);
    assert.match(web, /"service"\s*:\s*"ca-progress-v2-icai-sync"/);
    assert.match(web, /"binding"\s*:\s*"BILLING_SERVICE"/);
    assert.match(web, /"service"\s*:\s*"ca-progress-v2-billing"/);
    assert.match(web, /"binding"\s*:\s*"ADMIN_OPS_SERVICE"/);
    assert.match(web, /"service"\s*:\s*"ca-progress-v2-admin-ops"/);
    assert.match(web, /"binding"\s*:\s*"USER_RESOURCES_R2"/);
    assert.doesNotMatch(web, /CORE_WEB_SERVICE|ADMIN_WEB_SERVICE|COMMUNITY_WEB_SERVICE|PLANNING_WEB_SERVICE/);
  }

  assert.doesNotMatch(openNext, /functions\s*:/);
  assert.match(openNext, /defineCloudflareConfig\(\)/);
  assert.match(customWorker, /\.\/\.open-next\/worker\.js/);
  assert.doesNotMatch(customWorker, /routeService|x-ca-progress-next-internal/);

  for (const directory of ["web-core", "web-admin", "web-community", "web-planning"]) {
    assert.equal(existsSync(join(root, "workers", directory)), false, `${directory} should not be a deployment unit`);
  }
});

test("default deployment is a single web deployment while specialist services remain explicitly deployable", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.scripts.deploy, "npm run cf:deploy");
  assert.equal(pkg.scripts["cf:deploy"], "npm run cf:build && npm run cf:deploy:web");
  assert.equal(pkg.scripts["cf:deploy:web"], "opennextjs-cloudflare deploy --config=wrangler.web.jsonc");
  assert.match(pkg.scripts["cf:deploy:services"], /cf:deploy:icai[\s\S]*cf:deploy:billing[\s\S]*cf:deploy:admin/);
  assert.match(pkg.scripts["cf:deploy:all"], /cf:build[\s\S]*cf:deploy:services[\s\S]*cf:deploy:web/);
  assert.doesNotMatch(pkg.scripts["cf:deploy"], /cf:deploy:(?:icai|billing|admin|services)/);
  assert.match(pkg.scripts["cf:preview:multi"], /wrangler dev[\s\S]*wrangler\.web\.jsonc[\s\S]*workers\/icai-sync\/wrangler\.jsonc[\s\S]*workers\/billing\/wrangler\.jsonc[\s\S]*workers\/admin-ops\/wrangler\.jsonc/);
});

test("repository enforces independent headroom below Cloudflare hard bundle limits", () => {
  const pkg = JSON.parse(read("package.json"));
  const gate = read("scripts/check-cloudflare-size-budget.mjs");
  assert.match(pkg.scripts["cf:check:web"], /wrangler\.web\.jsonc --budget-mib 2\.80/);
  assert.match(pkg.scripts["cf:check:icai"], /--budget-mib 1\.50/);
  assert.match(pkg.scripts["cf:check:billing"], /--budget-mib 0\.75/);
  assert.match(pkg.scripts["cf:check:admin"], /--budget-mib 1\.00/);
  assert.match(pkg.scripts["cf:check"], /cf:check:icai[\s\S]*cf:check:billing[\s\S]*cf:check:admin[\s\S]*cf:check:web/);
  assert.match(gate, /compressedMiB > budgetMiB/);
  assert.match(gate, /exceeds the repository budget/);
});
