import { StudentDashboard } from "@/components/dashboard/student-dashboard";
import { getDashboardPageModel } from "@/lib/dashboard/service";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const model = await getDashboardPageModel();
  return <StudentDashboard model={model} />;
}
