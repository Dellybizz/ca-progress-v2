import { NextResponse, type NextRequest } from "next/server";
import { adminAuthorizationStatus } from "@/lib/authorization/server";
import { getAdminPreviewContext } from "@/lib/academic/student-context";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams;
  try {
    const context = await getAdminPreviewContext({
      level: query.get("level"),
      group: query.get("group"),
      attemptKey: query.get("attempt"),
    });
    return NextResponse.json({ ok: true, context }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const status = adminAuthorizationStatus(error) ?? 400;
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Preview context could not be resolved." }, { status });
  }
}
