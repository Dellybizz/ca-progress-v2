import { NextResponse, type NextRequest } from "next/server";
import { rotateCloudflareSession } from "@/lib/auth/cloudflare";
import { nativeCorsHeaders, nativeOptions } from "@/lib/auth/native-cors";
import { MOBILE_API_HEADERS } from "@/lib/mobile/contract";

export const dynamic = "force-dynamic";
const json = (request: NextRequest, data: unknown, status = 200) => NextResponse.json(data, { status, headers: { ...MOBILE_API_HEADERS, ...nativeCorsHeaders(request) } });
export const OPTIONS = (request: NextRequest) => nativeOptions(request);

export async function POST(request: NextRequest) {
  try {
    const session = await rotateCloudflareSession();
    return json(request, { accessToken: session.rawToken, tokenType: "Bearer", sessionId: session.sessionId, expiresAt: session.expiresAt, absoluteExpiresAt: session.absoluteExpiresAt });
  } catch {
    return json(request, { error: { code: "NATIVE_ROTATION_REJECTED", message: "The native session could not be rotated.", retryable: false } }, 401);
  }
}
