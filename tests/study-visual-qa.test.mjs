import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("Study page uses one clear hierarchy instead of repeated questions", () => {
  const page = read("components/study/study-page.tsx");
  const timer = read("components/study/study-timer.tsx");
  assert.match(page, /StudyFocusWorkspace/);
  assert.doesNotMatch(page, /study-page__intro/);
  assert.match(timer, /title=\{isActive \? "Session details" : "Start a focus session"\}/);
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

test("A1.2 Study uses a compact activity pulse above recent study", () => {
  const page = read("components/study/study-page.tsx");
  const timer = read("components/study/study-timer.tsx");
  const globals = read("app/globals.css");
  const css = read("app/styles/academic-index-a12.css");
  assert.doesNotMatch(page, /study-page__summary/);
  assert.match(timer, /function StudySideRail/);
  assert.match(timer, /study-side-pulse/);
  assert.match(timer, /Today/);
  assert.match(timer, /7 days/);
  assert.match(timer, /Streak/);
  assert.match(timer, /study-recent-card/);
  assert.match(globals, /academic-index-a12\.css/);
  assert.match(css, /study-side-pulse/);
});

test("A1.2 unifies Study actions and the structural Syllabus index", () => {
  const page = read("components/study/study-page.tsx");
  const syllabus = read("components/academic/syllabus-explorer.tsx");
  const css = read("app/styles/academic-index-a12.css");
  assert.doesNotMatch(page, /study-course-index/);
  assert.match(page, /StudyFocusWorkspace/);
  assert.match(syllabus, /Level → Group → Subject → Chapter → Unit/);
  assert.match(syllabus, /academic-subject-list/);
  assert.doesNotMatch(syllabus, /academic-hero/);
  assert.match(css, /@media\(max-width:620px\)/);
});

test("Study timer uses the requested focused dial and control-panel composition", () => {
  const timer = read("components/study/study-timer.tsx");
  const css = read("app/styles/academic-index-a12.css");
  assert.match(timer, /study-timer-workspace/);
  assert.match(timer, /study-timer-preview/);
  assert.match(timer, /study-timer-dial/);
  assert.match(timer, /study-control-panel/);
  assert.match(css, /grid-template-areas:"preview controls" "preview rail"/);
  assert.match(timer, /study-timer-ring__progress/);
  assert.match(timer, /setInterval\(tick, 100\)/);
  assert.match(css, /stroke-dashoffset \.12s linear/);
  assert.match(css, /study-timer-dial>\.study-timer-ring\{position:absolute/);
  assert.match(css, /is-stopwatch \.study-timer-ring/);
});

test("timer mutations and reflection dismissal respond optimistically", () => {
  const timer = read("components/study/study-timer.tsx");
  const reflection = read("components/study/study-reflection.tsx");
  const workspace = read("components/study/study-focus-workspace.tsx");
  assert.match(timer, /setOptimisticStartedAt\(Date\.now\(\)\)/);
  assert.match(timer, /setOptimisticEnded\(true\)/);
  assert.match(timer, /const timerStatus = optimisticStatus/);
  assert.match(timer, /activeStartedAt/);
  assert.doesNotMatch(timer, /Starting your focus session|study-starting-state/);
  assert.match(reflection, /setLater\(true\)/);
  assert.match(reflection, />Later<\/button>/);
  assert.match(reflection, /Number\(value\) <= 100/);
  assert.match(reflection, /role="dialog"/);
  assert.match(workspace, /onReviewChange/);
  assert.match(timer, /ready: false/);
});

test("academic breadcrumbs preserve the route a student used", () => {
  const trail = read("components/shell/route-trail.tsx");
  const shell = read("components/shell/app-shell.tsx");
  const study = read("components/study/study-page.tsx");
  assert.match(trail, /usePathname/);
  assert.match(trail, /sessionStorage/);
  assert.match(trail, /data-route-root-navigation/);
  assert.match(trail, /isTopLevel/);
  assert.match(shell, /<RouteTrail homeHref=\{homeHref\}/);
  assert.doesNotMatch(study, /study-page__intro/);
});

test("focus sessions work without a subject or chapter", () => {
  const timer = read("components/study/study-timer.tsx");
  const service = read("lib/study/phase3.ts");
  assert.match(timer, /Start general focus/);
  assert.match(timer, /<option value="">General focus<\/option>/);
  assert.match(timer, /disabled=\{busy\}/);
  assert.doesNotMatch(service, /Choose a chapter before starting a standalone study session/);
});
