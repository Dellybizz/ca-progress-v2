import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("Buddy comparison exposes Today weekly target and streak with relationship privacy gates", () => {
  const service = read("lib/study-buddy/comparison.ts");
  const component = read("components/study-buddy/study-buddy-comparison.tsx");
  const page = read("app/(student)/study-buddy/page.tsx");

  assert.match(service, /FROM study_buddy_relationships r/);
  assert.match(service, /r\.status='accepted'/);
  assert.match(service, /study_buddy_safety/);
  assert.match(service, /s\.blocked=1/);
  assert.match(service, /buddy_share\.share_progress/);
  assert.match(service, /buddy_share\.share_streak/);
  assert.match(service, /buddy_share\.share_goals/);
  assert.match(service, /owner_share\.share_goals/);
  assert.match(service, /todayStudyMinutes/);
  assert.match(service, /weekStudyMinutes/);
  assert.match(service, /weeklyTargetMinutes/);
  assert.match(service, /currentStreakDays/);

  assert.match(component, />Today</);
  assert.match(component, />Last 7 days</);
  assert.match(component, />Weekly target</);
  assert.match(component, />Current streak</);
  assert.match(component, /Not shared/);
  assert.match(component, /only when the buddy has permitted that relationship field/i);

  assert.match(page, /getStudyBuddyComparison/);
  assert.match(page, /StudyBuddyComparison/);
});

test("Buddy comparison never queries notes or test scores", () => {
  const service = read("lib/study-buddy/comparison.ts");
  assert.doesNotMatch(service, /FROM\s+notes|JOIN\s+notes|test_attempts|marks_scored|marks_total|body_html|body_text/i);
});
