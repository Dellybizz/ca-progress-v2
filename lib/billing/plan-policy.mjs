const MEBIBYTE = 1024 * 1024;

export const PLAN_TIERS = Object.freeze(["free", "basic", "pro"]);

export const PRODUCT_PLAN_LABELS = Object.freeze({
  free: "Explorer",
  basic: "Striver",
  pro: "Ranker",
});

export const PLAN_POLICY = Object.freeze({
  free: Object.freeze({
    tier: "free",
    productPlan: PRODUCT_PLAN_LABELS.free,
    rank: 0,
    monthlyPriceInr: 0,
    storageQuotaMegabytes: 250,
    storageQuotaBytes: 250 * MEBIBYTE,
  }),
  basic: Object.freeze({
    tier: "basic",
    productPlan: PRODUCT_PLAN_LABELS.basic,
    rank: 1,
    monthlyPriceInr: 50,
    storageQuotaMegabytes: 2560,
    storageQuotaBytes: 2560 * MEBIBYTE,
  }),
  pro: Object.freeze({
    tier: "pro",
    productPlan: PRODUCT_PLAN_LABELS.pro,
    rank: 2,
    monthlyPriceInr: 150,
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

  advanced_analytics: "pro",
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

export function monthlyPriceInr(value) {
  return PLAN_POLICY[normalizePlanTier(value)].monthlyPriceInr;
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

// Only completed services are advertised and provisioned into plan policies.
export const PLAN_SERVICE_CATALOG = Object.freeze([
 ['progress_tracker','progress','Progress tracking'],['today_planning','planner','Today planner'],
 ['study_timer','study','Focus timer'],['chapter_tracking','progress','Chapter tracking'],
 ['revision_tracking','progress','Revision tracking'],['tests_basic','tests','Test records'],
 ['notes_basic','notes','Personal notes'],['community','community','Community'],
 ['gamification','leaderboard','XP and leaderboard'],['study_buddy','study-buddy','Study Buddy connections'],
 ['profile','profile','Profile'],['analytics_basic','analytics','Basic analytics'],
 ['forecast_basic','analytics','Baseline forecast'],['exam_countdown','planner','Exam countdown'],
 ['resources.storage','resources','Private file storage'],['progress_pdf','exports','Progress PDF'],
 ['advanced_planner_calendar','calendar','Personal calendar'],['detailed_goals_reports','goals','Detailed goals'],
 ['customisation_reminders','notifications','Custom reminder preferences'],
 ['expanded_study_buddy','study-buddy','Shared goals and study together'],
 ['study_csv','exports','Study CSV'],['test_history_csv','exports','Test history CSV'],
 ['advanced_analytics','analytics','Advanced performance analysis'],['full_backup','exports','Full backup'],
 ['core.product','core','Core study access'],['analytics.forecast','analytics','Baseline forecast'],
 ['planner.smart','planner','Today planning'],['community.attachments','community','Community attachments'],
 ['resources_storage','resources','Private file storage'],
].map(([key,page,label])=>Object.freeze({key,page,label,tier:PLAN_FEATURE_REQUIRED_TIER[key]??'free'})));
export function configuredStorageBytes(entitlement){
 const explicit=entitlement.storageLimitBytes;
 if(explicit!=null)return Number.isSafeInteger(Number(explicit))&&Number(explicit)>=0?Number(explicit):0;
 if(entitlement.limitValue!=null&&entitlement.limitUnit==='megabytes')return Number.isFinite(Number(entitlement.limitValue))?Math.max(0,Math.floor(Number(entitlement.limitValue)*1024*1024)):0;
 if(entitlement.limitValue!=null&&entitlement.limitUnit==='bytes')return Number.isFinite(Number(entitlement.limitValue))?Math.max(0,Math.floor(Number(entitlement.limitValue))):0;
 return storageQuotaBytes(entitlement.tier);
}

export function configuredPlanLabel(tier, name) {
  return typeof name === "string" && name.trim() ? name.trim() : productPlanLabel(tier);
}
