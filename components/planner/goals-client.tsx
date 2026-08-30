"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import type { PlannerGoal } from "@/lib/planner/types";

export function GoalsClient({ goals }: { goals: PlannerGoal[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function request(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/planner/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Goal could not be saved.");
      router.refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Goal could not be saved.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    if (await request({ action: "create", title, description, dueDate })) {
      setTitle("");
      setDescription("");
      setDueDate("");
    }
  }

  return (
    <div className="phase6-goals-layout">
      <Card>
        <CardHeader title="Your goals" description="Milestones have due dates and explicit completion state; they are also composed into Calendar."/>
        <CardBody>
          {goals.length ? (
            <div className="phase6-goal-list">
              {goals.map((goal) => (
                <article key={goal.id} className={`phase6-goal phase6-goal--${goal.status}`}>
                  <button disabled={busy} onClick={() => void request({ action: "toggle", id: goal.id, done: goal.status !== "completed" })}><Icon name="check"/></button>
                  <div><strong>{goal.title}</strong><p>Due {new Date(`${goal.dueDate}T12:00:00`).toLocaleDateString()}</p>{goal.description ? <small>{goal.description}</small> : null}</div>
                  <button className="phase6-icon-button" disabled={busy} onClick={() => { if (window.confirm("Delete this goal?")) void request({ action: "delete", id: goal.id }); }}><Icon name="close" size={17}/></button>
                </article>
              ))}
            </div>
          ) : <div className="phase6-empty"><Icon name="target"/><strong>No goals yet</strong><p>Add a milestone with a due date.</p></div>}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Add goal" description="Keep goals high-level; daily execution belongs in Planner tasks."/>
        <CardBody>
          <form className="phase6-form" onSubmit={create}>
            <label><span>Goal</span><input required maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Complete Group 1 first revision"/></label>
            <label><span>Due date</span><input required type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)}/></label>
            <label><span>Description</span><textarea rows={4} maxLength={4000} value={description} onChange={(event) => setDescription(event.target.value)}/></label>
            {error ? <div className="phase6-inline-error">{error}</div> : null}
            <button className="ui-button ui-button--primary" disabled={busy} type="submit">{busy ? "Saving…" : "Add goal"}</button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
