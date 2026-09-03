import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (p) => readFileSync(join(root, p), "utf8");

test("hot screens have typed direct-D1 repository coverage", () => {
  const hot = read("lib/data/d1/hot-screens.ts");
  for (const name of [
    "getHotPlannerRows", "getHotCalendarRows", "getHotActivityRows",
    "getHotProgressRows", "getHotDashboardProgress",
    "getHotCommunityChannel", "getHotCommunityMessages",
  ]) assert.match(hot, new RegExp(`export async function ${name}`));
  assert.match(hot, /db\.batch\(\[/);
  assert.match(hot, /LIMIT 250/);
  assert.match(hot, /LIMIT 100/);
  assert.doesNotMatch(hot, /SELECT \*/);
});

test("hot screen services route Cloudflare reads through the typed repository", () => {
  assert.match(read("lib/progress/service.ts"), /getHotProgressRows|getHotDashboardProgress/);
  assert.match(read("lib/planner/service.ts"), /getHotPlannerRows|getHotCalendarRows|getHotActivityRows/);
  assert.match(read("lib/planner/dashboard.ts"), /getHotD1Database/);
  assert.match(read("lib/community/service.ts"), /getHotCommunityChannel|getHotCommunityMessages/);
  assert.doesNotMatch(read("lib/data/d1/hot-screens.ts"), /SELECT \*/);
});
test("screen query inputs are bounded and parameterized", () => {
  const hot = read("lib/data/d1/hot-screens.ts");
  assert.match(hot, /Math\.min\(Math\.floor\(limit\), 100\)/);
  assert.match(hot, /WHERE user_id=\?1/);
  assert.match(hot, /bind\(\.\.\.values\)/);
  assert.match(hot, /ORDER BY sequence_id DESC LIMIT/);
});

test("hot-query migration is resumable, idempotent, and applied to staging", () => {
  const migration = read("d1/migrations/0009_phase5_hot_query_indexes.sql");
  assert.match(migration, /CREATE INDEX IF NOT EXISTS/g);
  assert.match(read("scripts/validate-d1-hot-indexes.mjs"), /migrations apply/);
  assert.match(read("scripts/validate-d1-hot-indexes.mjs"), /PRAGMA foreign_key_check/);
  const workflow = read(".github/workflows/deploy-staging.yml");
  assert.match(workflow, /d1:hot-indexes:validate/);
  assert.match(workflow, /0009_phase5_hot_query_indexes\.sql/);
});
