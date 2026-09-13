"use client";

import { useState } from "react";

export function WeekSummaryShare({ text }: { text: string }) {
  const [status, setStatus] = useState<string | null>(null);

  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ title: "Your First CA Progress Week", text });
        setStatus("Shared");
        return;
      }
      await navigator.clipboard.writeText(text);
      setStatus("Copied");
    } catch {
      setStatus("Share cancelled");
    }
  }

  return <span className="button-row"><button type="button" className="ui-button ui-button--secondary" onClick={() => void share()}>Share week summary</button>{status ? <small aria-live="polite">{status}</small> : null}</span>;
}
