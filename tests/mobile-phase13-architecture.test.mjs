import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { mobileLocalFirstBoundaries as policy } from "../config/mobile-local-first-boundaries.mjs";
import { validateMobileBoundaries, violationsForSource } from "../scripts/mobile/validate-local-first-boundaries.mjs";

const read = (name) => readFile(new URL(`../${name}`, import.meta.url), "utf8");

test("Phase 13 architecture records and route policy are committed", async () => {
  for (const name of ["BASELINE.md", "ARCHITECTURE.md", "ROUTE_DATA_MATRIX.md", "SECURITY_BOUNDARIES.md", "PERFORMANCE_BUDGET.md", "PHASE_13_STATUS.md"]) {
    const value = await read(`docs/mobile-local-first/${name}`);
    assert.ok(value.length > 500, `${name} must contain a substantive record`);
  }
  const matrix = await read("docs/mobile-local-first/ROUTE_DATA_MATRIX.md");
  for (const route of ["/dashboard", "/planner", "/progress", "/study", "/notes", "/community", "/settings", "/billing", "/admin"]) {
    assert.match(matrix, new RegExp(route.replace("/", "\\/")));
  }
});

test("mobile dependency policy rejects server authority imports and secrets", () => {
  assert.ok(policy.sourceRoots.includes("apps/mobile"));
  for (const source of [
    'import { cookies } from "next/headers";',
    'import { db } from "@/lib/data/d1/client";',
    'import "server-only";',
    'const secret = process.env.RAZORPAY_KEY_SECRET;',
  ]) assert.ok(violationsForSource(source).length > 0, source);
  assert.deepEqual(violationsForSource('import { api } from "@ca/api-client";'), []);
});

test("current mobile-facing package roots satisfy the dependency boundary", async () => {
  const result = await validateMobileBoundaries();
  assert.deepEqual(result.violations, []);
});

test("baseline records the hosted shell and versioned offline mismatch", async () => {
  const baseline = await read("docs/mobile-local-first/BASELINE.md");
  assert.match(baseline, /server\.url/);
  assert.match(baseline, /\/api\/v1\/progress/);
  assert.match(baseline, /\/api\/progress/);
  const architecture = await read("docs/mobile-local-first/ARCHITECTURE.md");
  assert.match(architecture, /ADR-006/);
});
