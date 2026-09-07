import { NextResponse } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { getPlanFeatureAccessForUser } from "@/lib/billing/feature-access";
import { createHotCalendarEvent, deleteHotCalendarEvent, updateHotCalendarEvent } from "@/lib/data/d1/hot-screens";

export const dynamic = "force-dynamic";
const privateHeaders = { "Cache-Control": "private, no-store" };
type Body =
  | { action: "create"; title: string; notes?: string; startsAt: string; endsAt?: string | null; allDay?: boolean }
  | { action: "update"; id: string; title: string; notes?: string; startsAt: string; endsAt?: string | null; allDay?: boolean }
  | { action: "delete"; id: string };

export async function POST(request: Request) {
  const user = await optionalUser();
  if (!user) return NextResponse.json({ error: "Sign in to manage calendar events." }, { status: 401, headers: privateHeaders });
  const access = await getPlanFeatureAccessForUser(user.id, "advanced_planner_calendar");
  if (!access.allowed) return NextResponse.json({ error: access.upgradeMessage, code: "PLAN_UPGRADE_REQUIRED" }, { status: 403, headers: privateHeaders });
  let body: Body;
  try { body = await request.json() as Body; } catch { return NextResponse.json({ error: "Invalid calendar request." }, { status: 400, headers: privateHeaders }); }
  try {
    if (body.action === "delete") return NextResponse.json(await deleteHotCalendarEvent(user.id, body.id), { headers: privateHeaders });
    const event = { title: body.title?.trim() || "", notes: body.notes?.trim() || null, startsAt: body.startsAt, endsAt: body.endsAt || null, allDay: Boolean(body.allDay) };
    if (body.action === "create") return NextResponse.json(await createHotCalendarEvent(user.id, event), { status: 201, headers: privateHeaders });
    if (body.action === "update") return NextResponse.json(await updateHotCalendarEvent(user.id, body.id, event), { headers: privateHeaders });
    return NextResponse.json({ error: "Unknown calendar action." }, { status: 400, headers: privateHeaders });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Calendar event could not be saved." }, { status: 400, headers: privateHeaders });
  }
}
