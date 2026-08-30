import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const migration = readFileSync(join(root, "supabase/migrations/20260830120100_phase5_progress_tracker.sql"), "utf8");

test("Phase 5 does not create Phase 6 or Phase 9 source-of-truth tables", () => {
  assert.doesNotMatch(migration, /create table public\.(study_sessions|tasks|goals|revision_schedule|planner_recommendations)/);
});
