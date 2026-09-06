import { NextResponse, type NextRequest } from "next/server";
import { assertSameOriginMutation } from "@/lib/auth/csrf";
import { optionalUser } from "@/lib/auth/server";
import { getOwnerStudyProfileSettings, saveOwnerStudyProfileSettings, StudyProfileInputError } from "@/lib/profile/study-profile";

export const dynamic = "force-dynamic";

const privateHeaders = { "cache-control": "private, no-store" };

export async function GET() {
  const user = await optionalUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in to manage your Study Profile." }, { status: 401, headers: privateHeaders });
  const settings = await getOwnerStudyProfileSettings(user.id);
  return NextResponse.json({ ok: true, settings }, { headers: privateHeaders });
}

export async function PATCH(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
  } catch {
    return NextResponse.json({ ok: false, error: "Cross-site profile request rejected." }, { status: 403, headers: privateHeaders });
  }
  const user = await optionalUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in to manage your Study Profile." }, { status: 401, headers: privateHeaders });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ ok: false, error: "Invalid Study Profile request." }, { status: 400, headers: privateHeaders });
  try {
    const settings = await saveOwnerStudyProfileSettings(user.id, body);
    return NextResponse.json({ ok: true, settings }, { headers: privateHeaders });
  } catch (error) {
    if (error instanceof StudyProfileInputError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400, headers: privateHeaders });
    }
    return NextResponse.json({ ok: false, error: "Could not save Study Profile privacy settings." }, { status: 500, headers: privateHeaders });
  }
}
