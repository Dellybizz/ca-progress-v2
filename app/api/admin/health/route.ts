import { adminError, adminJson } from "@/lib/admin/http";
import { getOperationsHealth, requireAdminOperator } from "@/lib/admin/service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const operator = await requireAdminOperator("admin");
    return adminJson(await getOperationsHealth(operator));
  } catch (error) { return adminError(error); }
}
