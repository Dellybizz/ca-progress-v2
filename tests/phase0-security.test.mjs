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

test("Phase 0 migration enables RLS on every table", () => {
  const sql = read("supabase/migrations/20260830000100_phase0_core.sql");
  for (const table of ["profiles", "app_settings", "system_health_log"]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
  assert.match(sql, /profiles_select_own/);
  assert.match(sql, /app_settings_read_public/);
});

test("staging metadata opts out of search indexing", () => {
  const layout = read("app/layout.tsx");
  const robots = read("app/robots.ts");
  assert.match(layout, /index: false/);
  assert.match(robots, /disallow: "\/"/);
});
