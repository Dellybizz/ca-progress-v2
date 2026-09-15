import { optionalUser } from "@/lib/auth/server";
import { getBillingModel } from "@/lib/billing/service";
import { canUseExport } from "@/lib/exports/policy.mjs";
import { createOwnedStudyCsvStream } from "@/lib/exports/service";

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
    return Response.json({ error: "Sign in to export your study history." }, {
      status: 401,
      headers: PRIVATE_HEADERS,
    });
  }

  const billing = await getBillingModel();
  const tier = billing.mode === "ready" ? (billing.currentPlan?.tier_key ?? "free") : "free";
  if (billing.mode !== "ready" || !canUseExport(tier, "study_csv")) {
    return Response.json({ error: "Study CSV export requires Pro or Premium." }, {
      status: 403,
      headers: PRIVATE_HEADERS,
    });
  }

  const csv = createOwnedStudyCsvStream(user.id);
  return new Response(csv, {
    status: 200,
    headers: {
      ...PRIVATE_HEADERS,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="ca-progress-study-sessions.csv"',
    },
  });
}
