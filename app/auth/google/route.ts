import { NextResponse, type NextRequest } from "next/server";
import { sanitizeReturnPath } from "@/lib/auth/navigation";
import { startOAuthSignIn } from "@/lib/auth/provider";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const next = sanitizeReturnPath(request.nextUrl.searchParams.get("next"));
  const remember = request.nextUrl.searchParams.get("remember") !== "false";
  const client = request.nextUrl.searchParams.get("client") === "mobile" ? "mobile" : "web";
  const nativeTransaction = request.nextUrl.searchParams.get("native_transaction");
  const callback = new URL("/auth/callback", request.nextUrl.origin);
  callback.searchParams.set("next", next);
  callback.searchParams.set("remember", remember ? "true" : "false");
  callback.searchParams.set("client", client);
  if (client === "mobile" && nativeTransaction) callback.searchParams.set("native_transaction", nativeTransaction);

  try {
    const url = await startOAuthSignIn("google", callback.toString());
    return NextResponse.redirect(url);
  } catch {
    const login = new URL("/login", request.nextUrl.origin);
    login.searchParams.set("next", next);
    login.searchParams.set("error", "google_unavailable");
    return NextResponse.redirect(login);
  }
}
