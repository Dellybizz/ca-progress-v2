import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { refinementR1 } from "../config/refinement-r1-constitution.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("R1 locks one bounded reference owner for each product interaction family", () => {
  assert.deepEqual(Object.keys(refinementR1.references), ["quizlet", "amie", "todoist", "goodnotes", "dub", "linear"]);
  for (const reference of Object.values(refinementR1.references)) {
    assert.ok(reference.owns.length > 0);
    assert.ok(reference.reject.length > 0);
  }
});

test("R1 makes mobile adaptation and accessibility measurable", () => {
  assert.deepEqual(refinementR1.mobileActions, ["keep", "condense", "move", "defer", "merge", "remove on mobile"]);
  assert.deepEqual(refinementR1.primaryMobileNavigation, ["Home", "Today", "Study", "Progress", "More"]);
  assert.equal(refinementR1.targets.touchTargetPx, 44);
  assert.equal(refinementR1.targets.compactPhoneWidthPx, 360);
  assert.equal(refinementR1.targets.maxHorizontalApplicationOverflowPx, 0);
});

test("R1 deliverables cover evidence, routes, wireflows, mobile priorities and design constitution", () => {
  const files = [
    "docs/refinement-r1/REFERO_EVIDENCE.md",
    "docs/refinement-r1/ROUTE_REFERENCE_MAP.md",
    "docs/refinement-r1/WIREFLOWS.md",
    "docs/refinement-r1/MOBILE_PRIORITY_MATRIX.md",
    "DESIGN.md",
  ].map(read);
  const combined = files.join("\n");
  for (const term of ["Quizlet", "Amie", "Todoist", "Goodnotes", "Dub", "Linear", "360", "390", "430", "1440", "44", "keep", "condense", "defer", "remove on mobile"]) {
    assert.match(combined, new RegExp(term, "i"));
  }
  assert.match(read("docs/refinement-r1/WIREFLOWS.md"), /Desktop[\s\S]*Mobile/);
  assert.match(read("DESIGN.md"), /server authorization remains authoritative/i);
});
