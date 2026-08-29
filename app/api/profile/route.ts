import { NextResponse, type NextRequest } from "next/server";
import { loadAttemptOptions, optionalUser } from "@/lib/auth/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { normalizeDisplayName, validateAcademicSelection } from "@/lib/profile/validation";

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
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("profiles").update({ display_name: displayName, ca_level: selection.value.level, group_choice: selection.value.group, attempt_key: selection.value.attemptKey, daily_target_minutes: selection.value.dailyTargetMinutes }).eq("user_id", user.id);
  if (error) return NextResponse.json({ ok: false, error: "Could not save your profile." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
