import { getHealthSnapshot } from "@/server/health/get-health-snapshot";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const correlationId = request.headers.get("x-request-id") || crypto.randomUUID();
  const snapshot = await getHealthSnapshot(correlationId);
  return Response.json(snapshot, {
    status: snapshot.status === "ok" ? 200 : 503,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Request-Id": correlationId,
    },
  });
}
