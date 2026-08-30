import { adminError, adminJson } from "@/lib/admin/http";
import { getPlatformModel, requireAdminOperator, setFeatureFlag, setMaintenance } from "@/lib/admin/service";

export const dynamic = "force-dynamic";

export async function GET() {
  try { await requireAdminOperator("admin"); return adminJson(await getPlatformModel()); }
  catch (error) { return adminError(error); }
}

export async function PATCH(request: Request) {
  try {
    const operator = await requireAdminOperator("owner");
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) throw new Error("Invalid platform request.");
    if (body.action === "feature" && typeof body.flagKey === "string" && typeof body.enabled === "boolean") return adminJson(await setFeatureFlag(operator, body.flagKey, body.enabled));
    if (body.action === "maintenance" && typeof body.enabled === "boolean" && typeof body.message === "string") return adminJson(await setMaintenance(operator, { enabled: body.enabled, message: body.message, startsAt: typeof body.startsAt === "string" ? body.startsAt : null, endsAt: typeof body.endsAt === "string" ? body.endsAt : null }));
    throw new Error("Invalid platform action.");
  } catch (error) { return adminError(error); }
}
