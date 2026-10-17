import { NextResponse } from "next/server";
import { APP_RELEASE_CONTRACT } from "@/config/app-release";
import { getStudentContext } from "@/lib/academic/student-context";
import { loadViewer } from "@/lib/auth/server";
import { MOBILE_API_HEADERS, publicStudentContext } from "@/lib/mobile/contract";

export const dynamic = "force-dynamic";

export async function GET() {
  const [viewer, context] = await Promise.all([loadViewer(), getStudentContext()]);
  return NextResponse.json({
    release: APP_RELEASE_CONTRACT,
    viewer,
    academicContext: publicStudentContext(context),
  }, { headers: MOBILE_API_HEADERS });
}
