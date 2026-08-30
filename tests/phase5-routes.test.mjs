import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("all required Phase 5 surfaces exist", () => {
  for (const path of [
    "app/(student)/progress/page.tsx",
    "app/(student)/analytics/page.tsx",
    "app/(student)/subjects/[subjectSlug]/progress/page.tsx",
    "app/api/progress/route.ts",
  ]) assert.equal(existsSync(join(root, path)), true, `${path} should exist`);
});

test("progress mutations require server-readable authentication", () => {
  const api = read("app/api/progress/route.ts");
  assert.match(api, /optionalUser\(\)/);
  assert.match(api, /status: 401/);
  assert.match(api, /progress_set_stage/);
  assert.match(api, /progress_undo_event/);
});

test("progress private surfaces include loading and error states", () => {
  for (const path of [
    "app/(student)/progress/loading.tsx",
    "app/(student)/progress/error.tsx",
    "app/(student)/analytics/loading.tsx",
    "app/(student)/analytics/error.tsx",
    "app/(student)/subjects/[subjectSlug]/progress/loading.tsx",
    "app/(student)/subjects/[subjectSlug]/progress/error.tsx",
  ]) assert.equal(existsSync(join(root, path)), true, `${path} should exist`);
});
