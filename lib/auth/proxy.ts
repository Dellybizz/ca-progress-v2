import { NextResponse, type NextRequest } from "next/server";
import { updateSession as updateSupabaseSession } from "@/lib/supabase/proxy";

function cloudflareAuthRuntime() {
  return (process.env.CA_AUTH_RUNTIME || "").trim().toLowerCase() === "cloudflare";
}

function rejectCrossSiteUnsafeRequest(request: NextRequest) {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return null;

  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (fetchSite === "cross-site") {
    return NextResponse.json({ ok: false, error: "Cross-site mutation rejected." }, { status: 403 });
  }

  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ ok: false, error: "Mutation origin validation failed." }, { status: 403 });
  }
  return null;
}

/**
 * Authentication-runtime-aware request boundary. Supabase cookie refresh remains
 * active in production until cutover; Cloudflare target mode does not call
 * Supabase Auth and applies a same-origin guard to browser unsafe requests.
 */
export async function updateAuthSession(request: NextRequest) {
  if (!cloudflareAuthRuntime()) return updateSupabaseSession(request);
  return rejectCrossSiteUnsafeRequest(request) ?? NextResponse.next({ request });
}
