"use client";
import { useOfflineModel } from "@/components/offline/use-offline-model";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { useStudentContext } from "@/components/academic/student-context-provider";
import { offlineMutationFetch } from "@/lib/offline/mutation";
import type { StudyPendingReflection, StudyReadyModel, StudyTimerMutationResult } from "@/lib/study/types";

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
      <nav className="study-side-pulse" aria-label="Study activity"><span><small>Today</small><strong>{compactStudyTime(model.analytics.todaySeconds)}</strong></span><span><small>7 days</small><strong>{compactStudyTime(model.analytics.last7DaysSeconds)}</strong></span><span><small>Streak</small><strong>{model.analytics.streakDays}d</strong></span></nav>
      <Card className="study-recent-card">
        <CardHeader title="Recent study"/>
        <CardBody>{model.analytics.recentSessions.length ? <div className="phase6-session-list">{model.analytics.recentSessions.slice(0, 5).map((session) => <div key={session.id}><span><strong>{session.intendedTaskTitle ?? session.chapterTitle ?? session.subjectTitle ?? "General study"}</strong><small>{new Date(session.endedAt).toLocaleString()}{session.understandingScore !== null ? ` · self-reported ${session.understandingScore}%` : ""}{session.focusRating ? ` · ${session.focusRating}` : ""}</small></span><b>{minutesLabel(session.durationSeconds)}</b></div>)}</div> : <div className="phase6-empty study-empty"><span className="study-empty__icon"><Icon name="timer" size={22}/></span><strong>Your study history starts here</strong><p>Complete your first focus session and it’ll appear here automatically.</p></div>}</CardBody>
      </Card>
    </aside>
  );
}

export function StudyTimer({ model: serverModel, initialSubjectId, initialChapterId, initialTaskId, onReviewChange }: { model: StudyReadyModel; initialSubjectId?: string; initialChapterId?: string; initialTaskId?: string; onReviewChange?: (review: { session: StudyPendingReflection; ready: boolean } | null) => void }) {
  const model = useOfflineModel("study", serverModel);
  const context = useStudentContext();
  const router = useRouter();
  const [optimisticStartedAt, setOptimisticStartedAt] = useState<number | null>(null);
  const [optimisticEnded, setOptimisticEnded] = useState(false);
  const [optimisticStatus, setOptimisticStatus] = useState<"running" | "paused" | null>(null);
  const timer = optimisticEnded ? null : model.timer;
  const timerStatus = optimisticStatus ?? timer?.status ?? (optimisticStartedAt !== null ? "running" : null);
  const safeInitialTask = !timer && initialTaskId ? model.tasks.find((task) => task.id === initialTaskId) ?? null : null;
  const requestedSubjectId = safeInitialTask?.subjectId ?? initialSubjectId ?? null;
  const initialSubject = !timer && requestedSubjectId ? model.subjects.find((subject) => subject.id === requestedSubjectId) ?? null : null;
  const requestedChapterId = safeInitialTask?.chapterId ?? initialChapterId ?? null;
  const safeInitialChapterId = !timer && initialSubject && requestedChapterId && initialSubject.chapters.some((chapter) => chapter.id === requestedChapterId) ? requestedChapterId : "";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(timer?.elapsedSeconds ?? 0);
  const [subjectId, setSubjectId] = useState(timer?.subjectId ?? initialSubject?.id ?? "");
  const [chapterId, setChapterId] = useState(timer?.chapterId ?? safeInitialChapterId);
  const [taskId, setTaskId] = useState(timer?.taskId ?? safeInitialTask?.id ?? "");
  const [mode, setMode] = useState<"stopwatch" | "pomodoro">(timer?.mode ?? "pomodoro");
  const [focusMinutes, setFocusMinutes] = useState(Math.round((timer?.focusTargetSeconds ?? 1500) / 60));
  const [breakMinutes, setBreakMinutes] = useState(Math.round((timer?.breakTargetSeconds ?? 300) / 60));
  const selectedSubject = useMemo(() => model.subjects.find((subject) => subject.id === subjectId) ?? null, [model.subjects, subjectId]);
  const taskOptions = useMemo(() => model.tasks.filter((task) => (!subjectId || !task.subjectId || task.subjectId === subjectId) && (!chapterId || !task.chapterId || task.chapterId === chapterId)), [model.tasks, subjectId, chapterId]);

  useEffect(() => {
    if (timerStatus !== "running" || timer?.abandoned) return;
    const tick = () => {
      const value = timer
        ? (timer.storedElapsedSeconds ?? timer.elapsedSeconds) + (timer.runningSince ? Math.max(0, (Date.now() - Date.parse(timer.runningSince)) / 1000) : 0)
        : Math.max(0, (Date.now() - Number(optimisticStartedAt)) / 1000);
      setElapsed(Math.min(43_200, value));
    };
    tick();
    const interval = window.setInterval(tick, 100);
    return () => window.clearInterval(interval);
  }, [optimisticStartedAt, timer, timerStatus]);

  useEffect(() => {
    if (!timer || timer.status !== "running" || timer.abandoned) return;
    const id = window.setInterval(() => {
      if (navigator.onLine) void fetch("/api/study/timer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "touch" }), keepalive: true }).catch(() => undefined);
    }, 5 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [timer]);

  const remaining = timer?.mode === "pomodoro" && timer.focusTargetSeconds ? Math.max(0, timer.focusTargetSeconds - elapsed) : null;
  const isOptimisticallyStarting = !timer && optimisticStartedAt !== null;
  const isActive = Boolean(timer || isOptimisticallyStarting);
  const activeMode = timer?.mode ?? mode;
  const optimisticRemaining = activeMode === "pomodoro" ? Math.max(0, focusMinutes * 60 - elapsed) : null;
  const displaySeconds = timer ? (activeMode === "pomodoro" && remaining !== null ? remaining : elapsed) : isOptimisticallyStarting ? (optimisticRemaining ?? elapsed) : activeMode === "pomodoro" ? focusMinutes * 60 : 0;
  const progress = timer
    ? activeMode === "pomodoro" && timer.focusTargetSeconds
      ? Math.min(100, (elapsed / timer.focusTargetSeconds) * 100)
      : 0
    : isOptimisticallyStarting && activeMode === "pomodoro" ? Math.min(100, (elapsed / (focusMinutes * 60)) * 100) : 0;
  const focusLabel = timer?.intendedTaskTitle ?? timer?.chapterTitle ?? timer?.subjectTitle ?? selectedSubject?.chapters.find((chapter) => chapter.id === chapterId)?.title ?? selectedSubject?.title ?? "General focus";
  const activeStartedAt = timer?.startedAt ?? (optimisticStartedAt !== null ? new Date(optimisticStartedAt).toISOString() : null);

  async function mutate(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const {response,queued} = await offlineMutationFetch(context.userId!, "/api/study/timer", body, {status:String(body.action||"queued")});
      const payload = await response.json() as StudyTimerMutationResult & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Timer could not be updated.");
      if(!queued)router.refresh(); else setError("Timer change saved on this device and queued for sync.");
      return payload;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Timer could not be updated.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function start(event: FormEvent) {
    event.preventDefault();
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    setElapsed(0);
    setOptimisticEnded(false);
    setOptimisticStartedAt(Date.now());
    const result = await mutate({ action: "start", subjectId: subjectId || null, chapterId: chapterId || null, taskId: taskId || null, mode, focusMinutes: mode === "pomodoro" ? focusMinutes : null, breakMinutes: mode === "pomodoro" ? breakMinutes : null, timezone });
    if (!result) setOptimisticStartedAt(null);
  }

  async function end(action: "finish" | "discard") {
    const clientId = crypto.randomUUID();
    const endedAt = new Date().toISOString();
    const provisional: StudyPendingReflection = {
      sessionId: clientId,
      subjectId: timer?.subjectId ?? null,
      chapterId: timer?.chapterId ?? null,
      subjectTitle: timer?.subjectTitle ?? selectedSubject?.title ?? null,
      chapterTitle: timer?.chapterTitle ?? selectedSubject?.chapters.find((chapter) => chapter.id === chapterId)?.title ?? null,
      intendedTaskTitle: timer?.intendedTaskTitle ?? model.tasks.find((task) => task.id === taskId)?.title ?? null,
      durationSeconds: Math.max(1, Math.floor(elapsed)),
      endedAt,
    };
    setOptimisticEnded(true);
    setOptimisticStartedAt(null);
    if (action === "finish" && provisional.durationSeconds >= 120) onReviewChange?.({ session: provisional, ready: false });
    const result = await mutate({ action, ...(action === "finish" ? { clientId } : {}) });
    if (!result) {
      setOptimisticEnded(false);
      onReviewChange?.(null);
      return;
    }
    if (action === "finish" && result.reflection_required) onReviewChange?.({ session: { ...provisional, sessionId: result.session_id ?? clientId, durationSeconds: result.duration_seconds ?? provisional.durationSeconds, endedAt: result.ended_at ?? endedAt }, ready: true });
    else onReviewChange?.(null);
  }

  async function changeStatus(action: "pause" | "resume", next: "paused" | "running") {
    const previous = timerStatus;
    setOptimisticStatus(next);
    const result = await mutate({ action });
    if (!result) setOptimisticStatus(previous === "paused" ? "paused" : previous === "running" ? "running" : null);
  }

  return (
    <div className={`phase6-study-grid study-session-grid study-timer-workspace ${isActive ? "study-session-grid--live" : "study-session-grid--idle"}`}>
      <section className={`study-timer-preview ${timerStatus ? `is-${timerStatus}` : "is-idle"} ${activeMode === "stopwatch" ? "is-stopwatch" : ""}`} aria-label={isActive ? "Active focus timer" : "Focus timer"}>
        <span className="study-timer-preview__mode"><Icon name={activeMode === "pomodoro" ? "timer" : "clock"} size={15}/>{activeMode === "pomodoro" ? "Pomodoro" : "Stopwatch"}{isActive ? ` · ${timer?.abandoned ? "Needs review" : timerStatus}` : ""}</span>
        <div className="study-timer-dial">
          <svg className="study-timer-ring" viewBox="0 0 100 100" aria-hidden="true"><circle className="study-timer-ring__track" cx="50" cy="50" r="47" pathLength="100"/><circle className="study-timer-ring__progress" cx="50" cy="50" r="47" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - progress}/></svg>
          <span><Icon name="book" size={22}/></span>
          <strong aria-live="polite">{duration(displaySeconds)}</strong>
          <small>{focusLabel}</small>
        </div>
        <p>{isActive ? activeMode === "pomodoro" && (remaining === 0 || optimisticRemaining === 0) ? "Focus target reached — finish now or keep studying." : timerStatus === "paused" ? "Paused — your progress is preserved." : activeMode === "pomodoro" ? "Your focus ring is moving with the session." : "Focused time is being recorded." : activeMode === "pomodoro" ? `${focusMinutes} min focus · ${breakMinutes} min break` : "Open-ended focused study"}</p>
        {isActive ? <div className="study-dial-actions">
          {!timer?.abandoned && timerStatus === "running" ? <button className="study-dial-button study-dial-button--secondary" disabled={busy} onClick={() => void changeStatus("pause", "paused")}><Icon name="clock" size={22}/><span>Pause</span></button> : null}
          {!timer?.abandoned && timerStatus === "paused" ? <button className="study-dial-button study-dial-button--primary" disabled={busy} onClick={() => void changeStatus("resume", "running")}><Icon name="arrow" size={22}/><span>Resume</span></button> : null}
          {!timer?.abandoned ? <button className="study-dial-button study-dial-button--primary" disabled={busy} onClick={() => void end("finish")}><Icon name="check" size={22}/><span>Finish</span></button> : null}
          <button className="study-dial-button study-dial-button--secondary" disabled={busy} onClick={() => { if (window.confirm("Discard this timer without adding study time?")) void end("discard"); }}><Icon name="close" size={20}/><span>Discard</span></button>
        </div> : null}
      </section>
      <Card className="phase6-focus-card phase6-focus-card--setup study-builder-card study-control-panel">
        <CardHeader title={isActive ? "Session details" : "Start a focus session"}/>
        <CardBody>{isActive ? <div className="phase6-detail-list study-live-details">
          <div><span>Focus</span><strong>{focusLabel}</strong></div><div><span>Started</span><strong>{activeStartedAt ? new Date(activeStartedAt).toLocaleString() : "Now"}</strong></div><div><span>Mode</span><strong>{activeMode === "pomodoro" ? `Pomodoro · ${Math.round((timer?.focusTargetSeconds ?? focusMinutes * 60) / 60)}/${Math.round((timer?.breakTargetSeconds ?? breakMinutes * 60) / 60)}` : "Stopwatch"}</strong></div><div><span>Pauses</span><strong>{timer?.pauseCount ?? 0}</strong></div>
          {timer?.abandoned ? <div className="phase6-warning"><Icon name="clock"/><div><strong>This timer needs review.</strong><p>Discard it and start fresh so inactive time is not saved.</p></div></div> : null}
          {error ? <div className="phase6-inline-error" role="alert">{error}</div> : null}
        </div> : <form className="phase6-form study-builder" onSubmit={start}>
          <section className="study-builder-section">
            <div className="study-builder-section__title"><span>1</span><div><strong>Subject & chapter</strong></div></div>
            <div className="study-builder-fields">
              <label><span>Subject <small>optional</small></span><select value={subjectId} onChange={(event) => { setSubjectId(event.target.value); setChapterId(""); setTaskId(""); }}><option value="">General focus</option>{model.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.title}</option>)}</select></label>
              <label><span>Chapter <small>optional</small></span><select value={chapterId} onChange={(event) => { setChapterId(event.target.value); setTaskId(""); }} disabled={!selectedSubject}><option value="">No chapter selected</option>{selectedSubject?.chapters.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.number}. {chapter.title}</option>)}</select></label>
              <label><span>Task <small>optional</small></span><select value={taskId} onChange={(event) => setTaskId(event.target.value)}><option value="">No planner task</option>{taskOptions.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label>
            </div>
          </section>

          <section className="study-builder-section">
            <div className="study-builder-section__title"><span>2</span><div><strong>Timer</strong></div></div>
            <fieldset className="phase6-mode study-mode-picker"><legend>Timer mode</legend>
              <button type="button" className={mode === "pomodoro" ? "is-active" : ""} onClick={() => setMode("pomodoro")}><Icon name="timer" size={18}/><span><strong>Pomodoro</strong><small>Focus + break cycles</small></span></button>
              <button type="button" className={mode === "stopwatch" ? "is-active" : ""} onClick={() => setMode("stopwatch")}><Icon name="clock" size={18}/><span><strong>Stopwatch</strong><small>Study without a fixed end</small></span></button>
            </fieldset>
            {mode === "pomodoro" ? <div className="study-duration-panel"><div className="phase6-presets study-presets">
              <button type="button" className={focusMinutes === 25 && breakMinutes === 5 ? "is-active" : ""} onClick={() => { setFocusMinutes(25); setBreakMinutes(5); }}><strong>25 / 5</strong><small>focus / break</small></button>
              <button type="button" className={focusMinutes === 50 && breakMinutes === 10 ? "is-active" : ""} onClick={() => { setFocusMinutes(50); setBreakMinutes(10); }}><strong>50 / 10</strong><small>focus / break</small></button><span>or set your own</span></div>
              <div className="phase6-form-row study-custom-time"><label><span>Focus minutes</span><input type="number" min="1" max="720" value={focusMinutes} onChange={(event) => setFocusMinutes(Number(event.target.value))}/></label><label><span>Break minutes</span><input type="number" min="0" max="120" value={breakMinutes} onChange={(event) => setBreakMinutes(Number(event.target.value))}/></label></div>
            </div> : <div className="phase6-note"><Icon name="clock"/><span>Stopwatch records the exact focused time when you finish the session.</span></div>}
          </section>
          {error ? <div className="phase6-inline-error" role="alert">{error}</div> : null}
          <button className="ui-button ui-button--primary phase6-start-button study-start-button" disabled={busy} type="submit"><Icon name="timer" size={17}/>{busy ? "Starting…" : subjectId || taskId ? "Start focus session" : "Start general focus"}</button>
        </form>}</CardBody>
      </Card>
      <StudySideRail model={model}/>
    </div>
  );
}
