import { adminError, adminJson } from "@/lib/admin/http";
import { getContentAdminModel, requireAdminOperator, updateContentState } from "@/lib/admin/service";

export const dynamic = "force-dynamic";

export async function GET() {
  try { await requireAdminOperator("admin"); return adminJson(await getContentAdminModel()); }
  catch (error) { return adminError(error); }
}

export async function PATCH(request: Request) {
  try {
    const operator = await requireAdminOperator("admin");
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || !["syllabus_version","exam_attempt","icai_resource"].includes(String(body.entityType)) || typeof body.entityId !== "string" || typeof body.status !== "string") throw new Error("Invalid content state request.");
    return adminJson(await updateContentState(operator, { entityType: body.entityType as "syllabus_version" | "exam_attempt" | "icai_resource", entityId: body.entityId, status: body.status, verificationStatus: typeof body.verificationStatus === "string" ? body.verificationStatus : undefined }));
  } catch (error) { return adminError(error); }
}
