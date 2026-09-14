import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(`${root}${path}`, "utf8");

test("A1.4 makes Focus the primary Chapter Hub action", () => {
  const hub = read("components/chapter-hub/chapter-hub.tsx");
  assert.match(hub, /Start Focus/);
  assert.match(hub, /Update progress/);
  assert.doesNotMatch(hub, /Stable chapter identity/);
  assert.doesNotMatch(hub, /canonical workspace/);
});

test("A1.4 gives mobile shallow chapter views instead of one long stack", () => {
  const hub = read("components/chapter-hub/chapter-hub.tsx");
  const css = read("app/styles/chapter-hub.css");
  assert.match(hub, /overview.*study.*resources/);
  assert.match(hub, /chapter-hub-mobile-tabs/);
  assert.match(hub, /data-mobile-view="overview"/);
  assert.match(hub, /data-mobile-view="study"/);
  assert.match(hub, /data-mobile-view="resources"/);
  assert.match(css, /chapter-hub-page--overview/);
  assert.match(css, /chapter-hub-page--study/);
  assert.match(css, /chapter-hub-page--resources/);
});

test("A1.4 uses one desktop workspace and the global route trail", () => {
  const hub = read("components/chapter-hub/chapter-hub.tsx");
  const css = read("app/styles/chapter-hub.css");
  assert.match(hub, /chapter-hub-workspace/);
  assert.match(hub, /chapter-hub-main/);
  assert.match(hub, /chapter-hub-rail/);
  assert.match(hub, /Chapter activity/);
  assert.doesNotMatch(hub, /AcademicBreadcrumbs/);
  assert.match(css, /grid-template-columns:\s*minmax\(0, 1\.62fr\)/);
});

test("A1.4 provides private advanced chapter controls", () => {
  const hub = read("components/chapter-hub/chapter-hub.tsx");
  const api = read("app/api/chapters/[chapterId]/workspace/route.ts");
  const migration = read("d1/migrations/0048_chapter_workspace_controls.sql");
  for (const label of ["Rev. 1", "Rev. 2", "Test 1", "Test 2", "Understanding", "YouTube video", "Revision link"]) assert.match(hub, new RegExp(label));
  assert.match(hub, /\["private","community","icai"\]/);
  assert.match(hub, /resourceTab === "icai"/);
  assert.match(hub, /Search resources to attach/);
  assert.match(hub, /Save changes/);
  assert.match(hub, /disabled=\{!progress\[stage\.field\]\}/);
  assert.match(hub, /Save to chapter/);
  assert.match(hub, /resourceCode\(item\)/);
  assert.doesNotMatch(hub, /AcademicContextBar/);
  assert.doesNotMatch(hub, /chapter-hub-notes/);
  assert.doesNotMatch(hub, /chapter-hub-files/);
  assert.match(hub, /Saving…/);
  assert.match(api, /set_stage_date/);
  assert.match(api, /set_understanding/);
  assert.match(api, /assertAttachable/);
  assert.match(api, /sourceId,2048/);
  assert.match(api, /if\(!saved\?\.id\)throw/);
  assert.match(migration, /understanding_level INTEGER CHECK\(understanding_level BETWEEN 0 AND 100\)/);
  assert.match(migration, /UNIQUE\(user_id,chapter_id,source_kind,source_id\)/);
  assert.doesNotMatch(hub, /Official ICAI resources/);
});
