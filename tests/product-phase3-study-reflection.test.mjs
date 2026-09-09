import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("Product Phase 3 links completed study history to academic IDs and intended work", () => {
  const migration = read("d1/migrations/0014_product_phase3_study_sessions_reflection.sql");
  const service = read("lib/study/phase3.ts");
  const ui = read("components/study/study-timer.tsx");
  const studyRoute = read("app/(student)/study/page.tsx");

  assert.match(migration, /CREATE TABLE IF NOT EXISTS study_session_phase3/);
  assert.match(migration, /task_id TEXT REFERENCES tasks/);
  assert.match(migration, /plan_item_id TEXT REFERENCES daily_plan_items/);
  assert.match(service, /INSERT INTO study_sessions/);
  assert.match(service, /INSERT INTO study_session_phase3/);
  assert.match(service, /taskId/);
  assert.match(service, /planItemId/);
  assert.match(ui, /Task <small>optional<\/small>/);
  assert.match(ui, /taskId: taskId \|\| null/);
  assert.match(studyRoute, /initialTaskId=\{cleanId\(params\.taskId\)\}/);
});

test("Product Phase 3 records pauses and prevents duplicate absurd or stale active timers", () => {
  const service = read("lib/study/phase3.ts");
  const migration = read("d1/migrations/0014_product_phase3_study_sessions_reflection.sql");

  assert.match(migration, /user_id TEXT PRIMARY KEY REFERENCES study_timer_state/);
  assert.match(migration, /pause_count INTEGER NOT NULL DEFAULT 0/);
  assert.match(migration, /paused_seconds INTEGER NOT NULL DEFAULT 0/);
  assert.match(service, /A study timer is already active/);
  assert.match(service, /MAX_SESSION_SECONDS = 12 \* 60 \* 60/);
  assert.match(service, /STALE_INTERACTION_MS = 16 \* 60 \* 60 \* 1000/);
  assert.match(service, /pause_count=pause_count\+1/);
  assert.match(service, /paused_seconds=paused_seconds\+\?1/);
  assert.match(service, /Discard it and start a fresh session/);
});

test("Product Phase 3 retains one explicit self-reported understanding and focus reflection per meaningful session", () => {
  const migration = read("d1/migrations/0014_product_phase3_study_sessions_reflection.sql");
  const service = read("lib/study/phase3.ts");
  const reflection = read("components/study/study-reflection.tsx");
  const route = read("app/api/study/reflection/route.ts");

  assert.match(migration, /understanding_score INTEGER CHECK\(understanding_score BETWEEN 0 AND 100\)/);
  assert.match(migration, /focus_rating TEXT CHECK\(focus_rating IN \('poor','okay','focused'\)\)/);
  assert.match(migration, /reflection_saved_at TEXT/);
  assert.match(service, /MEANINGFUL_REFLECTION_SECONDS = 60/);
  assert.match(service, /reflection has already been saved/);
  assert.match(reflection, /self-reported understanding/);
  assert.match(reflection, /not a mastery score/);
  assert.match(reflection, /Poor/);
  assert.match(reflection, /Okay/);
  assert.match(reflection, /Focused/);
  assert.match(route, /saveStudySessionReflection/);
});

test("Product Phase 3 creates private or auto-context Community doubts without asking for a category", () => {
  const migration = read("d1/migrations/0014_product_phase3_study_sessions_reflection.sql");
  const service = read("lib/study/phase3.ts");
  const reflection = read("components/study/study-reflection.tsx");

  assert.match(migration, /CREATE TABLE IF NOT EXISTS study_session_doubts/);
  assert.match(migration, /visibility TEXT NOT NULL CHECK\(visibility IN \('private','community'\)\)/);
  assert.match(service, /community_channels WHERE subject_id=\?1 AND scope_type='subject'/);
  assert.match(service, /createHotCommunityMessage/);
  assert.match(service, /session\.subject_id/);
  assert.match(service, /session\.chapter_id/);
  assert.match(reflection, /Keep private/);
  assert.match(reflection, /Ask Community/);
  assert.match(reflection, /choose the Community doubts room automatically/);
  assert.doesNotMatch(reflection, /Select category|Choose category|categoryId/);
});

test("Product Phase 3 Community answers update linked doubt state and notify the original message author", () => {
  const migration = read("d1/migrations/0014_product_phase3_study_sessions_reflection.sql");
  const community = read("lib/data/d1/hot-screens.ts");

  assert.match(migration, /CREATE TRIGGER IF NOT EXISTS trg_study_session_doubt_answered/);
  assert.match(migration, /NEW\.reply_to_message_id IS NOT NULL/);
  assert.match(migration, /SET status='answered'/);
  assert.match(community, /INSERT INTO community_notifications/);
  assert.match(community, /'reply'/);
  assert.match(community, /reply_to_message_id/);
});

test("Product Phase 3 Chapter Hub reports reflection as self-reported rather than mastery", () => {
  const service = read("lib/chapter-hub/service.ts");
  const hub = read("components/chapter-hub/chapter-hub.tsx");

  assert.match(service, /AVG\(x\.understanding_score\) AS average_understanding/);
  assert.match(service, /COUNT\(x\.understanding_score\) AS reflected_session_count/);
  assert.match(hub, /Average self-reported understanding/);
  assert.match(hub, /not a mastery score/);
  assert.doesNotMatch(hub, /mastery:|Mastery score/);
});

test("Product Phase 3 asks for pending reflection from Study and Today without blocking a new timer", () => {
  const studyPage = read("components/study/study-page.tsx");
  const today = read("app/(student)/planner/today/page.tsx");

  assert.match(studyPage, /model\.pendingReflection \? <StudyReflection/);
  assert.match(studyPage, /<StudyTimer/);
  assert.match(today, /getPendingStudyReflectionPrompt/);
  assert.match(today, /Reflect on your finished session/);
  assert.match(today, /\/study\?reflect=/);
});

test("Product Phase 3 production deployment applies the additive idempotent session-reflection migration", () => {
  const workflow = read(".github/workflows/deploy-staging.yml");
  const retainedMigrations = read("scripts/apply-retained-d1-migrations.mjs");
  const migration = read("d1/migrations/0014_product_phase3_study_sessions_reflection.sql");
  assert.match(workflow, /npm run cf:migrate:retained/);
  assert.match(retainedMigrations, /0014_product_phase3_study_sessions_reflection\.sql/);
  assert.match(retainedMigrations, /\["0012"[\s\S]*\["0013"[\s\S]*\["0014"/);
  assert.match(workflow, /phase3_session_rows/);
  assert.match(workflow, /phase3_doubt_rows/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS/);
  assert.match(migration, /CREATE INDEX IF NOT EXISTS/);
  assert.match(migration, /CREATE TRIGGER IF NOT EXISTS/);
  assert.match(migration, /INSERT OR IGNORE INTO _ca_schema_migrations/);
});
