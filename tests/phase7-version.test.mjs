import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const root = new URL("../", import.meta.url).pathname; const read = (path) => readFileSync(join(root, path), "utf8");

test("Phase 7 remains implemented after the V2 staging label advances to Phase 10", () => {
  assert.match(read("wrangler.jsonc"), /NEXT_PUBLIC_APP_VERSION\": \"phase-10\"/);
  assert.match(read(".env.example"), /NEXT_PUBLIC_APP_VERSION=phase-10/);
  assert.match(read("lib/env.ts"), /\|\| \"phase-10\"/);
  assert.match(read(".github/workflows/deploy-staging.yml"), /NEXT_PUBLIC_APP_VERSION:\s*phase-10/);
  assert.match(read("app/globals.css"), /phase7\.css/);
});

test("Phase 7 migration itself did not start later smart-planner or community source-of-truth work", () => {
  const migration = read("supabase/migrations/20260830140100_phase7_notes_resources.sql");
  assert.doesNotMatch(migration, /revision_schedule|planner_recommendations|community_messages|subscription_entitlements/);
});
