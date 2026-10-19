import { NextResponse, type NextRequest } from "next/server";
import { optionalUser } from "@/lib/auth/server";
import { toggleCommunityReaction } from "@/lib/community/service";
import { MOBILE_API_HEADERS } from "@/lib/mobile/contract";
import { nativeCorsHeaders, nativeOptions } from "@/lib/auth/native-cors";
import { assertSameOriginMutation } from "@/lib/auth/csrf";

export const dynamic = "force-dynamic";
const json = (request: NextRequest, body: unknown, status = 200) => NextResponse.json(body, { status, headers: { ...MOBILE_API_HEADERS, ...nativeCorsHeaders(request), "Cache-Control": "private, no-store" } });
export const OPTIONS = (request: NextRequest) => nativeOptions(request);
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!request.headers.get("authorization")) {
    try { assertSameOriginMutation(request); } catch { return json(request, { error: { message: "Cross-site mutation rejected." } }, 403); }
  }
  if (!await optionalUser()) return json(request, { error: { message: "Sign in to react." } }, 401);
  const { emoji } = await request.json().catch(() => ({})) as { emoji?: unknown };
  if (typeof emoji !== "string") return json(request, { error: { message: "Choose a reaction." } }, 400);
  try { return json(request, { active: await toggleCommunityReaction((await params).id, emoji) }); }
  catch (error) { return json(request, { error: { message: error instanceof Error ? error.message : "Reaction could not be saved." } }, 409); }
}
