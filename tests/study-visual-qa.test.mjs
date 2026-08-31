import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("Study page is focus-first and student-facing", () => {
  const page = read("components/study/study-page.tsx");
  const timer = read("components/study/study-timer.tsx");
  assert.match(page, /What are you studying now\?/);
  assert.match(page, /Study focus/);
  assert.match(page, /Today/);
  assert.match(page, /Last 7 days/);
  assert.match(page, /Day streak/);
  assert.doesNotMatch(page, /server-side|become your analytics|analytics source/i);
  assert.doesNotMatch(timer, /private database row|page memory|route changes/i);
});

test("Study setup presents a clear two-step focus flow", () => {
  const timer = read("components/study/study-timer.tsx");
  assert.match(timer, /What are you studying\?/);
  assert.match(timer, /How do you want to focus\?/);
  assert.match(timer, /Focus \+ break cycles/);
  assert.match(timer, /Study without a fixed end/);
  assert.match(timer, /25/);
  assert.match(timer, /50/);
  assert.match(timer, /Start focus session/);
});

test("Study clarity layer uses one readable visual system", () => {
  const globals = read("app/globals.css");
  const css = read("app/styles/study-clarity.css");
  assert.match(globals, /study-clarity\.css/);
  assert.doesNotMatch(globals, /study-focus\.css/);
  assert.match(css, /study-page__summary/);
  assert.match(css, /study-builder-section__title/);
  assert.match(css, /study-mode-picker/);
  assert.match(css, /study-presets/);
  assert.match(css, /font-size: 14px/);
  assert.match(css, /font-size: 13px/);
});
