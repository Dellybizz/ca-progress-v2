import { StudentDashboard } from "@/components/dashboard/student-dashboard";
import { getDashboardPageModel } from "@/lib/dashboard/service";
import { OfflineSnapshot } from "@/components/offline/offline-snapshot";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const model = await getDashboardPageModel();
  return <><OfflineSnapshot kind="dashboard" data={model}/><StudentDashboard model={model} /></>;
}
