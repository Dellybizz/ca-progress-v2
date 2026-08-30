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
  const hardening = read("supabase/migrations/20260830170500_phase9_revision_schedule_completion_hardening.sql");
  assert.match(sql, /phase9_align_preferred_day/);
  assert.match(sql, /manual_due_at/);
  assert.match(hardening, /manual_due_at is null then excluded\.due_at/);
  assert.match(hardening, /completed_at = case/);
});

test("progress trigger handles DELETE before accessing NEW and INSERT before accessing OLD", () => {
  const hardening = read("supabase/migrations/20260830171000_phase9_trigger_safety.sql");
  const deleteBranch = hardening.indexOf("if tg_op = 'DELETE' then");
  const firstNewRead = hardening.indexOf("v_user_id := new.user_id");
  const insertBranch = hardening.indexOf("if tg_op = 'INSERT' then");
  const firstOldComparison = hardening.indexOf("new.completed_at is distinct from old.completed_at");
  assert.ok(deleteBranch >= 0 && deleteBranch < firstNewRead);
  assert.ok(insertBranch >= 0 && insertBranch < firstOldComparison);
  assert.match(hardening, /return old;/);
  assert.match(hardening, /return new;/);
});
