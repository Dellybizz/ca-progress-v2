"use client";

import { RouteErrorView } from "@/components/states/route-error-view";

export default function TestsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteErrorView title="Tests could not be loaded" message="Your test records are unchanged. Retry the tests page." reset={reset} />;
}
