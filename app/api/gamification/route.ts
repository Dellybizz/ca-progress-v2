import { NextResponse } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { getGamificationSummary } from "@/lib/gamification/service";

export const dynamic = "force-dynamic";
const privateHeaders = { "cache-control": "private, no-store" };

export async function GET() {
  const user = await optionalUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in to view XP and achievements." }, { status: 401, headers: privateHeaders });
  try {
    const summary = await getGamificationSummary(user.id);
    return NextResponse.json({ ok: true, summary }, { headers: privateHeaders });
  } catch {
    return NextResponse.json({ ok: false, error: "Gamification summary could not be loaded." }, { status: 500, headers: privateHeaders });
  }
}
