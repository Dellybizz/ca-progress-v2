"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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

type LeaderboardEntry = { rank: number; displayName: string; totalXp: number; levelName: string };

export function DashboardLeaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "empty" | "error">("loading");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/leaderboard?category=overall", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { ok?: boolean; leaderboard?: { entries?: LeaderboardEntry[] } };
        if (!response.ok || !payload.ok) throw new Error("Leaderboard unavailable");
        const next = payload.leaderboard?.entries?.slice(0, 5) ?? [];
        setEntries(next);
        setStatus(next.length ? "ready" : "empty");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setStatus("error");
      });
    return () => controller.abort();
  }, []);

  if (status === "loading") return <div className="dashboard-leaderboard-state" aria-live="polite">Loading rankings…</div>;
  if (status === "empty") return <div className="dashboard-leaderboard-state">No opted-in rankings yet.</div>;
  if (status === "error") return <div className="dashboard-leaderboard-state">Rankings are temporarily unavailable.</div>;

  return (
    <ol className="dashboard-leaderboard-list">
      {entries.map((entry) => (
        <li key={`${entry.rank}:${entry.displayName}`}>
          <span className="dashboard-leaderboard-rank">{entry.rank}</span>
          <span className="dashboard-leaderboard-avatar" aria-hidden="true">{entry.displayName.slice(0, 1).toUpperCase()}</span>
          <span className="dashboard-leaderboard-person"><strong>{entry.displayName}</strong><small>{entry.levelName}</small></span>
          <strong className="dashboard-leaderboard-xp">{entry.totalXp.toLocaleString("en-IN")} XP</strong>
        </li>
      ))}
    </ol>
  );
}
