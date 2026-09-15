import { NextResponse } from "next/server";
import { getStudentContext } from "@/lib/academic/student-context";
import { getServerGuestId } from "@/lib/auth/guest-server";
export const dynamic = "force-dynamic";
export async function GET() {
  const context = await getStudentContext();
  const guestId = context.mode === "guest" ? await getServerGuestId() : null;
  return NextResponse.json({ ...context, guestId }, { headers: { "Cache-Control": "private, no-store" } });
}
