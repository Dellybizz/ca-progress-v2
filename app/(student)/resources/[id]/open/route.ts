import { getD1RuntimeDatabase } from "@/lib/data/d1/client";
import { isApprovedIcaiUrl } from "@/lib/icai/html";

export const dynamic = "force-dynamic";

type ResourceOpenRow = {
  resource_row_id: string;
  canonical_resource_id: string;
  direct_file_url: string | null;
  source_page_url: string | null;
  health_status: string;
  is_current: number;
  official_url: string;
  status: string;
  verification_status: string;
};

function failure(status: number, message: string) {
  return Response.json({ error: message }, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const resourceId = id.trim();
  if (!resourceId || resourceId.length > 256) return failure(400, "Invalid resource identifier.");

  const db = getD1RuntimeDatabase();
  const row = await db.prepare(`
    SELECT
      a.resource_row_id,
      a.canonical_resource_id,
      a.direct_file_url,
      a.source_page_url,
      a.health_status,
      a.is_current,
      r.official_url,
      r.status,
      r.verification_status
    FROM autofetch_resource_records a
    JOIN icai_resources r ON r.id=a.resource_row_id
    WHERE (a.canonical_resource_id=?1 OR r.id=?1)
      AND a.is_current=1
      AND r.status='active'
      AND r.verification_status='verified'
    ORDER BY r.last_seen_at DESC
    LIMIT 1
  `).bind(resourceId).first<ResourceOpenRow>();

  if (!row) return failure(404, "Official resource is not available.");
  if (row.health_status === "broken" || row.health_status === "review_required") {
    return failure(503, "The official resource location is being re-verified. Please try again shortly.");
  }

  // Direct document is preferred. `official_url` is a compatibility fallback for
  // already-verified historical rows while discovery resolves a dedicated file URL.
  const destination = row.direct_file_url || row.official_url;
  if (!destination || !isApprovedIcaiUrl(destination)) {
    return failure(502, "The official resource destination failed verification.");
  }

  return new Response(null, {
    status: 307,
    headers: {
      Location: destination,
      "Cache-Control": "no-store, max-age=0",
      "Referrer-Policy": "no-referrer",
    },
  });
}
