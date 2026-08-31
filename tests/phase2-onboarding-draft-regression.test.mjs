import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const route = readFileSync(join(root, "app/api/onboarding/route.ts"), "utf8");

test("onboarding draft saves ignore blank values from later auto-advance steps", () => {
  assert.match(route, /function hasDraftValue\(value: unknown\)/);
  assert.match(route, /value !== null && value !== undefined && value !== ""/);
  assert.match(route, /if \(hasDraftValue\(body\.group\)/);
  assert.match(route, /if \(hasDraftValue\(body\.attemptKey\)/);
  assert.match(route, /if \(hasDraftValue\(body\.primaryUse\)/);
});

test("complete onboarding still requires a real primary focus", () => {
  assert.match(route, /if \(!isPrimaryUse\(body\.primaryUse\)\).*Choose what you want CA Progress to help with most/);
});
