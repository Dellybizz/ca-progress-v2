import { NextResponse } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { createD1ServerClient } from "@/lib/data/d1/client";
import type { StudyTimerMutationResult } from "@/lib/study/types";

export const dynamic = "force-dynamic";

type StartBody = { action: "start"; subjectId?: string | null; chapterId?: string | null; mode?: "stopwatch" | "pomodoro"; focusMinutes?: number | null; breakMinutes?: number | null; timezone?: string };
type Body = StartBody | { action: "pause" | "resume" | "finish" | "discard" | "touch" };

function errorMessage(message: string) {
  for (const text of ["already active", "requires", "not applicable", "does not belong", "already paused", "already running", "No active", "No paused", "safety limit", "appears abandoned", "Unknown timezone", "duration", "Unsupported timer"]) if (message.includes(text)) return message;
  return "Study timer could not be updated. Refresh and try again.";
}

export async function POST(request: Request) {
  const user = await optionalUser();
  if (!user) return NextResponse.json({ error: "Sign in to use the study timer." }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  let body: Body;
  try { body = await request.json() as Body; } catch { return NextResponse.json({ error: "Invalid timer request." }, { status: 400 }); }
  const client = await createD1ServerClient();
  let result: { data: unknown; error: { message: string; code?: string } | null };
  if (body.action === "start") {
    const focus = body.focusMinutes == null ? null : Math.round(Number(body.focusMinutes) * 60);
    const rest = body.breakMinutes == null ? null : Math.round(Number(body.breakMinutes) * 60);
    if (focus !== null && (!Number.isFinite(focus) || focus < 60 || focus > 43_200)) return NextResponse.json({ error: "Focus duration must be between 1 minute and 12 hours." }, { status: 400 });
    if (rest !== null && (!Number.isFinite(rest) || rest < 0 || rest > 7_200)) return NextResponse.json({ error: "Break duration must be between 0 and 120 minutes." }, { status: 400 });
    result = await client.rpc("study_timer_start", { p_subject_id: body.subjectId || null, p_chapter_id: body.chapterId || null, p_mode: body.mode ?? "stopwatch", p_focus_target_seconds: focus, p_break_target_seconds: rest, p_timezone: body.timezone || "UTC" });
  } else if (body.action === "pause") result = await client.rpc("study_timer_pause", {});
  else if (body.action === "resume") result = await client.rpc("study_timer_resume", {});
  else if (body.action === "finish") result = await client.rpc("study_timer_finish", {});
  else if (body.action === "discard") result = await client.rpc("study_timer_discard", {});
  else if (body.action === "touch") result = await client.rpc("study_timer_touch", {});
  else return NextResponse.json({ error: "Unknown timer action." }, { status: 400 });
  if (result.error) return NextResponse.json({ error: errorMessage(result.error.message) }, { status: result.error.code === "42501" ? 403 : 409, headers: { "Cache-Control": "private, no-store" } });
  return NextResponse.json((result.data ?? { ok: true }) as StudyTimerMutationResult, { headers: { "Cache-Control": "private, no-store" } });
}
