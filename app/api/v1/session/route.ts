import { NextResponse, type NextRequest } from "next/server";
import { assertSameOriginMutation } from "@/lib/auth/csrf";
import { getCloudflareApplicationSession, listCloudflareSessions, revokeOtherCloudflareSessions, rotateCloudflareSession, signOutAllCloudflareSessions } from "@/lib/auth/cloudflare";
import { MOBILE_API_HEADERS } from "@/lib/mobile/contract";

export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: MOBILE_API_HEADERS });

export async function GET() {
  const session = await getCloudflareApplicationSession();
  if (!session) return json({ authenticated: false, sessions: [] }, 401);
  const expiresInSeconds = Math.max(0, Math.floor((Date.parse(session.expiresAt) - Date.now()) / 1000));
  return json({
    authenticated: true,
    session: { currentSessionId: session.sessionId, clientKind: session.clientKind, deviceLabel: session.deviceLabel, rememberDevice: session.rememberDevice, expiresAt: session.expiresAt, absoluteExpiresAt: session.absoluteExpiresAt, rotateRecommended: expiresInSeconds < 30 * 60 },
    sessions: await listCloudflareSessions(),
  });
}

export async function POST(request: NextRequest) {
  try { assertSameOriginMutation(request); } catch { return json({ error: { code: "ORIGIN_REJECTED", message: "Cross-site session request rejected.", retryable: false } }, 403); }
  const body = await request.json().catch(() => null) as { action?: string } | null;
  try {
    if (body?.action === "rotate") { await rotateCloudflareSession(); return json({ ok: true, rotated: true }); }
    if (body?.action === "revoke_others") { await revokeOtherCloudflareSessions(); return json({ ok: true, revokedOthers: true }); }
    if (body?.action === "revoke_all") { await signOutAllCloudflareSessions(); return json({ ok: true, signedOut: true }); }
    return json({ error: { code: "SESSION_ACTION_UNSUPPORTED", message: "Unsupported session action.", retryable: false } }, 400);
  } catch {
    return json({ error: { code: "SESSION_ACTION_FAILED", message: "Session action failed.", retryable: false } }, 401);
  }
}
