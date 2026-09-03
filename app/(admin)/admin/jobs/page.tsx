import { requireAdminOperator } from "@/lib/authorization/server";
import { getBackgroundJobStatus, getOpenDeadLetters } from "@/lib/jobs/status";

export const dynamic = "force-dynamic";

export default async function AdminJobsPage() {
  const operator = await requireAdminOperator();
  if (!operator.allowed) return <main><h1>Access denied</h1></main>;
  const [jobs, deadLetters] = await Promise.all([getBackgroundJobStatus(), getOpenDeadLetters()]);
  return <main style={{ padding: 24 }}>
    <h1>Background jobs</h1>
    <p>Queue execution, retries and dead-lettered work.</p>
    <h2>Recent jobs</h2>
    <pre>{JSON.stringify(jobs, null, 2)}</pre>
    <h2>Open dead letters</h2>
    <pre>{JSON.stringify(deadLetters, null, 2)}</pre>
  </main>;
}
