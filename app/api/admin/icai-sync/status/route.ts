import { getAdminOperator } from "@/lib/authorization/server";
import { getD1RuntimeDatabase } from "@/lib/data/d1/client";
import { getIcaiScheduleOverview } from "@/lib/icai/scheduler";
import { getIcaiSyncLiveStatus } from "@/lib/icai/status-query";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
};

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: NO_STORE_HEADERS,
  });
}

export async function GET(request: Request) {
  const operator = await getAdminOperator();
  if (!operator.allowed) return json({ error: "Forbidden" }, 403);

  const url = new URL(request.url);
  const requestedRunId = url.searchParams.get("runId")?.trim() ?? null;
  if (requestedRunId && requestedRunId.length > 160) {
    return json({ error: "Invalid runId" }, 400);
  }

  try {
    const [status, scheduleResult] = await Promise.all([
      getIcaiSyncLiveStatus(requestedRunId),
      getIcaiScheduleOverview(getD1RuntimeDatabase())
        .then((value) => ({ value, error: null }))
        .catch((error: unknown) => ({
          value: null,
          error:
            error instanceof Error
              ? error.message
              : "Unable to read the distributed schedule.",
        })),
    ]);
    const schedule = scheduleResult.value;
    const next = schedule?.nextScheduledGroup;
    return json({
      ...status,
      scheduleError: scheduleResult.error,
      nextScheduledGroup: next
        ? { id: next.key, label: next.label, dueAt: next.scheduledFor }
        : null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to read ICAI sync status.";
    return json({ error: message }, 500);
  }
}
