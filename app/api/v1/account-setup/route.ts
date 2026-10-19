import { NextResponse, type NextRequest } from "next/server";
import { assertSameOriginMutation } from "@/lib/auth/csrf";
import { nativeCorsHeaders, nativeOptions } from "@/lib/auth/native-cors";
import { AccountSetupError, completeAccountSetup, getAccountSetupState } from "@/lib/auth/account-setup";
import { PasswordAuthError } from "@/lib/auth/password";
import { MOBILE_API_HEADERS } from "@/lib/mobile/contract";

export const dynamic = "force-dynamic";
export const OPTIONS = (request: NextRequest) => nativeOptions(request);
const json = (request: NextRequest, body: unknown, status = 200) => NextResponse.json(body, { status, headers: { ...MOBILE_API_HEADERS, ...nativeCorsHeaders(request), "Cache-Control": "private, no-store" } });

export async function GET(request: NextRequest) {
  const state = await getAccountSetupState();
  return state ? json(request, state) : json(request, { error: "Sign in to review your account." }, 401);
}

export async function POST(request: NextRequest) {
  const native = request.headers.get("authorization")?.startsWith("Bearer ") === true;
  if (!native) {
    try { assertSameOriginMutation(request); } catch { return json(request, { error: "Invalid request origin." }, 403); }
  }
  if (Number(request.headers.get("content-length") || 0) > 2048) return json(request, { error: "Request too large." }, 413);
  const input = await request.json().catch(() => null) as { username?: unknown; password?: unknown } | null;
  if (typeof input?.username !== "string" || typeof input.password !== "string" || input.username.length > 64 || input.password.length > 128) {
    return json(request, { error: "Enter a username and password." }, 400);
  }
  try {
    const result = await completeAccountSetup(input.username, input.password);
    return json(request, { ok: true, username: result.username });
  } catch (error) {
    if (error instanceof AccountSetupError) return json(request, { error: error.message }, error.status);
    if (error instanceof PasswordAuthError) return json(request, { error: error.message }, 400);
    return json(request, { error: "Account setup is temporarily unavailable." }, 503);
  }
}
