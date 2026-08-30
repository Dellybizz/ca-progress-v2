import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const root = new URL("../", import.meta.url).pathname; const read = (path) => readFileSync(join(root, path), "utf8");

test("chapter completion drives future revision due items from configurable intervals", () => {
  const sql = read("supabase/migrations/20260830170000_phase9_smart_revision_planner.sql");
  assert.match(sql, /default array\[1,7,21\]/);
  assert.match(sql, /phase9_rebuild_revision_schedule/);
  assert.match(sql, /unnest\(v_rules\.interval_days\) with ordinality/);
  assert.match(sql, /cp\.completed_at \+ make_interval\(days => interval_day\)/);
  assert.match(sql, /phase9_chapter_progress_schedule/);
  assert.match(sql, /after insert or update or delete on public\.chapter_progress/);
});

test("preferred study days adjust generated revision dates while manual due dates are protected", () => {
  const sql = read("supabase/migrations/20260830170000_phase9_smart_revision_planner.sql");
  assert.match(sql, /phase9_align_preferred_day/);
  assert.match(sql, /manual_due_at/);
  assert.match(sql, /where public\.revision_due_items\.manual_due_at is null/);
});
