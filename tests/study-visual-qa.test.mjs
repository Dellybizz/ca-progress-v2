import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("Study page uses one clear hierarchy instead of repeated questions", () => {
  const page = read("components/study/study-page.tsx");
  const timer = read("components/study/study-timer.tsx");
  assert.match(page, /model\.timer \? "Focus session" : "Study"/);
  assert.match(page, /formatAttempt\(model\.attemptKey\)/);
  assert.match(timer, /title="Start a focus session"/);
  assert.match(timer, /<strong>Subject & chapter<\/strong>/);
  assert.match(timer, /<strong>Timer<\/strong>/);
  assert.doesNotMatch(timer, /What are you studying\?/);
  assert.doesNotMatch(page, /server-side|become your analytics|analytics source/i);
  assert.doesNotMatch(timer, /private database row|page memory|route changes/i);
});

test("Pomodoro presets show focus and break together", () => {
  const timer = read("components/study/study-timer.tsx");
  assert.match(timer, /<strong>25 \/ 5<\/strong>/);
  assert.match(timer, /<strong>50 \/ 10<\/strong>/);
  assert.match(timer, /focus \/ break/);
  assert.match(timer, /Start focus session/);
});

test("desktop Study cards use a single shared-width vertical flow", () => {
  const globals = read("app/globals.css");
  const css = read("app/styles/study-layout-refine.css");
  assert.match(globals, /study-layout-refine\.css/);
  assert.match(css, /max-width: 960px/);
  assert.match(css, /grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /study-builder-card,[\s\S]*study-recent-card/);
  assert.match(css, /position: static/);
});
