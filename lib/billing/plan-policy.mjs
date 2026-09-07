const MEBIBYTE = 1024 * 1024;

export const PLAN_TIERS = Object.freeze(["free", "basic", "pro"]);

export const PRODUCT_PLAN_LABELS = Object.freeze({
  free: "Free",
  basic: "Pro",
  pro: "Premium",
});

export const PLAN_POLICY = Object.freeze({
  free: Object.freeze({
    tier: "free",
    productPlan: PRODUCT_PLAN_LABELS.free,
    rank: 0,
    storageQuotaMegabytes: 250,
    storageQuotaBytes: 250 * MEBIBYTE,
  }),
  basic: Object.freeze({
    tier: "basic",
    productPlan: PRODUCT_PLAN_LABELS.basic,
    rank: 1,
    storageQuotaMegabytes: 2560,
    storageQuotaBytes: 2560 * MEBIBYTE,
  }),
  pro: Object.freeze({
    tier: "pro",
    productPlan: PRODUCT_PLAN_LABELS.pro,
    rank: 2,
    storageQuotaMegabytes: 15360,
    storageQuotaBytes: 15360 * MEBIBYTE,
  }),
});

export const PLAN_FEATURE_REQUIRED_TIER = Object.freeze({
  progress_tracker: "free",
  today_planning: "free",
  study_timer: "free",
  chapter_tracking: "free",
  revision_tracking: "free",
  tests_basic: "free",
  notes_basic: "free",
  community: "free",
  gamification: "free",
  study_buddy: "free",
  profile: "free",
  analytics_basic: "free",
  forecast_basic: "free",
  exam_countdown: "free",
  resources_storage: "free",
  progress_pdf: "free",

  advanced_analytics: "basic",
  extended_history: "basic",
  advanced_planner_calendar: "basic",
  customisation_reminders: "basic",
  richer_notes: "basic",
  larger_test_archive: "basic",
  csv_exports: "basic",
  expanded_study_buddy: "basic",
  streak_freeze: "basic",
  detailed_goals_reports: "basic",
  study_csv: "basic",
  test_history_csv: "basic",

  advanced_preparation: "pro",
  advanced_forecasts_insights: "pro",
  full_backup: "pro",
  full_historical_insights: "pro",
  advanced_recovery_planning: "pro",
});

export function normalizePlanTier(value) {
  return value === "basic" || value === "pro" ? value : "free";
}

export function productPlanLabel(value) {
  return PRODUCT_PLAN_LABELS[normalizePlanTier(value)];
}

export function tierRank(value) {
  return PLAN_POLICY[normalizePlanTier(value)].rank;
}

export function meetsMinimumTier(value, requiredTier) {
  if (!PLAN_TIERS.includes(requiredTier)) return false;
  return tierRank(value) >= PLAN_POLICY[requiredTier].rank;
}

export function storageQuotaMegabytes(value) {
  return PLAN_POLICY[normalizePlanTier(value)].storageQuotaMegabytes;
}

export function storageQuotaBytes(value) {
  return PLAN_POLICY[normalizePlanTier(value)].storageQuotaBytes;
}

export function canUsePlanFeature(value, featureKey) {
  const requiredTier = PLAN_FEATURE_REQUIRED_TIER[featureKey];
  return requiredTier ? meetsMinimumTier(value, requiredTier) : false;
}

export function planFeatureRequirement(featureKey) {
  const tier = PLAN_FEATURE_REQUIRED_TIER[featureKey];
  if (!tier) return null;
  return Object.freeze({ tier, productPlan: PRODUCT_PLAN_LABELS[tier] });
}
