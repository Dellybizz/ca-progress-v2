export type PlanTier = "free" | "basic" | "pro";
export type ProductPlanLabel = "Free" | "Pro" | "Premium";
export type PlanFeatureKey = keyof typeof PLAN_FEATURE_REQUIRED_TIER;

export const PLAN_TIERS: readonly PlanTier[];
export const PRODUCT_PLAN_LABELS: Readonly<Record<PlanTier, ProductPlanLabel>>;
export const PLAN_POLICY: Readonly<Record<PlanTier, Readonly<{
  tier: PlanTier;
  productPlan: ProductPlanLabel;
  rank: number;
  monthlyPriceInr: number;
  storageQuotaMegabytes: number;
  storageQuotaBytes: number;
}>>>;
export const PLAN_FEATURE_REQUIRED_TIER: Readonly<Record<string, PlanTier>>;

export function normalizePlanTier(value: unknown): PlanTier;
export function productPlanLabel(value: unknown): ProductPlanLabel;
export function tierRank(value: unknown): number;
export function meetsMinimumTier(value: unknown, requiredTier: unknown): boolean;
export function monthlyPriceInr(value: unknown): number;
export function storageQuotaMegabytes(value: unknown): number;
export function storageQuotaBytes(value: unknown): number;
export function canUsePlanFeature(value: unknown, featureKey: string): boolean;
export function planFeatureRequirement(featureKey: string): Readonly<{ tier: PlanTier; productPlan: ProductPlanLabel }> | null;
