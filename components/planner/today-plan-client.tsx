"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import type { TodayPlanAction, TodayPlanItem, TodayPlanReadyModel } from "@/lib/smart-planner/types";

function tomorrow() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

function priorityLabel(score: number) {
  if (score >= 120) return "Critical";
  if (score >= 100) return "High";
  if (score >= 80) return "Medium";
  return "Suggested";
}

function statusLabel(status: TodayPlanReadyModel["forecast"]["status"]) {
  return ({ complete: "Syllabus complete", on_track: "On track", at_risk: "At risk", behind: "Behind pace", no_date: "Date unavailable" } as const)[status];
}

function reasonLabel(reasonCode: string) {
  const known: Record<string, string> = {
    revision_due: "Revision due",
    task_due_today: "Scheduled today",
    manual_reschedule: "Moved by you",
    unfinished_syllabus: "Syllabus remaining",
    test_due: "Test due",
    test_due_today: "Test due",
    overdue_task: "Overdue",
    overdue_revision: "Revision overdue",
  };
  if (known[reasonCode]) return known[reasonCode];
  return reasonCode.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function stateLabel(status: TodayPlanItem["status"]) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(parsed);
}

function formatSchedule(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
}

export function TodayPlanClient({ model }: { model: TodayPlanReadyModel }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [customDates, setCustomDates] = useState<Record<string, string>>({});

  async function run(action: TodayPlanAction, busyKey = "refresh") {
    setBusyId(busyKey);
    setError(null);
    try {
      const response = await fetch("/api/planner/today", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action),
      });
      const text = await response.text();
      let payload: { error?: string } = {};
      if (text) {
        try { payload = JSON.parse(text) as { error?: string }; } catch { payload = {}; }
      }
      if (!response.ok) throw new Error(payload.error || "Today Plan could not be updated.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Today Plan could not be updated.");
    } finally {
      setBusyId(null);
    }
  }

  function actions(item: TodayPlanItem) {
    if (item.status !== "planned") return <span className={`phase9-state phase9-state--${item.status}`}>{stateLabel(item.status)}</span>;
    const customDate = customDates[item.id] || tomorrow();
    return <div className="phase9-item-actions today-plan-actions">
      <button disabled={Boolean(busyId)} onClick={() => void run({ action: "complete", itemId: item.id }, item.id)}><Icon name="check" size={15}/>Complete</button>
      <button disabled={Boolean(busyId)} onClick={() => void run({ action: "snooze", itemId: item.id, minutes: 60 }, item.id)}><Icon name="clock" size={15}/>Snooze 1h</button>
      <button disabled={Boolean(busyId)} onClick={() => void run({ action: "reschedule", itemId: item.id, date: tomorrow() }, item.id)}><Icon name="calendar" size={15}/>Tomorrow</button>
      <label className="phase9-date-action"><span className="sr-only">Move to another date</span><input type="date" value={customDate} onChange={(event) => setCustomDates((current) => ({ ...current, [item.id]: event.target.value }))}/><button type="button" disabled={Boolean(busyId)} onClick={() => void run({ action: "reschedule", itemId: item.id, date: customDate }, item.id)}>Move</button></label>
      <button className="phase9-action-muted" disabled={Boolean(busyId)} onClick={() => void run({ action: "skip", itemId: item.id }, item.id)}>Skip</button>
    </div>;
  }

  const activeItems = model.items.filter((item) => item.status === "planned").length;

  return <div className="phase9-today-layout today-plan-layout">
    <div className="phase9-today-main">
      <section className="phase9-metrics today-plan-metrics" aria-label="Today plan summary">
        <Card><CardBody><Icon name="target"/><div><span>Planned time</span><strong>{model.plannedMinutes}m</strong><small>{model.targetMinutes}m target</small></div></CardBody></Card>
        <Card><CardBody><Icon name="clock"/><div><span>Revisions</span><strong>{model.dueRevisionCount}</strong><small>due today</small></div></CardBody></Card>
        <Card><CardBody><Icon name="sparkles"/><div><span>Plan items</span><strong>{activeItems}</strong><small>remaining</small></div></CardBody></Card>
      </section>

      {model.warnings.length ? <div className="phase9-warning-stack">{model.warnings.map((warning) => <div key={warning} className="phase9-warning"><Icon name="bell" size={17}/><span>{warning}</span></div>)}</div> : null}
      {error ? <div className="phase9-error" role="alert">{error}</div> : null}

      <Card className="today-plan-list-card">
        <CardHeader title="Study order" action={<button className="ui-button ui-button--secondary today-plan-refresh" disabled={Boolean(busyId)} onClick={() => void run({ action: "refresh" })}>{busyId === "refresh" ? "Refreshing…" : "Refresh plan"}</button>}/>
        <CardBody>
          {model.items.length ? <div className="phase9-timeline today-plan-timeline">{model.items.map((item, index) => <article key={item.id} className={`phase9-plan-item phase9-plan-item--${item.status} ${item.manualOverride ? "is-manual" : ""}`}>
            <div className="phase9-timeline-marker"><span>{index + 1}</span></div>
            <div className="phase9-plan-content today-plan-item">
              <div className="phase9-plan-heading"><div><span className={`phase9-kind phase9-kind--${item.itemKind}`}>{item.itemKind.replace("_", " ")}</span><h3>{item.title}</h3></div><strong>{item.estimatedMinutes}m</strong></div>
              <div className="phase9-item-meta today-plan-item-meta"><span>{item.subjectTitle ?? "General"}</span>{item.chapterTitle ? <span>· {item.chapterTitle}</span> : null}{item.scheduledAt ? <span>· {formatSchedule(item.scheduledAt)}</span> : null}</div>
              <div className="phase9-chip-row today-plan-chip-row"><span className={`phase9-priority phase9-priority--${priorityLabel(item.priorityScore).toLowerCase()}`}>{priorityLabel(item.priorityScore)}</span><span className="phase9-reason-chip">{reasonLabel(item.reasonCode)}</span>{item.manualOverride ? <span className="phase9-manual-chip">Adjusted</span> : null}</div>
              {item.manualNote ? <div className="phase9-manual-note">{item.manualNote}</div> : null}
              {actions(item)}
            </div>
          </article>)}</div> : <div className="phase9-empty"><Icon name="check"/><strong>Your plan is clear</strong><p>Nothing needs your attention right now. Add a task if you want to plan more study.</p><Link href="/planner">Open planner</Link></div>}
        </CardBody>
      </Card>
    </div>

    <aside className="phase9-today-side today-plan-side">
      <Card className="today-plan-forecast-card"><CardHeader title="Forecast" description={model.forecast.attemptLabel}/><CardBody><div className={`phase9-forecast-status phase9-forecast-status--${model.forecast.status}`}><strong>{statusLabel(model.forecast.status)}</strong><span>{model.forecast.completionPercent}% complete</span></div><div className="phase9-progress-track"><span style={{ width: `${Math.min(100, Math.max(0, model.forecast.completionPercent))}%` }}/></div><dl className="phase9-forecast-grid"><div><dt>Remaining</dt><dd>{model.forecast.remainingChapters}</dd></div><div><dt>Current pace</dt><dd>{model.forecast.observedChaptersPerWeek}/wk</dd></div><div><dt>Needed pace</dt><dd>{model.forecast.requiredChaptersPerWeek}/wk</dd></div><div><dt>Target</dt><dd>{formatDate(model.forecast.targetCompletionDate)}</dd></div></dl>{model.forecast.dateSource === "attempt_month" ? <small className="phase9-estimate-note">Based on your selected attempt month.</small> : null}<Link href="/analytics/forecast" className="ui-text-link">View forecast →</Link></CardBody></Card>
      <Card className="today-plan-weak-card"><CardHeader title="Needs attention"/><CardBody>{model.weakSubjects.length ? <div className="phase9-weak-list today-plan-weak-list">{model.weakSubjects.slice(0, 4).map((subject) => <div key={subject.subjectId}><div><strong>{subject.subjectTitle}</strong><span>{subject.completionPercent}% complete</span></div></div>)}</div> : <div className="phase9-mini-empty">No subject needs extra attention right now.</div>}</CardBody></Card>
      <div className="phase9-side-links today-plan-side-links"><Link href="/planner/revision-settings"><Icon name="settings" size={17}/>Revision settings</Link><Link href="/planner"><Icon name="calendar" size={17}/>Planner</Link></div>
    </aside>
  </div>;
}
