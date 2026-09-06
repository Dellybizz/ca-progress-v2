import { NextResponse } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { getPhase13UserModel, registerReferral, setLeaderboardPreference } from "@/lib/gamification/phase13-service";

export const dynamic = "force-dynamic";
const privateHeaders = { "cache-control": "private, no-store" };

export async function GET() {
  const user = await optionalUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401, headers: privateHeaders });
  try {
    return NextResponse.json({ ok: true, model: await getPhase13UserModel(user.id) }, { headers: privateHeaders });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Phase 13 data could not be loaded." }, { status: 500, headers: privateHeaders });
  }
}

export async function POST(request: Request) {
  const user = await optionalUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401, headers: privateHeaders });
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400, headers: privateHeaders }); }
  try {
    if (body.action === "leaderboard_preference") {
      const optedIn = body.optedIn === true;
      const preference = await setLeaderboardPreference(user.id, { optedIn, publicAlias: body.publicAlias });
      return NextResponse.json({ ok: true, preference, model: await getPhase13UserModel(user.id) }, { headers: privateHeaders });
    }
    if (body.action === "claim_referral") {
      const result = await registerReferral(user.id, body.code);
      return NextResponse.json({ ok: true, referral: result, model: await getPhase13UserModel(user.id) }, { headers: privateHeaders });
    }
    if (body.action === "refresh") return NextResponse.json({ ok: true, model: await getPhase13UserModel(user.id) }, { headers: privateHeaders });
    return NextResponse.json({ ok: false, error: "Unknown Phase 13 action." }, { status: 400, headers: privateHeaders });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Phase 13 action failed." }, { status: 400, headers: privateHeaders });
  }
}
