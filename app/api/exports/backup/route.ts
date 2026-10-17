import { optionalUser } from "@/lib/auth/server";
import { getPlanFeatureAccessForUser } from "@/lib/billing/feature-access";
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

  const access = await getPlanFeatureAccessForUser(user.id, "full_backup");
  if (!access.allowed) {
    return Response.json({ error: access.upgradeMessage }, {
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
