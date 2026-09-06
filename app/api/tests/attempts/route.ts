import { NextResponse } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { createPhase5TestAttempt } from "@/lib/tests/phase5";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function statusFor(message: string) {
  if (/not applicable|current academic profile/i.test(message)) return 403;
  if (/requires|cannot be completed before/i.test(message)) return 409;
  return 400;
}

export async function POST(request: Request) {
  const user = await optionalUser();
  if (!user) return NextResponse.json({ error: "Sign in to save a test attempt." }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid test attempt request." }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
  try {
    const result = await createPhase5TestAttempt(user.id, {
      chapterId: body.chapterId,
      stage: body.stage,
      marksScored: body.marksScored,
      marksTotal: body.marksTotal,
      durationMinutes: body.durationMinutes,
      completedOn: body.completedOn,
      mistakeCategories: body.mistakeCategories,
      mistakeNote: body.mistakeNote,
      idempotencyKey: body.idempotencyKey,
    });
    return NextResponse.json(result, { status: result.retry ? 200 : 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Test attempt could not be saved.";
    return NextResponse.json({ error: message }, { status: statusFor(message), headers: { "Cache-Control": "private, no-store" } });
  }
}
