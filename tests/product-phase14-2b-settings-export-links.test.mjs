import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("Phase 14.2B settings exposes Study and Test History CSV only through entitlement guards", () => {
  const settings = fs.readFileSync("app/(student)/settings/page.tsx", "utf8");
  assert.match(settings, /canUseExport\(tier, "study_csv"\)/);
  assert.match(settings, /canUseExport\(tier, "test_history_csv"\)/);
  assert.match(settings, /canExportStudy \? <a href="\/api\/exports\/study" download>Study CSV<\/a>/);
  assert.match(settings, /canExportTests \? <a href="\/api\/exports\/tests" download>Test History CSV<\/a>/);
  assert.match(settings, /Study CSV · Pro/);
  assert.match(settings, /Test History CSV · Pro/);
  assert.match(settings, /Full Backup · Premium/);
  assert.doesNotMatch(settings, /href="\/api\/exports\/backup"/);
});
