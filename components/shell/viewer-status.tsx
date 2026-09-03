"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";

type Viewer = { authenticated: boolean; label: string; initial: string };

const guestViewer: Viewer = { authenticated: false, label: "Guest", initial: "G" };

export function ViewerStatus() {
  const [viewer, setViewer] = useState<Viewer>(guestViewer);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/auth/viewer", { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<Viewer> : null)
      .then((nextViewer) => {
        if (!cancelled && nextViewer) {
          // The viewer endpoint is intentionally hydrated after the shell paints.
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setViewer(nextViewer);
        }
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="sidebar-status">
      <span className="sidebar-status__icon"><Icon name={viewer.authenticated ? "shield" : "sparkles"} size={16}/></span>
      <div><strong>{viewer.authenticated ? "Signed in" : "Guest mode"}</strong><span>{viewer.authenticated ? "Sync enabled" : "Local access"}</span></div>
    </div>
  );
}
