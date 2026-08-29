import { StateCard } from "@/components/states/state-card";

export default function AdminPlaceholderPage() {
  return (
    <div className="placeholder-page">
      <header>
        <p className="eyebrow">Admin · Phase 0</p>
        <h1 className="page-title">Privileged surface boundary prepared.</h1>
        <p className="page-lead">The admin route exists independently, but user authentication and role enforcement are intentionally implemented in later phases.</p>
      </header>
      <StateCard title="Permission state" tone="permission">
        No privileged data is available in Phase 0. Database tables use RLS from migration one, and the service-role client is server-only.
      </StateCard>
    </div>
  );
}
