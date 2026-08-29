import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (p) => readFileSync(join(root, p), "utf8");

test("service role is isolated to server-only client", () => {
  const browser = read("lib/supabase/browser.ts");
  const admin = read("lib/supabase/admin.ts");
  assert.equal(browser.includes("SUPABASE_SERVICE_ROLE_KEY"), false);
  assert.match(admin, /import "server-only"/);
  assert.match(admin, /createAdminSupabaseClient/);
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
