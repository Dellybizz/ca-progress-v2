import { optionalUser } from "@/lib/auth/server";
import { getBillingModel } from "@/lib/billing/service";
import { canUseExport } from "@/lib/exports/policy.mjs";
import { createOwnedFullBackupStream } from "@/lib/exports/service";

export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
};

export async function GET() {
  const user = await optionalUser();
  if (!user) {
    return Response.json({ error: "Sign in to download your full backup." }, {
      status: 401,
      headers: PRIVATE_HEADERS,
    });
  }

  const billing = await getBillingModel();
  const tier = billing.mode === "ready" ? (billing.currentPlan?.tier_key ?? "free") : "free";
  if (billing.mode !== "ready" || !canUseExport(tier, "full_backup")) {
    return Response.json({ error: "Full Backup requires Premium." }, {
      status: 403,
      headers: PRIVATE_HEADERS,
    });
  }

  return new Response(createOwnedFullBackupStream(user.id), {
    status: 200,
    headers: {
      ...PRIVATE_HEADERS,
      "Content-Type": "application/x-tar",
      "Content-Disposition": 'attachment; filename="ca-progress-full-backup.tar"',
    },
  });
}
