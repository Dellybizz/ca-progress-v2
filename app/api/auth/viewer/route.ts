import { NextResponse } from "next/server";
import { loadViewer } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const viewer = await loadViewer();
    return NextResponse.json(viewer, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json(
      { authenticated: false, label: "Guest", initial: "G" },
      { status: 200, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
