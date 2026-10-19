import { NextResponse, type NextRequest } from "next/server";
import { exchangeNativeAuthTransaction } from "@/lib/auth/cloudflare";
import { nativeCorsHeaders, nativeOptions } from "@/lib/auth/native-cors";
import { MOBILE_API_HEADERS } from "@/lib/mobile/contract";

export const dynamic = "force-dynamic";
const json = (request: NextRequest, data: unknown, status = 200) => NextResponse.json(data, { status, headers: { ...MOBILE_API_HEADERS, ...nativeCorsHeaders(request) } });
export const OPTIONS = (request: NextRequest) => nativeOptions(request);

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { transactionId?: string; exchangeCode?: string; verifier?: string } | null;
  try {
    const session = await exchangeNativeAuthTransaction({ transactionId: String(body?.transactionId || ""), exchangeCode: String(body?.exchangeCode || ""), verifier: String(body?.verifier || "") });
    return json(request, session);
  } catch {
    return json(request, { error: { code: "NATIVE_EXCHANGE_REJECTED", message: "The sign-in exchange is invalid, expired, or already used.", retryable: false } }, 401);
  }
}
