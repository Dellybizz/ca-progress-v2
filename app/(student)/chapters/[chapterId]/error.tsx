"use client";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

export default function ErrorState({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="chapter-hub-page">
    <div className="chapter-hub-error" role="alert">
      <Icon name="book" size={28}/>
      <h2>Chapter Hub could not be loaded</h2>
      <p>Your saved progress, notes, study history and files have not been changed. Retry the request.</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  </div>;
}
