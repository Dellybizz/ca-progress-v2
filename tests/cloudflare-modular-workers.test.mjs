import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

test("ICAI service is private and linked only in the final web deployment config", () => {
  const bootstrap = read("wrangler.jsonc");
  const web = read("wrangler.web.jsonc");
  const service = read("workers/icai-sync/wrangler.jsonc");
  assert.doesNotMatch(bootstrap, /"services"\s*:/);
  assert.match(web, /"services"\s*:\s*\[/);
  assert.match(web, /"binding"\s*:\s*"ICAI_SYNC_SERVICE"/);
  assert.match(web, /"service"\s*:\s*"ca-progress-v2-icai-sync"/);
  assert.match(service, /"name"\s*:\s*"ca-progress-v2-icai-sync"/);
  assert.match(service, /"workers_dev"\s*:\s*false/);
  assert.doesNotMatch(service, /"routes"\s*:/);
});

test("deployment self-bootstraps target Worker before deploying bound web Worker", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.scripts.deploy, "npm run cf:deploy");
  assert.match(pkg.scripts["cf:deploy"], /cf:deploy:icai[\s\S]*cf:deploy:web/);
  assert.match(pkg.scripts["cf:deploy:icai"], /workers\/icai-sync\/wrangler\.jsonc/);
  assert.match(pkg.scripts["cf:deploy:web"], /opennextjs-cloudflare deploy --config=wrangler\.web\.jsonc/);
  assert.match(pkg.scripts["cf:preview:multi"], /wrangler dev -c wrangler\.web\.jsonc -c workers\/icai-sync\/wrangler\.jsonc/);
});

test("repository enforces headroom below Cloudflare hard bundle limits", () => {
  const pkg = JSON.parse(read("package.json"));
  const gate = read("scripts/check-cloudflare-size-budget.mjs");
  assert.match(pkg.scripts["cf:check:web"], /--config wrangler.web.jsonc --budget-mib 3.10/);
  assert.match(pkg.scripts["cf:check:icai"], /--budget-mib 1\.50/);
  assert.match(pkg.scripts["cf:check"], /cf:check:icai[\s\S]*cf:check:web/);
  assert.match(gate, /compressedMiB > budgetMiB/);
  assert.match(gate, /exceeds the repository budget/);
});
