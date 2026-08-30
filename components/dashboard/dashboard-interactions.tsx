"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Icon, type IconName } from "@/components/ui/icon";
import type { DashboardQuickAction } from "@/lib/dashboard/types";

const actionIcons: Record<DashboardQuickAction["key"], IconName> = {
  start_study: "timer",
  add_task: "plus",
  add_note: "notes",
  open_progress: "chart",
};

function recordDashboardEvent(eventType: "dashboard_view" | "quick_action", actionKey?: DashboardQuickAction["key"]) {
  void fetch("/api/dashboard/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventType, actionKey }),
    credentials: "same-origin",
    cache: "no-store",
    keepalive: true,
  }).catch(() => undefined);
}

export function DashboardViewTracker() {
  useEffect(() => {
    recordDashboardEvent("dashboard_view");
  }, []);
  return null;
}

export function DashboardQuickActions({ actions }: { actions: DashboardQuickAction[] }) {
  return (
    <div className="dashboard-quick-actions">
      {actions.map((action) => (
        <Link
          key={action.key}
          href={action.href}
          className="dashboard-quick-action"
          onClick={() => recordDashboardEvent("quick_action", action.key)}
        >
          <span className="dashboard-quick-action__icon"><Icon name={actionIcons[action.key]} size={19} /></span>
          <span><strong>{action.label}</strong><small>{action.description}</small></span>
          <Icon name="chevron" size={16} />
        </Link>
      ))}
    </div>
  );
}
