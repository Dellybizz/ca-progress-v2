"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Icon } from "@/components/ui/icon";
import { useStudentContext } from "@/components/academic/student-context-provider";
import { offlineMutationFetch } from "@/lib/offline/mutation";
import type { ProgressChapter, ProgressMutationResult, ProgressReadyModel, ProgressStage, ProgressState } from "@/lib/progress/types";

const STAGES: Array<{ key: ProgressStage; label: string; short: string }> = [
  { key: "completed", label: "First Completion", short: "Done" },
  { key: "revision_1", label: "Revision 1", short: "Rev. 1" },
  { key: "revision_2", label: "Revision 2", short: "Rev. 2" },
  { key: "test_1", label: "Test 1", short: "Test 1" },
  { key: "test_2", label: "Test 2", short: "Test 2" },
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
  return false;
}

function optimisticState(state: ProgressState, stage: ProgressStage, enabled: boolean): ProgressState {
  return { ...state, [fieldForStage[stage]]: enabled ? new Date().toISOString() : null };
}

function isTestStage(stage: ProgressStage): stage is "test_1" | "test_2" {
  return stage === "test_1" || stage === "test_2";
}

function shortSubjectTitle(title: string) {
  const labels: Record<string, string> = {
    "Financial Management and Strategic Management": "FM SM",
    "Cost and Management Accounting": "Costing",
    "Auditing and Ethics": "Audit",
    "Corporate and Other Laws": "Law",
  };
  return labels[title] ?? title;
}

function sectionTitle(subjectTitle: string, sectionKey: string | null) {
  if (!sectionKey) return null;
  const key = sectionKey.toLocaleLowerCase().replaceAll("_", "-");
  if (subjectTitle === "Taxation") {
    if (/gst|goods|indirect/.test(key)) return "Goods and Service Tax (IDT)";
    if (/income|direct/.test(key)) return "Income Tax (DT)";
  }
  if (subjectTitle === "Financial Management and Strategic Management") {
    if (/strategic|strategy/.test(key)) return "Strategic Management";
    if (/financial|finance/.test(key)) return "Financial Management";
  }
  return null;
}

export function ProgressTracker({
  model,
  subjectLocked = false,
  initialChapterId,
}: {
  model: ProgressReadyModel;
  subjectLocked?: boolean;
  initialChapterId?: string;
}) {
  const context = useStudentContext();
  const router = useRouter();
  const initialChapter = initialChapterId ? model.chapters.find((chapter) => chapter.id === initialChapterId) ?? null : null;
  const [chapters, setChapters] = useState(model.chapters);
  const [query, setQuery] = useState(initialChapter ? `${initialChapter.number} ${initialChapter.title}` : "");
  const [subject, setSubject] = useState(subjectLocked && model.chapters[0] ? model.chapters[0].subjectId : "all");
  const [group, setGroup] = useState("all");
  const saveChains = useRef(new Map<string, Promise<void>>());
  const intentVersions = useRef(new Map<string, number>());
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [undoEvent, setUndoEvent] = useState<{ id: string; chapterId: string } | null>(null);

  const subjects = useMemo(() => {
    const map = new Map<string, { id: string; title: string }>();
    chapters.forEach((chapter) => map.set(chapter.subjectId, { id: chapter.subjectId, title: chapter.subjectTitle }));
    return [...map.values()];
  }, [chapters]);
  const groups = useMemo(
    () => [...new Map(chapters.map((chapter) => [chapter.groupCode, { code: chapter.groupCode, name: chapter.groupName }])).values()],
    [chapters],
  );
  const filtered = useMemo(() => chapters.filter((chapter) => {
    if (subject !== "all" && chapter.subjectId !== subject) return false;
    if (group !== "all" && chapter.groupCode !== group) return false;
    const q = query.trim().toLocaleLowerCase();
    return !q || `${chapter.number} ${chapter.title} ${chapter.subjectTitle}`.toLocaleLowerCase().includes(q);
  }), [chapters, group, query, subject]);
  const grouped = useMemo(() => [...new Map(filtered.map((chapter) => [chapter.subjectId, { title: chapter.subjectTitle, chapters: filtered.filter((item) => item.subjectId === chapter.subjectId) }])).values()].map((item) => ({ ...item, sections: [...new Map(item.chapters.map((chapter) => [sectionTitle(item.title, chapter.sectionKey) ?? "", { title: sectionTitle(item.title, chapter.sectionKey), chapters: item.chapters.filter((candidate) => (sectionTitle(item.title, candidate.sectionKey) ?? "") === (sectionTitle(item.title, chapter.sectionKey) ?? "")) }])).values()] })), [filtered]);

  function mutate(chapter: ProgressChapter, stage: ProgressStage) {
    if (isTestStage(stage)) {
      router.push(`/tests?chapterId=${encodeURIComponent(chapter.id)}&stage=${stage}`);
      return;
    }
    const enabled = !stageEnabled(chapter.state, stage);
    if ((enabled && stageLocked(chapter.state, stage)) || (!enabled && clearLocked(chapter.state, stage))) return;
    const previous = chapter.state;
    const next = optimisticState(previous, stage, enabled);
    const key = `${chapter.id}:${stage}`;
    const version = (intentVersions.current.get(key) ?? 0) + 1;
    intentVersions.current.set(key, version);
    flushSync(() => {
      setSaveState("saved");
      setMessage(null);
      setChapters((items) => items.map((item) => item.id === chapter.id ? { ...item, state: next } : item));
    });
    const persist = async () => {
      try {
        const {response,queued} = await offlineMutationFetch(context.userId!, "/api/progress", { action: "set_stage", chapterId: chapter.id, stage, enabled }, {state:next,saved_at:new Date().toISOString()}, { ...previous });
        const payload = await response.json() as ProgressMutationResult & { error?: string };
        if (!response.ok) throw new Error(payload.error || "Progress could not be saved.");
        if (intentVersions.current.get(key) === version) setChapters((items) => items.map((item) => item.id === chapter.id ? { ...item, state: payload.state, updatedAt: payload.saved_at } : item));
        setUndoEvent(payload.event_id ? { id: payload.event_id, chapterId: chapter.id } : null);
        if(queued)setMessage("Saved on this device. It will sync when you reconnect.");
      } catch (error) {
        if (intentVersions.current.get(key) === version) {
          setChapters((items) => items.map((item) => item.id === chapter.id ? { ...item, state: previous } : item));
          setSaveState("error");
          setMessage(error instanceof Error ? error.message : "Progress could not be saved.");
        }
      }
    };
    const queuedSave = (saveChains.current.get(key) ?? Promise.resolve()).then(persist, persist);
    saveChains.current.set(key, queuedSave);
    void queuedSave.finally(() => { if (saveChains.current.get(key) === queuedSave) saveChains.current.delete(key); });
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
      {!subjectLocked && groups.length > 1 ? <nav className="progress-group-tabs" aria-label="Group"><button type="button" className={group === "all" ? "is-active" : ""} onClick={() => setGroup("all")}>Both groups</button>{groups.map((item) => <button type="button" key={item.code} className={group === item.code ? "is-active" : ""} onClick={() => { setGroup(item.code); setSubject("all"); }}>{item.name}</button>)}</nav> : null}
      {!subjectLocked ? <nav className="progress-subject-tabs" aria-label="Subject"><span>Subjects</span><button type="button" className={subject === "all" ? "is-active" : ""} onClick={() => setSubject("all")}>All subjects</button>{subjects.filter((item) => group === "all" || chapters.some((chapter) => chapter.subjectId === item.id && chapter.groupCode === group)).map((item) => <button type="button" key={item.id} className={subject === item.id ? "is-active" : ""} onClick={() => setSubject(item.id)}>{shortSubjectTitle(item.title)}</button>)}</nav> : null}
      <label className="progress-search progress-search--standalone"><Icon name="search" size={17}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search chapters" /></label>

      {saveState === "error" ? <div className="progress-save-error" role="alert"><span><Icon name="bell" size={15}/>{message}</span>{undoEvent ? <button onClick={undo}>Undo</button> : null}</div> : null}

      {filtered.length ? <div className="progress-subject-sections">{grouped.map((subjectSection) => <section className="progress-subject-section" key={subjectSection.title}><h2>{shortSubjectTitle(subjectSection.title)}</h2>{subjectSection.sections.map((section) => <div className="progress-syllabus-section" key={section.title ?? "chapters"}>{section.title ? <h3>{section.title}</h3> : null}<div className="progress-chapter-list">{section.chapters.map((chapter) => (
        <article className="progress-chapter-card" key={chapter.id} data-canonical-chapter-id={chapter.id}>
          <div className="progress-chapter-heading">
            <h3><b>{chapter.number}</b>{chapter.title}</h3>
            <Link href={`/chapters/${chapter.id}`}>Go to Chapter Hub <Icon name="arrow" size={12}/></Link>
          </div>
          <div className="progress-stage-controls" role="group" aria-label={`${chapter.title} stages`}>
            {STAGES.map((stage) => {
              const active = stageEnabled(chapter.state, stage.key);
              const testStage = isTestStage(stage.key);
              const locked = !active && stageLocked(chapter.state, stage.key)
                ? true
                : !testStage && active ? clearLocked(chapter.state, stage.key) : false;
              const title = locked
                ? "Complete the required earlier stage first."
                : testStage
                  ? active ? `Open saved ${stage.label} marks` : `Record ${stage.label} marks`
                  : stage.label;
              return <button
                key={stage.key}
                type="button"
                className={active ? "is-active" : ""}
                disabled={locked}
                onClick={() => void mutate(chapter, stage.key)}
                title={title}
                aria-pressed={active}
                aria-label={`${stage.label}${active ? ", completed" : ""}`}
              >
                <span>{stage.short}</span>
                {locked ? <Icon name="lock" size={12}/> : active ? <Icon name="check" size={12}/> : testStage ? <Icon name="arrow" size={12}/> : null}
              </button>;
            })}
          </div>
        </article>
      ))}</div></div>)}</section>)}</div> : <div className="progress-empty"><Icon name="search"/><h3>No chapters match these filters</h3><p>Clear the search or broaden the subject/group selection.</p></div>}

    </div>
  );
}
