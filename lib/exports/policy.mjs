export const EXPORT_KINDS = Object.freeze([
  "progress_pdf",
  "study_csv",
  "test_history_csv",
  "full_backup",
]);

export const EXPORT_PRODUCT_PLANS = Object.freeze({
  free: "Free",
  basic: "Pro",
  pro: "Premium",
});

const TIER_RANK = Object.freeze({ free: 0, basic: 1, pro: 2 });
const REQUIRED_TIER = Object.freeze({
  progress_pdf: "free",
  study_csv: "basic",
  test_history_csv: "basic",
  full_backup: "pro",
});

export function normalizeExportTier(value) {
  return value === "basic" || value === "pro" ? value : "free";
}

export function exportProductPlanLabel(value) {
  return EXPORT_PRODUCT_PLANS[normalizeExportTier(value)];
}

export function canUseExport(tier, kind) {
  if (!EXPORT_KINDS.includes(kind)) return false;
  const normalizedTier = normalizeExportTier(tier);
  return TIER_RANK[normalizedTier] >= TIER_RANK[REQUIRED_TIER[kind]];
}

export function exportRequirement(kind) {
  if (!EXPORT_KINDS.includes(kind)) return null;
  const tier = REQUIRED_TIER[kind];
  return Object.freeze({ tier, productPlan: EXPORT_PRODUCT_PLANS[tier] });
}
