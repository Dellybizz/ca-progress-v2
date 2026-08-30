import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const root = new URL("../", import.meta.url).pathname; const read = (path) => readFileSync(join(root, path), "utf8");

test("Phase 9 is the current V2 staging label", () => {
  assert.match(read("wrangler.jsonc"), /NEXT_PUBLIC_APP_VERSION\": \"phase-9\"/);
  assert.match(read(".env.example"), /NEXT_PUBLIC_APP_VERSION=phase-9/);
  assert.match(read("lib/env.ts"), /\|\| \"phase-9\"/);
  assert.match(read(".github/workflows/deploy-staging.yml"), /NEXT_PUBLIC_APP_VERSION:\s*phase-9/);
});

test("Phase 9 owns smart planning without starting Phase 10 Community source-of-truth", () => {
  const migration = read("supabase/migrations/20260830170000_phase9_smart_revision_planner.sql");
  assert.match(migration, /revision_rules/);
  assert.match(migration, /daily_plans/);
  assert.match(migration, /forecast_snapshots/);
  assert.doesNotMatch(migration, /community_messages|community_channels|chat_messages|subscription_entitlements/);
});
