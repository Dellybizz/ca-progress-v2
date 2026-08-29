import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const required = [
  "app/(student)/dashboard/page.tsx",
  "app/(public)/login/page.tsx",
  "app/(public)/onboarding/page.tsx",
  "app/(admin)/admin/page.tsx",
  "app/api/health/route.ts",
  "lib/supabase/browser.ts",
  "lib/supabase/server.ts",
  "lib/supabase/admin.ts",
  "supabase/migrations/20260830000100_phase0_core.sql",
  "wrangler.jsonc",
  "open-next.config.ts",
];

test("Phase 0 required boundaries exist", () => {
  for (const file of required) assert.equal(existsSync(join(root, file)), true, `missing ${file}`);
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
