import { adminError, adminJson } from "@/lib/admin/http";
import { getPlansAdminModel, requireAdminOperator, updateEntitlement, updatePlan } from "@/lib/admin/service";

export const dynamic = "force-dynamic";

export async function GET() {
  try { await requireAdminOperator("admin"); return adminJson(await getPlansAdminModel()); }
  catch (error) { return adminError(error); }
}

export async function PATCH(request: Request) {
  try {
    const operator = await requireAdminOperator("owner");
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) throw new Error("Invalid plan request.");
    if (body.action === "plan" && typeof body.planId === "string" && typeof body.checkoutEnabled === "boolean" && typeof body.active === "boolean") {
      const price = body.priceSubunits === null ? null : Number(body.priceSubunits);
      if (price !== null && (!Number.isInteger(price) || price < 0)) throw new Error("Invalid plan price.");
      return adminJson(await updatePlan(operator, { planId: body.planId, priceSubunits: price, checkoutEnabled: body.checkoutEnabled, active: body.active }));
    }
    if (body.action === "entitlement" && typeof body.planId === "string" && typeof body.featureKey === "string" && typeof body.enabled === "boolean" && typeof body.limitUnit === "string") {
      const limit = body.limitValue === null ? null : Number(body.limitValue);
      if (limit !== null && (!Number.isFinite(limit) || limit < 0)) throw new Error("Invalid entitlement limit.");
      return adminJson(await updateEntitlement(operator, { planId: body.planId, featureKey: body.featureKey, enabled: body.enabled, limitValue: limit, limitUnit: body.limitUnit, upgradeMessage: typeof body.upgradeMessage === "string" ? body.upgradeMessage : "" }));
    }
    throw new Error("Invalid plan action.");
  } catch (error) { return adminError(error); }
}
