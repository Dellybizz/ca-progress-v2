"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import type { StudyReadyModel, StudyTimerMutationResult } from "@/lib/study/types";

function duration(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}
function minutesLabel(seconds: number) { const minutes = Math.round(seconds / 60); return minutes < 60 ? `${minutes} min` : `${(minutes / 60).toFixed(minutes % 60 ? 1 : 0)}h`; }

export function StudyTimer({ model }: { model: StudyReadyModel }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const baseAt = useRef(Date.now());
  const [subjectId, setSubjectId] = useState(model.timer?.subjectId ?? "");
  const [chapterId, setChapterId] = useState(model.timer?.chapterId ?? "");
  const [mode, setMode] = useState<"stopwatch" | "pomodoro">(model.timer?.mode ?? "pomodoro");
  const [focusMinutes, setFocusMinutes] = useState(Math.round((model.timer?.focusTargetSeconds ?? 1500) / 60));
  const [breakMinutes, setBreakMinutes] = useState(Math.round((model.timer?.breakTargetSeconds ?? 300) / 60));
  const timer = model.timer;
  const selectedSubject = useMemo(() => model.subjects.find((subject) => subject.id === subjectId) ?? null, [model.subjects, subjectId]);

  useEffect(() => { baseAt.current = Date.now(); setNow(Date.now()); }, [timer?.status, timer?.elapsedSeconds, timer?.lastInteractionAt]);
  useEffect(() => { if (!timer || timer.status !== "running" || timer.abandoned) return; const id = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(id); }, [timer]);
  useEffect(() => {
    if (!timer || timer.status !== "running" || timer.abandoned) return;
    const id = window.setInterval(() => { void fetch("/api/study/timer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "touch" }), keepalive: true }); }, 5 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [timer]);

  const elapsed = timer ? Math.min(43_200, timer.elapsedSeconds + (timer.status === "running" && !timer.abandoned ? Math.max(0, Math.floor((now - baseAt.current) / 1000)) : 0)) : 0;
  const remaining = timer?.mode === "pomodoro" && timer.focusTargetSeconds ? Math.max(0, timer.focusTargetSeconds - elapsed) : null;

  async function mutate(body: Record<string, unknown>) {
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/study/timer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json() as StudyTimerMutationResult & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Timer could not be updated.");
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Timer could not be updated."); }
    finally { setBusy(false); }
  }

  async function start(event: FormEvent) {
    event.preventDefault();
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    await mutate({ action: "start", subjectId: subjectId || null, chapterId: chapterId || null, mode, focusMinutes: mode === "pomodoro" ? focusMinutes : null, breakMinutes: mode === "pomodoro" ? breakMinutes : null, timezone });
  }

  if (timer) return (
    <div className="phase6-study-grid">
      <Card className="phase6-focus-card">
        <CardBody>
          <div className="phase6-focus-top"><span className="phase6-kicker"><Icon name="timer" size={16}/> Study Focus</span><span className={`phase6-status phase6-status--${timer.status}`}>{timer.abandoned ? "Needs review" : timer.status}</span></div>
          <div className="phase6-clock" aria-live="polite">{duration(timer.mode === "pomodoro" && remaining !== null ? remaining : elapsed)}</div>
          <p className="phase6-clock-label">{timer.mode === "pomodoro" ? remaining === 0 ? "Focus target reached — finish now or keep studying." : `Focus countdown · ${minutesLabel(timer.focusTargetSeconds ?? 0)} target` : "Elapsed focused study time"}</p>
          <div className="phase6-focus-context"><strong>{timer.chapterTitle ?? timer.subjectTitle ?? "General study"}</strong><span>{timer.mode === "pomodoro" ? `Pomodoro · ${Math.round((timer.focusTargetSeconds ?? 0) / 60)}/${Math.round((timer.breakTargetSeconds ?? 0) / 60)}` : "Stopwatch"}</span></div>
          {timer.abandoned ? <div className="phase6-warning"><Icon name="clock"/><div><strong>This timer appears abandoned.</strong><p>For safety, CA Progress will not turn an unattended 16+ hour timer into study analytics. Discard it and start a fresh session.</p></div></div> : null}
          {error ? <div className="phase6-inline-error" role="alert">{error}</div> : null}
          <div className="phase6-timer-actions">
            {!timer.abandoned && timer.status === "running" ? <button className="ui-button ui-button--secondary" disabled={busy} onClick={() => void mutate({ action: "pause" })}>Pause</button> : null}
            {!timer.abandoned && timer.status === "paused" ? <button className="ui-button ui-button--secondary" disabled={busy} onClick={() => void mutate({ action: "resume" })}>Resume</button> : null}
            {!timer.abandoned ? <button className="ui-button ui-button--primary" disabled={busy} onClick={() => void mutate({ action: "finish" })}>Finish session</button> : null}
            <button className="ui-button ui-button--ghost" disabled={busy} onClick={() => { if (window.confirm("Discard this timer without adding study time?")) void mutate({ action: "discard" }); }}>Discard</button>
          </div>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Session persistence" description="The active timer lives in your private database row, not in page memory."/>
        <CardBody><div className="phase6-detail-list"><div><span>Started</span><strong>{new Date(timer.startedAt).toLocaleString()}</strong></div><div><span>Timezone</span><strong>{timer.timezone}</strong></div><div><span>Saved elapsed</span><strong>{duration(timer.elapsedSeconds)}</strong></div><div><span>Route changes</span><strong>Safe to navigate away</strong></div></div></CardBody>
      </Card>
    </div>
  );

  return (
    <div className="phase6-study-grid">
      <Card className="phase6-focus-card phase6-focus-card--setup">
        <CardHeader title="Start a focus session" description="Choose what you are studying. The timer continues safely across reloads and route changes."/>
        <CardBody>
          <form className="phase6-form" onSubmit={start}>
            <label><span>Subject</span><select value={subjectId} onChange={(event) => { setSubjectId(event.target.value); setChapterId(""); }}><option value="">General study</option>{model.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.title}</option>)}</select></label>
            <label><span>Chapter</span><select value={chapterId} onChange={(event) => setChapterId(event.target.value)} disabled={!selectedSubject}><option value="">No chapter selected</option>{selectedSubject?.chapters.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.number}. {chapter.title}</option>)}</select></label>
            <fieldset className="phase6-mode"><legend>Timer mode</legend><button type="button" className={mode === "pomodoro" ? "is-active" : ""} onClick={() => setMode("pomodoro")}>Pomodoro</button><button type="button" className={mode === "stopwatch" ? "is-active" : ""} onClick={() => setMode("stopwatch")}>Stopwatch</button></fieldset>
            {mode === "pomodoro" ? <><div className="phase6-presets"><button type="button" className={focusMinutes === 25 && breakMinutes === 5 ? "is-active" : ""} onClick={() => { setFocusMinutes(25); setBreakMinutes(5); }}>25 / 5</button><button type="button" className={focusMinutes === 50 && breakMinutes === 10 ? "is-active" : ""} onClick={() => { setFocusMinutes(50); setBreakMinutes(10); }}>50 / 10</button><span>or custom</span></div><div className="phase6-form-row"><label><span>Focus minutes</span><input type="number" min="1" max="720" value={focusMinutes} onChange={(event) => setFocusMinutes(Number(event.target.value))}/></label><label><span>Break minutes</span><input type="number" min="0" max="120" value={breakMinutes} onChange={(event) => setBreakMinutes(Number(event.target.value))}/></label></div></> : <div className="phase6-note"><Icon name="clock"/><span>Stopwatch mode records the exact focused duration you finish.</span></div>}
            {error ? <div className="phase6-inline-error" role="alert">{error}</div> : null}
            <button className="ui-button ui-button--primary phase6-start-button" disabled={busy} type="submit">{busy ? "Starting…" : "Start study timer"}</button>
          </form>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Recent study" description="Completed sessions immediately become the study analytics source."/>
        <CardBody>{model.analytics.recentSessions.length ? <div className="phase6-session-list">{model.analytics.recentSessions.slice(0, 5).map((session) => <div key={session.id}><span><strong>{session.chapterTitle ?? session.subjectTitle ?? "General study"}</strong><small>{new Date(session.endedAt).toLocaleString()}</small></span><b>{minutesLabel(session.durationSeconds)}</b></div>)}</div> : <div className="phase6-empty"><Icon name="timer"/><strong>No completed study sessions yet</strong><p>Finish your first timer and it will appear here and in Analytics.</p></div>}</CardBody>
      </Card>
    </div>
  );
}
