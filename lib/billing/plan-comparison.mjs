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
  Object.freeze({key:"forecast",label:"Baseline completion forecast",featureKey:"forecast_basic",detail:"An estimate from your own progress and verified attempt date"}),
  Object.freeze({key:"progress-export",label:"Progress PDF",featureKey:"progress_pdf",detail:"Download your chapter and revision progress"}),
  Object.freeze({ key: "storage", label: "Private storage", kind: "storage", detail: "Files stay private and existing data is retained after a downgrade" }),
  Object.freeze({ key: "analytics", label: "Advanced analytics", featureKey: "advanced_analytics", detail: "Weakness, revision, consistency and test-insight analysis" }),
  Object.freeze({ key: "planner", label: "Advanced planner & calendar", featureKey: "advanced_planner_calendar", detail: "Calendar planning beyond the Free Today/task loop" }),
  Object.freeze({ key: "reminders", label: "Custom reminders", featureKey: "customisation_reminders", detail: "Personal notification preferences" }),
  Object.freeze({ key: "exports", label: "CSV exports", featureKey: "study_csv", detail: "Study and test-history CSV exports" }),
  Object.freeze({ key: "buddy", label: "Expanded Study Buddy", featureKey: "expanded_study_buddy", detail: "Sharing, nudges, shared goals and Study Together" }),
  Object.freeze({ key: "goals", label: "Detailed goals & reports", featureKey: "detailed_goals_reports", detail: "Goal tracking beyond Free daily planning" }),
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

// No tier defaults: the public table must describe the administrator's active policy.
export function publishedComparisonValue(rule) {
  if (!rule?.enabled) return "—";
  if (rule.limit_value == null) return rule.feature_key === "resources.storage" ? "Unlimited" : "Included";
  const value = Number(rule.limit_value);
  if (!Number.isFinite(value)) return "—";
  if (rule.limit_unit === "megabytes") return value >= 1024 ? `${Number((value / 1024).toFixed(2))} GB` : `${value} MB`;
  const unit = rule.limit_unit === "minutes" ? " min" : rule.limit_unit === "count" ? "" : ` ${rule.limit_unit}`;
  const period = rule.reset_period && rule.reset_period !== "never" && rule.reset_period !== "lifetime" ? ` / ${rule.reset_period}` : "";
  return `${value}${unit}${period}`;
}
