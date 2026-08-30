import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("later work preserves the Phase 1 boundary against academic and progress logic", () => {
  const phase1Source = [
    "supabase/migrations/20260830010100_phase1_user_preferences.sql",
    "lib/ui/preferences.ts",
    "lib/analytics/events.ts",
  ].map(read).join("\n");
  for (const forbidden of ["course_levels", "syllabus_versions", "chapter_progress"]) assert.equal(phase1Source.includes(forbidden), false, forbidden);
});

test("analytics remains a provider-neutral interface placeholder", () => {
  const analytics = read("lib/analytics/events.ts");
  assert.match(analytics, /AnalyticsSink/);
  assert.match(analytics, /noopAnalyticsSink/);
  assert.equal(/posthog|mixpanel|segment|google-analytics/i.test(analytics), false);
});
