import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;

test("Cloudflare Workers is the configured deployment path", () => {
  assert.equal(existsSync(join(root, "wrangler.jsonc")), true);
  assert.equal(existsSync(join(root, "open-next.config.ts")), true);
  assert.equal(existsSync(join(root, "scripts/deploy-split-web.mjs")), true);
  assert.equal(existsSync(join(root, "vercel.json")), false);
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert.match(pkg.scripts["cf:build"], /opennextjs-cloudflare build/);
  assert.match(pkg.scripts["cf:deploy"], /cf:deploy:web/);
  assert.equal(pkg.scripts["cf:deploy:web"], "node scripts/deploy-split-web.mjs");
  assert.match(readFileSync(join(root, "scripts/deploy-split-web.mjs"), "utf8"), /wrangler[\s\S]*deploy/);
});

test("staging Worker cannot be mistaken for the legacy project", () => {
  const wrangler = readFileSync(join(root, "wrangler.jsonc"), "utf8");
  assert.match(wrangler, /"name"\s*:\s*"ca-progress-v2"/);
  assert.match(wrangler, /"NEXT_PUBLIC_APP_ENV"\s*:\s*"staging"/);
  assert.match(wrangler, /"NEXT_PUBLIC_APP_VERSION"\s*:\s*"phase-[0-9]+"/);
});
