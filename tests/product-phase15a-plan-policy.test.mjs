import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  PLAN_FEATURE_REQUIRED_TIER,
  PLAN_POLICY,
  PRODUCT_PLAN_LABELS,
  canUsePlanFeature,
  meetsMinimumTier,
  normalizePlanTier,
  planFeatureRequirement,
  productPlanLabel,
  storageQuotaBytes,
  storageQuotaMegabytes,
  tierRank,
} from "../lib/billing/plan-policy.mjs";
import {
  EXPORT_PRODUCT_PLANS,
  canUseExport,
  exportProductPlanLabel,
  exportRequirement,
  normalizeExportTier,
} from "../lib/exports/policy.mjs";

const MEBIBYTE = 1024 * 1024;
const BILLING_SERVICE = "lib/billing/service.ts";
const EXPORT_POLICY = "lib/exports/policy.mjs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

test("Phase 15A defines one canonical Free/Pro/Premium identity and rank order", () => {
  assert.deepEqual(PRODUCT_PLAN_LABELS, { free: "Free", basic: "Pro", pro: "Premium" });
  assert.equal(productPlanLabel("free"), "Free");
  assert.equal(productPlanLabel("basic"), "Pro");
  assert.equal(productPlanLabel("pro"), "Premium");
  assert.equal(tierRank("free"), 0);
  assert.equal(tierRank("basic"), 1);
  assert.equal(tierRank("pro"), 2);
  assert.equal(meetsMinimumTier("free", "basic"), false);
  assert.equal(meetsMinimumTier("basic", "basic"), true);
  assert.equal(meetsMinimumTier("pro", "basic"), true);
});

test("unknown or malformed plan values fail safely to Free", () => {
  for (const value of [undefined, null, "", "premium", "enterprise", 2, {}, []]) {
    assert.equal(normalizePlanTier(value), "free");
    assert.equal(productPlanLabel(value), "Free");
    assert.equal(tierRank(value), 0);
  }
});

test("Phase 15A locks storage quotas to 250 MB, 2.5 GB, and 15 GB", () => {
  assert.equal(storageQuotaMegabytes("free"), 250);
  assert.equal(storageQuotaMegabytes("basic"), 2560);
  assert.equal(storageQuotaMegabytes("pro"), 15360);

  assert.equal(storageQuotaBytes("free"), 250 * MEBIBYTE);
  assert.equal(storageQuotaBytes("basic"), 2560 * MEBIBYTE);
  assert.equal(storageQuotaBytes("pro"), 15360 * MEBIBYTE);

  assert.equal(PLAN_POLICY.free.storageQuotaBytes, 250 * MEBIBYTE);
  assert.equal(PLAN_POLICY.basic.storageQuotaBytes, 2.5 * 1024 * 1024 * 1024);
  assert.equal(PLAN_POLICY.pro.storageQuotaBytes, 15 * 1024 * 1024 * 1024);
  assert.ok(storageQuotaBytes("free") < storageQuotaBytes("basic"));
  assert.ok(storageQuotaBytes("basic") < storageQuotaBytes("pro"));
});

test("Free remains a complete core study product while paid feature floors stay deterministic", () => {
  for (const feature of [
    "progress_tracker",
    "today_planning",
    "study_timer",
    "chapter_tracking",
    "revision_tracking",
    "tests_basic",
    "notes_basic",
    "community",
    "gamification",
    "study_buddy",
    "profile",
    "analytics_basic",
    "forecast_basic",
    "exam_countdown",
    "resources_storage",
    "progress_pdf",
  ]) {
    assert.equal(PLAN_FEATURE_REQUIRED_TIER[feature], "free", feature);
    assert.equal(canUsePlanFeature("free", feature), true, feature);
  }

  for (const feature of ["advanced_analytics", "study_csv", "test_history_csv"]) {
    assert.equal(canUsePlanFeature("free", feature), false, feature);
    assert.equal(canUsePlanFeature("basic", feature), true, feature);
    assert.equal(canUsePlanFeature("pro", feature), true, feature);
  }

  assert.equal(canUsePlanFeature("basic", "full_backup"), false);
  assert.equal(canUsePlanFeature("pro", "full_backup"), true);
  assert.equal(canUsePlanFeature("pro", "unknown_feature"), false);
});

test("Phase 14 export behavior is preserved through the Phase 15A policy adapter", () => {
  assert.equal(EXPORT_PRODUCT_PLANS, PRODUCT_PLAN_LABELS);
  assert.equal(normalizeExportTier("basic"), "basic");
  assert.equal(normalizeExportTier("unexpected"), "free");
  assert.equal(exportProductPlanLabel("pro"), "Premium");

  assert.equal(canUseExport("free", "progress_pdf"), true);
  assert.equal(canUseExport("free", "study_csv"), false);
  assert.equal(canUseExport("free", "test_history_csv"), false);
  assert.equal(canUseExport("free", "full_backup"), false);

  assert.equal(canUseExport("basic", "progress_pdf"), true);
  assert.equal(canUseExport("basic", "study_csv"), true);
  assert.equal(canUseExport("basic", "test_history_csv"), true);
  assert.equal(canUseExport("basic", "full_backup"), false);

  assert.equal(canUseExport("pro", "progress_pdf"), true);
  assert.equal(canUseExport("pro", "study_csv"), true);
  assert.equal(canUseExport("pro", "test_history_csv"), true);
  assert.equal(canUseExport("pro", "full_backup"), true);

  assert.deepEqual(exportRequirement("study_csv"), { tier: "basic", productPlan: "Pro" });
  assert.deepEqual(exportRequirement("full_backup"), { tier: "pro", productPlan: "Premium" });
  assert.equal(planFeatureRequirement("not_real"), null);
});

test("exports and resource storage consume the canonical policy instead of private tier/quota maps", () => {
  const exportsSource = read(EXPORT_POLICY);
  const billingSource = read(BILLING_SERVICE);

  assert.match(exportsSource, /from "\.\.\/billing\/plan-policy\.mjs"/);
  assert.match(exportsSource, /canUsePlanFeature\(tier, kind\)/);
  assert.doesNotMatch(exportsSource, /const TIER_RANK|REQUIRED_TIER/);

  assert.match(billingSource, /from "\.\/plan-policy\.mjs"/);
  assert.match(billingSource, /tierRank\(rewardTier\)/);
  assert.match(billingSource, /tierRank\(currentTier\)/);
  assert.match(billingSource, /storageQuotaMegabytes\(entitlement\.tier\)/);
  assert.match(billingSource, /storageQuotaBytes\(entitlement\.tier\)/);
  assert.match(billingSource, /canUsePlanFeature\(entitlement\.tier, "resources_storage"\)/);
  assert.doesNotMatch(billingSource, /entitlement\.limitValue \* 1024 \* 1024/);
});

test("storage enforcement remains owner-scoped and blocks only writes that exceed the canonical quota", () => {
  const billingSource = read(BILLING_SERVICE);
  assert.match(billingSource, /from\("uploaded_resources"\)\.select\("size_bytes"\)\.eq\("owner_user_id", userId\)/);
  assert.match(billingSource, /access\.usedBytes \+ input\.sizeBytes > access\.limitBytes/);
  assert.doesNotMatch(billingSource, /from\("uploaded_resources"\)\.delete\(/);
});
