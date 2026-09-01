import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");
const migration = () => read("supabase/migrations/20260901170000_mentor_phase2_academic_catalog.sql");

test("Mentor Phase 2 creates one canonical hierarchy without replacing the existing academic engine", () => {
  const sql = migration();

  for (const table of [
    "academic_catalog_nodes",
    "academic_catalog_version_items",
    "academic_catalog_aliases",
    "academic_catalog_lineage",
  ]) {
    assert.match(sql, new RegExp(`create table public\\.${table}`));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }

  for (const source of ["course_levels", "course_groups", "subjects", "syllabus_versions", "chapters", "topics"]) {
    assert.match(sql, new RegExp(`from public\\.${source}|join public\\.${source}`));
  }

  assert.match(sql, /node_type in \('course', 'group', 'subject', 'chapter', 'unit', 'accounting_standard', 'subtopic'\)/);
  assert.doesNotMatch(sql, /create table public\.(course_levels|course_groups|subjects|syllabus_versions|chapters|topics)\b/);
});

test("canonical IDs are derived from immutable CA Progress IDs and stable keys rather than titles", () => {
  const sql = migration();
  const helpers = read("lib/academic/catalog-normalization.ts");

  assert.match(sql, /'subject:' \|\| s\.id/);
  assert.match(sql, /'chapter:' \|\| s\.id \|\| ':' \|\| c\.stable_key/);
  assert.match(sql, /'topic:' \|\| s\.id \|\| ':' \|\| c\.stable_key \|\| ':' \|\| t\.stable_key/);
  assert.match(sql, /display titles never define identity/i);

  assert.match(helpers, /return `subject:\$\{subjectId\}`/);
  assert.match(helpers, /return `chapter:\$\{subjectId\}:\$\{chapterStableKey\}`/);
  assert.match(helpers, /return `topic:\$\{subjectId\}:\$\{chapterStableKey\}:\$\{topicStableKey\}`/);
  assert.match(helpers, /topicKind === "accounting_standard"/);
});

test("every existing subject chapter unit and Accounting Standard is backfilled into versioned canonical mappings", () => {
  const sql = migration();

  assert.match(sql, /source_entity_type in \('subject', 'chapter', 'topic'\)/);
  assert.match(sql, /from public\.syllabus_versions sv\s+join public\.subjects s/s);
  assert.match(sql, /from public\.chapters c\s+join public\.syllabus_versions sv/s);
  assert.match(sql, /from public\.topics t\s+join public\.chapters c/s);
  assert.match(sql, /when t\.topic_kind = 'accounting_standard' then 'accounting_standard'/);
  assert.match(sql, /t\.unit_number as official_code/);
  assert.match(sql, /c\.chapter_number as official_code/);
});

test("historical syllabus versions coexist and predecessor successor version history remains explicit", () => {
  const sql = migration();

  assert.match(sql, /syllabus_version_id text not null references public\.syllabus_versions\(id\)/);
  assert.match(sql, /applicable_from date not null/);
  assert.match(sql, /applicable_to date/);
  assert.match(sql, /create view public\.academic_syllabus_lineage/);
  assert.match(sql, /successor\.supersedes_version_id/);
  assert.match(sql, /predecessor_canonical_id/);
  assert.match(sql, /successor_canonical_id/);
  assert.match(sql, /'split_into'/);
  assert.match(sql, /'merged_into'/);
  assert.match(sql, /Item lineage is deliberately not inferred from title similarity/);
});

test("aliases include historical titles codes slugs and stable keys and can be attempt scoped", () => {
  const sql = migration();

  assert.match(sql, /normalized_alias text generated always/);
  assert.match(sql, /vi\.display_title, 'legacy_title'/);
  assert.match(sql, /vi\.source_stable_key, 'stable_key'/);
  assert.match(sql, /s\.slug, 'slug'/);
  assert.match(sql, /academic_catalog_resolve_alias/);
  assert.match(sql, /academic_catalog_resolve_alias_one/);
  assert.match(sql, /academic_catalog_is_applicable\(n\.canonical_id, p_attempt_key\)/);
  assert.match(sql, /asm\.attempt_key = p_attempt_key/);
  assert.match(sql, /count\(distinct candidate\.canonical_id\) = 1/);
});

test("existing progress is mapped canonically without destructive migration or history rewrite", () => {
  const sql = migration();

  assert.match(sql, /create view public\.chapter_progress_canonical/);
  assert.match(sql, /create view public\.progress_events_canonical/);
  assert.match(sql, /academic_catalog_resolve_legacy/);
  assert.match(sql, /vi\.source_entity_id = cp\.chapter_id/);
  assert.match(sql, /vi\.source_entity_id = pe\.chapter_id/);

  assert.doesNotMatch(sql, /\b(update|delete from|truncate table|drop table|alter table)\s+public\.chapter_progress\b/i);
  assert.doesNotMatch(sql, /\b(update|delete from|truncate table|drop table|alter table)\s+public\.progress_events\b/i);
});

test("chapter unit and AS numbering remains available to Today Plan through the existing Academic Catalog", () => {
  const types = read("lib/academic/types.ts");
  const query = read("lib/academic/query.ts");
  const planner = read("lib/smart-planner/service.ts");

  assert.match(types, /number: string/);
  assert.match(types, /unitNumber: string \| null/);
  assert.match(query, /number: chapter\.chapter_number/);
  assert.match(query, /unitNumber: topic\.unit_number/);
  assert.match(planner, /getAcademicCatalog/);
  assert.match(planner, /for \(const chapter of subject\.chapters\)/);
});

test("Phase 2 does not start source ingestion or change the app phase", () => {
  const sql = migration();

  assert.match(sql, /"source_ingestion":"not_started"/);
  assert.match(sql, /"next_phase":"not_started"/);
  assert.doesNotMatch(sql, /create table public\.(icai_sources|icai_source_snapshots|icai_sync_runs|mentor_source_ingestion)/);
  assert.doesNotMatch(sql, /'app\.phase'/);
});
