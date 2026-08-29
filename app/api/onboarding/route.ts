import { NextResponse, type NextRequest } from "next/server";
import { optionalUser, loadAttemptOptions } from "@/lib/auth/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isCALevel, isGroupChoice, normalizeDailyTarget, validateAcademicSelection } from "@/lib/profile/validation";
import type { Database } from "@/lib/supabase/database.types";

export const dynamic = "force-dynamic";
type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];

export async function POST(request: NextRequest) {
  const user = await optionalUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in to save onboarding." }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || (body.action !== "draft" && body.action !== "complete")) return NextResponse.json({ ok: false, error: "Invalid onboarding request." }, { status: 400 });
  const attempts = await loadAttemptOptions();
  const supabase = await createServerSupabaseClient();
  const update: ProfileUpdate = {};

  if (body.action === "complete") {
    const selection = validateAcademicSelection({ level: body.level, group: body.group, attemptKey: body.attemptKey, dailyTargetMinutes: body.dailyTargetMinutes }, attempts);
    if (!selection.ok) return NextResponse.json({ ok: false, error: selection.error }, { status: 400 });
    update.ca_level = selection.value.level;
    update.group_choice = selection.value.group;
    update.attempt_key = selection.value.attemptKey;
    update.daily_target_minutes = selection.value.dailyTargetMinutes;
    update.onboarding_step = 4;
    update.onboarding_completed_at = new Date().toISOString();
  } else {
    if (body.level !== null && body.level !== undefined) {
      if (!isCALevel(body.level)) return NextResponse.json({ ok: false, error: "Choose a valid CA level." }, { status: 400 });
      update.ca_level = body.level;
      if (body.level === "foundation") update.group_choice = "not_applicable";
    }
    if (body.group !== null && body.group !== undefined && body.level !== "foundation") {
      if (!isGroupChoice(body.group) || body.group === "not_applicable") return NextResponse.json({ ok: false, error: "Choose a valid group." }, { status: 400 });
      update.group_choice = body.group;
    }
    if (body.attemptKey !== null && body.attemptKey !== undefined) {
      if (typeof body.attemptKey !== "string" || !attempts.some((option) => option.key === body.attemptKey)) return NextResponse.json({ ok: false, error: "Choose an available attempt." }, { status: 400 });
      update.attempt_key = body.attemptKey;
    }
    if (body.dailyTargetMinutes !== null && body.dailyTargetMinutes !== undefined) {
      const target = normalizeDailyTarget(body.dailyTargetMinutes);
      if (target === null) return NextResponse.json({ ok: false, error: "Daily target must be between 15 and 720 minutes." }, { status: 400 });
      update.daily_target_minutes = target;
    }
    const step = Number(body.step);
    update.onboarding_step = Number.isInteger(step) ? Math.min(4, Math.max(1, step)) : 1;
  }

  const { data, error } = await supabase.from("profiles").update(update).eq("user_id", user.id).select("*").single();
  if (error) return NextResponse.json({ ok: false, error: "Could not save onboarding right now." }, { status: 500 });
  return NextResponse.json({ ok: true, profile: data });
}
