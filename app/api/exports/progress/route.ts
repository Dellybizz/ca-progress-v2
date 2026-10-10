import { optionalUser } from "@/lib/auth/server";
import { getPlanFeatureAccessForUser } from "@/lib/billing/feature-access";
import { createOwnedProgressPdf } from "@/lib/exports/service";

export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
};

export async function GET() {
  const user = await optionalUser();
  if (!user) {
    return Response.json({ error: "Sign in to export your progress." }, {
      status: 401,
      headers: PRIVATE_HEADERS,
    });
  }

  const access = await getPlanFeatureAccessForUser(user.id, "progress_pdf");
  if (!access.allowed) {
    return Response.json({ error: access.upgradeMessage }, {
      status: 403,
      headers: PRIVATE_HEADERS,
    });
  }

  const pdf = await createOwnedProgressPdf(user.id);
  return new Response(pdf as BodyInit, {
    status: 200,
    headers: {
      ...PRIVATE_HEADERS,
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="ca-progress-progress.pdf"',
    },
  });
}
