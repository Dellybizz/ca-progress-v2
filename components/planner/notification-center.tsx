"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import type { NotificationPreferences, PlannerNotification } from "@/lib/planner/types";

export function NotificationCenter({ notifications, preferences, compact = false }: { notifications: PlannerNotification[]; preferences: NotificationPreferences; compact?: boolean }) {
  const router = useRouter();
  const [settings, setSettings] = useState(preferences);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unread = notifications.filter((item) => !item.readAt);

  async function request(body: Record<string, unknown>) {
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/planner/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Notification settings could not be saved.");
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Notification settings could not be saved."); }
    finally { setBusy(false); }
  }

  async function savePreferences() { await request({ action: "preferences", ...settings }); }

  return <Card>
    <CardHeader title="Notifications" description="Private, actionable reminders from your own planner, goals and doubts." action={unread.length ? <button className="ui-text-link" type="button" disabled={busy} onClick={() => void request({ action: "read_all" })}>Mark all read</button> : undefined}/>
    <CardBody>
      {notifications.length ? <div className="phase6-task-list">{notifications.slice(0, compact ? 5 : 10).map((item) => <article key={item.id} className={`phase6-task ${item.readAt ? "" : "planner-notification--unread"}`}>
        <div><strong>{item.title}</strong><p>{item.body}</p><small>{new Date(item.createdAt).toLocaleString()}</small></div>
        <div className="planner-task__actions"><Link className="ui-text-link" href={item.actionHref} onClick={() => { if (!item.readAt) void request({ action: "read", id: item.id }); }}>Open</Link></div>
      </article>)}</div> : <p>No actionable reminders right now.</p>}
      {!compact ? <details className="planner-notification-settings">
        <summary>Notification preferences</summary>
        <div className="phase6-form">
          <label><input type="checkbox" checked={settings.revisionDue} onChange={(event) => setSettings((value) => ({ ...value, revisionDue: event.target.checked }))}/> Revision due</label>
          <label><input type="checkbox" checked={settings.testTomorrow} onChange={(event) => setSettings((value) => ({ ...value, testTomorrow: event.target.checked }))}/> Test tomorrow</label>
          <label><input type="checkbox" checked={settings.goalNearCompletion} onChange={(event) => setSettings((value) => ({ ...value, goalNearCompletion: event.target.checked }))}/> Goal near completion</label>
          <label><input type="checkbox" checked={settings.doubtAnswered} onChange={(event) => setSettings((value) => ({ ...value, doubtAnswered: event.target.checked }))}/> Doubt answered</label>
          <label><input type="checkbox" checked={settings.buddyActivity} onChange={(event) => setSettings((value) => ({ ...value, buddyActivity: event.target.checked }))}/> Buddy activity (when Buddy activity is available)</label>
          <label><span>Frequency</span><select value={settings.frequency} onChange={(event) => setSettings((value) => ({ ...value, frequency: event.target.value as NotificationPreferences["frequency"] }))}><option value="realtime">Real time</option><option value="daily_digest">Daily digest</option><option value="off">Off</option></select></label>
          <label><span>Maximum per day</span><input type="number" min="1" max="20" value={settings.maxPerDay} onChange={(event) => setSettings((value) => ({ ...value, maxPerDay: Number(event.target.value) }))}/></label>
          {error ? <div className="phase6-inline-error">{error}</div> : null}
          <button className="ui-button ui-button--secondary" type="button" disabled={busy} onClick={() => void savePreferences()}>{busy ? "Saving…" : "Save preferences"}</button>
        </div>
      </details> : null}
    </CardBody>
  </Card>;
}
