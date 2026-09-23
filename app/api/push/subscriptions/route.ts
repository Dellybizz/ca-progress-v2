import { NextResponse } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { assertSameOriginMutation } from "@/lib/auth/csrf";
import { getHotD1Database } from "@/lib/data/d1/runtime";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };
const publicKey = () => process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY?.trim() || null;

type SubscriptionBody = { endpoint?: unknown; expirationTime?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };

function validBody(value: unknown) {
  const body = value as SubscriptionBody;
  if (!body || typeof body.endpoint !== "string" || body.endpoint.length > 2048) return null;
  let endpoint: URL;
  try { endpoint = new URL(body.endpoint); } catch { return null; }
  if (endpoint.protocol !== "https:" || typeof body.keys?.p256dh !== "string" || typeof body.keys.auth !== "string") return null;
  if (body.keys.p256dh.length > 256 || body.keys.auth.length > 128) return null;
  return { endpoint: endpoint.toString(), p256dh: body.keys.p256dh, auth: body.keys.auth, expirationTime: typeof body.expirationTime === "number" ? body.expirationTime : null };
}

export async function GET() {
  const user = await optionalUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401, headers });
  const key = publicKey();
  if (!key) return NextResponse.json({ configured: false, publicKey: null, subscribed: false }, { headers });
  try {
    const row = await getHotD1Database().prepare("SELECT COUNT(*) AS count FROM web_push_subscriptions WHERE user_id=?1 AND revoked_at IS NULL").bind(user.id).first<{ count: number }>();
    return NextResponse.json({ configured: true, publicKey: key, subscribed: Number(row?.count ?? 0) > 0 }, { headers });
  } catch {
    return NextResponse.json({ configured: false, publicKey: null, subscribed: false }, { status: 503, headers });
  }
}

export async function POST(request: Request) {
  try { assertSameOriginMutation(request); } catch { return NextResponse.json({ error: "Request origin rejected." }, { status: 403, headers }); }
  const user = await optionalUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401, headers });
  if (!publicKey()) return NextResponse.json({ error: "Push delivery is not configured." }, { status: 503, headers });
  const body = validBody(await request.json().catch(() => null));
  if (!body) return NextResponse.json({ error: "Invalid push subscription." }, { status: 400, headers });
  const db = getHotD1Database();
  const owner = await db.prepare("SELECT user_id FROM web_push_subscriptions WHERE endpoint=?1 LIMIT 1").bind(body.endpoint).first<{ user_id: string }>();
  if (owner && owner.user_id !== user.id) return NextResponse.json({ error: "Subscription ownership conflict." }, { status: 409, headers });
  await db.prepare("INSERT INTO web_push_subscriptions(id,user_id,endpoint,p256dh,auth,expiration_time,user_agent) VALUES(?1,?2,?3,?4,?5,?6,?7) ON CONFLICT(endpoint) DO UPDATE SET p256dh=excluded.p256dh,auth=excluded.auth,expiration_time=excluded.expiration_time,user_agent=excluded.user_agent,revoked_at=NULL,updated_at=CURRENT_TIMESTAMP")
    .bind(crypto.randomUUID(), user.id, body.endpoint, body.p256dh, body.auth, body.expirationTime, request.headers.get("user-agent")?.slice(0, 300) ?? null).run();
  return NextResponse.json({ ok: true }, { headers });
}

export async function DELETE(request: Request) {
  try { assertSameOriginMutation(request); } catch { return NextResponse.json({ error: "Request origin rejected." }, { status: 403, headers }); }
  const user = await optionalUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401, headers });
  const body = await request.json().catch(() => null) as { endpoint?: unknown } | null;
  if (typeof body?.endpoint !== "string") return NextResponse.json({ error: "Endpoint required." }, { status: 400, headers });
  await getHotD1Database().prepare("UPDATE web_push_subscriptions SET revoked_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE user_id=?1 AND endpoint=?2").bind(user.id, body.endpoint).run();
  return NextResponse.json({ ok: true }, { headers });
}
