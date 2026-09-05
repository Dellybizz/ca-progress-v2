import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("Phase 5 migration uses normalized per-user chapter rows and event history", () => {
  const sql = read("supabase/migrations/20260830120100_phase5_progress_tracker.sql");
  assert.match(sql, /create table public\.chapter_progress/);
  assert.match(sql, /primary key \(user_id, chapter_id\)/);
  assert.match(sql, /create table public\.progress_events/);
  assert.match(sql, /previous_state jsonb/);
  assert.match(sql, /new_state jsonb/);
  assert.match(sql, /chapter_progress_user_updated_idx/);
  assert.match(sql, /progress_events_user_chapter_created_idx/);
});

test("dependency rules are enforced in database and transactional mutation RPC", () => {
  const sql = read("supabase/migrations/20260830120100_phase5_progress_tracker.sql");
  assert.match(sql, /revision_1_at is null or completed_at is not null/);
  assert.match(sql, /revision_2_at is null or revision_1_at is not null/);
  assert.match(sql, /test_1_at is null or completed_at is not null/);
  assert.match(sql, /test_2_at is null or test_1_at is not null/);
  assert.match(sql, /create or replace function public\.progress_set_stage/);
  assert.match(sql, /for update/);
  assert.match(sql, /perform public\.progress_validate_state\(v_next\)/);
});

test("progress ownership is enforced with RLS and RPC-only writes", () => {
  const sql = read("supabase/migrations/20260830120100_phase5_progress_tracker.sql");
  assert.match(sql, /alter table public\.chapter_progress enable row level security/);
  assert.match(sql, /chapter_progress_read_own/);
  assert.match(sql, /progress_events_read_own/);
  assert.match(sql, /revoke insert, update, delete, truncate, references, trigger on public\.chapter_progress from authenticated/);
  assert.match(sql, /auth\.uid\(\)/);
});

test("undo refuses to overwrite a newer chapter state or newer same-state event", () => {
  const base = read("supabase/migrations/20260830120100_phase5_progress_tracker.sql");
  const hardening = read("supabase/migrations/20260830121500_phase5_guard_latest_undo.sql");
  assert.match(base, /v_current <> v_event\.new_state/);
  assert.match(base, /reverts_event_id/);
  assert.match(hardening, /v_latest_event_id/);
  assert.match(hardening, /order by created_at desc, id desc/);
  assert.match(hardening, /v_latest_event_id is distinct from v_event\.id/);
  assert.match(hardening, /undo would overwrite a newer change/);
});

test("progress surfaces are real routes with optimistic autosave and normalized analytics", () => {
  const page = read("app/(student)/progress/page.tsx");
  const client = read("components/progress/progress-tracker.tsx");
  const service = read("lib/progress/service.ts");
  const analytics = read("app/(student)/analytics/page.tsx");
  const subject = read("app/(student)/subjects/[subjectSlug]/progress/page.tsx");
  assert.doesNotMatch(page, /ProductPreviewPage/);
  assert.match(client, /Saving automatically/);
  assert.match(client, /action: "set_stage"/);
  assert.match(client, /Undo last change/);
  assert.match(service, /getHotProgressRows/);
  assert.match(service, /getHotDashboardProgress/);
  assert.match(service, /getHotProgressRows\(identity\.id, chapterIds, sevenDaysAgo\)/);
  assert.match(service, /hot\.weeklyEvents/);
  assert.match(service, /hot\.events/);
  assert.match(analytics, /No manually maintained totals are used/);
  assert.match(analytics, /Nothing to analyse yet/);
  assert.match(subject, /getProgressPageModel\(subjectSlug\)/);
  assert.match(subject, /notFound\(\)/);
});

test("responsive Phase 5 styles include independent mobile treatment", () => {
  const css = read("app/styles/progress.css");
  assert.match(css, /@media\(max-width:640px\)/);
  assert.match(css, /progress-stage-controls/);
  assert.match(css, /overflow-x:auto/);
  assert.match(css, /progress-save-state\{position:sticky/);
});
