"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
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

function minutesLabel(seconds: number) {
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes} min` : `${(minutes / 60).toFixed(minutes % 60 ? 1 : 0)}h`;
}

function compactStudyTime(seconds: number) {
  if (!seconds) return "0m";
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  const value = seconds / 3600;
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}h`;
}

function StudySideRail({ model }: { model: StudyReadyModel }) {
  return (
    <aside className="study-side-rail" aria-label="Study summary and recent activity">
      <Card className="study-side-stat study-side-stat--today">
        <CardBody><span className="study-side-stat__icon"><Icon name="clock" size={18}/></span><div><strong>{compactStudyTime(model.analytics.todaySeconds)}</strong><small>Today</small></div></CardBody>
      </Card>
      <Card className="study-side-stat study-side-stat--week">
        <CardBody><span className="study-side-stat__icon"><Icon name="chart" size={18}/></span><div><strong>{compactStudyTime(model.analytics.last7DaysSeconds)}</strong><small>Last 7 days</small></div></CardBody>
      </Card>
      <Card className="study-side-stat study-side-stat--streak">
        <CardBody><span className="study-side-stat__icon"><Icon name="sparkles" size={18}/></span><div><strong>{model.analytics.streakDays}</strong><small>Day streak</small></div></CardBody>
      </Card>
      <Card className="study-recent-card">
        <CardHeader title="Recent study" description="Your latest completed sessions."/>
        <CardBody>{model.analytics.recentSessions.length ? <div className="phase6-session-list">{model.analytics.recentSessions.slice(0, 5).map((session) => <div key={session.id}><span><strong>{session.chapterTitle ?? session.subjectTitle ?? "General study"}</strong><small>{new Date(session.endedAt).toLocaleString()}</small></span><b>{minutesLabel(session.durationSeconds)}</b></div>)}</div> : <div className="phase6-empty study-empty"><span className="study-empty__icon"><Icon name="timer" size={22}/></span><strong>Your study history starts here</strong><p>Complete your first focus session and it’ll appear here automatically.</p></div>}</CardBody>
      </Card>
    </aside>
  );
}

export function StudyTimer({ model }: { model: StudyReadyModel }) {
  const router = useRouter();
  const timer = model.timer;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(timer?.elapsedSeconds ?? 0);
  const [subjectId, setSubjectId] = useState(timer?.subjectId ?? "");
  const [chapterId, setChapterId] = useState(timer?.chapterId ?? "");
  const [mode, setMode] = useState<"stopwatch" | "pomodoro">(timer?.mode ?? "pomodoro");
  const [focusMinutes, setFocusMinutes] = useState(Math.round((timer?.focusTargetSeconds ?? 1500) / 60));
  const [breakMinutes, setBreakMinutes] = useState(Math.round((timer?.breakTargetSeconds ?? 300) / 60));
  const selectedSubject = useMemo(() => model.subjects.find((subject) => subject.id === subjectId) ?? null, [model.subjects, subjectId]);

  useEffect(() => {
    if (!timer || timer.status !== "running" || timer.abandoned) return;
    const id = window.setInterval(() => setElapsed((value) => Math.min(43_200, value + 1)), 1000);
    return () => window.clearInterval(id);
  }, [timer]);

  useEffect(() => {
    if (!timer || timer.status !== "running" || timer.abandoned) return;
    const id = window.setInterval(() => {
      void fetch("/api/study/timer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "touch" }),
        keepalive: true,
      });
    }, 5 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [timer]);

  const remaining = timer?.mode === "pomodoro" && timer.focusTargetSeconds ? Math.max(0, timer.focusTargetSeconds - elapsed) : null;

  async function mutate(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/study/timer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json() as StudyTimerMutationResult & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Timer could not be updated.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Timer could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  async function start(event: FormEvent) {
    event.preventDefault();
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    await mutate({
      action: "start",
      subjectId: subjectId || null,
      chapterId: chapterId || null,
      mode,
      focusMinutes: mode === "pomodoro" ? focusMinutes : null,
      breakMinutes: mode === "pomodoro" ? breakMinutes : null,
      timezone,
    });
  }

  if (timer) return (
    <div className="phase6-study-grid study-session-grid study-session-grid--live">
      <Card className="phase6-focus-card study-live-card">
        <CardBody>
          <div className="phase6-focus-top"><span className="phase6-kicker"><Icon name="timer" size={16}/> Focus session</span><span className={`phase6-status phase6-status--${timer.status}`}>{timer.abandoned ? "Needs review" : timer.status}</span></div>
          <div className="phase6-clock" aria-live="polite">{duration(timer.mode === "pomodoro" && remaining !== null ? remaining : elapsed)}</div>
          <p className="phase6-clock-label">{timer.mode === "pomodoro" ? remaining === 0 ? "Focus target reached — finish now or keep studying." : `${minutesLabel(timer.focusTargetSeconds ?? 0)} focus target` : "Focused time elapsed"}</p>
          <div className="phase6-focus-context"><strong>{timer.chapterTitle ?? timer.subjectTitle ?? "General study"}</strong><span>{timer.mode === "pomodoro" ? `Pomodoro · ${Math.round((timer.focusTargetSeconds ?? 0) / 60)}/${Math.round((timer.breakTargetSeconds ?? 0) / 60)}` : "Stopwatch"}</span></div>
          {timer.abandoned ? <div className="phase6-warning"><Icon name="clock"/><div><strong>This timer looks inactive.</strong><p>Discard it and start a fresh session so only real study time is saved.</p></div></div> : null}
          {error ? <div className="phase6-inline-error" role="alert">{error}</div> : null}
          <div className="phase6-timer-actions">
            {!timer.abandoned && timer.status === "running" ? <button className="ui-button ui-button--secondary" disabled={busy} onClick={() => void mutate({ action: "pause" })}>Pause</button> : null}
            {!timer.abandoned && timer.status === "paused" ? <button className="ui-button ui-button--secondary" disabled={busy} onClick={() => void mutate({ action: "resume" })}>Resume</button> : null}
            {!timer.abandoned ? <button className="ui-button ui-button--primary" disabled={busy} onClick={() => void mutate({ action: "finish" })}>Finish session</button> : null}
            <button className="ui-button ui-button--ghost" disabled={busy} onClick={() => { if (window.confirm("Discard this timer without adding study time?")) void mutate({ action: "discard" }); }}>Discard</button>
          </div>
        </CardBody>
      </Card>
      <Card className="study-session-details">
        <CardHeader title="Session details" description="Your current timer is saved automatically."/>
        <CardBody><div className="phase6-detail-list"><div><span>Started</span><strong>{new Date(timer.startedAt).toLocaleString()}</strong></div><div><span>Timezone</span><strong>{timer.timezone}</strong></div><div><span>Saved time</span><strong>{duration(timer.elapsedSeconds)}</strong></div><div><span>Navigation</span><strong>You can move around safely</strong></div></div></CardBody>
      </Card>
    </div>
  );

  return (
    <div className="phase6-study-grid study-session-grid study-session-grid--idle">
      <Card className="phase6-focus-card phase6-focus-card--setup study-builder-card">
        <CardHeader title="Start a focus session" description="Choose what to study and how long you want to focus."/>
        <CardBody>
          <form className="phase6-form study-builder" onSubmit={start}>
            <section className="study-builder-section">
              <div className="study-builder-section__title"><span>1</span><div><strong>Subject & chapter</strong><small>Track a specific chapter, or keep it as general study.</small></div></div>
              <div className="study-builder-fields">
                <label><span>Subject</span><select value={subjectId} onChange={(event) => { setSubjectId(event.target.value); setChapterId(""); }}><option value="">General study</option>{model.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.title}</option>)}</select></label>
                <label><span>Chapter</span><select value={chapterId} onChange={(event) => setChapterId(event.target.value)} disabled={!selectedSubject}><option value="">No chapter selected</option>{selectedSubject?.chapters.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.number}. {chapter.title}</option>)}</select></label>
              </div>
            </section>

            <section className="study-builder-section">
              <div className="study-builder-section__title"><span>2</span><div><strong>Timer</strong><small>Choose a timed focus block or an open-ended stopwatch.</small></div></div>
              <fieldset className="phase6-mode study-mode-picker"><legend>Timer mode</legend>
                <button type="button" className={mode === "pomodoro" ? "is-active" : ""} onClick={() => setMode("pomodoro")}><Icon name="timer" size={18}/><span><strong>Pomodoro</strong><small>Focus + break cycles</small></span></button>
                <button type="button" className={mode === "stopwatch" ? "is-active" : ""} onClick={() => setMode("stopwatch")}><Icon name="clock" size={18}/><span><strong>Stopwatch</strong><small>Study without a fixed end</small></span></button>
              </fieldset>

              {mode === "pomodoro" ? <div className="study-duration-panel">
                <div className="phase6-presets study-presets">
                  <button type="button" className={focusMinutes === 25 && breakMinutes === 5 ? "is-active" : ""} onClick={() => { setFocusMinutes(25); setBreakMinutes(5); }}><strong>25 / 5</strong><small>focus / break</small></button>
                  <button type="button" className={focusMinutes === 50 && breakMinutes === 10 ? "is-active" : ""} onClick={() => { setFocusMinutes(50); setBreakMinutes(10); }}><strong>50 / 10</strong><small>focus / break</small></button>
                  <span>or set your own</span>
                </div>
                <div className="phase6-form-row study-custom-time"><label><span>Focus minutes</span><input type="number" min="1" max="720" value={focusMinutes} onChange={(event) => setFocusMinutes(Number(event.target.value))}/></label><label><span>Break minutes</span><input type="number" min="0" max="120" value={breakMinutes} onChange={(event) => setBreakMinutes(Number(event.target.value))}/></label></div>
              </div> : <div className="phase6-note"><Icon name="clock"/><span>Stopwatch records the exact focused time when you finish the session.</span></div>}
            </section>

            {error ? <div className="phase6-inline-error" role="alert">{error}</div> : null}
            <button className="ui-button ui-button--primary phase6-start-button study-start-button" disabled={busy} type="submit"><Icon name="timer" size={17}/>{busy ? "Starting…" : "Start focus session"}</button>
          </form>
        </CardBody>
      </Card>

      <StudySideRail model={model}/>
    </div>
  );
}
