import { NextResponse, type NextRequest } from "next/server";
import { searchAcademicCatalog } from "@/lib/academic/query";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length > 100) return NextResponse.json({ ok: false, error: "Search is limited to 100 characters." }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
  if (q.length < 2) return NextResponse.json({ ok: true, results: [] }, { headers: { "Cache-Control": "private, no-store" } });

  try {
    const results = await searchAcademicCatalog(q, {
      level: request.nextUrl.searchParams.get("level"),
      group: request.nextUrl.searchParams.get("group"),
      attempt: request.nextUrl.searchParams.get("attempt"),
    });
    return NextResponse.json({ ok: true, results }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "Academic search is temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
