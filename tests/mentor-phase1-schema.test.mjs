import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");
const migration = () => read("supabase/migrations/20260901160000_mentor_phase1_foundation.sql");

test("Mentor Phase 1 creates only the eight foundation tables with RLS", () => {
  const sql = migration();
  const tables = [
    "mentor_model_versions",
    "mentor_intelligence_sources",
    "mentor_evidence",
    "mentor_exam_intelligence",
    "mentor_learning_intelligence",
    "mentor_personalization_rules",
    "mentor_personalization_eligibility",
    "mentor_recommendation_explanations",
  ];

  for (const table of tables) {
    assert.match(sql, new RegExp(`create table public\\.${table}`));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }

  assert.doesNotMatch(sql, /create table public\.(leaderboard|leaderboards|rankings|top_performers|air_rankings)/i);
});

test("Mentor Phase 1 reuses existing attempt, academic and ICAI truth instead of duplicating it", () => {
  const sql = migration();
  for (const reference of [
    "public.exam_attempts(id)",
    "public.course_levels(id)",
    "public.course_groups(id)",
    "public.subjects(id)",
    "public.syllabus_versions(id)",
    "public.chapters(id)",
    "public.topics(id)",
    "public.icai_resources(id)",
  ]) assert.match(sql, new RegExp(reference.replace(/[().]/g, "\\$&")));

  assert.doesNotMatch(sql, /create table public\.mentor_(attempts|subjects|chapters|topics)/);
});

test("future external and internal source categories are placeholders with zero trust by default", () => {
  const sql = migration();
  for (const source of ["trusted_faculty", "community", "internal_user_outcome", "verified_high_performer", "verified_air"]) {
    assert.match(sql, new RegExp(`'${source}'`));
  }
  assert.match(sql, /authority_tier text not null default 'untrusted'/);
  assert.match(sql, /authority_weight numeric\(6,5\) not null default 0/);
  assert.match(sql, /visibility text not null default 'internal'/);
  assert.match(sql, /visibility = 'internal' or contributor_user_id is null/);
});

test("personalised recommendation reads are metric gated while preprocessed intelligence is available", () => {
  const sql = migration();
  assert.match(sql, /mentor_personalization_is_eligible/);
  assert.match(sql, /e\.state in \('personalized','high_confidence'\)/);
  assert.match(sql, /provenance = 'preprocessed'/);
  assert.match(sql, /mentor_recommendations_read_own_gated/);
  assert.match(sql, /metric_key is not null and public\.mentor_personalization_is_eligible\(auth\.uid\(\), metric_key\)/);
});

test("personalisation defaults are metric-specific and similar-student data requires a cohort", () => {
  const sql = migration();
  for (const metric of [
    "pace_estimate",
    "weak_area",
    "revision_timing",
    "workload_forecast",
    "sustainable_capacity",
    "retention_risk",
    "similar_students",
  ]) assert.match(sql, new RegExp(`'${metric}'`));

  assert.match(sql, /\('pace_estimate', 'Personal pace estimate', 3, 180, 5/);
  assert.match(sql, /\('weak_area', 'Performance-based weak areas', 7, 0, 0, 2, 0, 3/);
  assert.match(sql, /\('similar_students', 'Students-like-you intelligence', 14, 600, 10, 5, 0, 3, 0, 100\)/);
});

test("Phase 1 records that rankings are not started", () => {
  const sql = migration();
  assert.match(sql, /"phase":1/);
  assert.match(sql, /"rankings":"not_started"/);
  assert.doesNotMatch(sql, /'app\.phase'/);
});
