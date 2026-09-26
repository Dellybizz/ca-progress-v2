import { NextResponse, type NextRequest } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { nativeCorsHeaders, nativeOptions } from "@/lib/auth/native-cors";
import { MOBILE_API_HEADERS } from "@/lib/mobile/contract";
import { getProgressPageModel } from "@/lib/progress/service";
import { createPhase5TestAttempt, getPhase5TestArchive } from "@/lib/tests/phase5";
import { assertSameOriginMutation } from "@/lib/auth/csrf";

export const dynamic = "force-dynamic";
const json = (request: NextRequest, body: unknown, status = 200) => NextResponse.json(body, {
  status, headers: { ...MOBILE_API_HEADERS, ...nativeCorsHeaders(request), "Cache-Control": "private, no-store" },
});
export const OPTIONS = (request: NextRequest) => nativeOptions(request);

export async function GET(request: NextRequest) {
  const user = await optionalUser();
  if (!user) return json(request, { error: { message: "Sign in to view Tests." } }, 401);
  try {
    const model = await getProgressPageModel();
    if (model.mode !== "ready") return json(request, { error: { message: "Complete your academic profile to view Tests." } }, 409);
    return json(request, { archive: await getPhase5TestArchive(user.id, model.chapters.map(chapter => chapter.id)) });
  } catch { return json(request, { error: { message: "Tests could not be refreshed. Saved attempts remain available." } }, 503); }
}

export async function POST(request: NextRequest) {
  if (!request.headers.get("authorization")) {
    try { assertSameOriginMutation(request); }
    catch { return json(request, { error: { message: "Cross-site mutation rejected." } }, 403); }
  }
  const user = await optionalUser();
  if (!user) return json(request, { error: { message: "Sign in to record a test." } }, 401);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return json(request, { error: { message: "Invalid test attempt." } }, 400);
  try {
    const result = await createPhase5TestAttempt(user.id, {
      chapterId: body.chapterId, stage: body.stage, marksScored: body.marksScored, marksTotal: body.marksTotal,
      durationMinutes: body.durationMinutes, completedOn: body.completedOn, mistakeCategories: body.mistakeCategories,
      mistakeNote: body.mistakeNote, idempotencyKey: body.idempotencyKey,
    });
    return json(request, result, result.retry ? 200 : 201);
  } catch (error) { return json(request, { error: { message: error instanceof Error ? error.message : "Test attempt could not be saved." } }, 409); }
}
