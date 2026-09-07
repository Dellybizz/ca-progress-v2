import type { PlanTier, ProductPlanLabel } from "./plan-policy.mjs";

export type PlanComparisonColumn = Readonly<{
  tier: PlanTier;
  label: ProductPlanLabel;
  monthlyPriceInr: number;
  storageQuotaMegabytes: number;
}>;

export type PlanComparisonRow = Readonly<{
  key: string;
  label: string;
  featureKey?: string;
  kind?: "storage";
  detail: string;
}>;

export const PLAN_COMPARISON_COLUMNS: readonly PlanComparisonColumn[];
export const PLAN_COMPARISON_ROWS: readonly PlanComparisonRow[];
export function planComparisonValue(row: PlanComparisonRow, tier: PlanTier): string;
