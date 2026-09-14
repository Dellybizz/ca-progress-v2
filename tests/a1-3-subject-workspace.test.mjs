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
  assert.match(tracker, /Both groups/);
  assert.match(tracker, /All subjects/);
  assert.match(tracker, /Go to Chapter Hub/);
  assert.match(tracker, /flushSync/);
  assert.match(tracker, /saveChains/);
  assert.match(tracker, /disabled=\{locked\}/);
  for (const label of ["Rev. 1", "Rev. 2", "Test 1", "Test 2"]) assert.match(tracker, new RegExp(label.replace(".", "\\.")));
  assert.match(tracker, /Income Tax \(DT\)/);
  assert.match(tracker, /Goods and Service Tax \(IDT\)/);
  assert.match(tracker, /Financial Management/);
  assert.match(tracker, /Strategic Management/);
  assert.doesNotMatch(tracker, /<small>\{stage\.label\}<\/small>/);
  assert.doesNotMatch(tracker, /Your portfolio at a glance/);
});

test("A1.3 mobile keeps compact selectors and chapter actions", () => {
  const css = read("app/styles/progress.css") + read("app/styles/academic.css");
  assert.match(css, /\.progress-group-tabs/);
  assert.match(css, /\.progress-subject-tabs/);
  assert.match(css, /academic-chapter-row--workspace/);
  assert.match(css, /progress-chapter-card\{padding:9px 0/);
  assert.match(css, /progress-hub-label--mobile/);
  assert.match(css, /grid-template-columns:minmax\(0,1fr\) auto/);
  assert.match(css, /@media\(min-width:981px\)\{\.progress-page\{width:111\.111%;max-width:1355\.56px;zoom:\.9\}\}/);
});
