import { NextResponse, type NextRequest } from "next/server";
import { assertSameOriginMutation } from "@/lib/auth/csrf";
import { optionalUser } from "@/lib/auth/server";
import { grantStudyProfileBuddy, revokeStudyProfileBuddy, StudyProfileInputError } from "@/lib/profile/study-profile";

export const dynamic = "force-dynamic";
const privateHeaders = { "cache-control": "private, no-store" };

async function bodyBuddyId(request: NextRequest) {
  const body = await request.json().catch(() => null) as { buddyUserId?: unknown } | null;
  return body?.buddyUserId;
}

export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
  } catch {
    return NextResponse.json({ ok: false, error: "Cross-site buddy request rejected." }, { status: 403, headers: privateHeaders });
  }
  const user = await optionalUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in to manage Study Profile buddies." }, { status: 401, headers: privateHeaders });
  try {
    const settings = await grantStudyProfileBuddy(user.id, await bodyBuddyId(request));
    return NextResponse.json({ ok: true, settings }, { headers: privateHeaders });
  } catch (error) {
    if (error instanceof StudyProfileInputError) return NextResponse.json({ ok: false, error: error.message }, { status: 400, headers: privateHeaders });
    return NextResponse.json({ ok: false, error: "Could not add this study buddy." }, { status: 500, headers: privateHeaders });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
  } catch {
    return NextResponse.json({ ok: false, error: "Cross-site buddy request rejected." }, { status: 403, headers: privateHeaders });
  }
  const user = await optionalUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in to manage Study Profile buddies." }, { status: 401, headers: privateHeaders });
  try {
    const settings = await revokeStudyProfileBuddy(user.id, await bodyBuddyId(request));
    return NextResponse.json({ ok: true, settings }, { headers: privateHeaders });
  } catch (error) {
    if (error instanceof StudyProfileInputError) return NextResponse.json({ ok: false, error: error.message }, { status: 400, headers: privateHeaders });
    return NextResponse.json({ ok: false, error: "Could not remove this study buddy." }, { status: 500, headers: privateHeaders });
  }
}
