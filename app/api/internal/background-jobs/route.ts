import { NextResponse } from "next/server";
import { executeBackgroundJob } from "@/lib/jobs/execute";
import type { BackgroundJob } from "@/lib/jobs/queue";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const INTERNAL_MARKER = "ca-progress-v2-background-job";

export async function POST(request: Request) {
  if (request.headers.get("x-ca-progress-internal") !== INTERNAL_MARKER) {
    return NextResponse.json({ ok: false, error: "Internal job request required." }, { status: 403 });
  }
  let job: BackgroundJob;
  try { job = await request.json() as BackgroundJob; } catch {
    return NextResponse.json({ ok: false, error: "Invalid job payload." }, { status: 400 });
  }
  if (!job?.id || !job?.idempotencyKey || !job?.type || typeof job.payload !== "object") {
    return NextResponse.json({ ok: false, error: "Malformed job envelope." }, { status: 400 });
  }
  try {
    const result = await executeBackgroundJob(job);
    return NextResponse.json({ ok: true, result }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Background job failed." }, { status: 500, headers: { "Cache-Control": "private, no-store" } });
  }
}
