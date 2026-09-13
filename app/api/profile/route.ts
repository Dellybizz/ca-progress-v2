import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { loadAttemptOptions, optionalUser } from "@/lib/auth/server";
import { saveProfilePatch } from "@/lib/profile/service";
import { normalizeDisplayName, validateAcademicSelection } from "@/lib/profile/validation";
import { validateAcademicContextSelection } from "@/lib/academic/student-context";
import { invalidateUserFeatureCache } from "@/lib/cache/public";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const user = await optionalUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in to update your profile." }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ ok: false, error: "Invalid profile request." }, { status: 400 });
  const displayName = normalizeDisplayName(body.displayName);
  if (!displayName) return NextResponse.json({ ok: false, error: "Display name must be between 1 and 80 characters." }, { status: 400 });
  const attempts = await loadAttemptOptions();
  const selection = validateAcademicSelection({ level: body.level, group: body.group, attemptKey: body.attemptKey, dailyTargetMinutes: body.dailyTargetMinutes }, attempts);
  if (!selection.ok) return NextResponse.json({ ok: false, error: selection.error }, { status: 400 });
  const canonical = await validateAcademicContextSelection(selection.value);
  if (!canonical.ok) return NextResponse.json({ ok: false, error: canonical.error }, { status: 400 });
  try {
    await saveProfilePatch(user.id, {
      displayName,
      caLevel: selection.value.level,
      groupChoice: selection.value.group,
      attemptKey: selection.value.attemptKey,
      dailyTargetMinutes: selection.value.dailyTargetMinutes,
    });
    await invalidateUserFeatureCache(user.id);
    revalidatePath("/", "layout");
  } catch {
    return NextResponse.json({ ok: false, error: "Could not save your profile." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, contextChanged: true });
}
