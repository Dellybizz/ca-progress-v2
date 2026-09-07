import {
  PLAN_TIERS,
  canUsePlanFeature,
  monthlyPriceInr,
  productPlanLabel,
  storageQuotaMegabytes,
} from "./plan-policy.mjs";

export const PLAN_COMPARISON_COLUMNS = Object.freeze(
  PLAN_TIERS.map((tier) => Object.freeze({
    tier,
    label: productPlanLabel(tier),
    monthlyPriceInr: monthlyPriceInr(tier),
    storageQuotaMegabytes: storageQuotaMegabytes(tier),
  })),
);

export const PLAN_COMPARISON_ROWS = Object.freeze([
  Object.freeze({ key: "core", label: "Core study loop", featureKey: "study_timer", detail: "Today, Study, Reflection, Progress, Notes, Tests and core Analytics" }),
  Object.freeze({ key: "storage", label: "Private storage", kind: "storage", detail: "Files stay private and existing data is retained after a downgrade" }),
  Object.freeze({ key: "analytics", label: "Advanced analytics", featureKey: "advanced_analytics", detail: "Weakness, revision, consistency and test-insight analysis" }),
  Object.freeze({ key: "planner", label: "Advanced planner & calendar", featureKey: "advanced_planner_calendar", detail: "Calendar planning beyond the Free Today/task loop" }),
  Object.freeze({ key: "reminders", label: "Custom reminders", featureKey: "customisation_reminders", detail: "Personal notification preferences" }),
  Object.freeze({ key: "exports", label: "CSV exports", featureKey: "study_csv", detail: "Study and test-history CSV exports" }),
  Object.freeze({ key: "buddy", label: "Expanded Study Buddy", featureKey: "expanded_study_buddy", detail: "Sharing, nudges, shared goals and Study Together" }),
  Object.freeze({ key: "goals", label: "Detailed goals & reports", featureKey: "detailed_goals_reports", detail: "Goal tracking beyond Free daily planning" }),
  Object.freeze({ key: "premium-insights", label: "Premium insight layer", featureKey: "advanced_preparation", kind: "planned", detail: "Advanced preparation, forecasts, history and recovery planning are staged separately" }),
  Object.freeze({ key: "backup", label: "Full backup", featureKey: "full_backup", detail: "Streamed requester-owned D1 + private R2 backup" }),
]);

export function planComparisonValue(row, tier) {
  if (row?.kind === "storage") {
    const megabytes = storageQuotaMegabytes(tier);
    if (megabytes >= 1024) return `${Number((megabytes / 1024).toFixed(1))} GB`;
    return `${megabytes} MB`;
  }
  if (row?.kind === "planned") {
    return row?.featureKey && canUsePlanFeature(tier, row.featureKey) ? "Planned" : "—";
  }
  return row?.featureKey && canUsePlanFeature(tier, row.featureKey) ? "Included" : "—";
}
