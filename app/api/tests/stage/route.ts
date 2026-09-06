import { NextResponse } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { savePhase4TestStage, undoPhase4TestStage } from "@/lib/tests/phase4";

export const dynamic = "force-dynamic";

type Body =
  | { action: "save"; chapterId: string; stage: string; marksScored: number; marksTotal: number; completedOn: string }
  | { action: "undo"; recordId: string };

function statusFor(message: string) {
  if (/not applicable|current academic profile/i.test(message)) return 403;
  if (/requires|Undo Test 2|changed after|cannot be recovered safely/i.test(message)) return 409;
  return 400;
}

export async function POST(request: Request) {
  const user = await optionalUser();
  if (!user) return NextResponse.json({ error: "Sign in to save test marks." }, { status: 401 });

  let body: Body;
  try {
    body = await request.json() as Body;
  } catch {
    return NextResponse.json({ error: "Invalid test request." }, { status: 400 });
  }

  try {
    if (body.action === "save") {
      return NextResponse.json(await savePhase4TestStage(user.id, body), {
        headers: { "Cache-Control": "no-store" },
      });
    }
    if (body.action === "undo") {
      return NextResponse.json(await undoPhase4TestStage(user.id, body.recordId), {
        headers: { "Cache-Control": "no-store" },
      });
    }
    return NextResponse.json({ error: "Unknown test action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Test marks could not be saved.";
    return NextResponse.json({ error: message }, { status: statusFor(message) });
  }
}
