"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import type { ProgressChapter, ProgressMutationResult, ProgressReadyModel, ProgressStage, ProgressState } from "@/lib/progress/types";

const STAGES: Array<{ key: ProgressStage; label: string; short: string }> = [
  { key: "completed", label: "Completed", short: "Done" },
  { key: "revision_1", label: "Revision 1", short: "1R" },
  { key: "revision_2", label: "Revision 2", short: "2R" },
  { key: "test_1", label: "Test 1", short: "T1" },
  { key: "test_2", label: "Test 2", short: "T2" },
];

const fieldForStage: Record<ProgressStage, keyof ProgressState> = {
  completed: "completed_at",
  revision_1: "revision_1_at",
  revision_2: "revision_2_at",
  test_1: "test_1_at",
  test_2: "test_2_at",
};

function stageEnabled(state: ProgressState, stage: ProgressStage) {
  return Boolean(state[fieldForStage[stage]]);
}

function stageLocked(state: ProgressState, stage: ProgressStage) {
  if (stage === "revision_1" || stage === "test_1") return !state.completed_at;
  if (stage === "revision_2") return !state.revision_1_at;
  if (stage === "test_2") return !state.test_1_at;
  return false;
}

function clearLocked(state: ProgressState, stage: ProgressStage) {
  if (stage === "completed") return Boolean(state.revision_1_at || state.test_1_at);
  if (stage === "revision_1") return Boolean(state.revision_2_at);
  if (stage === "test_1") return Boolean(state.test_2_at);
  return false;
}

function optimisticState(state: ProgressState, stage: ProgressStage, enabled: boolean): ProgressState {
  return { ...state, [fieldForStage[stage]]: enabled ? new Date().toISOString() : null };
}

function summary(chapters: ProgressChapter[]) {
  const total = chapters.length;
  const completed = chapters.filter((chapter) => chapter.state.completed_at).length;
  const revisions = chapters.filter((chapter) => chapter.state.revision_1_at).length + chapters.filter((chapter) => chapter.state.revision_2_at).length;
  const tests = chapters.filter((chapter) => chapter.state.test_1_at).length + chapters.filter((chapter) => chapter.state.test_2_at).length;
  const achieved = completed + revisions + tests;
  return {
    completed,
    completion: total ? Math.round((completed / total) * 100) : 0,
    revisions: total ? Math.round((revisions / (total * 2)) * 100) : 0,
    tests: total ? Math.round((tests / (total * 2)) * 100) : 0,
    overall: total ? Math.round((achieved / (total * 5)) * 100) : 0,
  };
}

export function ProgressTracker({ model, subjectLocked = false }: { model: ProgressReadyModel; subjectLocked?: boolean }) {
  const [chapters, setChapters] = useState(model.chapters);
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState(subjectLocked && model.chapters[0] ? model.chapters[0].subjectId : "all");
  const [group, setGroup] = useState("all");
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [undoEvent, setUndoEvent] = useState<{ id: string; chapterId: string } | null>(null);

  const subjects = useMemo(() => {
    const map = new Map<string, { id: string; title: string }>();
    chapters.forEach((chapter) => map.set(chapter.subjectId, { id: chapter.subjectId, title: chapter.subjectTitle }));
    return [...map.values()];
  }, [chapters]);
  const groups = useMemo(() => [...new Map(chapters.map((chapter) => [chapter.groupCode, { code: chapter.groupCode, name: chapter.groupName }])).values()], [chapters]);
  const filtered = useMemo(() => chapters.filter((chapter) => {
    if (subject !== "all" && chapter.subjectId !== subject) return false;
    if (group !== "all" && chapter.groupCode !== group) return false;
    const q = query.trim().toLocaleLowerCase();
    return !q || `${chapter.number} ${chapter.title} ${chapter.subjectTitle}`.toLocaleLowerCase().includes(q);
  }), [chapters, group, query, subject]);
  const totals = useMemo(() => summary(chapters), [chapters]);

  async function mutate(chapter: ProgressChapter, stage: ProgressStage) {
    const enabled = !stageEnabled(chapter.state, stage);
    if ((enabled && stageLocked(chapter.state, stage)) || (!enabled && clearLocked(chapter.state, stage))) return;
    const previous = chapter.state;
    const next = optimisticState(previous, stage, enabled);
    const key = `${chapter.id}:${stage}`;
    setPendingKey(key);
    setSaveState("saving");
    setMessage(null);
    setChapters((items) => items.map((item) => item.id === chapter.id ? { ...item, state: next } : item));
    try {
      const response = await fetch("/api/progress", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "set_stage", chapterId: chapter.id, stage, enabled }),
      });
      const payload = await response.json() as ProgressMutationResult & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Progress could not be saved.");
      setChapters((items) => items.map((item) => item.id === chapter.id ? { ...item, state: payload.state, updatedAt: payload.saved_at } : item));
      setUndoEvent(payload.event_id ? { id: payload.event_id, chapterId: chapter.id } : null);
      setSaveState("saved");
    } catch (error) {
      setChapters((items) => items.map((item) => item.id === chapter.id ? { ...item, state: previous } : item));
      setSaveState("error");
      setMessage(error instanceof Error ? error.message : "Progress could not be saved.");
    } finally {
      setPendingKey(null);
    }
  }

  async function undo() {
    if (!undoEvent) return;
    setSaveState("saving");
    setMessage(null);
    try {
      const response = await fetch("/api/progress", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "undo", eventId: undoEvent.id }),
      });
      const payload = await response.json() as ProgressMutationResult & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Undo failed.");
      setChapters((items) => items.map((item) => item.id === payload.chapter_id ? { ...item, state: payload.state, updatedAt: payload.saved_at } : item));
      setUndoEvent(null);
      setSaveState("saved");
    } catch (error) {
      setSaveState("error");
      setMessage(error instanceof Error ? error.message : "Undo failed.");
    }
  }

  return (
    <div className="progress-workspace">
      <section className="progress-summary-grid" aria-label="Progress analytics summary">
        <div><span>Overall</span><strong>{totals.overall}%</strong><small>all 5 stages</small></div>
        <div><span>Completed</span><strong>{totals.completion}%</strong><small>{totals.completed}/{chapters.length} chapters</small></div>
        <div><span>Revisions</span><strong>{totals.revisions}%</strong><small>1R + 2R</small></div>
        <div><span>Tests</span><strong>{totals.tests}%</strong><small>T1 + T2</small></div>
      </section>

      <section className="progress-toolbar" aria-label="Progress filters">
        <label className="progress-search"><Icon name="search" size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search chapters or subjects" /></label>
        {!subjectLocked ? <label><span>Subject</span><select value={subject} onChange={(event) => setSubject(event.target.value)}><option value="all">All subjects</option>{subjects.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label> : null}
        {groups.length > 1 ? <label><span>Group</span><select value={group} onChange={(event) => setGroup(event.target.value)}><option value="all">All groups</option>{groups.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label> : null}
        <Link className="progress-analytics-link" href="/analytics">Analytics <Icon name="arrow" size={14}/></Link>
      </section>

      <div className={`progress-save-state progress-save-state--${saveState}`} role="status" aria-live="polite">
        <span><Icon name={saveState === "error" ? "bell" : saveState === "saving" ? "clock" : "check"} size={15}/>{saveState === "saving" ? "Saving automatically…" : saveState === "error" ? message : saveState === "saved" ? "All changes saved" : "Changes auto-save"}</span>
        {undoEvent ? <button onClick={undo}>Undo last change</button> : null}
      </div>

      {filtered.length ? <div className="progress-chapter-list">{filtered.map((chapter) => (
        <article className="progress-chapter-card" key={chapter.id}>
          <div className="progress-chapter-heading"><span>{chapter.subjectTitle}</span><h3><b>{chapter.number}</b>{chapter.title}</h3><small>{chapter.groupName}</small></div>
          <div className="progress-stage-controls" role="group" aria-label={`${chapter.title} stages`}>
            {STAGES.map((stage) => {
              const active = stageEnabled(chapter.state, stage.key);
              const locked = active ? clearLocked(chapter.state, stage.key) : stageLocked(chapter.state, stage.key);
              const pending = pendingKey === `${chapter.id}:${stage.key}`;
              return <button key={stage.key} type="button" className={active ? "is-active" : ""} disabled={locked || Boolean(pendingKey)} onClick={() => mutate(chapter, stage.key)} title={locked ? "Complete the required earlier stage first." : stage.label} aria-pressed={active}><span>{stage.short}</span><small>{stage.label}</small>{locked && !active ? <Icon name="lock" size={12}/> : pending ? <Icon name="clock" size={12}/> : active ? <Icon name="check" size={12}/> : null}</button>;
            })}
          </div>
        </article>
      ))}</div> : <div className="progress-empty"><Icon name="search"/><h3>No chapters match these filters</h3><p>Clear the search or broaden the subject/group selection.</p></div>}

      <section className="progress-history">
        <div><span className="eyebrow">Recent history</span><h2>Latest saved changes</h2><p>Every accepted stage change creates an audit event. Undo only applies when no newer change would be overwritten.</p></div>
        <div className="progress-history-list">{model.history.length ? model.history.slice(0, 8).map((item) => <div key={item.id}><span><strong>{item.chapterTitle}</strong><small>{item.stage.replaceAll("_", " ")} · {item.action}</small></span><Badge tone={item.action === "undo" ? "neutral" : "info"}>{new Date(item.createdAt).toLocaleDateString("en-IN")}</Badge></div>) : <p>No progress changes yet. Your first auto-saved stage update will appear here.</p>}</div>
      </section>
    </div>
  );
}
