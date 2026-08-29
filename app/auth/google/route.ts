import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { sanitizeReturnPath } from "@/lib/auth/navigation";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const next = sanitizeReturnPath(request.nextUrl.searchParams.get("next"));
  const remember = request.nextUrl.searchParams.get("remember") !== "false";
  const callback = new URL("/auth/callback", request.nextUrl.origin);
  callback.searchParams.set("next", next);
  callback.searchParams.set("remember", remember ? "true" : "false");

  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: callback.toString() } });
    if (error || !data.url) throw error ?? new Error("Google OAuth URL was not returned.");
    return NextResponse.redirect(data.url);
  } catch {
    const login = new URL("/login", request.nextUrl.origin);
    login.searchParams.set("next", next);
    login.searchParams.set("error", "google_unavailable");
    return NextResponse.redirect(login);
  }
}
