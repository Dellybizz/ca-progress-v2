import type { Metadata } from "next";
import { ProgressPage } from "@/components/progress/progress-page";
import { getProgressPageModel } from "@/lib/progress/service";
import { OfflineSnapshot } from "@/components/offline/offline-snapshot";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Progress | CA Progress" };

export default async function Page() {
  const model = await getProgressPageModel();
  return <><OfflineSnapshot kind="progress" data={model}/><ProgressPage model={model}/></>;
}
