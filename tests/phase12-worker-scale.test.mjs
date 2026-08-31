import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("OpenNext server routes are split into growth domains", () => {
  const config = read("open-next.config.ts");
  for (const domain of ["admin", "community", "planning"]) assert.match(config, new RegExp(`${domain}:\\s*\\{`));
  assert.match(config, /app\/\(admin\)\/admin\/page/);
  assert.match(config, /app\/\(student\)\/community\/page/);
  assert.match(config, /app\/\(student\)\/planner\/page/);
});

test("public Worker is ingress-only and never imports the default Next server bundle", () => {
  const router = read("custom-worker.ts");
  assert.match(router, /middleware\/handler\.mjs/);
  assert.doesNotMatch(router, /\.open-next\/worker\.js/);
  assert.doesNotMatch(router, /server-functions\/default\/handler\.mjs/);
  for (const binding of ["CORE_WEB_SERVICE", "ADMIN_WEB_SERVICE", "COMMUNITY_WEB_SERVICE", "PLANNING_WEB_SERVICE"]) assert.match(router, new RegExp(binding));
});

test("split Next server Workers are private service-binding targets", () => {
  for (const name of ["web-core", "web-admin", "web-community", "web-planning"]) {
    const entry = `workers/${name}/index.ts`;
    const config = `workers/${name}/wrangler.jsonc`;
    assert.equal(existsSync(join(root, entry)), true, entry);
    assert.equal(existsSync(join(root, config)), true, config);
    assert.match(read(config), /"workers_dev"\s*:\s*false/);
    assert.match(read(entry), /runNextServer/);
  }
});

test("each Next domain has its own compressed-size budget and router is kept small", () => {
  const pkg = read("package.json");
  for (const name of ["web-core", "web-admin", "web-community", "web-planning"]) {
    assert.match(pkg, new RegExp(`cf:check:${name}`));
    assert.match(pkg, new RegExp(`workers/${name}/wrangler\\.jsonc --budget-mib 2\\.70`));
  }
  assert.match(pkg, /cf:check:web-router/);
  assert.match(pkg, /wrangler\.web\.jsonc --budget-mib 0\.90/);
});

test("split web deployment publishes private servers before the public router", () => {
  const deploy = read("scripts/deploy-split-web.mjs");
  const core = deploy.indexOf("workers/web-core/wrangler.jsonc");
  const admin = deploy.indexOf("workers/web-admin/wrangler.jsonc");
  const community = deploy.indexOf("workers/web-community/wrangler.jsonc");
  const planning = deploy.indexOf("workers/web-planning/wrangler.jsonc");
  const router = deploy.indexOf("wrangler.web.jsonc");
  assert.ok(core >= 0 && admin > core && community > admin && planning > community && router > planning);
});

test("local Cloudflare smoke exercises every split route family", () => {
  const smoke = read("scripts/smoke-cloudflare-runtime.mjs");
  for (const route of ["/settings", "/admin", "/community", "/planner"]) assert.match(smoke, new RegExp(route.replace("/", "\\/")));
  for (const name of ["web-core", "web-admin", "web-community", "web-planning"]) assert.match(smoke, new RegExp(`workers/${name}/wrangler\\.jsonc`));
});
