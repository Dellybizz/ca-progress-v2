import { NextResponse } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { getPlanFeatureAccessForUser } from "@/lib/billing/feature-access";
import { markPhase8NotificationRead, updateNotificationPreferences } from "@/lib/planner/phase8";
import type { NotificationFrequency } from "@/lib/planner/types";

export const dynamic = "force-dynamic";
const privateHeaders = { "Cache-Control": "private, no-store" };
type Body =
  | { action: "read"; id: string }
  | { action: "read_all" }
  | { action: "preferences"; revisionDue?: boolean; testTomorrow?: boolean; goalNearCompletion?: boolean; doubtAnswered?: boolean; buddyActivity?: boolean; frequency?: NotificationFrequency; maxPerDay?: number };

export async function POST(request: Request) {
  const user = await optionalUser();
  if (!user) return NextResponse.json({ error: "Sign in to manage notifications." }, { status: 401, headers: privateHeaders });
  let body: Body;
  try { body = await request.json() as Body; } catch { return NextResponse.json({ error: "Invalid notification request." }, { status: 400, headers: privateHeaders }); }
  try {
    if (body.action === "read") return NextResponse.json(await markPhase8NotificationRead(user.id, body.id), { headers: privateHeaders });
    if (body.action === "read_all") return NextResponse.json(await markPhase8NotificationRead(user.id, null), { headers: privateHeaders });
    if (body.action === "preferences") {
      const access = await getPlanFeatureAccessForUser(user.id, "customisation_reminders");
      if (!access.allowed) return NextResponse.json({ error: access.upgradeMessage, code: "PLAN_UPGRADE_REQUIRED" }, { status: 403, headers: privateHeaders });
      return NextResponse.json(await updateNotificationPreferences(user.id, {
        ...(typeof body.revisionDue === "boolean" ? { revisionDue: body.revisionDue } : {}),
        ...(typeof body.testTomorrow === "boolean" ? { testTomorrow: body.testTomorrow } : {}),
        ...(typeof body.goalNearCompletion === "boolean" ? { goalNearCompletion: body.goalNearCompletion } : {}),
        ...(typeof body.doubtAnswered === "boolean" ? { doubtAnswered: body.doubtAnswered } : {}),
        ...(typeof body.buddyActivity === "boolean" ? { buddyActivity: body.buddyActivity } : {}),
        ...(body.frequency ? { frequency: body.frequency } : {}),
        ...(Number.isFinite(Number(body.maxPerDay)) ? { maxPerDay: Math.round(Number(body.maxPerDay)) } : {}),
      }), { headers: privateHeaders });
    }
    return NextResponse.json({ error: "Unknown notification action." }, { status: 400, headers: privateHeaders });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Notification settings could not be saved." }, { status: 400, headers: privateHeaders });
  }
}
