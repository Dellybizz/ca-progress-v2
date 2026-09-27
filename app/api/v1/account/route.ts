import { NextResponse, type NextRequest } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { getBillingModel, getPricingModel } from "@/lib/billing/service";
import { getRecurringBillingState } from "@/lib/billing/recurring-service";
import { getFeatureTourProgress, saveFeatureTourProgress } from "@/lib/mobile/feature-tour";
import { getHotD1Database } from "@/lib/data/d1/runtime";
import { nativeCorsHeaders, nativeOptions } from "@/lib/auth/native-cors";
import { MOBILE_API_HEADERS } from "@/lib/mobile/contract";
import { assertSameOriginMutation } from "@/lib/auth/csrf";

export const dynamic = "force-dynamic";
const json = (request: NextRequest, body: unknown, status = 200) => NextResponse.json(body, {
  status, headers: { ...MOBILE_API_HEADERS, ...nativeCorsHeaders(request), "Cache-Control": "private, no-store" },
});
export const OPTIONS = (request: NextRequest) => nativeOptions(request);

export async function GET(request: NextRequest) {
  const user = await optionalUser();
  if (!user) return json(request, { error: { message: "Sign in to view account settings." } }, 401);
  try {
    const [billing, pricing, recurring, tour, deletion] = await Promise.all([
      getBillingModel(), getPricingModel(), getRecurringBillingState(), getFeatureTourProgress(user.id),
      getHotD1Database().prepare("SELECT status,requested_at,scheduled_for,cancelled_at,completed_at,retention_note FROM account_deletion_requests WHERE user_id=?1 ORDER BY requested_at DESC LIMIT 1").bind(user.id).first(),
    ]);
    return json(request, { snapshot: { billing, pricing, recurring, tour, deletion: deletion ?? null, fetchedAt: new Date().toISOString() } });
  } catch { return json(request, { error: { message: "Account details could not refresh. Saved information remains available." } }, 503); }
}

export async function POST(request: NextRequest) {
  if (!request.headers.get("authorization")?.startsWith("Bearer ")) {
    try { assertSameOriginMutation(request); } catch { return json(request, { error: { message: "Cross-site account request rejected." } }, 403); }
  }
  const user = await optionalUser();
  if (!user) return json(request, { error: { message: "Sign in to manage your account." } }, 401);
  const body = await request.json().catch(() => null) as { action?: unknown; confirmation?: unknown; step?: unknown; completed?: unknown } | null;
  if (body?.action === "tour") {
    if (!Number.isInteger(body.step) || Number(body.step) < 0 || Number(body.step) > 14 || typeof body.completed !== "boolean")
      return json(request, { error: { message: "Invalid tour progress." } }, 400);
    try { return json(request, { tour: await saveFeatureTourProgress(user.id, Number(body.step), body.completed) }); }
    catch { return json(request, { error: { message: "Tour progress could not synchronize." } }, 503); }
  }
  if (body?.action === "delete") {
    if (body.confirmation !== "DELETE MY ACCOUNT") return json(request, { error: { message: "Type DELETE MY ACCOUNT to confirm." } }, 400);
    const db = getHotD1Database();
    try {
      const existing = await db.prepare("SELECT scheduled_for FROM account_deletion_requests WHERE user_id=?1 AND status IN ('scheduled','processing') LIMIT 1").bind(user.id).first();
      if (existing) return json(request, { ok: true, scheduledFor: existing.scheduled_for });
      const scheduledFor = new Date(Date.now() + 7 * 86400000).toISOString();
      await db.prepare("INSERT INTO account_deletion_requests(id,user_id,status,scheduled_for) VALUES(?1,?2,'scheduled',?3)").bind(crypto.randomUUID(), user.id, scheduledFor).run();
      return json(request, { ok: true, scheduledFor });
    } catch { return json(request, { error: { message: "Deletion could not be scheduled. Try again online." } }, 503); }
  }
  if (body?.action === "cancelDeletion") {
    try {
      await getHotD1Database().prepare("UPDATE account_deletion_requests SET status='cancelled',cancelled_at=CURRENT_TIMESTAMP WHERE user_id=?1 AND status='scheduled'").bind(user.id).run();
      return json(request, { ok: true });
    } catch { return json(request, { error: { message: "Cancellation could not be confirmed. Try again online." } }, 503); }
  }
  return json(request, { error: { message: "Unsupported account action." } }, 400);
}
