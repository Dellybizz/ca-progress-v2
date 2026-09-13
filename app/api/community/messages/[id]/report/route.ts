import { NextResponse } from "next/server";
import { reportCommunityMessage } from "@/lib/community/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null) as { reason?: unknown; details?: unknown } | null;
  if (!body || typeof body.reason !== "string") return NextResponse.json({ error: "Report reason is required." }, { status: 400 });
  try {
    const result = await reportCommunityMessage(id, body.reason, typeof body.details === "string" ? body.details : null);
    const reportId = typeof result === "string" ? result : result?.id;
    if (!reportId) throw new Error("Message report did not return an id.");
    return NextResponse.json({ ok: true, reportId, status: typeof result === "string" ? "open" : result.status }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Message could not be reported.";
    return NextResponse.json({ error: message }, { status: /sign in/i.test(message) ? 401 : /denied/i.test(message) ? 403 : 400, headers: { "Cache-Control": "private, no-store" } });
  }
}
