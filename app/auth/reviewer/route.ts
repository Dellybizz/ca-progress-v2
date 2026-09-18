import { NextResponse } from "next/server";
import { sanitizeReturnPath } from "@/lib/auth/navigation";
import { ReviewerAuthError, signInRazorpayReviewer } from "@/lib/auth/cloudflare";

export const dynamic = "force-dynamic";

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const failure = new URL("/login?error=reviewer_auth_failed", request.url);
  if (!sameOrigin(request)) return NextResponse.redirect(failure, 303);

  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.redirect(failure, 303);

  const username = String(form.get("username") ?? "");
  const password = String(form.get("password") ?? "");
  const next = sanitizeReturnPath(String(form.get("next") ?? "/billing"), "/billing");
  const remember = String(form.get("remember") ?? "true") !== "false";

  try {
    await signInRazorpayReviewer({ username, password, remember });
    return NextResponse.redirect(new URL(next, request.url), 303);
  } catch {
    failure.searchParams.set("next", next);
    return NextResponse.redirect(failure, 303);
  }
}
