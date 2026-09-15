"use client";

import { Icon } from "@/components/ui/icon";
import { useViewer } from "./viewer-client";

export function ViewerStatus() {
  const viewer = useViewer();

  return (
    <div className="sidebar-status">
      <span className="sidebar-status__icon"><Icon name={viewer.authenticated ? "shield" : "sparkles"} size={16}/></span>
      <div><strong>{viewer.authenticated ? "Signed in" : "Guest mode"}</strong><span>{viewer.authenticated ? "Sync enabled" : "Local access"}</span></div>
    </div>
  );
}
