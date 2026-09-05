import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (p) => readFileSync(join(root, p), "utf8");

test("active runtime is Cloudflare-only and has no Supabase SDK configuration", () => {
  const pkg = JSON.parse(read("package.json"));
  const dependencies = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  assert.equal(dependencies["@supabase/ssr"], undefined);
  assert.equal(dependencies["@supabase/supabase-js"], undefined);
  const env = read(".env.example");
  assert.doesNotMatch(env, /NEXT_PUBLIC_SUPABASE_|SUPABASE_SERVICE_ROLE_KEY/);
  const provider = read("lib/auth/provider.ts");
  assert.match(provider, /startCloudflareOAuth/);
  assert.match(provider, /getCloudflareRequestAuth/);
});

test("staging metadata opts out of search indexing", () => {
  const layout = read("app/layout.tsx");
  const robots = read("app/robots.ts");
  assert.match(layout, /index: false/);
  assert.match(robots, /disallow: "\/"/);
});
