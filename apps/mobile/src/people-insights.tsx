import React, { useCallback, useEffect, useRef, useState } from "react";
import { nativeApiRequest } from "./native-auth";
import { readPeopleSnapshot, storePeopleSnapshot, type BuddyDashboard, type BuddySharing, type InsightsSnapshot, type LocalAccountRepository, type LocalWorkspace, type PeopleSnapshotKey, type TestArchiveSnapshot } from "../../../packages/mobile-data/src";

function useSavedSnapshot<T>(repository: LocalAccountRepository | null, kind: PeopleSnapshotKey, path: string, field: string) {
  const [snapshot, setSnapshot] = useState<{ key: string; value: T } | null>(null);
  const scope = `${repository?.accountId ?? ""}:${kind}:${path}`;
  const value = snapshot?.key === scope ? snapshot.value : null;
  const setValue = (updated: T) => setSnapshot({ key: scope, value: updated });
  const [error, setError] = useState("");
  const requestNumber = useRef(0);
  const refresh = useCallback(async () => {
    if (!repository || !navigator.onLine) return;
    const currentRequest = ++requestNumber.current;
    try {
      const result = await nativeApiRequest(path) as Record<string, unknown>;
      if (!result[field]) throw new Error("The server returned no saved data.");
      const updated = result[field] as T;
      await storePeopleSnapshot(repository.accountId, kind, updated);
      if (currentRequest === requestNumber.current) { setSnapshot({ key: scope, value: updated }); setError(""); }
    } catch (cause) { if (currentRequest === requestNumber.current) setError(cause instanceof Error ? cause.message : "Refresh failed."); }
  }, [repository, kind, path, field, scope]);
  useEffect(() => {
    let live = true;
    const requests = requestNumber;
    if (repository) void readPeopleSnapshot<T>(repository.accountId, kind).then(saved => {
      if (live && saved) setSnapshot({ key: scope, value: saved });
      if (live) void refresh();
    });
    const onOnline = () => void refresh();
    window.addEventListener("online", onOnline);
    const remove = repository?.subscribe(() => void refresh());
    return () => { live = false; requests.current++; remove?.(); window.removeEventListener("online", onOnline); };
  }, [repository, kind, refresh, scope]);
  return { value, setValue, error, setError, refresh };
}

export function NativeBuddy({ repository, workspace }: { repository: LocalAccountRepository | null; workspace: LocalWorkspace }) {
  const { value, setValue, error, setError, refresh } = useSavedSnapshot<BuddyDashboard>(repository, "buddy", "/api/v1/people", "dashboard");
  const [id, setId] = useState(""); const [busy, setBusy] = useState(false);
  const act = async (payload: Record<string, unknown>) => {
    if (!navigator.onLine || !repository) { setError("Connect to manage Study Buddy requests."); return; }
    setBusy(true); setError("");
    try {
      const result = await nativeApiRequest("/api/v1/people", { method: "POST", body: JSON.stringify(payload) }) as { dashboard: BuddyDashboard };
      await storePeopleSnapshot(repository.accountId, "buddy", result.dashboard);
      setValue(result.dashboard); setId("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Request failed."); }
    finally { setBusy(false); }
  };
  const mutate = (action: "request" | "respond" | "remove", buddyUserId: string, response?: "accept" | "reject") => act({ action, buddyUserId, response });
  return <section className="screen people-p5"><header><p className="eyebrow">STUDY BUDDY</p><h1>Accountability</h1><p>Relationships open from saved data. Requests need a connection.</p></header>
    <form className="quick-add" onSubmit={event => { event.preventDefault(); void mutate("request", id.trim()); }}><input value={id} onChange={event => setId(event.target.value)} placeholder="Buddy user ID" aria-label="Buddy user ID"/><button className="primary" disabled={!id.trim() || busy || !navigator.onLine}>Send request</button></form>
    {error && <p className="core-error" role="alert">{error} <button onClick={() => void refresh()}>Retry</button></p>}
    {value?.incomingRequests.length ? <div className="list section-list"><h2>Requests received</h2>{value.incomingRequests.map(item => <article className="row" key={item.relationshipId}><span className="avatar">◎</span><div><strong>{item.displayName}</strong><small>{item.userId}</small></div><button className="secondary" disabled={busy} onClick={() => void mutate("respond", item.userId, "accept")}>Accept</button><button className="secondary" disabled={busy} onClick={() => void mutate("respond", item.userId, "reject")}>Decline</button></article>)}</div> : null}
    {value?.outgoingRequests.length ? <div className="list section-list"><h2>Requests sent</h2>{value.outgoingRequests.map(item => <article className="row" key={item.relationshipId}><span className="avatar">◎</span><div><strong>{item.displayName}</strong><small>Awaiting response</small></div></article>)}</div> : null}
    <div className="list section-list"><h2>Your buddies</h2>{value?.buddies.length ? value.buddies.map(item => <article className="planner-p3-card p5-buddy-card" key={item.relationshipId}><header><div><strong>{item.displayName}</strong><small>{item.userId} · {item.muted ? "Muted" : "Connected"}</small></div></header><div className="p5-buddy-sharing"><strong>What I share</strong>{([ ["shareProfile", "Profile details"], ["shareProgress", "Study minutes"], ["shareStreak", "Streak"], ["shareGoals", "Goals"], ["shareStudyStatus", "Study status"] ] as Array<[keyof BuddySharing, string]>).map(([key, label]) => <label key={key}><input type="checkbox" checked={Boolean(item.mySharing?.[key])} disabled={busy || !navigator.onLine} onChange={() => void act({ action: "sharing", buddyUserId: item.userId, ...item.mySharing, [key]: !item.mySharing[key] })}/>{label}</label>)}</div><p>{item.accountability?.caLevel ?? ""} {item.accountability?.attemptKey ?? ""}</p><div className="button-row"><button className="secondary" disabled={busy} onClick={() => void act({ action: "nudge", buddyUserId: item.userId })}>Nudge</button><button className="secondary" disabled={busy} onClick={() => void act({ action: "safety", buddyUserId: item.userId, mode: item.muted ? "unmute" : "mute" })}>{item.muted ? "Unmute" : "Mute"}</button><button className="secondary" disabled={busy} onClick={() => void mutate("remove", item.userId)}>Remove</button><button className="secondary" disabled={busy} onClick={() => void act({ action: "safety", buddyUserId: item.userId, mode: "block" })}>Block</button></div><form className="p5-buddy-report" onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); void act({ action: "report", buddyUserId: item.userId, reason: data.get("reason"), details: data.get("details") }); event.currentTarget.reset(); }}><label>Report safety issue<input name="reason" required maxLength={80} placeholder="Reason"/></label><textarea name="details" maxLength={600} placeholder="Optional details"/><button className="secondary" disabled={busy}>Report</button></form></article>) : workspace.buddies.length ? workspace.buddies.map(item => <article className="row" key={item.id}><span className="avatar">◎</span><div><strong>{item.name}</strong><small>{item.state}</small></div></article>) : <p>No Study Buddy relationships saved yet.</p>}</div>
    {value?.recentNudges.length ? <div className="list section-list"><h2>Recent nudges</h2>{value.recentNudges.map(item => <article className="row" key={item.id}><span className="avatar">◎</span><div><strong>{item.sender_display_name || "Study Buddy"}</strong><small>{item.message}</small></div></article>)}</div> : null}
  </section>;
}

export function NativeActivity({ repository, workspace }: { repository: LocalAccountRepository | null; workspace: LocalWorkspace }) {
  const [category, setCategory] = useState("overall");
  const { value, error, refresh } = useSavedSnapshot<InsightsSnapshot>(repository, `insights_${category}` as PeopleSnapshotKey, `/api/v1/insights?category=${category}`, "snapshot");
  const entries = value?.leaderboard.entries ?? [];
  return <section className="screen people-p5"><header><p className="eyebrow">ACTIVITY & XP</p><h1>Activity</h1><p>Saved XP and leaderboard data are refreshed from the server.</p></header>
    <div className="metric-grid"><article><small>XP</small><strong>{value?.model.effectiveTotalXp ?? workspace.leaderboard.score}</strong><p>{value?.summary.level.name ?? "Recorded study"}</p></article><article><small>Rank</small><strong>{value?.model.leaderboard.rank ? `#${value.model.leaderboard.rank}` : workspace.leaderboard.rank ? `#${workspace.leaderboard.rank}` : "—"}</strong><p>{value?.leaderboard.period ?? "Saved ranking"}</p></article><article><small>Streak</small><strong>{value?.summary.streak.current ?? "—"}</strong><p>Best {value?.summary.streak.best ?? "—"} days</p></article><article><small>Achievements</small><strong>{value?.summary.achievements.length ?? "—"}</strong><p>Server verified</p></article></div>
    {error && <p className="core-error" role="alert">{error} <button onClick={() => void refresh()}>Retry</button></p>}
    <div className="core-filters syllabus-filter">{["overall", "foundation", "intermediate", "final"].map(item => <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div>
    <div className="list section-list"><h2>Monthly leaders · {value?.leaderboard.category ?? category}</h2>{entries.length ? entries.slice(0, 30).map((item, index) => <article className="row" key={`${item.rank}-${index}`}><span className="avatar">#{item.rank}</span><div><strong>{item.displayName ?? "Student"}</strong><small>{item.totalXp ?? 0} XP</small></div></article>) : <p>Ranking is unavailable offline until this category has been synchronized.</p>}</div>
    <div className="list section-list"><h2>Recent activity</h2>{workspace.activity.map(item => <article className="row" key={item.id}><span className="avatar">+{item.xp}</span><div><strong>{item.title.replaceAll("_", " ")}</strong><small>{new Date(item.occurredAt).toLocaleString("en-IN")}</small></div></article>)}</div>
  </section>;
}

export function NativeTests({ repository, workspace }: { repository: LocalAccountRepository | null; workspace: LocalWorkspace }) {
  const { value, error, refresh } = useSavedSnapshot<TestArchiveSnapshot>(repository, "tests", "/api/v1/test-archive", "archive");
  const [chapterId, setChapterId] = useState(""); const [stage, setStage] = useState<"test_1" | "test_2">("test_1");
  const [scored, setScored] = useState(""); const [total, setTotal] = useState(""); const [minutes, setMinutes] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [key, setKey] = useState(() => crypto.randomUUID()); const [busy, setBusy] = useState(false); const [saveError, setSaveError] = useState("");
  const save = async () => {
    if (!navigator.onLine) { setSaveError("Connect to record a test attempt."); return; }
    setBusy(true); setSaveError("");
    try {
      await nativeApiRequest("/api/v1/test-archive", { method: "POST", body: JSON.stringify({ chapterId, stage, marksScored: Number(scored), marksTotal: Number(total), durationMinutes: Number(minutes), completedOn: date, idempotencyKey: key }) });
      setKey(crypto.randomUUID()); setScored(""); await refresh(); window.dispatchEvent(new Event("ca-sync"));
    } catch (cause) { setSaveError(cause instanceof Error ? cause.message : "Test attempt could not be saved."); }
    finally { setBusy(false); }
  };
  return <section className="screen people-p5"><header><p className="eyebrow">TEST HISTORY</p><h1>Tests</h1><p>Every attempt is permanent history. Scores and progress milestones come from the server.</p></header>
    {error && <p className="core-error" role="alert">{error} <button onClick={() => void refresh()}>Retry</button></p>}
    <p className="note">Recording a new test requires a connection. Saved attempts remain available offline.</p>
    <form className="p5-test-form" onSubmit={event => { event.preventDefault(); void save(); }}><h2>Record a test attempt</h2>
      <label>Chapter<select value={chapterId} onChange={event => setChapterId(event.target.value)} required><option value="">Choose chapter</option>{workspace.academic.chapters.map(chapter => <option value={chapter.id} key={chapter.id}>{chapter.title}</option>)}</select></label>
      <label>Stage<select value={stage} onChange={event => setStage(event.target.value as "test_1" | "test_2")}><option value="test_1">Test 1</option><option value="test_2">Test 2</option></select></label>
      <label>Marks scored<input type="number" min="0" max="1000" step="0.01" required value={scored} onChange={event => setScored(event.target.value)}/></label>
      <label>Total marks<input type="number" min="0.01" max="1000" step="0.01" required value={total} onChange={event => setTotal(event.target.value)}/></label>
      <label>Duration in minutes<input type="number" min="1" max="1440" required value={minutes} onChange={event => setMinutes(event.target.value)}/></label>
      <label>Completed on<input type="date" required max={new Date().toISOString().slice(0, 10)} value={date} onChange={event => setDate(event.target.value)}/></label>
      <button className="primary" disabled={busy || !navigator.onLine || !chapterId || !scored || !total || !minutes}>{busy ? "Saving…" : "Save attempt"}</button>
    </form>{saveError && <p className="core-error" role="alert">{saveError}</p>}
    <div className="list section-list">{value?.attempts.length ? value.attempts.map(item => <article className="row" key={item.id}><span className="avatar">{Math.round(item.percentage)}%</span><div><strong>{item.chapterTitle}</strong><small>{item.subjectTitle} · {item.stage === "test_1" ? "Test 1" : "Test 2"} · Attempt {item.attemptNumber}</small><small>{item.marksScored}/{item.marksTotal} · {new Date(item.completedAt).toLocaleDateString("en-IN")}</small></div></article>) : <p>No test attempts saved on this device.</p>}</div>
  </section>;
}

type AnalyticsModel = {
  levelName: string; attemptKey: string;
  weeklyStudy: { currentMinutes: number; priorMinutes: number; direction: string };
  readiness: Array<{ key: string; label: string; percent: number; numerator: number; denominator: number; calculation: string }>;
  consistency: Array<{ subjectId: string; subjectTitle: string; activeDaysLast14: number; minutesLast14: number }>;
  evidence: { studySessionsLast14: number; reflectedSessions: number; testAttempts: number; completedChapters: number };
  forecast: { attemptLabel: string; status: string; eligible: boolean; completionPercent: number; completedChapters: number; totalChapters: number; remainingChapters: number; observedChaptersPerWeek: number | null; requiredChaptersPerWeek: number | null; projectedCompletionDate: string | null; verifiedAttemptDate: string | null; reasons: string[]; boundary: string; calculation: string };
};

export function NativeAnalytics({ repository, workspace, forecast = false, onNavigate }: { repository: LocalAccountRepository | null; workspace: LocalWorkspace; forecast?: boolean; onNavigate: (route: "profile" | "progress") => void }) {
  const { value, error, refresh } = useSavedSnapshot<AnalyticsModel>(repository, "analytics", "/api/v1/insights/analytics", "model");
  const completed = workspace.progress.filter(item => Boolean(item.payload.completedAt)).length;
  const evidence = value?.forecast;
  const nextRoute = evidence?.verifiedAttemptDate ? "progress" : "profile";
  const nextAction = nextRoute === "profile" ? "Review your attempt" : "Record chapter progress";
  return <section className="screen people-p5 insights-p3"><header><p className="eyebrow">{workspace.academic.level} · {workspace.academic.attempt}</p><h1>{forecast ? "Forecast" : "Analytics"}</h1><p>{forecast ? "A forecast appears when your attempt date and recent progress support one." : "Recorded study, readiness and subject consistency."}</p></header>
    {error && <p className="core-error" role="alert">{error} <button onClick={() => void refresh()}>Retry</button></p>}
    {forecast ? <>
      <div className="metric-grid insights-summary"><article><small>First coverage</small><strong>{evidence?.completionPercent ?? (workspace.progress.length ? Math.round(completed / workspace.progress.length * 100) : 0)}%</strong><p>{evidence?.completedChapters ?? completed} of {evidence?.totalChapters ?? workspace.progress.length} chapters</p></article>{evidence?.eligible && <article><small>Observed pace</small><strong>{evidence.observedChaptersPerWeek ?? "—"}</strong><p>Chapters per week</p></article>}</div>
      <section className="planner-p3-card forecast-outcome"><h2>{evidence?.eligible ? "Projected finish" : "What to do next"}</h2>{evidence?.eligible ? <><strong>{evidence.projectedCompletionDate || "Not available"}</strong><p>Verified exam date: {evidence.verifiedAttemptDate || "Unavailable"}</p>{evidence.requiredChaptersPerWeek != null && <p>Required pace: {evidence.requiredChaptersPerWeek} chapters per week.</p>}</> : <><p>{!value ? "Connect once to validate your attempt date and progress." : !evidence?.verifiedAttemptDate ? "A verified exam date is needed before we can show a finish date." : "Record recent chapter completions to establish a reliable pace."}</p><button className="primary" onClick={() => onNavigate(nextRoute)}>{nextAction}</button></>}
      {value && <details className="insights-method"><summary>How this forecast works</summary><p>{evidence?.boundary}</p><p>{evidence?.calculation}</p>{Boolean(evidence?.reasons.length) && <ul>{evidence?.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>}</details>}</section>
    </> : <>
      <div className="metric-grid insights-summary"><article><small>Study this week</small><strong>{value?.weeklyStudy.currentMinutes ?? "—"} min</strong><p>Previous: {value?.weeklyStudy.priorMinutes ?? "—"} min</p></article><article><small>First coverage</small><strong>{evidence?.completionPercent ?? (workspace.progress.length ? Math.round(completed / workspace.progress.length * 100) : 0)}%</strong><p>{value?.evidence.completedChapters ?? completed} chapters</p></article><article><small>Test attempts</small><strong>{value?.evidence.testAttempts ?? "—"}</strong><p>Recorded evidence</p></article><article><small>Sessions</small><strong>{value?.evidence.studySessionsLast14 ?? "—"}</strong><p>Past 14 days</p></article></div>
      <section className="insights-list"><h2>Readiness</h2>{value?.readiness.length ? value.readiness.map(item => <article className="insights-line" key={item.key}><div><strong>{item.label}</strong><small>{item.numerator}/{item.denominator}</small></div><b>{item.percent}%</b><details><summary>Calculation</summary>{item.calculation}</details></article>) : <p>Connect to load verified readiness metrics.</p>}</section>
      <section className="insights-list"><h2>Subject consistency</h2>{value?.consistency.length ? value.consistency.map(item => <article className="insights-line" key={item.subjectId}><div><strong>{item.subjectTitle}</strong><small>{item.activeDaysLast14} active days · {item.minutesLast14} min in 14 days</small></div></article>) : <p>Connect to load your subject activity.</p>}</section>
    </>}
  </section>;
}
