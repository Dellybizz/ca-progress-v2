import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const root = new URL("../", import.meta.url).pathname; const read = (path) => readFileSync(join(root, path), "utf8");
test("Phase 5 remains documented after the staging version advances", () => { assert.match(read("PHASE_5_STATUS.md"), /Phase 5/); assert.match(read("supabase/migrations/20260830120100_phase5_progress_tracker.sql"), /chapter_progress/); assert.doesNotMatch(read("supabase/migrations/20260830120100_phase5_progress_tracker.sql"), /study_sessions/); });
