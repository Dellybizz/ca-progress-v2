import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getCommunityChannelAccess } from "@/lib/community/service";

export const runtime = "edge";
export const dynamic = "force-dynamic";

type DurableNamespace = {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response> };
};

export async function GET(request: Request, { params }: { params: Promise<{ channel: string }> }) {
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
    return new Response("WebSocket upgrade required.", { status: 426 });
  }
  const { channel } = await params;
  const access = await getCommunityChannelAccess(channel);
  if (!access.allowed) return new Response(access.reason, { status: access.status });
  const { env } = getCloudflareContext();
  const namespace = (env as unknown as { COMMUNITY_COORDINATORS?: DurableNamespace }).COMMUNITY_COORDINATORS;
  if (!namespace) return new Response("Community realtime is unavailable.", { status: 503 });
  const id = namespace.idFromName(channel);
  return namespace.get(id).fetch(request);
}
