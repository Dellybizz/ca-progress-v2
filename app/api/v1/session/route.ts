import { NextResponse, type NextRequest } from "next/server";
import { assertSameOriginMutation } from "@/lib/auth/csrf";
import { getCloudflareApplicationSession, listCloudflareSessions, revokeOtherCloudflareSessions, rotateCloudflareSession, signOutAllCloudflareSessions } from "@/lib/auth/cloudflare";
import { MOBILE_API_HEADERS } from "@/lib/mobile/contract";
import { nativeCorsHeaders, nativeOptions } from "@/lib/auth/native-cors";

export const dynamic = "force-dynamic";
const json = (request: NextRequest, data: unknown, status = 200) => NextResponse.json(data, { status, headers: { ...MOBILE_API_HEADERS, ...nativeCorsHeaders(request) } });
export const OPTIONS = (request: NextRequest) => nativeOptions(request);

export async function GET(request: NextRequest) {
  const session = await getCloudflareApplicationSession();
  if (!session) return json(request, { authenticated: false, sessions: [] }, 401);
  const expiresInSeconds = Math.max(0, Math.floor((Date.parse(session.expiresAt) - Date.now()) / 1000));
  return json(request, {
    authenticated: true,
    user: { applicationUserId: session.applicationUserId, displayName: session.displayName, email: session.email, avatarUrl: session.avatarUrl },
    session: { currentSessionId: session.sessionId, clientKind: session.clientKind, deviceLabel: session.deviceLabel, rememberDevice: session.rememberDevice, expiresAt: session.expiresAt, absoluteExpiresAt: session.absoluteExpiresAt, rotateRecommended: expiresInSeconds < 30 * 60 },
    sessions: await listCloudflareSessions(),
  });
}

export async function POST(request: NextRequest) {
  if (!request.headers.get("authorization")?.startsWith("Bearer ")) {
    try { assertSameOriginMutation(request); } catch { return json(request, { error: { code: "ORIGIN_REJECTED", message: "Cross-site session request rejected.", retryable: false } }, 403); }
  }
  const body = await request.json().catch(() => null) as { action?: string } | null;
  try {
    if (body?.action === "rotate") { await rotateCloudflareSession(); return json(request, { ok: true, rotated: true }); }
    if (body?.action === "revoke_others") { await revokeOtherCloudflareSessions(); return json(request, { ok: true, revokedOthers: true }); }
    if (body?.action === "revoke_all") { await signOutAllCloudflareSessions(); return json(request, { ok: true, signedOut: true }); }
    return json(request, { error: { code: "SESSION_ACTION_UNSUPPORTED", message: "Unsupported session action.", retryable: false } }, 400);
  } catch {
    return json(request, { error: { code: "SESSION_ACTION_FAILED", message: "Session action failed.", retryable: false } }, 401);
  }
}
