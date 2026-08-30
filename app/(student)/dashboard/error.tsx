"use client";

import { RouteErrorView } from "@/components/states/route-error-view";

export default function DashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteErrorView title="Your dashboard could not be assembled" message="Your account and verified academic data are unchanged. Retry the dashboard when you are ready." reset={reset} />;
}
