import { NextResponse } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { markPhase8NotificationRead, updateNotificationPreferences } from "@/lib/planner/phase8";
import type { NotificationFrequency } from "@/lib/planner/types";

export const dynamic = "force-dynamic";
type Body =
  | { action: "read"; id: string }
  | { action: "read_all" }
  | { action: "preferences"; revisionDue?: boolean; testTomorrow?: boolean; goalNearCompletion?: boolean; doubtAnswered?: boolean; buddyActivity?: boolean; frequency?: NotificationFrequency; maxPerDay?: number };

export async function POST(request: Request) {
  const user = await optionalUser();
  if (!user) return NextResponse.json({ error: "Sign in to manage notifications." }, { status: 401 });
  let body: Body;
  try { body = await request.json() as Body; } catch { return NextResponse.json({ error: "Invalid notification request." }, { status: 400 }); }
  try {
    if (body.action === "read") return NextResponse.json(await markPhase8NotificationRead(user.id, body.id), { headers: { "Cache-Control": "private, no-store" } });
    if (body.action === "read_all") return NextResponse.json(await markPhase8NotificationRead(user.id, null), { headers: { "Cache-Control": "private, no-store" } });
    if (body.action === "preferences") return NextResponse.json(await updateNotificationPreferences(user.id, {
      ...(typeof body.revisionDue === "boolean" ? { revisionDue: body.revisionDue } : {}),
      ...(typeof body.testTomorrow === "boolean" ? { testTomorrow: body.testTomorrow } : {}),
      ...(typeof body.goalNearCompletion === "boolean" ? { goalNearCompletion: body.goalNearCompletion } : {}),
      ...(typeof body.doubtAnswered === "boolean" ? { doubtAnswered: body.doubtAnswered } : {}),
      ...(typeof body.buddyActivity === "boolean" ? { buddyActivity: body.buddyActivity } : {}),
      ...(body.frequency ? { frequency: body.frequency } : {}),
      ...(Number.isFinite(Number(body.maxPerDay)) ? { maxPerDay: Math.round(Number(body.maxPerDay)) } : {}),
    }), { headers: { "Cache-Control": "private, no-store" } });
    return NextResponse.json({ error: "Unknown notification action." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Notification settings could not be saved." }, { status: 400 });
  }
}
