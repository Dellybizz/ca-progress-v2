import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("OpenNext compiles one web runtime instead of route-family deployment workers", () => {
  const config = read("open-next.config.ts");
  assert.match(config, /defineCloudflareConfig\(\)/);
  assert.doesNotMatch(config, /functions\s*:/);
  for (const name of ["web-core", "web-admin", "web-community", "web-planning"]) {
    assert.equal(existsSync(join(root, "workers", name)), false, `${name} should not be a deployment unit`);
  }
});

test("consolidated web Worker owns normal OpenNext requests without a route-forwarding ingress layer", () => {
  const worker = read("custom-worker.ts");
  const web = read("wrangler.web.jsonc");
  assert.match(worker, /\.open-next\/worker\.js/);
  assert.match(worker, /openNextWorker\.fetch\(request, env, ctx\)/);
  assert.doesNotMatch(worker, /middleware\/handler\.mjs|routeService|x-ca-progress-next-internal/);
  for (const binding of ["CORE_WEB_SERVICE", "ADMIN_WEB_SERVICE", "COMMUNITY_WEB_SERVICE", "PLANNING_WEB_SERVICE"]) {
    assert.doesNotMatch(web, new RegExp(binding));
  }
});

test("only heavy or privileged specialist Workers remain private service-binding targets", () => {
  const web = read("wrangler.web.jsonc");
  const services = [
    ["icai-sync", "ICAI_SYNC_SERVICE", "ca-progress-v2-icai-sync"],
    ["billing", "BILLING_SERVICE", "ca-progress-v2-billing"],
    ["admin-ops", "ADMIN_OPS_SERVICE", "ca-progress-v2-admin-ops"],
  ];
  for (const [directory, binding, service] of services) {
    const entry = `workers/${directory}/index.ts`;
    const config = `workers/${directory}/wrangler.jsonc`;
    assert.equal(existsSync(join(root, entry)), true, entry);
    assert.equal(existsSync(join(root, config)), true, config);
    assert.match(read(config), /"workers_dev"\s*:\s*false/);
    assert.match(web, new RegExp(`"binding"\\s*:\\s*"${binding}"`));
    assert.match(web, new RegExp(`"service"\\s*:\\s*"${service}"`));
  }
});

test("consolidated web and specialist services retain independent compressed-size safety gates", () => {
  const pkg = read("package.json");
  assert.match(pkg, /cf:check:web/);
  assert.match(pkg, /wrangler\.web\.jsonc --budget-mib 2\.80/);
  assert.match(pkg, /workers\/icai-sync\/wrangler\.jsonc --budget-mib 1\.50/);
  assert.match(pkg, /workers\/billing\/wrangler\.jsonc --budget-mib 0\.75/);
  assert.match(pkg, /workers\/admin-ops\/wrangler\.jsonc --budget-mib 1\.00/);
  assert.doesNotMatch(pkg, /cf:check:web-(?:core|admin|community|planning|router)/);
});

test("normal deployment publishes one web Worker while specialist services have an explicit maintenance path", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.scripts["cf:deploy"], "npm run cf:build && npm run cf:deploy:web");
  assert.equal(pkg.scripts["cf:deploy:web"], "opennextjs-cloudflare deploy --config=wrangler.web.jsonc");
  assert.match(pkg.scripts["cf:deploy:services"], /cf:deploy:icai[\s\S]*cf:deploy:billing[\s\S]*cf:deploy:admin/);
  assert.equal(existsSync(join(root, "scripts/deploy-split-web.mjs")), false);
});

test("local Cloudflare smoke exercises representative product route families through the consolidated web Worker", () => {
  const smoke = read("scripts/smoke-cloudflare-runtime.mjs");
  for (const route of ["/settings", "/tests", "/admin", "/community", "/planner"]) {
    assert.match(smoke, new RegExp(route.replace("/", "\\/")));
  }
  assert.match(smoke, /wrangler\.web\.jsonc/);
  for (const name of ["icai-sync", "billing", "admin-ops"]) assert.match(smoke, new RegExp(`workers/${name}/wrangler\\.jsonc`));
  for (const name of ["web-core", "web-admin", "web-community", "web-planning"]) assert.doesNotMatch(smoke, new RegExp(name));
});
