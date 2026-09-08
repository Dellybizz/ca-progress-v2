import { getAdminOperator } from "@/lib/authorization/server";
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
    const status = await getIcaiSyncLiveStatus(requestedRunId);
    return json(status);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to read ICAI sync status.";
    return json({ error: message }, 500);
  }
}
