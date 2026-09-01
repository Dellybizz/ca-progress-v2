import { NextResponse, type NextRequest } from "next/server";
import { assertSameOriginMutation } from "@/lib/auth/csrf";
import { rotateCloudflareSession } from "@/lib/auth/cloudflare";
import { isCloudflareAuthRuntime } from "@/lib/auth/provider";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isCloudflareAuthRuntime()) return NextResponse.json({ ok: false, error: "Worker sessions are not active." }, { status: 409 });
  try {
    assertSameOriginMutation(request);
    await rotateCloudflareSession();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Session rotation failed." }, { status: 401 });
  }
}
