"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import type { TodayPlanInteractionAction, TodayPlanItem, TodayPlanReadyModel } from "@/lib/smart-planner/types";

type TodayPlanDisplayItem = TodayPlanItem & {
  displayTitle?: string;
  chapterDisplayTitle?: string | null;
  plannedStartAt?: string | null;
  plannedEndAt?: string | null;
  scheduleState?: "overdue" | "fixed" | "planned" | null;
  startedAt?: string | null;
};

type TodayPlanDisplayModel = Omit<TodayPlanReadyModel, "items"> & { items: TodayPlanDisplayItem[]; canUndo?: boolean };
type RunningTask = { itemId: string; startedAt: string; expectedEndAt: string };
type Confirmation = { item: TodayPlanDisplayItem; title: string; description: string; action?: TodayPlanInteractionAction; kind: "planner" | "finish"; hideAfter?: boolean };

const RUNNING_KEY = "ca-progress-today-running-task";

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
    revision_overdue: "Revision overdue",
    task_due_today: "Scheduled today",
    task_overdue: "Task overdue",
    manual_reschedule: "Moved by you",
    remaining_syllabus: "Syllabus remaining",
    weak_subject_new_work: "Needs attention",
    completed_chapter_test: "Test due",
    followup_test: "Follow-up test",
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

function formatClock(value: string | null | undefined, timezone?: string) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", ...(timezone ? { timeZone: timezone } : {}) }).format(parsed);
}

function expectedEnd(startedAt: string, minutes: number) {
  const started = new Date(startedAt);
  if (!Number.isFinite(started.getTime())) return null;
  return new Date(started.getTime() + Math.max(1, minutes) * 60_000).toISOString();
}

function scheduleCopy(item: TodayPlanDisplayItem, timezone: string) {
  if (item.status !== "planned") return null;
  if (item.scheduleState === "overdue" && item.scheduledAt) return { tone: "urgent", text: `Scheduled ${formatClock(item.scheduledAt, timezone)} · time passed` };
  if (item.scheduleState === "fixed" && item.plannedStartAt) return { tone: "fixed", text: `Scheduled ${formatClock(item.plannedStartAt, timezone)}` };
  if (item.plannedStartAt && item.plannedEndAt) return { tone: "planned", text: `${formatClock(item.plannedStartAt, timezone)} – ${formatClock(item.plannedEndAt, timezone)}` };
  return null;
}

function plannerActionCopy(action: TodayPlanInteractionAction, item: TodayPlanDisplayItem) {
  const title = item.displayTitle ?? item.title;
  if (action.action === "complete") return { title: "Mark this task complete?", description: `Complete “${title}” and update the remaining plan.` };
  if (action.action === "snooze") return { title: "Snooze this task?", description: `Move “${title}” one hour later and adjust flexible work around it.` };
  if (action.action === "skip") return { title: "Skip this task?", description: `“${title}” will leave today’s current plan and the remaining work will move up.` };
  if (action.action === "reschedule") return { title: "Move this task?", description: `Move “${title}” to ${formatDate(action.date)}. It will leave today’s current plan.` };
  return { title: "Update this plan?", description: "Apply this change to your current study plan." };
}

export function TodayPlanClient({ model }: { model: TodayPlanDisplayModel }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [customDates, setCustomDates] = useState<Record<string, string>>({});
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [runningTask, setRunningTask] = useState<RunningTask | null>(null);
  const [organising, setOrganising] = useState(false);
  const [orderIds, setOrderIds] = useState<string[]>(() => model.items.filter((item) => item.status !== "skipped" && item.status !== "rescheduled").map((item) => item.id));
  const [orderHistory, setOrderHistory] = useState<string[][]>([]);

  useEffect(() => {
    let frame: number | null = null;
    try {
      const raw = window.localStorage.getItem(RUNNING_KEY);
      if (raw) {
        const stored = JSON.parse(raw) as RunningTask;
        if (stored?.itemId && model.items.some((item) => item.id === stored.itemId && item.status === "planned")) {
          frame = window.requestAnimationFrame(() => setRunningTask(stored));
          return () => { if (frame !== null) window.cancelAnimationFrame(frame); };
        }
        window.localStorage.removeItem(RUNNING_KEY);
      }
      const serverStarted = model.items.find((item) => item.status === "planned" && item.startedAt);
      if (serverStarted?.startedAt) {
        const end = expectedEnd(serverStarted.startedAt, serverStarted.estimatedMinutes);
        if (end) frame = window.requestAnimationFrame(() => setRunningTask({ itemId: serverStarted.id, startedAt: serverStarted.startedAt as string, expectedEndAt: end }));
      }
    } catch {
      window.localStorage.removeItem(RUNNING_KEY);
    }
    return () => { if (frame !== null) window.cancelAnimationFrame(frame); };
  }, [model.items]);

  useEffect(() => {
    if (runningTask) window.localStorage.setItem(RUNNING_KEY, JSON.stringify(runningTask));
    else window.localStorage.removeItem(RUNNING_KEY);
  }, [runningTask]);

  const visibleItems = useMemo(() => {
    const byId = new Map(model.items.filter((item) => item.status !== "skipped" && item.status !== "rescheduled" && !hiddenIds.has(item.id)).map((item) => [item.id, item]));
    const ordered = orderIds.map((id) => byId.get(id)).filter((item): item is TodayPlanDisplayItem => Boolean(item));
    for (const item of byId.values()) if (!orderIds.includes(item.id)) ordered.push(item);
    return ordered;
  }, [hiddenIds, model.items, orderIds]);

  const activeItems = visibleItems.filter((item) => item.status === "planned").length;

  async function requestPlanner(action: TodayPlanInteractionAction) {
    const response = await fetch("/api/planner/today", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action) });
    const text = await response.text();
    let payload: { error?: string; startedAt?: string } = {};
    if (text) { try { payload = JSON.parse(text) as { error?: string; startedAt?: string }; } catch { payload = {}; } }
    if (!response.ok) throw new Error(payload.error || "Today Plan could not be updated.");
    return payload;
  }

  async function postPlanner(action: TodayPlanInteractionAction, busyKey = "refresh", hideAfter = false) {
    setBusyId(busyKey);
    setError(null);
    try {
      await requestPlanner(action);
      if (hideAfter && "itemId" in action) setHiddenIds((current) => new Set(current).add(action.itemId));
      if (action.action === "undo") {
        setHiddenIds(new Set());
        setOrganising(false);
        setOrderHistory([]);
      }
      router.refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Today Plan could not be updated.");
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function timerAction(body: Record<string, unknown>) {
    const response = await fetch("/api/study/timer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) throw new Error(payload.error || "Study timer could not be updated.");
  }

  async function startTask(item: TodayPlanDisplayItem) {
    if (runningTask && runningTask.itemId !== item.id) return;
    setBusyId(`start:${item.id}`);
    setError(null);
    try {
      await timerAction({ action: "start", subjectId: item.subjectId, chapterId: item.chapterId, mode: "pomodoro", focusMinutes: item.estimatedMinutes, breakMinutes: 0, timezone: model.timezone });
      let plannerStart: { startedAt?: string };
      try {
        plannerStart = await requestPlanner({ action: "start", itemId: item.id });
      } catch (error) {
        await timerAction({ action: "discard" }).catch(() => undefined);
        throw error;
      }
      const started = plannerStart.startedAt ? new Date(plannerStart.startedAt) : new Date();
      const expected = new Date(started.getTime() + item.estimatedMinutes * 60_000);
      setRunningTask({ itemId: item.id, startedAt: started.toISOString(), expectedEndAt: expected.toISOString() });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Study timer could not be started.");
    } finally {
      setBusyId(null);
    }
  }

  function askPlanner(action: TodayPlanInteractionAction, item: TodayPlanDisplayItem, hideAfter = false) {
    setConfirmation({ item, action, kind: "planner", hideAfter, ...plannerActionCopy(action, item) });
  }

  function askFinish(item: TodayPlanDisplayItem) {
    setConfirmation({ item, kind: "finish", title: "Finish this study task?", description: `Stop the timer and mark “${item.displayTitle ?? item.title}” complete.` });
  }

  async function confirmAction() {
    if (!confirmation) return;
    const pending = confirmation;
    setConfirmation(null);
    if (pending.kind === "finish") {
      setBusyId(`finish:${pending.item.id}`);
      setError(null);
      try {
        await timerAction({ action: "finish" });
        setRunningTask(null);
        await postPlanner({ action: "complete", itemId: pending.item.id }, pending.item.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Task could not be finished.");
        setBusyId(null);
      }
      return;
    }
    if (!pending.action) return;
    if (pending.action.action === "complete" && runningTask?.itemId === pending.item.id) {
      try { await timerAction({ action: "finish" }); setRunningTask(null); }
      catch (err) { setError(err instanceof Error ? err.message : "Active study timer could not be finished."); return; }
    }
    await postPlanner(pending.action, pending.item.id, pending.hideAfter);
  }

  function moveFlexible(itemId: string, direction: -1 | 1) {
    const currentIndex = orderIds.indexOf(itemId);
    if (currentIndex < 0) return;
    const itemById = new Map(model.items.map((item) => [item.id, item]));
    const current = itemById.get(itemId);
    if (!current || current.status !== "planned" || current.scheduleState !== "planned") return;
    let targetIndex = currentIndex + direction;
    while (targetIndex >= 0 && targetIndex < orderIds.length) {
      const target = itemById.get(orderIds[targetIndex]);
      if (target?.status === "planned" && target.scheduleState === "planned") break;
      targetIndex += direction;
    }
    if (targetIndex < 0 || targetIndex >= orderIds.length) return;
    setOrderHistory((history) => [...history, orderIds]);
    setOrderIds((currentOrder) => {
      const next = [...currentOrder];
      [next[currentIndex], next[targetIndex]] = [next[targetIndex], next[currentIndex]];
      return next;
    });
  }

  function undoOrder() {
    setOrderHistory((history) => {
      if (!history.length) return history;
      setOrderIds(history[history.length - 1]);
      return history.slice(0, -1);
    });
  }

  async function saveOrder() {
    const itemIds = orderIds.filter((id) => model.items.some((item) => item.id === id && item.status === "planned" && !hiddenIds.has(id)));
    if (!itemIds.length) { setOrganising(false); return; }
    setBusyId("organise");
    setError(null);
    try {
      await requestPlanner({ action: "reorder", itemIds });
      setOrganising(false);
      setOrderHistory([]);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Study order could not be saved.");
    } finally {
      setBusyId(null);
    }
  }

  function actions(item: TodayPlanDisplayItem) {
    if (item.status !== "planned") return <span className={`phase9-state phase9-state--${item.status}`}>{stateLabel(item.status)}</span>;
    const customDate = customDates[item.id] || tomorrow();
    const isRunning = runningTask?.itemId === item.id;
    const anotherRunning = Boolean(runningTask && !isRunning);
    const lockSecondary = Boolean(busyId) || isRunning;
    return <div className="phase9-item-actions today-plan-actions">
      {isRunning ? <button className="today-plan-start-action is-running" disabled={Boolean(busyId)} onClick={() => askFinish(item)}><Icon name="timer" size={15}/>Finish task</button> : <button className="today-plan-start-action" disabled={Boolean(busyId) || anotherRunning} onClick={() => void startTask(item)}><Icon name="timer" size={15}/>{anotherRunning ? "Another task active" : "Start task"}</button>}
      <button disabled={Boolean(busyId)} onClick={() => askPlanner({ action: "complete", itemId: item.id }, item)}><Icon name="check" size={15}/>Complete</button>
      <button disabled={lockSecondary} onClick={() => askPlanner({ action: "snooze", itemId: item.id, minutes: 60 }, item)}><Icon name="clock" size={15}/>Snooze 1h</button>
      <button disabled={lockSecondary} onClick={() => askPlanner({ action: "reschedule", itemId: item.id, date: tomorrow() }, item, true)}><Icon name="calendar" size={15}/>Tomorrow</button>
      <label className="phase9-date-action"><span className="sr-only">Move to another date</span><input disabled={isRunning} type="date" value={customDate} onChange={(event) => setCustomDates((current) => ({ ...current, [item.id]: event.target.value }))}/><button type="button" disabled={lockSecondary} onClick={() => askPlanner({ action: "reschedule", itemId: item.id, date: customDate }, item, true)}>Move</button></label>
      <button className="phase9-action-muted" disabled={lockSecondary} onClick={() => askPlanner({ action: "skip", itemId: item.id }, item, true)}>Skip</button>
    </div>;
  }

  return <>
    <div className="phase9-today-layout today-plan-layout">
      <div className="phase9-today-main">
        <section className="phase9-metrics today-plan-metrics" aria-label="Today plan summary">
          <Card><CardBody><Icon name="target"/><div><span>Planned time</span><strong>{model.plannedMinutes}m</strong><small>{model.targetMinutes}m target</small></div></CardBody></Card>
          <Card><CardBody><Icon name="clock"/><div><span>Revisions</span><strong>{model.dueRevisionCount}</strong><small>due today</small></div></CardBody></Card>
          <Card><CardBody><Icon name="sparkles"/><div><span>Plan items</span><strong>{activeItems}</strong><small>remaining</small></div></CardBody></Card>
        </section>
        {model.warnings.length ? <div className="phase9-warning-stack">{model.warnings.map((warning) => <div key={warning} className="phase9-warning"><Icon name="bell" size={17}/><span>{warning}</span></div>)}</div> : null}
        {error ? <div className="phase9-error" role="alert">{error}</div> : null}
        <Card className="today-plan-list-card">
          <CardHeader title="Study order" action={<div className="today-plan-header-actions"><button className="ui-button ui-button--secondary today-plan-refresh" disabled={!model.canUndo || Boolean(busyId)} onClick={() => void postPlanner({ action: "undo" }, "undo")}>{busyId === "undo" ? "Undoing…" : "Undo"}</button><button className="ui-button ui-button--secondary today-plan-refresh" disabled={Boolean(busyId)} onClick={() => setOrganising((value) => !value)}>{organising ? "Close organiser" : "Organise"}</button><button className="ui-button ui-button--secondary today-plan-refresh" disabled={Boolean(busyId)} onClick={() => void postPlanner({ action: "refresh" })}>{busyId === "refresh" ? "Refreshing…" : "Refresh plan"}</button></div>}/>
          <CardBody>
            {organising ? <div className="today-plan-organiser"><div><Icon name="layers" size={18}/><span><strong>Organise flexible work</strong><small>Use the arrows to reorder flexible study. Scheduled tasks stay anchored to their assigned time.</small></span></div><div><button disabled={!orderHistory.length || Boolean(busyId)} onClick={undoOrder}>Undo move</button><button className="is-primary" disabled={Boolean(busyId)} onClick={() => void saveOrder()}>{busyId === "organise" ? "Saving…" : "Save order"}</button></div></div> : null}
            {visibleItems.length ? <div className="phase9-timeline today-plan-timeline">{visibleItems.map((item, index) => {
              const schedule = scheduleCopy(item, model.timezone);
              const isRunning = runningTask?.itemId === item.id;
              const startedAt = isRunning && runningTask ? runningTask.startedAt : item.startedAt;
              const expectedFinish = isRunning && runningTask ? runningTask.expectedEndAt : startedAt ? expectedEnd(startedAt, item.estimatedMinutes) : null;
              return <article key={item.id} className={`phase9-plan-item phase9-plan-item--${item.status} ${item.manualOverride ? "is-manual" : ""} ${item.scheduleState === "overdue" ? "is-time-overdue" : ""} ${isRunning ? "is-running" : ""}`}>
                <div className="phase9-timeline-marker"><span>{index + 1}</span></div>
                <div className="phase9-plan-content today-plan-item">
                  <div className="phase9-plan-heading"><div><span className={`phase9-kind phase9-kind--${item.itemKind}`}>{item.itemKind.replace("_", " ")}</span><h3>{item.displayTitle ?? item.title}</h3></div><strong>{item.estimatedMinutes}m</strong></div>
                  <div className="phase9-item-meta today-plan-item-meta"><span>{item.subjectTitle ?? "General"}</span></div>
                  <div className="today-plan-time-row">{schedule ? <span className={`today-plan-schedule today-plan-schedule--${schedule.tone}`}><Icon name="clock" size={13}/>{schedule.text}</span> : null}{item.scheduleState === "overdue" ? <span className="today-plan-urgency">Urgent</span> : null}</div>
                  <div className="phase9-chip-row today-plan-chip-row"><span className={`phase9-priority phase9-priority--${priorityLabel(item.priorityScore).toLowerCase()}`}>{priorityLabel(item.priorityScore)}</span><span className="phase9-reason-chip">{reasonLabel(item.reasonCode)}</span>{item.manualOverride ? <span className="phase9-manual-chip">Adjusted</span> : null}</div>
                  {item.status === "planned" && startedAt && expectedFinish ? <div className="today-plan-running"><Icon name="timer" size={16}/><div><strong>{isRunning ? "In progress" : "Started"}</strong><span>Started {formatClock(startedAt, model.timezone)} · expected finish {formatClock(expectedFinish, model.timezone)}</span></div></div> : null}
                  {item.status === "completed" && (startedAt || item.completedAt) ? <div className="today-plan-completed-time"><Icon name="check" size={15}/><span>{startedAt ? `Started ${formatClock(startedAt, model.timezone)}` : ""}{startedAt && item.completedAt ? " · " : ""}{item.completedAt ? `Completed ${formatClock(item.completedAt, model.timezone)}` : ""}</span></div> : null}
                  {item.manualNote && item.manualNote !== "Order adjusted" && item.manualNote !== "Order adjusted by student" ? <div className="phase9-manual-note">{item.manualNote}</div> : null}
                  {organising && item.status === "planned" ? <div className="today-plan-order-controls"><span>{item.scheduleState === "planned" ? "Flexible" : "Time fixed"}</span><div><button aria-label="Move task earlier" disabled={item.scheduleState !== "planned" || Boolean(busyId)} onClick={() => moveFlexible(item.id, -1)}>↑</button><button aria-label="Move task later" disabled={item.scheduleState !== "planned" || Boolean(busyId)} onClick={() => moveFlexible(item.id, 1)}>↓</button></div></div> : actions(item)}
                </div>
              </article>;
            })}</div> : <div className="phase9-empty"><Icon name="check"/><strong>Your plan is clear</strong><p>Nothing needs your attention right now. Add a task if you want to plan more study.</p><Link href="/planner">Open planner</Link></div>}
          </CardBody>
        </Card>
      </div>
      <aside className="phase9-today-side today-plan-side">
        <Card className="today-plan-forecast-card"><CardHeader title="Forecast" description={model.forecast.attemptLabel}/><CardBody><div className={`phase9-forecast-status phase9-forecast-status--${model.forecast.status}`}><strong>{statusLabel(model.forecast.status)}</strong><span>{model.forecast.completionPercent}% complete</span></div><div className="phase9-progress-track"><span style={{ width: `${Math.min(100, Math.max(0, model.forecast.completionPercent))}%` }}/></div><dl className="phase9-forecast-grid"><div><dt>Remaining</dt><dd>{model.forecast.remainingChapters}</dd></div><div><dt>Current pace</dt><dd>{model.forecast.observedChaptersPerWeek}/wk</dd></div><div><dt>Needed pace</dt><dd>{model.forecast.requiredChaptersPerWeek}/wk</dd></div><div><dt>Target</dt><dd>{formatDate(model.forecast.targetCompletionDate)}</dd></div></dl>{model.forecast.dateSource === "attempt_month" ? <small className="phase9-estimate-note">Based on your selected attempt month.</small> : null}<Link href="/analytics/forecast" className="ui-text-link">View forecast →</Link></CardBody></Card>
        <Card className="today-plan-weak-card"><CardHeader title="Needs attention"/><CardBody>{model.weakSubjects.length ? <div className="phase9-weak-list today-plan-weak-list">{model.weakSubjects.slice(0, 4).map((subject) => <div key={subject.subjectId}><div><strong>{subject.subjectTitle}</strong><span>{subject.completionPercent}% complete</span></div></div>)}</div> : <div className="phase9-mini-empty">No subject needs extra attention right now.</div>}</CardBody></Card>
        <div className="phase9-side-links today-plan-side-links"><Link href="/planner/revision-settings"><Icon name="settings" size={17}/>Revision settings</Link><Link href="/planner"><Icon name="calendar" size={17}/>Planner</Link></div>
      </aside>
    </div>
    {confirmation ? <div className="today-plan-confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setConfirmation(null); }}><section className="today-plan-confirm" role="dialog" aria-modal="true" aria-labelledby="today-plan-confirm-title"><span className="today-plan-confirm__icon"><Icon name={confirmation.kind === "finish" || confirmation.action?.action === "complete" ? "check" : "clock"} size={20}/></span><div><h2 id="today-plan-confirm-title">{confirmation.title}</h2><p>{confirmation.description}</p></div><div className="today-plan-confirm__actions"><button onClick={() => setConfirmation(null)}>Cancel</button><button className="is-primary" disabled={Boolean(busyId)} onClick={() => void confirmAction()}>Confirm</button></div></section></div> : null}
  </>;
}
