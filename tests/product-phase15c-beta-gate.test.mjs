import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  PLAN_FEATURE_REQUIRED_TIER,
  canUsePlanFeature,
  monthlyPriceInr,
  productPlanLabel,
  storageQuotaMegabytes,
  tierRank,
} from "../lib/billing/plan-policy.mjs";
import {
  PLAN_COMPARISON_COLUMNS,
  PLAN_COMPARISON_ROWS,
  planComparisonValue,
} from "../lib/billing/plan-comparison.mjs";
import {
  IMPLEMENTED_PAID_SURFACES,
  NOT_YET_IMPLEMENTED_PAID_FEATURES,
} from "../lib/billing/paid-surface-audit.mjs";

const read = (path) => fs.readFileSync(path, "utf8");

test("Phase 15C comparison locks canonical Free, Pro and Premium product values", () => {
  assert.deepEqual(PLAN_COMPARISON_COLUMNS.map((column) => ({
    tier: column.tier,
    label: column.label,
    monthlyPriceInr: column.monthlyPriceInr,
    storageQuotaMegabytes: column.storageQuotaMegabytes,
  })), [
    { tier: "free", label: "Free", monthlyPriceInr: 0, storageQuotaMegabytes: 250 },
    { tier: "basic", label: "Pro", monthlyPriceInr: 50, storageQuotaMegabytes: 2560 },
    { tier: "pro", label: "Premium", monthlyPriceInr: 150, storageQuotaMegabytes: 15360 },
  ]);
  assert.equal(monthlyPriceInr("free"), 0);
  assert.equal(monthlyPriceInr("basic"), 50);
  assert.equal(monthlyPriceInr("pro"), 150);
  assert.equal(productPlanLabel("basic"), "Pro");
  assert.equal(productPlanLabel("pro"), "Premium");

  const storage = PLAN_COMPARISON_ROWS.find((row) => row.key === "storage");
  assert.ok(storage);
  assert.equal(planComparisonValue(storage, "free"), "250 MB");
  assert.equal(planComparisonValue(storage, "basic"), "2.5 GB");
  assert.equal(planComparisonValue(storage, "pro"), "15 GB");
});

test("pricing UX is comparison-first and never exposes internal Basic/Pro naming as product identity", () => {
  const page = read("app/(student)/pricing/page.tsx");
  const client = read("components/billing/pricing-client.tsx");
  assert.match(page, /Free, Pro or Premium/);
  assert.match(page, /server, not trusted from the browser/);
  assert.match(client, /PLAN_COMPARISON_COLUMNS/);
  assert.match(client, /PLAN_COMPARISON_ROWS/);
  assert.match(client, /productPlanLabel\(plan\.tier_key\)/);
  assert.match(client, /monthlyPriceInr\(plan\.tier_key\)/);
  assert.match(client, /Checkout stays locked if the server billing row differs/);
  assert.doesNotMatch(client, />Basic</);
});

test("every implemented paid API surface is represented by the audit and has a server-side feature check", () => {
  assert.ok(IMPLEMENTED_PAID_SURFACES.length >= 7);
  const keys = new Set();
  for (const surface of IMPLEMENTED_PAID_SURFACES) {
    assert.ok(fs.existsSync(surface.route), `${surface.key}: ${surface.route}`);
    assert.ok(!keys.has(surface.key), surface.key);
    keys.add(surface.key);
    assert.notEqual(PLAN_FEATURE_REQUIRED_TIER[surface.featureKey], "free", surface.featureKey);
    const source = read(surface.route);
    assert.match(source, new RegExp(`[\"']${surface.featureKey}[\"']`), surface.key);
    if (surface.route.includes("/exports/")) assert.match(source, /canUseExport/);
    else assert.match(source, /getPlanFeatureAccessForUser/);
  }
});

test("planner paid mutations are server gated while Free notification read state remains usable", () => {
  const calendar = read("app/api/planner/calendar/route.ts");
  const goals = read("app/api/planner/goals/route.ts");
  const notifications = read("app/api/planner/notifications/route.ts");
  assert.match(calendar, /getPlanFeatureAccessForUser\(user\.id, "advanced_planner_calendar"\)/);
  assert.match(goals, /getPlanFeatureAccessForUser\(user\.id, "detailed_goals_reports"\)/);
  assert.match(notifications, /if \(body\.action === "read"\)/);
  assert.match(notifications, /if \(body\.action === "read_all"\)/);
  assert.match(notifications, /if \(body\.action === "preferences"\)[\s\S]*getPlanFeatureAccessForUser\(user\.id, "customisation_reminders"\)/);
  assert.match(calendar, /PLAN_UPGRADE_REQUIRED/);
  assert.match(goals, /PLAN_UPGRADE_REQUIRED/);
  assert.match(notifications, /PLAN_UPGRADE_REQUIRED/);
});

test("Study Buddy keeps connection and safety Free while collaboration actions require Pro", () => {
  const source = read("app/api/study-buddy/route.ts");
  const advanced = source.match(/const ADVANCED_ACTIONS = new Set\(\[([^\]]+)\]\)/)?.[1] ?? "";
  for (const action of ["sharing", "nudge", "createGoal", "contributeGoal", "startTogether", "joinTogether", "completeTogether"]) {
    assert.match(advanced, new RegExp(`"${action}"`), action);
  }
  for (const action of ["request", "respond", "remove", "safety", "report"]) {
    assert.doesNotMatch(advanced, new RegExp(`"${action}"`), action);
    assert.match(source, new RegExp(`case "${action}"`), action);
  }
  assert.match(source, /getPlanFeatureAccessForUser\(user\.id, "expanded_study_buddy"\)/);
});

test("controlled beta matrix preserves a genuinely usable Free product and monotonic upgrades", () => {
  const freeCore = [
    "progress_tracker", "today_planning", "study_timer", "chapter_tracking", "revision_tracking",
    "tests_basic", "notes_basic", "community", "gamification", "study_buddy", "profile",
    "analytics_basic", "forecast_basic", "exam_countdown", "resources_storage", "progress_pdf",
  ];
  for (const feature of freeCore) assert.equal(canUsePlanFeature("free", feature), true, `Free ${feature}`);

  const proUpgrades = ["advanced_analytics", "advanced_planner_calendar", "customisation_reminders", "expanded_study_buddy", "detailed_goals_reports", "study_csv", "test_history_csv"];
  for (const feature of proUpgrades) {
    assert.equal(canUsePlanFeature("free", feature), false, feature);
    assert.equal(canUsePlanFeature("basic", feature), true, feature);
    assert.equal(canUsePlanFeature("pro", feature), true, feature);
  }

  const premiumUpgrades = ["advanced_preparation", "advanced_forecasts_insights", "full_backup", "full_historical_insights", "advanced_recovery_planning"];
  for (const feature of premiumUpgrades) {
    assert.equal(canUsePlanFeature("free", feature), false, feature);
    assert.equal(canUsePlanFeature("basic", feature), false, feature);
    assert.equal(canUsePlanFeature("pro", feature), true, feature);
  }

  assert.equal(tierRank("free") < tierRank("basic"), true);
  assert.equal(tierRank("basic") < tierRank("pro"), true);
  assert.equal(storageQuotaMegabytes("free") < storageQuotaMegabytes("basic"), true);
  assert.equal(storageQuotaMegabytes("basic") < storageQuotaMegabytes("pro"), true);
});

test("full retention loop has concrete implemented surfaces for the beta gate", () => {
  const surfaces = [
    ["Today / Planner", "app/(student)/planner/page.tsx"],
    ["Study / Reflection", "app/(student)/study/page.tsx"],
    ["Progress", "app/(student)/progress/page.tsx"],
    ["XP / achievements", "app/api/gamification/route.ts"],
    ["Notes", "app/(student)/notes/page.tsx"],
    ["Tests", "app/(student)/tests/page.tsx"],
    ["Analytics", "app/(student)/analytics/page.tsx"],
    ["Study Buddy", "app/(student)/study-buddy/page.tsx"],
  ];
  for (const [label, path] of surfaces) assert.ok(fs.existsSync(path), `${label}: ${path}`);
  assert.match(read("app/(student)/study/page.tsx"), /reflect/);
  assert.match(read("app/api/gamification/route.ts"), /XP and achievements/);
  assert.match(read("app/(student)/analytics/page.tsx"), /Actionable analytics/);
});

test("downgrade remains non-destructive and only future paid writes are locked", () => {
  const billing = read("lib/billing/service.ts");
  const uploadIntent = read("app/api/resources/upload-url/route.ts");
  const uploadComplete = read("app/api/resources/upload-complete/route.ts");
  assert.doesNotMatch(billing, /from\("uploaded_resources"\)\.delete\(/);
  assert.match(uploadIntent, /r2_upload_intents/);
  assert.match(uploadComplete, /getResourceStorageAccess\(identity\.id\)/);
  assert.match(uploadComplete, /bucket\.delete\(String\(intent\.object_key\)\)/);
  assert.doesNotMatch(uploadComplete, /DELETE FROM uploaded_resources/);
});

test("unimplemented paid ideas are explicit and Phase 16 is not started by 15C", () => {
  for (const feature of NOT_YET_IMPLEMENTED_PAID_FEATURES) {
    assert.notEqual(PLAN_FEATURE_REQUIRED_TIER[feature], "free", feature);
  }
  assert.equal(fs.existsSync("docs/CA_PROGRESS_PRODUCT_PHASE16_STATUS.md"), false);
});
