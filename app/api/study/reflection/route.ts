import { NextResponse } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { saveStudySessionReflection } from "@/lib/study/phase3";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const identity = await optionalUser();
  if (!identity) return NextResponse.json({ error: "Sign in to save a study reflection." }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid reflection request." }, { status: 400 });
  }

  try {
    const result = await saveStudySessionReflection(identity.id, typeof body.sessionId === "string" ? body.sessionId : "", {
      understandingScore: body.understandingScore,
      focusRating: body.focusRating,
      doubtBody: body.doubtBody,
      doubtVisibility: body.doubtVisibility,
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Reflection could not be saved.";
    const status = /not found|not owned/i.test(message) ? 404 : /already been saved/i.test(message) ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
