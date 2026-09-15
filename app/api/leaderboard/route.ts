import { NextResponse } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { getLeaderboard } from "@/lib/gamification/phase13-service";

export const dynamic = "force-dynamic";
const privateHeaders = { "cache-control": "private, no-store" };

export async function GET(request: Request) {
  const user = await optionalUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401, headers: privateHeaders });
  const url = new URL(request.url);
  const category = url.searchParams.get("category") ?? "overall";
  try {
    const leaderboard = await getLeaderboard(category);
    return NextResponse.json({ ok: true, leaderboard }, { headers: privateHeaders });
  } catch {
    return NextResponse.json({ ok: false, error: "Leaderboard could not be loaded." }, { status: 500, headers: privateHeaders });
  }
}
