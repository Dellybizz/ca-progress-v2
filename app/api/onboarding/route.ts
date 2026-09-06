import { NextResponse } from "next/server";
import { optionalUser, loadAttemptOptions } from "@/lib/auth/server";
import { saveOnboardingPreparationState } from "@/lib/profile/onboarding-experience";
import { saveProfilePatch, type ProfilePatch } from "@/lib/profile/service";
import { attemptAppliesToLevel, isCALevel, isGroupChoice, isPreparationState, validateOnboardingSelection } from "@/lib/profile/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await optionalUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in to save onboarding." }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || (body.action !== "draft" && body.action !== "complete")) return NextResponse.json({ ok: false, error: "Invalid onboarding request." }, { status: 400 });
  const attempts = await loadAttemptOptions();
  const update: ProfilePatch = {};

  try {
    if (body.action === "complete") {
      const selection = validateOnboardingSelection({ level: body.level, group: body.group, attemptKey: body.attemptKey, preparationState: body.preparationState }, attempts);
      if (!selection.ok) return NextResponse.json({ ok: false, error: selection.error }, { status: 400 });
      await saveOnboardingPreparationState(user.id, selection.value.preparationState);
      update.caLevel = selection.value.level;
      update.groupChoice = selection.value.group;
      update.attemptKey = selection.value.attemptKey;
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
        const level = isCALevel(body.level) ? body.level : null;
        if (typeof body.attemptKey !== "string" || !attempts.some((option) => option.key === body.attemptKey && (!level || attemptAppliesToLevel(option, level)))) return NextResponse.json({ ok: false, error: "Choose an available attempt." }, { status: 400 });
        update.attemptKey = body.attemptKey;
      }
      if (body.preparationState !== null && body.preparationState !== undefined) {
        if (!isPreparationState(body.preparationState)) return NextResponse.json({ ok: false, error: "Choose your current preparation state." }, { status: 400 });
        await saveOnboardingPreparationState(user.id, body.preparationState);
      }
      const step = Number(body.step);
      update.onboardingStep = Number.isInteger(step) ? Math.min(4, Math.max(1, step)) : 1;
    }

    const profile = await saveProfilePatch(user.id, update);
    return NextResponse.json({ ok: true, profile }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "Could not save onboarding right now." }, { status: 500, headers: { "Cache-Control": "private, no-store" } });
  }
}
