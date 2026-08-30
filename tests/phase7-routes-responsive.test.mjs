import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
const root = new URL("../", import.meta.url).pathname; const read = (path) => readFileSync(join(root, path), "utf8");

test("all Phase 7 product and moderation routes are real server-backed surfaces", () => {
  const routes = ["app/(student)/notes/page.tsx", "app/(student)/notes/[id]/page.tsx", "app/(student)/resources/page.tsx", "app/(student)/resources/[id]/page.tsx", "app/(admin)/admin/resources/moderation/page.tsx"];
  for (const route of routes) { assert.equal(existsSync(join(root, route)), true, route); assert.doesNotMatch(read(route), /ProductPreviewPage/); }
  assert.match(read("app/(student)/notes/page.tsx"), /getResourceLibraryModel/);
  assert.match(read("app/(student)/resources/[id]/page.tsx"), /getResourceDetailModel/);
});

test("Phase 7 notes library includes rich editing, My Shared and ICAI resource views", () => {
  const library = read("components/resources/resource-library.tsx");
  const editor = read("components/resources/note-editor.tsx");
  assert.match(library, /My Notes & Files/);
  assert.match(library, /Shared/);
  assert.match(library, /ICAI Resources/);
  assert.match(library, /ICAI Official/);
  assert.match(library, /phase7-document-card--icai/);
  assert.match(editor, /contentEditable/);
  assert.match(editor, /subjectId/);
  assert.match(editor, /chapterId/);
  assert.match(editor, /tags/);
  assert.match(editor, /Share with Community/);
});

test("Phase 7 routes include loading error empty permission and independent mobile contracts", () => {
  for (const path of ["app/(student)/notes/loading.tsx", "app/(student)/notes/error.tsx", "app/(student)/resources/loading.tsx", "app/(student)/resources/error.tsx", "app/(admin)/admin/resources/moderation/loading.tsx", "app/(admin)/admin/resources/moderation/error.tsx"]) assert.equal(existsSync(join(root, path)), true, path);
  const css = read("app/styles/phase7.css");
  const library = read("components/resources/resource-library.tsx");
  const admin = read("app/(admin)/admin/resources/moderation/page.tsx");
  assert.match(css, /@media\(max-width:720px\)/);
  assert.match(css, /@media\(max-width:430px\)/);
  assert.match(css, /phase7-upload-drawer/);
  assert.match(library, /Your library is empty/);
  assert.match(library, /No approved community resources yet/);
  assert.match(admin, /Access denied/);
});
