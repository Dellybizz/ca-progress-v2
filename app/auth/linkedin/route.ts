import { NextResponse, type NextRequest } from "next/server";
import { sanitizeReturnPath } from "@/lib/auth/navigation";
import { startOAuthSignIn } from "@/lib/auth/provider";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const next = sanitizeReturnPath(request.nextUrl.searchParams.get("next"));
  const remember = request.nextUrl.searchParams.get("remember") !== "false";
  const callback = new URL("/auth/callback", request.nextUrl.origin);
  callback.searchParams.set("next", next);
  callback.searchParams.set("remember", remember ? "true" : "false");

  try {
    const url = await startOAuthSignIn("linkedin_oidc", callback.toString());
    return NextResponse.redirect(url);
  } catch {
    const login = new URL("/login", request.nextUrl.origin);
    login.searchParams.set("next", next);
    login.searchParams.set("error", "linkedin_unavailable");
    return NextResponse.redirect(login);
  }
}
