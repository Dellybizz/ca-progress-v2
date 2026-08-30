import { NextResponse } from "next/server";
import { createResourceSignedUrl } from "@/lib/resources/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(request.url);
  const signedUrl = await createResourceSignedUrl(id, url.searchParams.get("download") === "1");
  if (!signedUrl) return NextResponse.json({ error: "Resource not found or access denied." }, { status: 404 });
  return NextResponse.json({ url: signedUrl }, { headers: { "cache-control": "private, no-store" } });
}
