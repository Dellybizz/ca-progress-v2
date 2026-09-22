import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("Phase 7 publishes one explicit contract for all 14 student feature families", () => {
  const contract = read("config/mobile-feature-parity.ts");
  const entries = contract.slice(contract.indexOf("const FEATURES"), contract.indexOf("] as const"));
  const ids = [...entries.matchAll(/id: "([^"]+)"/g)].map((match) => match[1]);
  assert.equal(ids.length, 14);
  assert.equal(new Set(ids).size, 14);
  for (const field of ["mobileLayout", "offline", "permission", "synchronization", "failureState"])
    assert.equal((entries.match(new RegExp(`${field}:`, "g")) ?? []).length, 14);
  assert.match(contract, /analytics: "shared route, API and failure telemetry"/);
  assert.match(read("lib/mobile/api-v1.ts"), /studentFeatureParity: MOBILE_STUDENT_FEATURES/);
});

test("Phase 7 Feature Tour is responsive, recoverable and reachable", () => {
  for (const path of [
    "app/(student)/feature-tour/page.tsx",
    "app/(student)/feature-tour/loading.tsx",
    "app/(student)/feature-tour/error.tsx",
  ]) assert.ok(existsSync(new URL(path, root)), `${path} must exist`);
  const tour = read("components/mobile/feature-tour.tsx");
  const css = read("app/styles/shell.css");
  const navigation = read("components/shell/navigation-contract.ts");
  assert.match(tour, /ca-progress:feature-tour/);
  assert.match(tour, /Progress remains on this device/);
  assert.match(read("app/(student)/feature-tour/page.tsx"), /branch preview has no auth or D1 binding/);
  assert.match(css, /\.feature-tour/);
  assert.match(css, /@media \(max-width: 520px\)/);
  assert.match(navigation, /href: "\/feature-tour"/);
});

test("Phase 7 synchronizes tour progress through D1 without blocking guests", () => {
  const migration = read("d1/migrations/0060_mobile_phase7_feature_tour.sql");
  const route = read("app/api/feature-tour/route.ts");
  const service = read("lib/mobile/feature-tour.ts");
  const migrations = read("scripts/apply-retained-d1-migrations.mjs");
  assert.match(migration, /feature_tour_step INTEGER NOT NULL DEFAULT 0/);
  assert.match(migration, /feature_tour_completed_at TEXT/);
  assert.match(route, /localOnly: true/);
  assert.match(route, /Number\(input\.step\) > 14/);
  assert.match(service, /WHERE user_id=\?3/);
  assert.match(service, /isFeatureTourSchemaUnavailable/);
  assert.match(service, /cloudReady: false/);
  assert.match(service, /storage-unavailable/);
  assert.match(route, /FEATURE_TOUR_SYNC_NOT_READY/);
  assert.match(migrations, /0060_mobile_phase7_feature_tour\.sql/);
});

test("Phase 7 global search retains shortcuts and adds academic results", () => {
  const controls = read("components/shell/topbar-controls.tsx");
  assert.match(controls, /allNavigation\(area\)/);
  assert.match(controls, /\/api\/v1\/academic\/search\?q=/);
  assert.match(controls, /Academic search is unavailable\. Page shortcuts still work/);
  assert.match(controls, /item\.type === "subject"/);
});

test("Phase 7 notification drawer uses the authenticated planner feed", () => {
  const drawer = read("components/shell/notification-drawer.tsx");
  const route = read("app/api/planner/notifications/route.ts");
  assert.match(drawer, /\/api\/v1\/planner\/notifications/);
  assert.match(drawer, /action: "read"/);
  assert.match(drawer, /Sign in for private reminders/);
  assert.match(route, /getPhase8NotificationCenter/);
  assert.match(route, /optionalUser/);
  assert.match(route, /status: 401/);
});

test("Phase 7 truthfully distinguishes full, partial, snapshot and online behavior", () => {
  const contract = read("config/mobile-feature-parity.ts");
  assert.match(contract, /"full" \| "partial" \| "snapshot" \| "online"/);
  assert.match(contract, /id: "planning"[\s\S]*?offline: "partial"/);
  assert.match(contract, /id: "search"[\s\S]*?offline: "online"/);
  assert.match(read("docs/mobile/PHASE_7_STUDENT_PARITY.md"), /Phase 8/);
});
