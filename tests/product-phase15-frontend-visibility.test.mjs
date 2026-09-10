import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

test("Phase 0-15 student-facing work has a reachable frontend surface", () => {
  for (const path of [
    "app/(student)/dashboard/page.tsx",
    "app/(student)/syllabus/page.tsx",
    "app/(student)/chapters/[chapterId]/page.tsx",
    "app/(student)/planner/today/page.tsx",
    "app/(student)/study/page.tsx",
    "app/(student)/progress/page.tsx",
    "app/(student)/tests/page.tsx",
    "app/(student)/notes/page.tsx",
    "app/(student)/community/page.tsx",
    "app/(student)/calendar/page.tsx",
    "app/(student)/goals/page.tsx",
    "app/(student)/analytics/page.tsx",
    "app/(student)/analytics/forecast/page.tsx",
    "app/(student)/study-profile/[userId]/page.tsx",
    "app/(student)/study-buddy/page.tsx",
    "app/(student)/activity/page.tsx",
    "app/(student)/settings/page.tsx",
    "app/(student)/pricing/page.tsx",
    "app/(student)/billing/page.tsx",
  ]) assert.equal(existsSync(join(root, path)), true, `${path} should exist`);
});

test("Dashboard subject discovery targets the real syllabus route", () => {
  const dashboard = read("components/dashboard/student-dashboard.tsx");
  assert.match(dashboard, /href="\/syllabus"[^>]+aria-label="Browse subjects"/);
  assert.match(dashboard, /href="\/syllabus"[^>]*>[\s\S]*?<strong>Browse Subjects<\/strong>/);
  assert.doesNotMatch(dashboard, /href="\/subjects"/);
});

test("Phase 13 leaderboard is discoverable without adding another top-level destination", () => {
  const dashboard = read("components/dashboard/student-dashboard.tsx");
  const navigation = read("components/shell/navigation.tsx");
  const mobile = read("components/shell/mobile-navigation.tsx");
  const panel = read("components/gamification/phase13-panel.tsx");
  assert.match(dashboard, /href="\/activity#leaderboard">Leaderboard/);
  assert.match(navigation, /Activity & Leaderboard/);
  assert.match(mobile, /Activity & Leaderboard/);
  assert.match(panel, /id="leaderboard"/);
  assert.match(panel, /Monthly leaderboard · opt-in only/);
});

test("Phase 11-15 completion evidence remains present without starting Phase 16", () => {
  for (const path of [
    "CA_PROGRESS_REVISED_PHASE_11_STATUS.md",
    "CA_PROGRESS_REVISED_PHASE_12_STATUS.md",
    "CA_PROGRESS_REVISED_PHASE_13_STATUS.md",
    "docs/CA_PROGRESS_PRODUCT_PHASE14_STATUS.md",
    "docs/CA_PROGRESS_PRODUCT_PHASE15_STATUS.md",
  ]) assert.equal(existsSync(join(root, path)), true, `${path} should exist`);
  assert.equal(existsSync(join(root, "docs/CA_PROGRESS_PRODUCT_PHASE16_STATUS.md")), false);
});
