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

test("desktop Study uses a right rail with metrics stacked above recent study", () => {
  const page = read("components/study/study-page.tsx");
  const timer = read("components/study/study-timer.tsx");
  const globals = read("app/globals.css");
  const css = read("app/styles/study-layout-refine.css");
  assert.doesNotMatch(page, /study-page__summary/);
  assert.match(timer, /function StudySideRail/);
  assert.match(timer, /study-side-stat--today/);
  assert.match(timer, /study-side-stat--week/);
  assert.match(timer, /study-side-stat--streak/);
  assert.match(timer, /study-recent-card/);
  assert.match(globals, /study-layout-refine\.css/);
  assert.match(css, /study-session-grid--idle/);
  assert.match(css, /grid-template-columns: minmax\(0, 1\.55fr\) minmax\(280px, \.62fr\)/);
  assert.match(css, /study-side-rail/);
});
