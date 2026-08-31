"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import type { PlannerReadyModel, TaskKind } from "@/lib/planner/types";

function localInput(date = new Date(Date.now() + 60 * 60 * 1000)) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.valueOf() - offset).toISOString().slice(0, 16);
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatTaskSchedule(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function PlannerClient({ model }: { model: PlannerReadyModel }) {
  const router = useRouter();
  const defaultWhen = useMemo(() => localInput(), []);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [kind, setKind] = useState<TaskKind>("study");
  const [subjectId, setSubjectId] = useState("");
  const [chapterId, setChapterId] = useState("");
  const [scheduledDate, setScheduledDate] = useState(defaultWhen.slice(0, 10));
  const [scheduledTime, setScheduledTime] = useState(defaultWhen.slice(11, 16));
  const [estimated, setEstimated] = useState(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);

  const selectedSubject = model.subjects.find((subject) => subject.id === subjectId) ?? null;
  const today = useMemo(() => new Date(), []);
  const openTasks = model.tasks.filter((task) => task.status === "todo");
  const todayTasks = openTasks.filter((task) => sameDay(new Date(task.dueAt), today));
  const todayMinutes = todayTasks.reduce((sum, task) => sum + task.estimatedMinutes, 0);
  const completedCount = model.tasks.filter((task) => task.status === "done").length;

  async function request(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/planner/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Task could not be saved.");
      router.refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Task could not be saved.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    const scheduledAt = new Date(`${scheduledDate}T${scheduledTime}`);
    if (Number.isNaN(scheduledAt.getTime())) {
      setError("Choose a valid date and time.");
      return;
    }

    const ok = await request({
      action: "create",
      title,
      notes,
      taskKind: kind,
      subjectId: subjectId || null,
      chapterId: chapterId || null,
      dueAt: scheduledAt.toISOString(),
      estimatedMinutes: estimated,
    });
    if (ok) {
      setTitle("");
      setNotes("");
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const ok = await request({ action: "delete", id: deleteTarget.id });
    if (ok) setDeleteTarget(null);
  }

  return (
    <>
      <div className="phase6-planner-layout planner-layout">
        <div className="phase6-planner-main planner-main">
          <section className="phase6-metric-strip phase6-metric-strip--planner planner-summary" aria-label="Today's plan summary">
            <Card><CardBody><Icon name="calendar"/><span><strong>{todayTasks.length}</strong><small>Tasks today</small></span></CardBody></Card>
            <Card><CardBody><Icon name="clock"/><span><strong>{todayMinutes}m</strong><small>Planned time</small></span></CardBody></Card>
            <Card><CardBody><Icon name="check"/><span><strong>{completedCount}</strong><small>Completed</small></span></CardBody></Card>
          </section>

          <Card className="planner-tasks-card">
            <CardHeader title="Today’s tasks" action={<Link href="/calendar" className="ui-text-link">Calendar</Link>}/>
            <CardBody>
              {model.tasks.length ? (
                <div className="phase6-task-list">
                  {model.tasks.map((task) => (
                    <article key={task.id} className={`phase6-task phase6-task--${task.status}`}>
                      <button aria-label={task.status === "done" ? "Mark task incomplete" : "Complete task"} disabled={busy} onClick={() => void request({ action: "toggle", id: task.id, done: task.status !== "done" })}><Icon name="check" size={16}/></button>
                      <div>
                        <div className="phase6-task-title"><strong>{task.title}</strong><span className={`phase6-kind phase6-kind--${task.taskKind}`}>{task.taskKind}</span></div>
                        <p>{task.chapterTitle ?? task.subjectTitle ?? "General"} · {task.estimatedMinutes} min · {formatTaskSchedule(task.dueAt)}</p>
                        {task.notes ? <small>{task.notes}</small> : null}
                      </div>
                      <button className="phase6-icon-button" aria-label={`Delete ${task.title}`} disabled={busy} onClick={() => setDeleteTarget({ id: task.id, title: task.title })}><Icon name="close" size={17}/></button>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="phase6-empty planner-empty">
                  <span className="planner-empty__icon"><Icon name="calendar" size={22}/></span>
                  <strong>Your day is clear</strong>
                  <p>Add a task to start building today’s study plan.</p>
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        <aside className="planner-side">
          <Card className="planner-add-card">
            <CardHeader title="Add task"/>
            <CardBody>
              <form className="phase6-form planner-form" onSubmit={create}>
                <label className="planner-form__full"><span>Task</span><input required maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Revise AS 10"/></label>

                <div className="planner-form__grid">
                  <label><span>Type</span><select value={kind} onChange={(event) => setKind(event.target.value as TaskKind)}><option value="study">Study</option><option value="revision">Revision</option><option value="test">Test</option><option value="other">Other</option></select></label>
                  <label><span>Subject</span><select value={subjectId} onChange={(event) => { setSubjectId(event.target.value); setChapterId(""); }}><option value="">General</option>{model.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.title}</option>)}</select></label>
                  <label><span>Chapter</span><select disabled={!selectedSubject} value={chapterId} onChange={(event) => setChapterId(event.target.value)}><option value="">No chapter</option>{selectedSubject?.chapters.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.number}. {chapter.title}</option>)}</select></label>
                  <label><span>Minutes</span><input type="number" min="1" max="720" value={estimated} onChange={(event) => setEstimated(Number(event.target.value))}/></label>
                </div>

                <fieldset className="planner-schedule">
                  <legend><Icon name="calendar" size={14}/> Scheduled for</legend>
                  <div className="planner-schedule__grid">
                    <label><span>Date</span><input type="date" required value={scheduledDate} onChange={(event) => setScheduledDate(event.target.value)}/></label>
                    <label><span>Time</span><input type="time" required value={scheduledTime} onChange={(event) => setScheduledTime(event.target.value)}/></label>
                  </div>
                </fieldset>

                <label><span>Notes <em>optional</em></span><textarea maxLength={4000} value={notes} onChange={(event) => setNotes(event.target.value)} rows={2}/></label>
                {error ? <div className="phase6-inline-error">{error}</div> : null}
                <button disabled={busy} className="ui-button ui-button--primary planner-add-button" type="submit">{busy ? "Saving…" : "Add task"}</button>
              </form>
            </CardBody>
          </Card>

          <Card className="planner-goals-card">
            <CardHeader title="Goals"/>
            <CardBody>
              <div className="phase6-side-goals">
                {model.goals.slice(0, 4).map((goal) => <div key={goal.id}><span>{goal.title}</span><small>{goal.dueDate}</small></div>)}
                {!model.goals.length ? <p>No active goals yet.</p> : null}
                <Link href="/goals" className="ui-text-link">Manage goals →</Link>
              </div>
            </CardBody>
          </Card>
        </aside>
      </div>

      {deleteTarget ? (
        <div className="planner-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !busy) setDeleteTarget(null); }}>
          <div className="planner-delete-dialog" role="alertdialog" aria-modal="true" aria-labelledby="planner-delete-title" aria-describedby="planner-delete-description">
            <span className="planner-delete-dialog__icon"><Icon name="close" size={20}/></span>
            <div className="planner-delete-dialog__copy">
              <h2 id="planner-delete-title">Delete task?</h2>
              <p id="planner-delete-description"><strong>{deleteTarget.title}</strong> will be removed from your plan.</p>
            </div>
            <div className="planner-delete-dialog__actions">
              <button className="ui-button ui-button--secondary" type="button" disabled={busy} onClick={() => setDeleteTarget(null)}>Keep task</button>
              <button className="ui-button planner-delete-confirm" type="button" disabled={busy} onClick={() => void confirmDelete()}>{busy ? "Deleting…" : "Delete task"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
