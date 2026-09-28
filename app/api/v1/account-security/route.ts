import { NextResponse, type NextRequest } from "next/server";
import { assertSameOriginMutation } from "@/lib/auth/csrf";
import { nativeCorsHeaders, nativeOptions } from "@/lib/auth/native-cors";
import { AccountSecurityError, changeAccountCredentials, revokeAccountDevice } from "@/lib/auth/account-security";
import { PasswordAuthError } from "@/lib/auth/password";
import { MOBILE_API_HEADERS } from "@/lib/mobile/contract";

export const dynamic = "force-dynamic";
export const OPTIONS = (request: NextRequest) => nativeOptions(request);
const json = (request: NextRequest, body: unknown, status = 200) => NextResponse.json(body, { status, headers: { ...MOBILE_API_HEADERS, ...nativeCorsHeaders(request), "Cache-Control": "private, no-store" } });

export async function POST(request: NextRequest) {
  const native = request.headers.get("authorization")?.startsWith("Bearer ") === true;
  if (!native) {
    try { assertSameOriginMutation(request); } catch { return json(request, { error: "Invalid request origin." }, 403); }
  }
  if (Number(request.headers.get("content-length") || 0) > 2048) return json(request, { error: "Request too large." }, 413);
  const body = await request.json().catch(() => null) as { action?: unknown; currentPassword?: unknown; username?: unknown; newPassword?: unknown; sessionId?: unknown } | null;
  if (typeof body?.currentPassword !== "string" || body.currentPassword.length > 128) return json(request, { error: "Enter your current password." }, 400);
  try {
    if (body.action === "username" && typeof body.username === "string" && body.username.length <= 64) return json(request, await changeAccountCredentials({ currentPassword: body.currentPassword, username: body.username }));
    if (body.action === "password" && typeof body.newPassword === "string" && body.newPassword.length <= 128) return json(request, await changeAccountCredentials({ currentPassword: body.currentPassword, newPassword: body.newPassword }));
    if (body.action === "revoke_device" && typeof body.sessionId === "string") return json(request, await revokeAccountDevice(body.sessionId, body.currentPassword));
    return json(request, { error: "Unsupported account security action." }, 400);
  } catch (error) {
    if (error instanceof AccountSecurityError) return json(request, { error: error.message }, error.status);
    if (error instanceof PasswordAuthError) return json(request, { error: error.message }, 400);
    return json(request, { error: "Account security is temporarily unavailable." }, 503);
  }
}
