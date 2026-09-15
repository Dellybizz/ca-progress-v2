import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Multipart uploads are intentionally disabled: use upload-url, browser PUT to R2, then upload-complete. */
export async function POST() {
  return NextResponse.json(
    { error: "Use the direct R2 upload flow.", code: "DIRECT_UPLOAD_REQUIRED", uploadUrlEndpoint: "/api/resources/upload-url", completionEndpoint: "/api/resources/upload-complete" },
    { status: 410, headers: { "Cache-Control": "private, no-store" } },
  );
}
