import { optionalUser } from "@/lib/auth/server";
import { getBillingModel } from "@/lib/billing/service";
import { canUseExport } from "@/lib/exports/policy.mjs";
import { createOwnedTestHistoryCsvStream } from "@/lib/exports/service";

export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
};

export async function GET() {
  const user = await optionalUser();
  if (!user) {
    return Response.json({ error: "Sign in to export your test history." }, {
      status: 401,
      headers: PRIVATE_HEADERS,
    });
  }

  const billing = await getBillingModel();
  const tier = billing.currentPlan?.tier_key ?? "free";
  if (!canUseExport(tier, "test_history_csv")) {
    return Response.json({ error: "Test History CSV export requires Pro or Premium." }, {
      status: 403,
      headers: PRIVATE_HEADERS,
    });
  }

  const csv = createOwnedTestHistoryCsvStream(user.id);
  return new Response(csv, {
    status: 200,
    headers: {
      ...PRIVATE_HEADERS,
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="ca-progress-test-history.csv"',
    },
  });
}
