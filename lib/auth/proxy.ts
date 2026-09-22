import { NextResponse, type NextRequest } from "next/server";

const GUEST_ID_COOKIE = "ca_guest_id";
const API_VERSION = "1";
const MAX_API_BODY_BYTES = 1_000_000;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{8,180}$/;

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
 * legacy provider assets remain frozen only for rollback provenance during verification.
 */
export async function updateAuthSession(request: NextRequest) {
  const unsafeResponse = rejectCrossSiteUnsafeRequest(request);
  if (unsafeResponse) return unsafeResponse;
  const isVersionedApi = request.nextUrl.pathname.startsWith("/api/v1/");
  const method = request.method.toUpperCase();
  const isMutation = !["GET", "HEAD", "OPTIONS"].includes(method);
  const requestedVersion = request.headers.get("x-ca-api-version");
  if (isVersionedApi && requestedVersion && requestedVersion !== API_VERSION) {
    return NextResponse.json({ error: { code: "API_VERSION_UNSUPPORTED", message: "This API version is not supported.", retryable: false } }, { status: 406 });
  }
  if (isVersionedApi && isMutation) {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_API_BODY_BYTES) {
      return NextResponse.json({ error: { code: "PAYLOAD_TOO_LARGE", message: "The request body is too large.", retryable: false } }, { status: 413 });
    }
    const contentType = request.headers.get("content-type")?.toLowerCase() || "";
    if (contentLength > 0 && !contentType.includes("application/json") && !contentType.includes("multipart/form-data")) {
      return NextResponse.json({ error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Use JSON or multipart form data.", retryable: false } }, { status: 415 });
    }
  }
  const requestHeaders = new Headers(request.headers);
  const traceId = requestHeaders.get("x-request-id")?.trim() || crypto.randomUUID();
  requestHeaders.set("x-request-id", traceId);
  requestHeaders.set("x-ca-api-version", API_VERSION);
  if (isVersionedApi && isMutation) {
    const supplied = requestHeaders.get("idempotency-key")?.trim();
    requestHeaders.set("idempotency-key", supplied && IDEMPOTENCY_KEY.test(supplied) ? supplied : crypto.randomUUID());
  }
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  if (isVersionedApi) {
    response.headers.set("X-CA-API-Version", API_VERSION);
    response.headers.set("X-Request-ID", traceId);
    response.headers.set("Cache-Control", "private, no-store");
  }
  if (!request.cookies.get(GUEST_ID_COOKIE)?.value) {
    response.cookies.set(GUEST_ID_COOKIE, crypto.randomUUID(), { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 365 * 24 * 60 * 60 });
  }
  // Temporary staging-only test mode: assign each browser its own isolated server identity.
  if (process.env.CA_GUEST_TEST_MODE?.trim().toLowerCase() === "true" && !request.cookies.get("ca_guest_test_id")?.value) {
    response.cookies.set("ca_guest_test_id", crypto.randomUUID(), { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 30 * 24 * 60 * 60 });
  }
  return response;
}
