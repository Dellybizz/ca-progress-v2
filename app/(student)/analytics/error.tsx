"use client";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

export default function ErrorState({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="progress-page"><div className="progress-empty"><Icon name="bell" size={28}/><h2>Analytics could not be loaded</h2><p>Your progress rows are unchanged. Retry the derived analytics query.</p><Button onClick={reset}>Try again</Button></div></div>;
}
