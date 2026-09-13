import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(`${root}${path}`, "utf8");

test("A1.3 joins subject structure to canonical progress without duplicating state", () => {
  const route = read("app/(student)/subjects/[subjectSlug]/page.tsx");
  const subject = read("components/academic/subject-detail.tsx");
  assert.match(route, /getProgressPageModel\(subjectSlug\)/);
  for (const signal of ["completed_at", "revision_1_at", "revision_2_at", "test_1_at", "test_2_at"]) assert.match(subject, new RegExp(signal));
  assert.match(subject, /\/subjects\/\$\{subject\.slug\}\/progress/);
  assert.match(subject, /\/chapters\/\$\{chapter\.id\}/);
});

test("A1.3 separates portfolio comparison from subject action", () => {
  const tracker = read("components/progress/progress-tracker.tsx");
  assert.match(tracker, /progress-portfolio/);
  assert.match(tracker, /progress-subject-status/);
  assert.match(tracker, /subjectLocked \?/);
  assert.match(tracker, /Filter chapters/);
});

test("A1.3 mobile keeps chapter actions and defers comparison detail", () => {
  const css = read("app/styles/progress.css") + read("app/styles/academic.css");
  assert.match(css, /\.progress-mobile-filters\{display:block/);
  assert.match(css, /\.progress-toolbar\{display:none\}/);
  assert.match(css, /\.progress-history\{display:none\}/);
  assert.match(css, /academic-chapter-row--workspace/);
});
