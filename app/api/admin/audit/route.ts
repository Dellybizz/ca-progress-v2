import { adminError, adminJson } from "@/lib/admin/http";
import { getAuditLog, requireAdminOperator } from "@/lib/admin/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireAdminOperator("admin");
    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get("page") || "1") || 1);
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || "50") || 50));
    return adminJson({ rows: await getAuditLog({ page, limit, action: url.searchParams.get("action") || undefined, actor: url.searchParams.get("actor") || undefined }), page, limit });
  } catch (error) { return adminError(error); }
}
