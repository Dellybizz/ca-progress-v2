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
