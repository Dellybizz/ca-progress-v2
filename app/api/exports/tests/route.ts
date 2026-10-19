import { optionalUser } from "@/lib/auth/server";
import { getPlanFeatureAccessForUser } from "@/lib/billing/feature-access";
import { createOwnedTestHistoryCsvStream } from "@/lib/exports/service";

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
    return Response.json({ error: "Sign in to export your test history." }, {
      status: 401,
      headers: PRIVATE_HEADERS,
    });
  }

  const access = await getPlanFeatureAccessForUser(user.id, "test_history_csv");
  if (!access.allowed) {
    return Response.json({ error: access.upgradeMessage }, {
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
