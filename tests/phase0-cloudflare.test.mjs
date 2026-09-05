import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;

test("Cloudflare Workers is the configured deployment path", () => {
  assert.equal(existsSync(join(root, "wrangler.web.jsonc")), true);
  assert.equal(existsSync(join(root, "wrangler.jsonc")), false);
  assert.equal(existsSync(join(root, "open-next.config.ts")), true);
  assert.equal(existsSync(join(root, "vercel.json")), false);
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert.match(pkg.scripts["cf:deploy"], /cf:deploy:web/);
  assert.match(pkg.scripts["cf:deploy:web"], /opennextjs-cloudflare/);
});

test("production Worker is the Cloudflare-retired CA Progress V2 runtime", () => {
  const wrangler = readFileSync(join(root, "wrangler.web.jsonc"), "utf8");
  assert.match(wrangler, /"name"\s*:\s*"ca-progress-v2"/);
  assert.match(wrangler, /"NEXT_PUBLIC_APP_ENV"\s*:\s*"production"/);
  assert.match(wrangler, /"NEXT_PUBLIC_APP_VERSION"\s*:\s*"cloudflare-retired"/);
  assert.doesNotMatch(wrangler, /SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_SUPABASE_/);
});
