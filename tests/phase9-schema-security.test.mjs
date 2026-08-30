import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const root = new URL("../", import.meta.url).pathname; const read = (path) => readFileSync(join(root, path), "utf8");

const migration = () => read("supabase/migrations/20260830170000_phase9_smart_revision_planner.sql");

test("Phase 9 creates the six planner source-of-truth objects from the plan", () => {
  const sql = migration();
  for (const table of ["revision_rules","revision_due_items","daily_plans","daily_plan_items","planner_events","forecast_snapshots"]) {
    assert.match(sql, new RegExp(`create table public\\.${table}`));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }
});

test("Phase 9 planner tables expose own-user reads but no direct authenticated writes", () => {
  const sql = migration();
  assert.match(sql, /revision_rules_read_own/);
  assert.match(sql, /revision_due_items_read_own/);
  assert.match(sql, /daily_plans_read_own/);
  assert.match(sql, /daily_plan_items_read_own/);
  assert.match(sql, /planner_events_read_own/);
  assert.match(sql, /forecast_snapshots_read_own/);
  assert.match(sql, /revoke insert, update, delete, truncate, references, trigger[\s\S]*from authenticated/);
  assert.match(sql, /grant select[\s\S]*to authenticated/);
});

test("Phase 9 uses the existing server credential after request authorization and introduces no new secret", () => {
  const service = read("lib/smart-planner/service.ts");
  const env = read(".env.example");
  assert.match(service, /optionalUser\(\)/);
  assert.match(service, /createAdminSupabaseClient/);
  assert.match(env, /Phase 9 adds no new secret/);
  assert.doesNotMatch(env, /PHASE9_[A-Z_]+=|OPENAI_API_KEY|ANTHROPIC_API_KEY/);
});
