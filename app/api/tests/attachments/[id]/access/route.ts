import { NextResponse } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { createR2PresignedUrl } from "@/lib/resources/r2-presign";
import { getOwnedPhase5Attachment } from "@/lib/tests/phase5";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await optionalUser();
  if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  const { id } = await context.params;
  let attachment;
  try { attachment = await getOwnedPhase5Attachment(user.id, id); }
  catch { return NextResponse.json({ error: "Attachment not found." }, { status: 404, headers: { "Cache-Control": "private, no-store" } }); }
  if (!attachment) return NextResponse.json({ error: "Attachment not found." }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  try {
    const signed = await createR2PresignedUrl({ key: attachment.object_key, method: "GET", expiresInSeconds: 300 });
    return NextResponse.json({ url: signed.url, expiresAt: signed.expiresAt, filename: attachment.filename }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Private attachment access is temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
