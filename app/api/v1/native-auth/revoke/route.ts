import { NextResponse, type NextRequest } from "next/server";
import { revokeCurrentNativeSession } from "@/lib/auth/cloudflare";
import { nativeCorsHeaders, nativeOptions } from "@/lib/auth/native-cors";
import { MOBILE_API_HEADERS } from "@/lib/mobile/contract";

export const dynamic = "force-dynamic";
const json = (request: NextRequest, data: unknown, status = 200) => NextResponse.json(data, { status, headers: { ...MOBILE_API_HEADERS, ...nativeCorsHeaders(request) } });
export const OPTIONS = (request: NextRequest) => nativeOptions(request);

export async function POST(request: NextRequest) {
  try { await revokeCurrentNativeSession(); return json(request, { ok: true }); }
  catch { return json(request, { error: { code: "NATIVE_REVOKE_REJECTED", message: "The native session could not be revoked.", retryable: false } }, 401); }
}
