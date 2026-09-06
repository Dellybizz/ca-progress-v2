import { NextResponse } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { performStudyTimerAction } from "@/lib/study/phase3";
import { attachActiveTimerToLatestTodayItem } from "@/lib/study/today-link";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const identity = await optionalUser();
  if (!identity) return NextResponse.json({ error: "Sign in to use the study timer." }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid timer request." }, { status: 400 });
  }

  try {
    if (body.action === "finish") await attachActiveTimerToLatestTodayItem(identity.id);
    const result = await performStudyTimerAction(identity.id, body);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Study timer could not be updated.";
    const status = /already active|No active|stale|12-hour/i.test(message) ? 409 : /unavailable|not applicable|belongs to another/i.test(message) ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
