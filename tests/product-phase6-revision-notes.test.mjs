import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(path, "utf8");

const migration = read("d1/migrations/0017_product_phase6_revision_notes.sql");
const service = read("lib/notes/phase6.ts");
const route = read("app/api/notes/route.ts");
const exportRoute = read("app/api/notes/[id]/export/route.ts");
const editor = read("components/resources/note-editor.tsx");
const library = read("components/resources/resource-library.tsx");
const community = read("components/community/community-chat.tsx");
const resourceService = read("lib/resources/service.ts");
const validation = read("lib/resources/validation.ts");
const chapterHub = read("lib/chapter-hub/service.ts");
const deploy = read(".github/workflows/deploy-staging.yml");

test("Product Phase 6 preserves legacy notes through an additive companion schema", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS note_revision_metadata/);
  assert.match(migration, /INSERT OR IGNORE INTO note_revision_metadata/);
  assert.match(migration, /FROM notes n/);
  assert.match(migration, /json_object\('version',1,'format','html','html',n\.body_html\)/);
  assert.doesNotMatch(migration, /ALTER TABLE notes/);
  assert.doesNotMatch(migration, /DROP TABLE notes/);
});

test("Product Phase 6 links revision notes to subject chapter and optional Unit or AS while retaining General Notes", () => {
  assert.match(service, /getPhase6AcademicOptions/);
  assert.match(service, /FROM topics WHERE chapter_id IN/);
  assert.match(service, /Selected Unit\/AS does not belong to that chapter/);
  assert.match(editor, /General Notes/);
  assert.match(editor, /Unit \/ AS \(optional\)/);
  assert.match(route, /topicId/);
});

test("Product Phase 6 rich-note sanitizer round-trips revision formatting and safe table structure", () => {
  for (const tag of ["mark", "table", "thead", "tbody", "tr", "th", "td"]) assert.match(validation, new RegExp(`\\"${tag}\\"`));
  assert.match(validation, /safeTableSpan/);
  assert.match(validation, /script\|style\|iframe\|object\|embed/);
  assert.match(service, /JSON\.stringify\(\{ version: 1, format: "html", html: input\.bodyHtml \}\)/);
});

test("Product Phase 6 provides table presets custom sizing and reliable row column header controls", () => {
  assert.match(editor, /tableHtml\(2, 2\)/);
  assert.match(editor, /tableHtml\(3, 3\)/);
  assert.match(editor, /tableHtml\(4, 4\)/);
  assert.match(editor, /insertCustomTable/);
  assert.match(editor, /function addRow/);
  assert.match(editor, /function removeRow/);
  assert.match(editor, /function addColumn/);
  assert.match(editor, /function removeColumn/);
  assert.match(editor, /function toggleHeader/);
  assert.match(editor, /cell merging is not enabled/);
});

test("Product Phase 6 private images PDFs and note files are owner-linked at D1 and service boundaries", () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS note_resource_links/);
  assert.match(migration, /FOREIGN KEY\(resource_id,user_id\) REFERENCES uploaded_resources\(id,owner_user_id\)/);
  assert.match(service, /WHERE owner_user_id=\?1 AND id IN/);
  assert.match(service, /not owned by you/);
  assert.match(editor, /Private note files/);
});

test("Product Phase 6 Community answers retain immutable source attribution and start private", () => {
  assert.match(community, /Save to Notes/);
  assert.match(community, /communityMessageId=/);
  assert.match(service, /source_author_label/);
  assert.match(service, /question_body/);
  assert.match(service, /source_discussion_path/);
  assert.match(service, /const visibility = source && !input\.id \? "private" : input\.visibility/);
  assert.match(migration, /Community-saved notes must be private when created/);
  assert.match(library, /Source attribution is retained and this note starts private/);
});

test("Product Phase 6 closes direct private-note ID access while preserving approved shared reading", () => {
  assert.match(resourceService, /if \(!canManage && !\(row\.visibility === "shared" && row\.moderation_status === "approved"\)\) return \{ mode: "missing" \}/);
  assert.match(resourceService, /canReport: !canManage/);
});

test("Product Phase 6 exports the same versioned rich document with source and private attachment metadata", () => {
  assert.match(exportRoute, /getOwnedPhase6NoteExport/);
  assert.match(exportRoute, /Content-Disposition/);
  assert.match(exportRoute, /private, no-store/);
  assert.match(service, /schemaVersion: 1/);
  assert.match(service, /revision: extras\.get\(noteId\)/);
  assert.match(service, /attachments: files\.results/);
});

test("Product Phase 6 notes remain discoverable from Notes and the owner-scoped Chapter Hub", () => {
  assert.match(library, /My revision library/);
  assert.match(resourceService, /getPhase6NoteExtras/);
  assert.match(chapterHub, /FROM notes/);
  assert.match(chapterHub, /user_id/);
  assert.match(chapterHub, /chapter_id/);
});

test("Product Phase 6 production deployment applies and verifies migration 0017 before web rollout", () => {
  const retainedMigrations = read("scripts/apply-retained-d1-migrations.mjs");
  assert.match(deploy, /npm run cf:migrate:retained/);
  assert.match(retainedMigrations, /0017_product_phase6_revision_notes\.sql/);
  assert.match(retainedMigrations, /\["0016"[\s\S]*\["0017"/);
  assert.match(deploy, /phase6_revision_notes/);
  assert.match(deploy, /phase6_note_files/);
  assert.ok(deploy.indexOf("Apply missing retained D1 migrations") < deploy.indexOf("Deploy web runtime"));
  assert.match(migration, /VALUES \('0017','product phase 6 revision notes tables and community attribution'/);
});
