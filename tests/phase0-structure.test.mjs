import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const required = ["app/(student)/dashboard/page.tsx", "app/(public)/login/page.tsx", "app/(public)/onboarding/page.tsx", "app/(admin)/admin/page.tsx", "app/api/health/route.ts", "lib/auth/provider.ts", "lib/auth/server.ts", "lib/auth/proxy.ts", "lib/data/d1/client.ts", "d1/migrations/0001_phase2_platform.sql", "wrangler.web.jsonc", "open-next.config.ts", "scripts/verify-supabase-retired.mjs"];

test("post-retirement application boundaries exist", () => {
  for (const file of required) assert.equal(existsSync(join(root, file)), true, `missing ${file}`);
  assert.equal(existsSync(join(root, "supabase")), false);
  assert.equal(existsSync(join(root, "wrangler.jsonc")), false);
});

test("legacy monolith names are absent", () => {
  const blocked = [];
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (["node_modules", ".git"].includes(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/Tracker\.tsx$|ProgressContext\.tsx$/.test(entry.name)) blocked.push(full);
    }
  }
  walk(root);
  assert.deepEqual(blocked, []);
});
