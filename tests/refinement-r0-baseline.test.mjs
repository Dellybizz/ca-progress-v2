import assert from "node:assert/strict";
import test from "node:test";
import { defectRegister, journeyInventory, mobileRouteInventory, performanceBaseline, refinementR0, reuseMap } from "../config/refinement-r0-baseline.mjs";
import { routeContracts } from "../config/product-consistency-route-contracts.mjs";

test("R0 pins the certified production handover without changing main", () => {
  assert.equal(refinementR0.phase, "R0");
  assert.equal(refinementR0.production.branch, "phase-12-operations-admin-platform");
  assert.equal(refinementR0.production.migrationCount, 47);
  assert.match(refinementR0.production.dataPolicy, /Preserve production data and stable identifiers/);
});

test("R0 inventories every contracted route for reuse and mobile adaptation", () => {
  assert.equal(reuseMap.length, routeContracts.length);
  assert.equal(mobileRouteInventory.length, routeContracts.length);
  assert.ok(mobileRouteInventory.every((item) => item.primaryAction && item.rationale));
  assert.ok(mobileRouteInventory.every((item) => item.checks.includes("44px touch targets")));
  assert.ok(journeyInventory.length >= 8);
});

test("R0 records reproducible performance and blocks open critical defects", () => {
  assert.ok(performanceBaseline.samples.length >= 3);
  assert.ok(performanceBaseline.samples.every((sample) => sample.status === 200));
  assert.equal(defectRegister.filter((item) => item.severity === "critical" && item.state !== "closed").length, 0);
});

