import { adminAuthorizationStatus, requireAdminCapability } from "@/lib/authorization/server";
import { getIcaiSyncLiveStatus } from "@/lib/icai/status-query";

export const dynamic = "force-dynamic";
const NO_STORE_HEADERS = { "Cache-Control": "private, no-store, max-age=0" };
function json(body: unknown, status = 200) { return Response.json(body, { status, headers: NO_STORE_HEADERS }); }

export async function GET(request: Request) {
  try { await requireAdminCapability("icai.read"); }
  catch (error) { return json({ error: adminAuthorizationStatus(error) === 401 ? "Authentication required." : "Forbidden" }, adminAuthorizationStatus(error) ?? 403); }
  const url = new URL(request.url);
  const requestedRunId = url.searchParams.get("runId")?.trim() ?? null;
  if (requestedRunId && requestedRunId.length > 160) return json({ error: "Invalid runId" }, 400);
  try { return json(await getIcaiSyncLiveStatus(requestedRunId)); }
  catch (error) { return json({ error: error instanceof Error ? error.message : "Unable to read ICAI sync status." }, 500); }
}
