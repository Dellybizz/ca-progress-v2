import "server-only";

/**
 * Cookie-authenticated unsafe requests must be same-origin. OAuth login CSRF is
 * separately protected with a signed one-time transaction cookie + state + PKCE.
 */
export function assertSameOriginMutation(request: Request) {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return;
  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (fetchSite === "cross-site") throw new Error("Cross-site mutation rejected.");
  const origin = request.headers.get("origin");
  if (!origin) return;
  const expected = new URL(request.url).origin;
  if (origin !== expected) throw new Error("Mutation origin validation failed.");
}
