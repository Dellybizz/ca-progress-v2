"use client";

import { RouteErrorView } from "@/components/states/route-error-view";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteErrorView error={error} reset={reset} />;
}
