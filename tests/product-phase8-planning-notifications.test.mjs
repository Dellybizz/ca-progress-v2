import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("Product Phase 8 migration is additive, idempotent and preserves historical task and goal rows", () => {
  const migration = read("d1/migrations/0019_product_phase8_planning_notifications.sql");
  for (const table of ["planner_task_phase8", "planner_goal_phase8", "notification_preferences", "in_app_notifications"]) assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  assert.match(migration, /missing extension row means the historical/);
  assert.doesNotMatch(migration, /ALTER TABLE\s+(tasks|goals)/i);
  assert.match(migration, /INSERT OR IGNORE INTO _ca_schema_migrations/);
  assert.match(migration, /'0019'/);
});

test("fixed commitments and flexible study tasks coexist with the complete Phase 8 task vocabulary", () => {
  const types = read("lib/planner/types.ts");
  const service = read("lib/planner/phase8.ts");
  const client = read("components/planner/planner-client.tsx");
  for (const kind of ["class", "study", "revision", "test", "mock", "personal", "other"]) assert.match(types, new RegExp(`"${kind}"`));
  assert.match(types, /TaskScheduleMode = "fixed" \| "flexible"/);
  assert.match(service, /extension\?\.schedule_mode ?? "fixed"|schedule_mode/);
  assert.match(service, /planner_task_phase8/);
  assert.match(client, /Fixed time/);
  assert.match(client, /Flexible study/);
  assert.match(client, /targetDate/);
});

test("Today keeps fixed anchors and explicitly releases flexible task clock times", () => {
  const today = read("lib/planner/phase8-today.ts");
  assert.match(today, /extension\?\.schedule_mode !== "flexible"/);
  assert.match(today, /scheduledAt: null/);
  assert.match(today, /futureFixed/);
  assert.match(today, /availableMinutes/);
  assert.match(today, /fittingIndex/);
  assert.match(today, /scheduleState: "fixed"/);
});

test("goals use recorded study and progress rows and the same service feeds Planner Today and Analytics", () => {
  const service = read("lib/planner/phase8.ts");
  const planner = read("lib/planner/service.ts");
  const today = read("app/(student)/planner/today/page.tsx");
  const analytics = read("app/(student)/analytics/page.tsx");
  assert.match(service, /FROM study_sessions WHERE user_id=\?1/);
  assert.match(service, /FROM chapter_progress WHERE user_id=\?1/);
  for (const kind of ["daily_study", "weekly_study", "completion", "revision", "test"]) assert.match(service, new RegExp(`goalKind === "${kind}"|"${kind}"`));
  assert.match(planner, /getPhase8GoalSummaries/);
  assert.match(today, /getCurrentPhase8Snapshot/);
  assert.match(analytics, /getCurrentPhase8Snapshot/);
});

test("countdown is derived only from the selected applicable verified attempt with threshold states", () => {
  const service = read("lib/planner/phase8.ts");
  assert.match(service, /JOIN course_levels l ON l\.code=p\.ca_level/);
  assert.match(service, /ea\.level_id=l\.id AND ea\.attempt_key=p\.attempt_key AND ea\.verification_status='verified'/);
  assert.match(service, /first_event_date/);
  assert.doesNotMatch(service, /attempt.*month.*fallback|synthetic.*attempt/i);
  for (const threshold of [7, 15, 30, 60, 90]) assert.match(service, new RegExp(`days <= ${threshold}`));
  assert.match(read("lib/planner/calendar.ts"), /\.eq\("level_id", context\.levelId\)\.eq\("attempt_key", context\.selection\.attemptKey\)/);
});

test("timezone behavior uses the profile zone for local dates and calendar month boundaries", () => {
  const service = read("lib/planner/phase8.ts");
  const calendar = read("lib/planner/calendar.ts");
  assert.match(service, /dateKeyInTimezone/);
  assert.match(service, /timeZone: safeTimeZone\(timezone\)/);
  assert.match(service, /const today = dateKeyInTimezone\(row\.timezone, now\)/);
  assert.match(calendar, /localMonthKey/);
  assert.match(calendar, /context\.timezone/);
  assert.match(calendar, /36 \* HOUR_MS/);
  assert.match(calendar, /extension\.target_date\.slice\(0, 7\) === month/);
});

test("actionable notifications are user-owned, preference controlled and do not invent Buddy activity", () => {
  const service = read("lib/planner/phase8.ts");
  const migration = read("d1/migrations/0019_product_phase8_planning_notifications.sql");
  for (const type of ["revision_due", "test_tomorrow", "goal_near_completion", "doubt_answered", "buddy_activity"]) assert.match(migration, new RegExp(type));
  assert.match(service, /buddyActivity: false/);
  assert.match(service, /No Buddy event is/);
  assert.doesNotMatch(service, /notification_type:\s*"buddy_activity"/);
  assert.match(service, /revision_due_items WHERE user_id=\?1/);
  assert.match(service, /study_session_doubts WHERE user_id=\?1/);
  assert.match(service, /tasks t .*t\.user_id=\?1/s);
});

test("notification privacy includes dedupe, local-day rate limits, preferences and actionable links", () => {
  const service = read("lib/planner/phase8.ts");
  const migration = read("d1/migrations/0019_product_phase8_planning_notifications.sql");
  const api = read("app/api/planner/notifications/route.ts");
  const client = read("components/planner/notification-center.tsx");
  assert.match(migration, /UNIQUE\(user_id,dedupe_key\)/);
  assert.match(migration, /max_per_day INTEGER NOT NULL DEFAULT 8/);
  assert.match(service, /dateKeyInTimezone\(timezone, row\.created_at\) === today/);
  assert.match(service, /prefs\.maxPerDay - createdToday/);
  assert.match(service, /action_href/);
  assert.match(api, /action: "preferences"/);
  assert.match(client, /href=\{item\.actionHref\}/);
  assert.match(client, /Maximum per day/);
});

test("Cloudflare deployment applies and verifies Product Phase 8 migration 0019", () => {
  const workflow = read(".github/workflows/deploy-staging.yml");
  const retainedMigrations = read("scripts/apply-retained-d1-migrations.mjs");
  assert.match(workflow, /npm run cf:migrate:retained/);
  assert.match(retainedMigrations, /0019_product_phase8_planning_notifications\.sql/);
  assert.match(retainedMigrations, /\["0019"/);
  assert.match(workflow, /phase8_task_extensions/);
  assert.match(workflow, /phase8_goal_extensions/);
  assert.match(workflow, /phase8_notification_preferences/);
  assert.match(workflow, /phase8_in_app_notifications/);
});
