import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");
const migration = read("supabase/migrations/20260830130000_phase6_study_planner_calendar.sql");
const hardening = read("supabase/migrations/20260830133000_phase6_timezone_and_task_guard.sql");

test("Phase 6 normalizes study sessions and one persisted timer per user", () => {
  assert.match(migration, /create table public\.study_sessions/);
  assert.match(migration, /create table public\.study_timer_state/);
  assert.match(migration, /user_id uuid primary key references auth\.users/);
  assert.match(migration, /duration_seconds integer not null check \(duration_seconds between 1 and 43200\)/);
  assert.match(migration, /mode text not null check \(mode in \('stopwatch', 'pomodoro'\)\)/);
});

test("timer lifecycle is transactional, duplicate-safe and abandoned-timer aware", () => {
  for (const fn of ["study_timer_start", "study_timer_pause", "study_timer_resume", "study_timer_finish", "study_timer_discard"]) assert.match(migration, new RegExp(`function public\\.${fn}`));
  assert.match(migration, /A study timer is already active/);
  assert.match(migration, /for update/);
  assert.match(migration, /last_interaction_at < v_now - interval '16 hours'/);
  assert.match(migration, /appears abandoned/);
  assert.match(migration, /insert into public\.study_sessions/);
  assert.match(migration, /delete from public\.study_timer_state/);
});

test("timer and study sessions are own-user RLS reads with RPC-only writes", () => {
  assert.match(migration, /alter table public\.study_sessions enable row level security/);
  assert.match(migration, /alter table public\.study_timer_state enable row level security/);
  assert.match(migration, /study_sessions_read_own/);
  assert.match(migration, /study_timer_state_read_own/);
  assert.match(migration, /revoke insert, update, delete, truncate, references, trigger on public\.study_sessions from authenticated/);
});

test("Phase 6 persists and validates user timezone", () => {
  assert.match(hardening, /add column timezone text not null default 'UTC'/);
  assert.match(hardening, /pg_timezone_names/);
  assert.match(hardening, /phase6_set_timezone/);
  assert.match(hardening, /study_timer_state_sync_timezone/);
});

test("study UI exposes subject chapter selection and Pomodoro presets without a manual hours array", () => {
  const client = read("components/study/study-timer.tsx");
  const service = read("lib/study/service.ts");
  assert.match(client, /25 \/ 5/);
  assert.match(client, /50 \/ 10/);
  assert.match(client, /focusMinutes/);
  assert.match(client, /subjectId/);
  assert.match(client, /chapterId/);
  assert.match(client, /action: "pause"/);
  assert.match(client, /action: "resume"/);
  assert.match(client, /action: "finish"/);
  assert.match(service, /getHotStudySessions/);
  assert.match(service, /getHotStudyTimer/);
  assert.match(service, /getHotStudySessions\(userId, since\)/);
  assert.doesNotMatch(`${client}\n${service}`, /studyHours\s*[:=]/);
});
