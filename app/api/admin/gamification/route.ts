import { NextResponse } from "next/server";
import { adminTraceId, recordAdminAuditEvent } from "@/lib/admin/audit";
import { adminAuthorizationStatus, requireAdminCapability, type AdminActor } from "@/lib/authorization/server";
import type { AdminCapability } from "@/lib/authorization/capabilities.mjs";
import { listAntiCheatFlags, reviewAntiCheatFlag, scanAntiCheatForUser, settleMonthlyRewards } from "@/lib/gamification/phase13-service";

export const dynamic = "force-dynamic";
const privateHeaders = { "cache-control": "private, no-store" };
const idPattern = /^[0-9a-f-]{36}$/i;

async function authorized(capability: AdminCapability): Promise<{ actor: AdminActor | null; error: NextResponse | null }> {
  try { return { actor: await requireAdminCapability(capability), error: null }; }
  catch (error) {
    const status = adminAuthorizationStatus(error) ?? 403;
    return { actor: null, error: NextResponse.json({ error: status === 401 ? "Authentication required." : `Missing admin capability: ${capability}.` }, { status, headers: privateHeaders }) };
  }
}

function missingActor() {
  return NextResponse.json({ ok: false, error: "Admin authorization could not be resolved." }, { status: 500, headers: privateHeaders });
}

export async function GET(request: Request) {
  const auth = await authorized("gamification.read");
  if (auth.error) return auth.error;
  const rawStatus = new URL(request.url).searchParams.get("status") ?? undefined;
  const status = rawStatus === "pending" || rawStatus === "cleared" || rawStatus === "upheld" ? rawStatus : undefined;
  try {
    return NextResponse.json({ ok: true, flags: await listAntiCheatFlags(status) }, { headers: privateHeaders });
  } catch {
    return NextResponse.json({ ok: false, error: "Anti-cheat review queue could not be loaded." }, { status: 500, headers: privateHeaders });
  }
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400, headers: privateHeaders }); }
  try {
    if (body.action === "scan_user") {
      const auth = await authorized("gamification.review");
      if (auth.error) return auth.error;
      if (!auth.actor) return missingActor();
      const userId = typeof body.userId === "string" ? body.userId.trim() : "";
      if (!idPattern.test(userId)) return NextResponse.json({ ok: false, error: "User ID is invalid." }, { status: 400, headers: privateHeaders });
      const scan = await scanAntiCheatForUser(userId);
      await recordAdminAuditEvent({ actorUserId: auth.actor.user.id, actorRole: auth.actor.role, capability: "gamification.review", action: "gamification.scan_user", targetType: "user", targetId: userId, reason: typeof body.reason === "string" ? body.reason : null, newValue: { scanCompleted: true }, traceId: adminTraceId(request), reversible: false });
      return NextResponse.json({ ok: true, scan }, { headers: privateHeaders });
    }
    if (body.action === "review_flag") {
      const auth = await authorized("gamification.review");
      if (auth.error) return auth.error;
      if (!auth.actor) return missingActor();
      const flagId = typeof body.flagId === "string" ? body.flagId.trim() : "";
      const decision = body.decision === "clear" || body.decision === "uphold" ? body.decision : null;
      if (!idPattern.test(flagId) || !decision) return NextResponse.json({ ok: false, error: "Review request is invalid." }, { status: 400, headers: privateHeaders });
      const review = await reviewAntiCheatFlag({ flagId, actorUserId: auth.actor.user.id, decision, notes: body.notes });
      await recordAdminAuditEvent({ actorUserId: auth.actor.user.id, actorRole: auth.actor.role, capability: "gamification.review", action: `gamification.flag.${decision}`, targetType: "anti_cheat_flag", targetId: flagId, reason: typeof body.notes === "string" ? body.notes : null, newValue: { decision }, traceId: adminTraceId(request), reversible: true });
      return NextResponse.json({ ok: true, review }, { headers: privateHeaders });
    }
    if (body.action === "settle_rewards") {
      const auth = await authorized("rewards.settle");
      if (auth.error) return auth.error;
      if (!auth.actor) return missingActor();
      const competitionPeriod = typeof body.competitionPeriod === "string" ? body.competitionPeriod.trim() : "";
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(competitionPeriod)) return NextResponse.json({ ok: false, error: "Competition period must be YYYY-MM." }, { status: 400, headers: privateHeaders });
      const settlement = await settleMonthlyRewards(competitionPeriod, auth.actor.user.id);
      await recordAdminAuditEvent({ actorUserId: auth.actor.user.id, actorRole: auth.actor.role, capability: "rewards.settle", action: "gamification.rewards.settle", targetType: "leaderboard_competition_period", targetId: competitionPeriod, reason: typeof body.reason === "string" ? body.reason : "Monthly leaderboard reward settlement", newValue: { settlementCompleted: true }, traceId: adminTraceId(request), reversible: false });
      return NextResponse.json({ ok: true, settlement }, { headers: privateHeaders });
    }
    return NextResponse.json({ ok: false, error: "Unknown admin gamification action." }, { status: 400, headers: privateHeaders });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Admin gamification action failed." }, { status: 400, headers: privateHeaders });
  }
}
