import { NextResponse, type NextRequest } from "next/server";
import { sanitizeReturnPath } from "@/lib/auth/navigation";
import { startOAuthSignIn } from "@/lib/auth/provider";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const recovery=request.nextUrl.searchParams.get("purpose")==="recovery";
  const next = sanitizeReturnPath(request.nextUrl.searchParams.get("next"));
  const remember = request.nextUrl.searchParams.get("remember") !== "false";
  const client = request.nextUrl.searchParams.get("client") === "mobile" ? "mobile" : "web";
  const nativeTransaction = request.nextUrl.searchParams.get("native_transaction");
  const callback = new URL("/auth/callback", request.nextUrl.origin);
  if(recovery)callback.searchParams.set("purpose","recovery");
  callback.searchParams.set("next", next);
  callback.searchParams.set("remember", remember ? "true" : "false");
  callback.searchParams.set("client", client);
  if (client === "mobile" && nativeTransaction) callback.searchParams.set("native_transaction", nativeTransaction);

  try {
    const url = await startOAuthSignIn("google", callback.toString());
    return NextResponse.redirect(url);
  } catch {
    if(recovery)return NextResponse.redirect(new URL("/account/recover?error=verification_failed",request.nextUrl.origin));
    const login = new URL("/login", request.nextUrl.origin);
    login.searchParams.set("next", next);
    login.searchParams.set("error", "google_unavailable");
    return NextResponse.redirect(login);
  }
}
