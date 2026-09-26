import { NextResponse, type NextRequest } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { nativeCorsHeaders, nativeOptions } from "@/lib/auth/native-cors";
import { MOBILE_API_HEADERS } from "@/lib/mobile/contract";
import { getGamificationSummary } from "@/lib/gamification/service";
import { getLeaderboard, getPhase13UserModel } from "@/lib/gamification/phase13-service";

export const dynamic = "force-dynamic";
const json = (request: NextRequest, body: unknown, status = 200) => NextResponse.json(body, {
  status, headers: { ...MOBILE_API_HEADERS, ...nativeCorsHeaders(request), "Cache-Control": "private, no-store" },
});
export const OPTIONS = (request: NextRequest) => nativeOptions(request);

export async function GET(request: NextRequest) {
  const user = await optionalUser();
  if (!user) return json(request, { error: { message: "Sign in to view Activity." } }, 401);
  const category = request.nextUrl.searchParams.get("category") || "overall";
  if (!["overall", "foundation", "intermediate", "final"].includes(category)) return json(request, { error: { message: "Invalid leaderboard category." } }, 400);
  try {
    const [summary, model, leaderboard] = await Promise.all([
      getGamificationSummary(user.id), getPhase13UserModel(user.id), getLeaderboard(category),
    ]);
    return json(request, { snapshot: { summary, model, leaderboard } });
  } catch { return json(request, { error: { message: "Activity could not be refreshed. Saved data remains available." } }, 503); }
}
