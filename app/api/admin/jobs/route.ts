import { NextResponse } from "next/server";
import { requireAdminOperator } from "@/lib/authorization/server";
import { getBackgroundJobStatus, getOpenDeadLetters } from "@/lib/jobs/status";

export const dynamic = "force-dynamic";

export async function GET() {
  const operator = await requireAdminOperator();
  if (!operator.allowed) return NextResponse.json({ error: "Access denied." }, { status: 403 });
  const [jobs, deadLetters] = await Promise.all([getBackgroundJobStatus(), getOpenDeadLetters()]);
  return NextResponse.json({ jobs, deadLetters }, { headers: { "Cache-Control": "private, no-store" } });
}
