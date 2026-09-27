import { NextResponse, type NextRequest } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { grantStudyProfileBuddy, revokeStudyProfileBuddy, StudyProfileInputError } from "@/lib/profile/study-profile";
import { nativeCorsHeaders, nativeOptions } from "@/lib/auth/native-cors";
import { MOBILE_API_HEADERS } from "@/lib/mobile/contract";
import { assertSameOriginMutation } from "@/lib/auth/csrf";

export const dynamic = "force-dynamic";
const json = (request: NextRequest, body: unknown, status = 200) => NextResponse.json(body, {
  status, headers: { ...MOBILE_API_HEADERS, ...nativeCorsHeaders(request), "Cache-Control": "private, no-store" },
});
export const OPTIONS = (request: NextRequest) => nativeOptions(request);
async function change(request: NextRequest, action: "grant" | "revoke") {
  if (!request.headers.get("authorization")?.startsWith("Bearer ")) {
    try { assertSameOriginMutation(request); } catch { return json(request, { error: { message: "Cross-site buddy request rejected." } }, 403); }
  }
  const user = await optionalUser();
  if (!user) return json(request, { error: { message: "Sign in to manage Study Profile buddies." } }, 401);
  const body = await request.json().catch(() => null) as { buddyUserId?: unknown } | null;
  try {
    const settings = action === "grant" ? await grantStudyProfileBuddy(user.id, body?.buddyUserId) : await revokeStudyProfileBuddy(user.id, body?.buddyUserId);
    return json(request, { settings });
  } catch (error) { return json(request, { error: { message: error instanceof StudyProfileInputError ? error.message : "Could not update buddy access." } }, error instanceof StudyProfileInputError ? 400 : 503); }
}
export const POST = (request: NextRequest) => change(request, "grant");
export const DELETE = (request: NextRequest) => change(request, "revoke");
