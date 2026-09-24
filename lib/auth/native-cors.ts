import "server-only";

const NATIVE_ORIGINS = new Set(["capacitor://localhost", "http://localhost", "https://localhost"]);

export function nativeCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin") || "";
  if (!NATIVE_ORIGINS.has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization,Content-Type,Idempotency-Key,X-CA-API-Version,X-CA-App-Build,X-CA-Native-App",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

export function nativeOptions(request: Request) {
  return new Response(null, { status: 204, headers: nativeCorsHeaders(request) });
}
