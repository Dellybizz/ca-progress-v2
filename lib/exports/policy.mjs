import {
  PRODUCT_PLAN_LABELS,
  canUsePlanFeature,
  normalizePlanTier,
  planFeatureRequirement,
  productPlanLabel,
} from "../billing/plan-policy.mjs";

export const EXPORT_KINDS = Object.freeze([
  "progress_pdf",
  "study_csv",
  "test_history_csv",
  "full_backup",
]);

export const EXPORT_PRODUCT_PLANS = PRODUCT_PLAN_LABELS;

export function normalizeExportTier(value) {
  return normalizePlanTier(value);
}

export function exportProductPlanLabel(value) {
  return productPlanLabel(value);
}

export function canUseExport(tier, kind) {
  return EXPORT_KINDS.includes(kind) && canUsePlanFeature(tier, kind);
}

export function exportRequirement(kind) {
  return EXPORT_KINDS.includes(kind) ? planFeatureRequirement(kind) : null;
}
