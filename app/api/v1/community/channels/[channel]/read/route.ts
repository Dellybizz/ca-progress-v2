import { NextResponse, type NextRequest } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { markCommunityRead } from "@/lib/community/service";
import { MOBILE_API_HEADERS } from "@/lib/mobile/contract";
import { nativeCorsHeaders, nativeOptions } from "@/lib/auth/native-cors";
import { assertSameOriginMutation } from "@/lib/auth/csrf";

export const dynamic = "force-dynamic";
const json = (request: NextRequest, body: unknown, status = 200) => NextResponse.json(body, { status, headers: { ...MOBILE_API_HEADERS, ...nativeCorsHeaders(request), "Cache-Control": "private, no-store" } });
export const OPTIONS = (request: NextRequest) => nativeOptions(request);
export async function POST(request: NextRequest, { params }: { params: Promise<{ channel: string }> }) {
  if (!request.headers.get("authorization")) {
    try { assertSameOriginMutation(request); } catch { return json(request, { error: { message: "Cross-site mutation rejected." } }, 403); }
  }
  if (!await optionalUser()) return json(request, { error: { message: "Sign in to mark a channel read." } }, 401);
  const { sequence } = await request.json().catch(() => ({})) as { sequence?: unknown };
  if (!Number.isSafeInteger(sequence) || Number(sequence) < 0) return json(request, { error: { message: "Invalid read position." } }, 400);
  try { return json(request, { lastReadSequence: await markCommunityRead((await params).channel, sequence as number) }); }
  catch (error) { return json(request, { error: { message: error instanceof Error ? error.message : "Read position could not be saved." } }, 409); }
}
