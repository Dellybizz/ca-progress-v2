import { NextResponse } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { getServerAppRole } from "@/lib/authorization/server";
import { isPrivilegedRole } from "@/lib/authorization/roles";
import { listAntiCheatFlags, reviewAntiCheatFlag, scanAntiCheatForUser, settleMonthlyRewards } from "@/lib/gamification/phase13-service";

export const dynamic = "force-dynamic";
const privateHeaders = { "cache-control": "private, no-store" };
const idPattern = /^[0-9a-f-]{36}$/i;

async function privilegedIdentity() {
  const identity = await optionalUser();
  if (!identity) return { error: NextResponse.json({ error: "Authentication required." }, { status: 401, headers: privateHeaders }) };
  const role = await getServerAppRole();
  if (!isPrivilegedRole(role)) return { error: NextResponse.json({ error: "Moderator access required." }, { status: 403, headers: privateHeaders }) };
  return { identity };
}

export async function GET(request: Request) {
  const auth = await privilegedIdentity();
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
  const auth = await privilegedIdentity();
  if (auth.error || !auth.identity) return auth.error;
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400, headers: privateHeaders }); }
  try {
    if (body.action === "scan_user") {
      const userId = typeof body.userId === "string" ? body.userId.trim() : "";
      if (!idPattern.test(userId)) return NextResponse.json({ ok: false, error: "User ID is invalid." }, { status: 400, headers: privateHeaders });
      return NextResponse.json({ ok: true, scan: await scanAntiCheatForUser(userId) }, { headers: privateHeaders });
    }
    if (body.action === "review_flag") {
      const flagId = typeof body.flagId === "string" ? body.flagId.trim() : "";
      const decision = body.decision === "clear" || body.decision === "uphold" ? body.decision : null;
      if (!idPattern.test(flagId) || !decision) return NextResponse.json({ ok: false, error: "Review request is invalid." }, { status: 400, headers: privateHeaders });
      return NextResponse.json({ ok: true, review: await reviewAntiCheatFlag({ flagId, actorUserId: auth.identity.id, decision, notes: body.notes }) }, { headers: privateHeaders });
    }
    if (body.action === "settle_rewards") {
      const competitionPeriod = typeof body.competitionPeriod === "string" ? body.competitionPeriod.trim() : "";
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(competitionPeriod)) return NextResponse.json({ ok: false, error: "Competition period must be YYYY-MM." }, { status: 400, headers: privateHeaders });
      return NextResponse.json({ ok: true, settlement: await settleMonthlyRewards(competitionPeriod, auth.identity.id) }, { headers: privateHeaders });
    }
    return NextResponse.json({ ok: false, error: "Unknown admin gamification action." }, { status: 400, headers: privateHeaders });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Admin gamification action failed." }, { status: 400, headers: privateHeaders });
  }
}
