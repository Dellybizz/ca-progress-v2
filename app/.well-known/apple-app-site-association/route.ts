import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export async function GET() {
  const teamId = process.env.APPLE_TEAM_ID?.trim();
  if (!teamId || !/^[A-Z0-9]{10}$/.test(teamId)) return NextResponse.json({ error: "Apple app association is not configured." }, { status: 503 });
  return NextResponse.json({ applinks: { apps: [], details: [{ appID: `${teamId}.in.zanisheluxe.caprogress`, paths: ["/auth/callback*", "/dashboard*", "/planner/*", "/progress*", "/study*", "/notes/*", "/resources/*", "/community/*", "/settings/*", "/billing*", "/pricing*"] }] } }, { headers: { "Cache-Control": "public, max-age=3600", "Content-Type": "application/json" } });
}
