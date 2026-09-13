import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { defectRegister, journeyInventory, mobileRouteInventory, performanceBaseline, refinementR0, reuseMap } from "../../config/refinement-r0-baseline.mjs";
import { routeContracts } from "../../config/product-consistency-route-contracts.mjs";

const root = resolve(import.meta.dirname, "../..");
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

check(refinementR0.phase === "R0", "phase must remain R0");
check(refinementR0.production.migrationCount === 47, "migration ledger must record all 47 migrations");
check(existsSync(resolve(root, `d1/migrations/${refinementR0.production.latestMigration}`)), "latest migration is missing");
check(reuseMap.length === routeContracts.length, "every contracted route needs a reuse owner");
check(mobileRouteInventory.length === routeContracts.length, "every contracted route needs a mobile decision");
check(mobileRouteInventory.every((item) => item.primaryAction && item.checks.length === 4), "mobile entries need a purpose, primary action and checks");
check(journeyInventory.length >= 8, "important journeys are incomplete");
check(performanceBaseline.samples.every((sample) => sample.status === 200), "guest performance samples must be reproducible HTTP 200 responses");
check(defectRegister.some((item) => item.severity === "critical" && item.state === "closed"), "critical consistency gate evidence is missing");
check(!defectRegister.some((item) => item.severity === "critical" && item.state !== "closed"), "R0 cannot pass with an open critical defect");

console.log(JSON.stringify({ phase: "R0", passed: failures.length === 0, routes: routeContracts.length, journeys: journeyInventory.length, migrations: refinementR0.production.migrationCount, defects: defectRegister.length, failures }, null, 2));
if (failures.length) process.exit(1);

