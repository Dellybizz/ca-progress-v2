import { NextResponse } from "next/server";
import { adminAuthorizationStatus, requireAdminCapability } from "@/lib/authorization/server";
import { getBackgroundJobStatus, getOpenDeadLetters } from "@/lib/jobs/status";

export const dynamic = "force-dynamic";
const privateHeaders = { "Cache-Control": "private, no-store" };

export async function GET() {
  try { await requireAdminCapability("jobs.read"); }
  catch (error) {
    const status = adminAuthorizationStatus(error) ?? 403;
    return NextResponse.json({ error: status === 401 ? "Authentication required." : "Jobs access required." }, { status, headers: privateHeaders });
  }
  const [jobs, deadLetters] = await Promise.all([getBackgroundJobStatus(), getOpenDeadLetters()]);
  return NextResponse.json({ jobs, deadLetters }, { headers: privateHeaders });
}
