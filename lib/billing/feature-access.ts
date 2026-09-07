import "server-only";

import { getEntitlementForUser } from "./service";
import { canUsePlanFeature, planFeatureRequirement, productPlanLabel } from "./plan-policy.mjs";

export type PlanFeatureAccess = {
  planId: string;
  tier: "free" | "basic" | "pro";
  planName: string;
  featureKey: string;
  allowed: boolean;
  upgradeMessage: string;
};

export async function getPlanFeatureAccessForUser(userId: string, featureKey: string): Promise<PlanFeatureAccess> {
  if (!userId) throw new Error("Authenticated user id is required for plan access checks.");
  const entitlement = await getEntitlementForUser(userId, featureKey);
  const requirement = planFeatureRequirement(featureKey);
  const allowed = Boolean(entitlement.planId) && canUsePlanFeature(entitlement.tier, featureKey);
  return {
    planId: entitlement.planId,
    tier: entitlement.tier,
    planName: productPlanLabel(entitlement.tier),
    featureKey,
    allowed,
    upgradeMessage: allowed
      ? ""
      : requirement
        ? `Upgrade to ${requirement.productPlan} to use this feature.`
        : "This feature is not available on your current plan.",
  };
}
