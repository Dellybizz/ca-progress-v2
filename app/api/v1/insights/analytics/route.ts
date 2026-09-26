import { NextResponse, type NextRequest } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { getPhase9AnalyticsModel } from "@/lib/analytics/phase9";
import { MOBILE_API_HEADERS } from "@/lib/mobile/contract";
import { nativeCorsHeaders, nativeOptions } from "@/lib/auth/native-cors";

export const dynamic = "force-dynamic";
const json = (request: NextRequest, body: unknown, status = 200) => NextResponse.json(body, { status, headers: { ...MOBILE_API_HEADERS, ...nativeCorsHeaders(request), "Cache-Control": "private, no-store" } });
export const OPTIONS = (request: NextRequest) => nativeOptions(request);
export async function GET(request: NextRequest) {
  if (!await optionalUser()) return json(request, { error: { message: "Sign in to view Analytics." } }, 401);
  try {
    const model = await getPhase9AnalyticsModel();
    if (model.mode !== "ready") return json(request, { error: { message: "Complete your academic profile to view Analytics." } }, 409);
    return json(request, { model });
  } catch { return json(request, { error: { message: "Analytics could not be refreshed. Saved evidence remains available." } }, 503); }
}
