import { EnvironmentBanner } from "@/components/shell/environment-banner";
import { StateCard } from "@/components/states/state-card";

export default function NotFound() {
  return (
    <>
      <EnvironmentBanner />
      <main className="public-content">
        <StateCard title="Page not found" tone="danger">
          This route is not part of the Phase 0 V2 foundation.
        </StateCard>
      </main>
    </>
  );
}
