import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("Product Phase 3 binds direct Today timers to the exact intended plan item without contaminating standalone Study", () => {
  const helper = read("lib/study/today-link.ts");
  const route = read("app/api/study/timer/route.ts");
  assert.match(helper, /pe\.event_type='today_plan_started'/);
  assert.match(helper, /datetime\(pe\.created_at\)>=datetime\(st\.started_at\)/);
  assert.match(helper, /dpi\.subject_id=st\.subject_id/);
  assert.match(helper, /dpi\.chapter_id=st\.chapter_id/);
  assert.match(helper, /sx\.task_id IS NULL/);
  assert.match(helper, /sx\.plan_item_id IS NULL/);
  assert.match(route, /if \(body\.action === "finish"\) await attachActiveTimerToLatestTodayItem\(identity\.id\)/);
});
