import type { Metadata } from "next";
import { IcaiAdminSyncData } from "@/components/icai/admin-sync-data";
import { requireAdminPageCapability } from "@/lib/authorization/server";
import { getIcaiAdminDashboard, getIcaiPublicCatalog } from "@/lib/icai/query";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "ICAI Synced Data & Review | CA Progress" };

function param(value: string | string[] | undefined) {
  return typeof value === "string" ? value : null;
}

export default async function IcaiSyncDataPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPageCapability("icai.read");
  const [dashboard, catalog, params] = await Promise.all([
    getIcaiAdminDashboard(),
    getIcaiPublicCatalog(),
    searchParams,
  ]);

  return (
    <IcaiAdminSyncData
      dashboard={dashboard}
      catalog={catalog}
      notice={param(params.notice)}
      error={param(params.error)}
    />
  );
}
