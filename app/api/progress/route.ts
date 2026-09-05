import { NextResponse } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { setHotProgressStage, undoHotProgressEvent } from "@/lib/data/d1/hot-screens";
import { PROGRESS_STAGES, type ProgressMutationResult, type ProgressStage } from "@/lib/progress/types";

export const dynamic = "force-dynamic";

type Body =
  | { action: "set_stage"; chapterId: string; stage: ProgressStage; enabled: boolean }
  | { action: "undo"; eventId: string };

function cleanError(message: string) {
  if (message.includes("requires")) return message;
  if (message.includes("applicable")) return message;
  if (message.includes("newer change")) return message;
  if (message.includes("cannot be undone")) return message;
  return "Progress could not be saved. Refresh and try again.";
}

export async function POST(request: Request) {
  const user = await optionalUser();
  if (!user) return NextResponse.json({ error: "Sign in to save progress." }, { status: 401 });

  let body: Body;
  try {
    body = await request.json() as Body;
  } catch {
    return NextResponse.json({ error: "Invalid progress request." }, { status: 400 });
  }

  try {
    if (body.action === "set_stage") {
      if (!body.chapterId || !PROGRESS_STAGES.includes(body.stage) || typeof body.enabled !== "boolean") return NextResponse.json({ error: "Invalid progress stage request." }, { status: 400 });
      return NextResponse.json(await setHotProgressStage(user.id, body.chapterId, body.stage, body.enabled) as ProgressMutationResult);
    }
    if (body.action === "undo") {
      if (!body.eventId) return NextResponse.json({ error: "Choose a progress change to undo." }, { status: 400 });
      return NextResponse.json(await undoHotProgressEvent(user.id, body.eventId) as ProgressMutationResult);
    }
    return NextResponse.json({ error: "Unknown progress action." }, { status: 400 });
  } catch (error) {
    const message = cleanError(error instanceof Error ? error.message : "Progress could not be saved.");
    return NextResponse.json({ error: message }, { status: /applicable|requires/.test(message) ? 403 : 409 });
  }

}
