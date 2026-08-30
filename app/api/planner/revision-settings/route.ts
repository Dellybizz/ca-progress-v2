import { NextResponse } from "next/server";
import { setRevisionSettings } from "@/lib/smart-planner/service";

export const dynamic = "force-dynamic";

type Body = {
  intervalDays?: unknown;
  preferredWeekdays?: unknown;
  revisionMinutes?: unknown;
  newChapterMinutes?: unknown;
  testMinutes?: unknown;
};

function numberArray(value: unknown) {
  return Array.isArray(value) && value.every((item) => typeof item === "number" && Number.isFinite(item)) ? value : null;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Body | null;
  if (!body) return NextResponse.json({ error: "Invalid revision settings request." }, { status: 400 });
  const intervalDays = numberArray(body.intervalDays);
  const preferredWeekdays = numberArray(body.preferredWeekdays);
  const revisionMinutes = Number(body.revisionMinutes);
  const newChapterMinutes = Number(body.newChapterMinutes);
  const testMinutes = Number(body.testMinutes);
  if (!intervalDays || !preferredWeekdays || !Number.isFinite(revisionMinutes) || !Number.isFinite(newChapterMinutes) || !Number.isFinite(testMinutes)) {
    return NextResponse.json({ error: "Check the revision intervals, study days and duration values." }, { status: 400 });
  }
  try {
    const data = await setRevisionSettings({ intervalDays, preferredWeekdays, revisionMinutes, newChapterMinutes, testMinutes });
    return NextResponse.json({ ok: true, data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Revision settings could not be saved.";
    return NextResponse.json({ error: message }, { status: /sign in/i.test(message) ? 401 : 400, headers: { "Cache-Control": "private, no-store" } });
  }
}
