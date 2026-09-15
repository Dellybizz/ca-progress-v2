import type { Metadata } from "next";
import { IcaiAdminSyncData } from "@/components/icai/admin-sync-data";
import { requireAdminPageCapability } from "@/lib/authorization/server";
import { getIcaiAdminDashboard, getIcaiPublicCatalog } from "@/lib/icai/query";
import { listAdminExamDateEstimates } from "@/lib/icai/exam-date-estimates";

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
    type: param(params.type),
  };
  const [dashboard, catalog, estimates] = await Promise.all([
    getIcaiAdminDashboard(),
    getIcaiPublicCatalog(filters),
    listAdminExamDateEstimates(),
  ]);

  return (
    <IcaiAdminSyncData
      dashboard={dashboard}
      catalog={catalog}
      estimates={estimates}
      notice={param(params.notice)}
      error={param(params.error)}
    />
  );
}
