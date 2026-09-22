import { NextResponse } from "next/server";
import { getDashboardPageModel } from "@/lib/dashboard/service";
import { publicStudentContext, MOBILE_API_HEADERS } from "@/lib/mobile/contract";
import { getStudentContext } from "@/lib/academic/student-context";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [data, context] = await Promise.all([getDashboardPageModel(), getStudentContext()]);
    return NextResponse.json({ data, academicContext: publicStudentContext(context) }, { headers: MOBILE_API_HEADERS });
  } catch {
    return NextResponse.json({ error: { code: "DASHBOARD_UNAVAILABLE", message: "Dashboard is temporarily unavailable.", retryable: true } }, { status: 503, headers: MOBILE_API_HEADERS });
  }
}
