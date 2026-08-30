import { adminError, adminJson } from "@/lib/admin/http";
import { getNotificationTemplates, requireAdminOperator, saveNotificationTemplate } from "@/lib/admin/service";

export const dynamic = "force-dynamic";

export async function GET() {
  try { await requireAdminOperator("admin"); return adminJson({ templates: await getNotificationTemplates() }); }
  catch (error) { return adminError(error); }
}

export async function POST(request: Request) {
  try {
    const operator = await requireAdminOperator("admin");
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body.templateKey !== "string" || typeof body.name !== "string" || typeof body.title !== "string" || typeof body.body !== "string") throw new Error("Invalid notification template.");
    return adminJson(await saveNotificationTemplate(operator, { id: typeof body.id === "string" ? body.id : null, templateKey: body.templateKey, name: body.name, title: body.title, body: body.body, active: body.active !== false }), 201);
  } catch (error) { return adminError(error); }
}
