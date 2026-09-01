import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { assertSameOriginMutation } from "@/lib/auth/csrf";
import { signOutCurrentSession } from "@/lib/auth/provider";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    assertSameOriginMutation(request);
  } catch {
    return NextResponse.json({ ok: false, error: "Cross-site sign-out request rejected." }, { status: 403 });
  }
  try {
    await signOutCurrentSession();
  } catch {
    // A missing/expired session is already signed out from the application's perspective.
  }
  revalidatePath("/", "layout");
  return NextResponse.redirect(new URL("/login", request.nextUrl.origin), { status: 303 });
}
