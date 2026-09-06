import { NextResponse } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { getStudyProfileForViewer, StudyProfileInputError } from "@/lib/profile/study-profile";

export const dynamic = "force-dynamic";
const privateHeaders = { "cache-control": "private, no-store", vary: "Cookie" };

type RouteContext = { params: Promise<{ userId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const viewer = await optionalUser();
  const { userId } = await context.params;
  try {
    const profile = await getStudyProfileForViewer(userId, viewer?.id ?? null);
    if (!profile) {
      return NextResponse.json({ ok: false, error: "Study profile unavailable." }, { status: 404, headers: privateHeaders });
    }
    return NextResponse.json({ ok: true, profile }, { headers: privateHeaders });
  } catch (error) {
    if (error instanceof StudyProfileInputError) {
      return NextResponse.json({ ok: false, error: "Study profile unavailable." }, { status: 404, headers: privateHeaders });
    }
    return NextResponse.json({ ok: false, error: "Could not load this Study Profile." }, { status: 500, headers: privateHeaders });
  }
}
