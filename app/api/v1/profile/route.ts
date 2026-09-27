import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { loadAttemptOptions, optionalUser } from "@/lib/auth/server";
import { saveProfilePatch } from "@/lib/profile/service";
import { normalizeDisplayName, validateAcademicSelection } from "@/lib/profile/validation";
import { validateAcademicContextSelection } from "@/lib/academic/student-context";
import { invalidateUserFeatureCache } from "@/lib/cache/public";
import { assertSameOriginMutation } from "@/lib/auth/csrf";
import { nativeCorsHeaders, nativeOptions } from "@/lib/auth/native-cors";
import { MOBILE_API_HEADERS } from "@/lib/mobile/contract";

export const dynamic = "force-dynamic";
const json = (request: NextRequest, body: unknown, status = 200) => NextResponse.json(body, {
  status, headers: { ...MOBILE_API_HEADERS, ...nativeCorsHeaders(request), "Cache-Control": "private, no-store" },
});
export const OPTIONS = (request: NextRequest) => nativeOptions(request);

export async function GET(request: NextRequest) {
  const user = await optionalUser();
  if (!user) return json(request, { error: { message: "Sign in to view your profile options." } }, 401);
  try { return json(request, { attempts: await loadAttemptOptions() }); }
  catch { return json(request, { error: { message: "Attempt options could not refresh." } }, 503); }
}

export async function POST(request: NextRequest) {
  if (!request.headers.get("authorization")?.startsWith("Bearer ")) {
    try { assertSameOriginMutation(request); } catch { return json(request, { error: { message: "Cross-site profile request rejected." } }, 403); }
  }
  const user = await optionalUser();
  if (!user) return json(request, { error: { message: "Sign in to update your profile." } }, 401);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return json(request, { error: { message: "Invalid profile request." } }, 400);
  const displayName = normalizeDisplayName(body.displayName);
  if (!displayName) return json(request, { error: { message: "Display name must be between 1 and 80 characters." } }, 400);
  const selection = validateAcademicSelection({ level: body.level, group: body.group, attemptKey: body.attemptKey, dailyTargetMinutes: body.dailyTargetMinutes }, await loadAttemptOptions());
  if (!selection.ok) return json(request, { error: { message: selection.error } }, 400);
  const canonical = await validateAcademicContextSelection(selection.value);
  if (!canonical.ok) return json(request, { error: { message: canonical.error } }, 400);
  try {
    await saveProfilePatch(user.id, {
      displayName, caLevel: selection.value.level, groupChoice: selection.value.group,
      attemptKey: selection.value.attemptKey, dailyTargetMinutes: selection.value.dailyTargetMinutes,
    });
    await invalidateUserFeatureCache(user.id);
    revalidatePath("/", "layout");
    return json(request, { ok: true, contextChanged: true });
  } catch { return json(request, { error: { message: "Could not save your profile." } }, 500); }
}
