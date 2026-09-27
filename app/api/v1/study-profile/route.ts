import { NextResponse, type NextRequest } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { getOwnerStudyProfileSettings, saveOwnerStudyProfileSettings, StudyProfileInputError } from "@/lib/profile/study-profile";
import { nativeCorsHeaders, nativeOptions } from "@/lib/auth/native-cors";
import { MOBILE_API_HEADERS } from "@/lib/mobile/contract";
import { assertSameOriginMutation } from "@/lib/auth/csrf";

export const dynamic = "force-dynamic";
const json = (request: NextRequest, body: unknown, status = 200) => NextResponse.json(body, {
  status, headers: { ...MOBILE_API_HEADERS, ...nativeCorsHeaders(request), "Cache-Control": "private, no-store" },
});
export const OPTIONS = (request: NextRequest) => nativeOptions(request);
export async function GET(request: NextRequest) {
  const user = await optionalUser();
  if (!user) return json(request, { error: { message: "Sign in to manage your Study Profile." } }, 401);
  try { return json(request, { settings: await getOwnerStudyProfileSettings(user.id) }); }
  catch { return json(request, { error: { message: "Privacy settings could not refresh." } }, 503); }
}
export async function PATCH(request: NextRequest) {
  if (!request.headers.get("authorization")?.startsWith("Bearer ")) {
    try { assertSameOriginMutation(request); } catch { return json(request, { error: { message: "Cross-site profile request rejected." } }, 403); }
  }
  const user = await optionalUser();
  if (!user) return json(request, { error: { message: "Sign in to manage your Study Profile." } }, 401);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return json(request, { error: { message: "Invalid Study Profile request." } }, 400);
  try { return json(request, { settings: await saveOwnerStudyProfileSettings(user.id, body) }); }
  catch (error) { return json(request, { error: { message: error instanceof StudyProfileInputError ? error.message : "Could not save Study Profile privacy." } }, error instanceof StudyProfileInputError ? 400 : 503); }
}
