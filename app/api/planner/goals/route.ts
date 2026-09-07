import { NextResponse } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { getPlanFeatureAccessForUser } from "@/lib/billing/feature-access";
import { createPhase8Goal, deletePhase8Goal, togglePhase8Goal } from "@/lib/planner/phase8";
import type { GoalKind } from "@/lib/planner/types";

export const dynamic = "force-dynamic";
const privateHeaders = { "Cache-Control": "private, no-store" };
const KINDS: GoalKind[] = ["daily_study", "weekly_study", "completion", "revision", "test", "custom"];
type Body =
  | { action: "create"; title: string; description?: string; dueDate: string; goalKind?: GoalKind; targetValue?: number; startsOn?: string | null }
  | { action: "toggle"; id: string; done: boolean }
  | { action: "delete"; id: string };

export async function POST(request: Request) {
  const user = await optionalUser();
  if (!user) return NextResponse.json({ error: "Sign in to manage goals." }, { status: 401, headers: privateHeaders });
  const access = await getPlanFeatureAccessForUser(user.id, "detailed_goals_reports");
  if (!access.allowed) return NextResponse.json({ error: access.upgradeMessage, code: "PLAN_UPGRADE_REQUIRED" }, { status: 403, headers: privateHeaders });
  let body: Body;
  try { body = await request.json() as Body; } catch { return NextResponse.json({ error: "Invalid goal request." }, { status: 400, headers: privateHeaders }); }
  try {
    if (body.action === "create") {
      const goalKind = body.goalKind ?? "custom";
      if (!KINDS.includes(goalKind)) return NextResponse.json({ error: "Unsupported goal type." }, { status: 400, headers: privateHeaders });
      return NextResponse.json(await createPhase8Goal(user.id, {
        title: body.title?.trim() || "",
        description: body.description?.trim() || null,
        dueDate: body.dueDate,
        goalKind,
        targetValue: Math.round(Number(body.targetValue ?? 1)),
        startsOn: body.startsOn || null,
      }), { status: 201, headers: privateHeaders });
    }
    if (body.action === "toggle") return NextResponse.json(await togglePhase8Goal(user.id, body.id, body.done), { headers: privateHeaders });
    if (body.action === "delete") return NextResponse.json(await deletePhase8Goal(user.id, body.id), { headers: privateHeaders });
    return NextResponse.json({ error: "Unknown goal action." }, { status: 400, headers: privateHeaders });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Goal could not be saved." }, { status: 400, headers: privateHeaders });
  }
}
