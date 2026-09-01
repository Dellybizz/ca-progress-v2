import { NextResponse } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { getEntitlementForUser } from "@/lib/billing/service";
import { performTodayPlanInteraction } from "@/lib/smart-planner/today-interactions";
import type { TodayPlanAction } from "@/lib/smart-planner/types";

export const dynamic = "force-dynamic";

function validAction(value: unknown): value is TodayPlanAction {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  if (body.action === "refresh" || body.action === "undo") return true;
  if (body.action === "reorder") return Array.isArray(body.itemIds) && body.itemIds.length > 0 && body.itemIds.every((id) => typeof id === "string" && id);
  if (typeof body.itemId !== "string" || !body.itemId) return false;
  if (body.action === "start" || body.action === "complete" || body.action === "skip") return true;
  if (body.action === "snooze") return typeof body.minutes === "number" && Number.isFinite(body.minutes);
  if (body.action === "reschedule") return typeof body.date === "string";
  return false;
}

export async function POST(request: Request) {
  const identity = await optionalUser();
  if (!identity) return NextResponse.json({ error: "Sign in to update Today Plan." }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  const entitlement = await getEntitlementForUser(identity.id, "planner.smart");
  if (!entitlement.allowed) return NextResponse.json({ error: entitlement.upgradeMessage, code: "ENTITLEMENT_REQUIRED", feature: "planner.smart" }, { status: 403, headers: { "Cache-Control": "private, no-store" } });
  const body = await request.json().catch(() => null);
  if (!validAction(body)) return NextResponse.json({ error: "Invalid Today Plan action." }, { status: 400 });
  try {
    const result = await performTodayPlanInteraction(body);
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Today Plan could not be updated.";
    const status = /sign in/i.test(message) ? 401 : /not found/i.test(message) ? 404 : /valid|choose|within one year|different plans|active plan/i.test(message) ? 400 : 409;
    return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "private, no-store" } });
  }
}
