import { adminError, adminJson } from "@/lib/admin/http";
import { listMembers, requireAdminOperator, setMemberAdminActive, setMemberRole, type AdminRole } from "@/lib/admin/service";

export const dynamic = "force-dynamic";
const assignable = new Set<AdminRole>(["moderator","admin","owner"]);

export async function GET(request: Request) {
  try {
    const operator = await requireAdminOperator("admin");
    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get("page") || "1") || 1);
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || "25") || 25));
    return adminJson(await listMembers(operator, { page, limit, search: url.searchParams.get("q") || undefined, role: url.searchParams.get("role") || undefined }));
  } catch (error) { return adminError(error); }
}

export async function PATCH(request: Request) {
  try {
    const operator = await requireAdminOperator("owner");
    const body = await request.json().catch(() => null) as { action?: unknown; userId?: unknown; role?: unknown; active?: unknown } | null;
    if (!body || typeof body.userId !== "string") throw new Error("Invalid member request.");
    if (body.action === "role") {
      if (typeof body.role !== "string" || !assignable.has(body.role as AdminRole)) throw new Error("Invalid admin role.");
      return adminJson(await setMemberRole(operator, body.userId, body.role as AdminRole));
    }
    if (body.action === "active" && typeof body.active === "boolean") return adminJson(await setMemberAdminActive(operator, body.userId, body.active));
    throw new Error("Invalid member action.");
  } catch (error) { return adminError(error); }
}
