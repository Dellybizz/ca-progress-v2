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
  const [, params] = await Promise.all([
    requireAdminPageCapability("icai.read"),
    searchParams,
  ]);
  const filters = {
    level: param(params.level),
    attempt: param(params.attempt),
    subject: param(params.subject),
  };
  const [dashboard, catalog] = await Promise.all([
    getIcaiAdminDashboard(),
    getIcaiPublicCatalog(filters),
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
