import { NextResponse } from "next/server";
import { getStudentContext } from "@/lib/academic/student-context";
import { getServerGuestId } from "@/lib/auth/guest-server";
import { MOBILE_API_HEADERS, publicStudentContext } from "@/lib/mobile/contract";
export const dynamic = "force-dynamic";
export async function GET() {
  const context = await getStudentContext();
  const guestId = context.mode === "guest" ? await getServerGuestId() : null;
  return NextResponse.json({ ...publicStudentContext(context), guestId }, { headers: MOBILE_API_HEADERS });
}
