import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const path = join(root, "supabase/migrations/20260830090100_phase4_smart_student_dashboard.sql");
const migration = readFileSync(path, "utf8");

test("Phase 4 migration creates only lightweight dashboard analytics state", () => {
  assert.equal(existsSync(path), true);
  assert.match(migration, /create table public\.dashboard_events/i);
  assert.match(migration, /event_type.*dashboard_view.*quick_action/is);
  assert.match(migration, /context jsonb/i);
  assert.doesNotMatch(migration, /create table public\.(chapter_progress|study_sessions|tasks|daily_plans|dashboard_state)/i);
});

test("dashboard analytics is private and RLS insert-own only", () => {
  assert.match(migration, /alter table public\.dashboard_events enable row level security/i);
  assert.match(migration, /dashboard_events_insert_own/i);
  assert.match(migration, /auth\.uid\(\).*user_id/is);
  assert.match(migration, /revoke all on public\.dashboard_events from anon/i);
  assert.match(migration, /revoke select, update, delete, truncate, references, trigger on public\.dashboard_events from authenticated/i);
  assert.match(migration, /grant insert on public\.dashboard_events to authenticated/i);
});

test("Phase 4 records cache/recommendation boundaries without a giant dashboard JSON source of truth", () => {
  assert.match(migration, /dashboard\.phase4/i);
  assert.match(migration, /academic_cache_seconds/);
  assert.match(migration, /icai_cache_seconds/);
  assert.match(migration, /recommendation_slots/);
  assert.match(migration, /smart_planner.*phase9/is);
});
