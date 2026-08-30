import { NextResponse } from "next/server";
import { performTodayPlanAction } from "@/lib/smart-planner/service";
import type { TodayPlanAction } from "@/lib/smart-planner/types";

export const dynamic = "force-dynamic";

function validAction(value: unknown): value is TodayPlanAction {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  if (body.action === "refresh") return true;
  if (typeof body.itemId !== "string" || !body.itemId) return false;
  if (body.action === "complete" || body.action === "skip") return true;
  if (body.action === "snooze") return typeof body.minutes === "number" && Number.isFinite(body.minutes);
  if (body.action === "reschedule") return typeof body.date === "string";
  return false;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!validAction(body)) return NextResponse.json({ error: "Invalid Today Plan action." }, { status: 400 });
  try {
    const result = await performTodayPlanAction(body);
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Today Plan could not be updated.";
    const status = /sign in/i.test(message) ? 401 : /not found/i.test(message) ? 404 : /valid|choose|within one year/i.test(message) ? 400 : 409;
    return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "private, no-store" } });
  }
}
