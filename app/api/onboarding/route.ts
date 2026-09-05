import { NextResponse, type NextRequest } from "next/server";
import { optionalUser, loadAttemptOptions } from "@/lib/auth/server";
import { saveProfilePatch, type ProfilePatch } from "@/lib/profile/service";
import { isCALevel, isGroupChoice, normalizeDailyTarget, validateAcademicSelection } from "@/lib/profile/validation";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const user = await optionalUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in to save onboarding." }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || (body.action !== "draft" && body.action !== "complete")) return NextResponse.json({ ok: false, error: "Invalid onboarding request." }, { status: 400 });
  const attempts = await loadAttemptOptions();
  const update: ProfilePatch = {};

  if (body.action === "complete") {
    const selection = validateAcademicSelection({ level: body.level, group: body.group, attemptKey: body.attemptKey, dailyTargetMinutes: body.dailyTargetMinutes }, attempts);
    if (!selection.ok) return NextResponse.json({ ok: false, error: selection.error }, { status: 400 });
    update.caLevel = selection.value.level;
    update.groupChoice = selection.value.group;
    update.attemptKey = selection.value.attemptKey;
    update.dailyTargetMinutes = selection.value.dailyTargetMinutes;
    update.onboardingStep = 4;
    update.onboardingCompletedAt = new Date().toISOString();
  } else {
    if (body.level !== null && body.level !== undefined) {
      if (!isCALevel(body.level)) return NextResponse.json({ ok: false, error: "Choose a valid CA level." }, { status: 400 });
      update.caLevel = body.level;
      if (body.level === "foundation") update.groupChoice = "not_applicable";
    }
    if (body.group !== null && body.group !== undefined && body.level !== "foundation") {
      if (!isGroupChoice(body.group) || body.group === "not_applicable") return NextResponse.json({ ok: false, error: "Choose a valid group." }, { status: 400 });
      update.groupChoice = body.group;
    }
    if (body.attemptKey !== null && body.attemptKey !== undefined) {
      if (typeof body.attemptKey !== "string" || !attempts.some((option) => option.key === body.attemptKey)) return NextResponse.json({ ok: false, error: "Choose an available attempt." }, { status: 400 });
      update.attemptKey = body.attemptKey;
    }
    if (body.dailyTargetMinutes !== null && body.dailyTargetMinutes !== undefined) {
      const target = normalizeDailyTarget(body.dailyTargetMinutes);
      if (target === null) return NextResponse.json({ ok: false, error: "Daily target must be between 15 and 720 minutes." }, { status: 400 });
      update.dailyTargetMinutes = target;
    }
    const step = Number(body.step);
    update.onboardingStep = Number.isInteger(step) ? Math.min(4, Math.max(1, step)) : 1;
  }

  try {
    const profile = await saveProfilePatch(user.id, update);
    return NextResponse.json({ ok: true, profile });
  } catch {
    return NextResponse.json({ ok: false, error: "Could not save onboarding right now." }, { status: 500 });
  }
}
