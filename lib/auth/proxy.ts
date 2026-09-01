import { NextResponse, type NextRequest } from "next/server";

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
 * Phase 5 production request boundary. Authentication is handled by the
 * Cloudflare session runtime; middleware only enforces same-origin protection
 * for unsafe browser requests. The pre-cutover Worker version remains the
 * rollback path while Supabase is retained during verification.
 */
export async function updateAuthSession(request: NextRequest) {
  return rejectCrossSiteUnsafeRequest(request) ?? NextResponse.next({ request });
}
