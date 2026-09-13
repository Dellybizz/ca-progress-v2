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

test("A1.3 uses direct group and subject selectors before chapter action", () => {
  const tracker = read("components/progress/progress-tracker.tsx");
  assert.match(tracker, /progress-group-tabs/);
  assert.match(tracker, /progress-subject-tabs/);
  assert.match(tracker, /All groups/);
  assert.match(tracker, /All subjects/);
  assert.doesNotMatch(tracker, /Your portfolio at a glance/);
});

test("A1.3 mobile keeps compact selectors and chapter actions", () => {
  const css = read("app/styles/progress.css") + read("app/styles/academic.css");
  assert.match(css, /\.progress-group-tabs/);
  assert.match(css, /\.progress-subject-tabs/);
  assert.match(css, /academic-chapter-row--workspace/);
});
