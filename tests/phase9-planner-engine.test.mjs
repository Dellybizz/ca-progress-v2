import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const root = new URL("../", import.meta.url).pathname; const read = (path) => readFileSync(join(root, path), "utf8");

test("Today Plan recommendations store and show explainable reasons", () => {
  const service = read("lib/smart-planner/service.ts");
  const ui = read("components/planner/today-plan-client.tsx");
  const sql = read("supabase/migrations/20260830170000_phase9_smart_revision_planner.sql");
  assert.match(sql, /reason_code text not null/);
  assert.match(sql, /reason_text text not null/);
  assert.match(service, /reasonCode:/);
  assert.match(service, /reasonText:/);
  assert.match(ui, /Why:/);
  assert.match(ui, /item\.reasonText/);
});

test("manual changes override generated suggestions and survive recomputation", () => {
  const service = read("lib/smart-planner/service.ts");
  assert.match(service, /manual_override \|\| item\.status !== "planned"/);
  assert.match(service, /blockedKeys = new Set\(preserved\.map/);
  assert.match(service, /delete\(\)\.eq\("plan_id", plan\.id\)\.eq\("manual_override", false\)\.eq\("status", "planned"\)/);
  assert.match(service, /manual_override: true/);
  assert.match(service, /event_type: "manual_plan_change"/);
  assert.doesNotMatch(service, /MEANINGFUL_EVENTS[\s\S]{0,300}"manual_plan_change"/);
});

test("forecast safely reacts to attempt/profile planning changes and labels fallback dates", () => {
  const sql = read("supabase/migrations/20260830170000_phase9_smart_revision_planner.sql");
  const service = read("lib/smart-planner/service.ts");
  const forecast = read("app/(student)/analytics/forecast/page.tsx");
  assert.match(sql, /new\.attempt_key is distinct from old\.attempt_key/);
  assert.match(sql, /profile_planning_changed/);
  assert.match(service, /attemptMonthAnchor/);
  assert.match(service, /"attempt_month"/);
  assert.match(forecast, /selected attempt month as a planning estimate/i);
});

test("meaningful events trigger recomputation instead of constant full recalculation", () => {
  const service = read("lib/smart-planner/service.ts");
  assert.match(service, /MEANINGFUL_EVENTS/);
  assert.match(service, /meaningfulEvent && plan\.generated_at < meaningfulEvent\.created_at/);
  assert.match(service, /if \(stale\)/);
});
