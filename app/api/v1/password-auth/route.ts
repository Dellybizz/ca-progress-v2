import { NextResponse, type NextRequest } from "next/server";
import { assertSameOriginMutation } from "@/lib/auth/csrf";
import { nativeCorsHeaders, nativeOptions } from "@/lib/auth/native-cors";
import { PasswordAuthError, passwordAccount } from "@/lib/auth/password";
import { MOBILE_API_HEADERS } from "@/lib/mobile/contract";

export const dynamic = "force-dynamic";
export const OPTIONS = (request: NextRequest) => nativeOptions(request);
const json = (request: NextRequest, body: unknown, status = 200) => NextResponse.json(body, { status, headers: { ...MOBILE_API_HEADERS, ...nativeCorsHeaders(request), "Cache-Control": "no-store" } });

export async function POST(request: NextRequest) {
  const native = request.headers.get("x-ca-native-app") === "in.zanisheluxe.caprogress";
  const origin = request.headers.get("origin");
  if (native && origin && !["capacitor://localhost", "http://localhost", "https://localhost"].includes(origin)) return json(request, { error: { code: "ORIGIN_REJECTED", message: "Invalid application origin." } }, 403);
  if (!native) {
    try { assertSameOriginMutation(request); } catch { return json(request, { error: { code: "ORIGIN_REJECTED", message: "Invalid login origin." } }, 403); }
  }
  if (Number(request.headers.get("content-length") || 0) > 2048) return json(request, { error: { code: "INVALID_INPUT", message: "The request is too large." } }, 413);
  const input = await request.json().catch(() => null) as { action?: string; username?: string; password?: string; remember?: boolean } | null;
  if (!input || !["register", "login"].includes(input.action || "") || typeof input.username !== "string" || typeof input.password !== "string") return json(request, { error: { code: "INVALID_INPUT", message: "Enter a username and password." } }, 400);
  try {
    const result = await passwordAccount(request, { action: input.action as "register" | "login", username: input.username, password: input.password, native, remember: native || input.remember !== false });
    return json(request, result, input.action === "register" ? 201 : 200);
  } catch (error) {
    if (error instanceof PasswordAuthError) return json(request, { error: { code: error.code, message: error.message } }, error.code === "RATE_LIMITED" ? 429 : error.code === "USERNAME_TAKEN" ? 409 : 401);
    return json(request, { error: { code: "AUTH_UNAVAILABLE", message: "Sign-in is temporarily unavailable." } }, 503);
  }
}
