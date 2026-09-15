"use client";

import { RouteErrorView } from "@/components/states/route-error-view";

export default function SettingsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteErrorView title="Settings could not be loaded" message="Your profile and preferences are unchanged. Retry the settings page." reset={reset} />;
}
