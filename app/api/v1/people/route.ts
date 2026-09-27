import { NextResponse, type NextRequest } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { nativeCorsHeaders, nativeOptions } from "@/lib/auth/native-cors";
import { MOBILE_API_HEADERS } from "@/lib/mobile/contract";
import { getStudyBuddyDashboard, requestStudyBuddy, respondStudyBuddy, removeStudyBuddy, sendStudyBuddyNudge, setStudyBuddySafety, reportStudyBuddy, updateStudyBuddySharing } from "@/lib/study-buddy/service";
import { assertSameOriginMutation } from "@/lib/auth/csrf";
import { getPlanFeatureAccessForUser } from "@/lib/billing/feature-access";

export const dynamic = "force-dynamic";
const json = (request: NextRequest, body: unknown, status = 200) => NextResponse.json(body, {
  status, headers: { ...MOBILE_API_HEADERS, ...nativeCorsHeaders(request), "Cache-Control": "private, no-store" },
});
export const OPTIONS = (request: NextRequest) => nativeOptions(request);

export async function GET(request: NextRequest) {
  const user = await optionalUser();
  if (!user) return json(request, { error: { message: "Sign in to view Study Buddy." } }, 401);
  try { return json(request, { dashboard: await getStudyBuddyDashboard(user.id) }); }
  catch { return json(request, { error: { message: "Study Buddy could not be loaded." } }, 503); }
}

export async function POST(request: NextRequest) {
  if (!request.headers.get("authorization")) {
    try { assertSameOriginMutation(request); }
    catch { return json(request, { error: { message: "Cross-site mutation rejected." } }, 403); }
  }
  const user = await optionalUser();
  if (!user) return json(request, { error: { message: "Sign in to manage Study Buddy." } }, 401);
  const body = await request.json().catch(() => null) as { action?: string; buddyUserId?: unknown; response?: unknown; mode?: unknown; reason?: unknown; details?: unknown; message?: unknown; [key: string]: unknown } | null;
  if (!body || typeof body.buddyUserId !== "string") return json(request, { error: { message: "Choose a Study Buddy." } }, 400);
  if (body.action === "sharing" || body.action === "nudge") {
    const access = await getPlanFeatureAccessForUser(user.id, "expanded_study_buddy");
    if (!access.allowed) return json(request, { error: { message: access.upgradeMessage } }, 403);
  }
  try {
    let result: unknown;
    if (body.action === "request") result = await requestStudyBuddy(user.id, body.buddyUserId);
    else if (body.action === "respond") result = await respondStudyBuddy(user.id, body.buddyUserId, body.response);
    else if (body.action === "remove") result = await removeStudyBuddy(user.id, body.buddyUserId);
    else if (body.action === "nudge") result = await sendStudyBuddyNudge(user.id, body.buddyUserId, body.message);
    else if (body.action === "safety") result = await setStudyBuddySafety(user.id, body.buddyUserId, body.mode);
    else if (body.action === "report") result = await reportStudyBuddy(user.id, body.buddyUserId, body.reason, body.details);
    else if (body.action === "sharing") result = await updateStudyBuddySharing(user.id, body.buddyUserId, body);
    else return json(request, { error: { message: "Unsupported Study Buddy action." } }, 400);
    return json(request, { ok: true, result, dashboard: await getStudyBuddyDashboard(user.id) });
  } catch (error) { return json(request, { error: { message: error instanceof Error ? error.message : "Study Buddy could not be updated." } }, 409); }
}
