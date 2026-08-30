import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const sql = readFileSync(join(root, "supabase/migrations/20260830030100_phase3_academic_engine.sql"), "utf8");

const referenceTables = ["course_levels", "course_groups", "subjects", "syllabus_versions", "chapters", "topics", "attempt_syllabus_map"];

test("Phase 3 normalizes the complete academic reference model", () => {
  for (const table of [...referenceTables, "academic_change_events"]) assert.match(sql, new RegExp(`create table public\\.${table}`, "i"));
  assert.match(sql, /effective_from date not null/i);
  assert.match(sql, /effective_to date/i);
  assert.match(sql, /supersedes_version_id text references public\.syllabus_versions/i);
  assert.match(sql, /stable_key text not null/i);
  assert.match(sql, /topic_kind.*accounting_standard.*case_component/is);
});

test("academic history uses restrictive foreign keys instead of destructive cascades", () => {
  const restrictCount = (sql.match(/on delete restrict/gi) ?? []).length;
  assert.ok(restrictCount >= 8, `expected restrictive history FKs, found ${restrictCount}`);
  assert.equal(/references public\.syllabus_versions\([^)]*\) on delete cascade/i.test(sql), false);
});

test("public academic catalog is read-only through RLS", () => {
  for (const table of referenceTables) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
    assert.match(sql, new RegExp(`${table.replaceAll("_", "_")}.*read`, "i"));
  }
  assert.match(sql, /grant select on public\.course_levels[\s\S]*to anon, authenticated/i);
  assert.match(sql, /revoke insert, update, delete, truncate, references, trigger[\s\S]*from anon, authenticated/i);
  assert.match(sql, /revoke all on public\.academic_change_events from anon, authenticated/i);
});

test("Phase 3 adds lookup indexes for filtered queries and search", () => {
  for (const index of ["subjects_level_group_idx", "syllabus_versions_subject_idx", "chapters_version_idx", "topics_chapter_idx", "attempt_syllabus_lookup_idx", "subjects_title_lower_idx", "chapters_title_lower_idx", "topics_title_lower_idx"]) assert.match(sql, new RegExp(index));
});
