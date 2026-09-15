import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("Phase 4 dashboard progress slot is promoted to Phase 5 data", () => {
  const service = read("lib/dashboard/service.ts");
  const types = read("lib/dashboard/types.ts");
  const ui = read("components/dashboard/student-dashboard.tsx");
  assert.match(service, /getProgressPageModel/);
  assert.match(service, /status: "tracked"/);
  assert.doesNotMatch(types, /awaiting_phase5/);
  assert.match(ui, /model\.progress\.overallPercent/);
  assert.match(ui, /group\.percent/);
  assert.doesNotMatch(ui, /Progress pending/);
});
