"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import type { RevisionSettings } from "@/lib/smart-planner/types";

const DAYS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

export function RevisionSettingsClient({ settings }: { settings: RevisionSettings }) {
  const router = useRouter();
  const [intervalText, setIntervalText] = useState(settings.intervalDays.join(", "));
  const [weekdays, setWeekdays] = useState(settings.preferredWeekdays);
  const [revisionMinutes, setRevisionMinutes] = useState(settings.revisionMinutes);
  const [newChapterMinutes, setNewChapterMinutes] = useState(settings.newChapterMinutes);
  const [testMinutes, setTestMinutes] = useState(settings.testMinutes);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggleDay(day: number) {
    setWeekdays((current) => current.includes(day) ? current.filter((value) => value !== day) : [...current, day].sort((a, b) => a - b));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    setError(null);
    const intervalDays = intervalText.split(",").map((value) => Number(value.trim())).filter((value) => Number.isFinite(value));
    try {
      const response = await fetch("/api/planner/revision-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intervalDays, preferredWeekdays: weekdays, revisionMinutes, newChapterMinutes, testMinutes }),
      });
      const text = await response.text();
      let payload: { error?: string } = {};
      if (text) {
        try { payload = JSON.parse(text) as { error?: string }; } catch { payload = {}; }
      }
      if (!response.ok) throw new Error(payload.error || "Revision settings could not be saved.");
      setMessage("Revision rules saved. Existing generated due dates have been recalculated while manual due-date overrides remain protected.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Revision settings could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return <form className="phase9-settings-layout" onSubmit={save}>
    <Card><CardHeader title="Revision intervals" description="Each interval creates a future revision due item from the chapter completion timestamp."/><CardBody><label className="phase9-field"><span>Days after chapter completion</span><input value={intervalText} onChange={(event) => setIntervalText(event.target.value)} placeholder="1, 7, 21"/><small>Use 1–5 comma-separated intervals between 1 and 180 days. Example: 1, 7, 21.</small></label><div className="phase9-rule-preview"><strong>Current sequence</strong><div>{intervalText.split(",").map((value) => value.trim()).filter(Boolean).map((value, index) => <span key={`${value}-${index}`}>Revision {index + 1}: +{value}d</span>)}</div></div></CardBody></Card>

    <Card><CardHeader title="Preferred study days" description="Optional new syllabus work and tests are generated on these days. Overdue revisions and tasks can still appear on any day."/><CardBody><div className="phase9-day-grid">{DAYS.map((day) => <button key={day.value} type="button" aria-pressed={weekdays.includes(day.value)} className={weekdays.includes(day.value) ? "is-selected" : ""} onClick={() => toggleDay(day.value)}>{day.label}</button>)}</div>{!weekdays.length ? <div className="phase9-inline-warning">Choose at least one study day.</div> : null}</CardBody></Card>

    <Card><CardHeader title="Default session estimates" description="These minutes help the engine fit explainable suggestions inside your daily target."/><CardBody><div className="phase9-duration-grid"><label className="phase9-field"><span>Revision</span><input type="number" min="10" max="360" value={revisionMinutes} onChange={(event) => setRevisionMinutes(Number(event.target.value))}/><small>10–360 min</small></label><label className="phase9-field"><span>New chapter</span><input type="number" min="15" max="480" value={newChapterMinutes} onChange={(event) => setNewChapterMinutes(Number(event.target.value))}/><small>15–480 min</small></label><label className="phase9-field"><span>Test</span><input type="number" min="15" max="360" value={testMinutes} onChange={(event) => setTestMinutes(Number(event.target.value))}/><small>15–360 min</small></label></div></CardBody></Card>

    {error ? <div className="phase9-error" role="alert">{error}</div> : null}
    {message ? <div className="phase9-success" role="status">{message}</div> : null}
    <div className="phase9-settings-actions"><button className="ui-button ui-button--primary" type="submit" disabled={busy || !weekdays.length}>{busy ? "Saving…" : "Save revision settings"}</button></div>
  </form>;
}
