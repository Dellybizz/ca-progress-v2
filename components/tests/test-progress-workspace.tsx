"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import type { ProgressChapter, ProgressState } from "@/lib/progress/types";
import {
  type TestProgressStage,
  type TestStageRecord,
  type TestStageSaveResult,
  type TestStageUndoResult,
} from "@/lib/tests/types";

function todayDate() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function formatDate(value: string | null) {
  if (!value) return "Not yet";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(date)
    : value;
}

function stageLabel(stage: TestProgressStage) {
  return stage === "test_1" ? "Test 1" : "Test 2";
}

function recordKey(chapterId: string, stage: TestProgressStage) {
  return `${chapterId}:${stage}`;
}

export function TestProgressWorkspace({
  initialChapters,
  initialRecords,
}: {
  initialChapters: ProgressChapter[];
  initialRecords: TestStageRecord[];
}) {
  const searchParams = useSearchParams();
  const queryChapterId = searchParams.get("chapterId");
  const queryStage = searchParams.get("stage");
  const initialChapterId = initialChapters.some((chapter) => chapter.id === queryChapterId)
    ? queryChapterId as string
    : initialChapters[0]?.id ?? "";
  const initialStage: TestProgressStage = queryStage === "test_2" ? "test_2" : "test_1";
  const initialRecord = initialRecords.find((item) => item.chapterId === initialChapterId && item.stage === initialStage) ?? null;

  const [chapters, setChapters] = useState(initialChapters);
  const [records, setRecords] = useState(initialRecords);
  const [chapterId, setChapterId] = useState(initialChapterId);
  const [stage, setStage] = useState<TestProgressStage>(initialStage);
  const [marksScored, setMarksScored] = useState(initialRecord ? String(initialRecord.marksScored) : "");
  const [marksTotal, setMarksTotal] = useState(initialRecord ? String(initialRecord.marksTotal) : "100");
  const [completedOn, setCompletedOn] = useState(initialRecord ? initialRecord.completedAt.slice(0, 10) : todayDate());
  const [busy, setBusy] = useState<"save" | "undo" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const chapter = chapters.find((item) => item.id === chapterId) ?? null;
  const recordMap = useMemo(() => new Map(records.map((item) => [recordKey(item.chapterId, item.stage), item])), [records]);
  const existing = chapter ? recordMap.get(recordKey(chapter.id, stage)) ?? null : null;
  const prerequisiteMet = chapter
    ? stage === "test_1" ? Boolean(chapter.state.completed_at) : Boolean(chapter.state.test_1_at)
    : false;

  function selectMilestone(nextChapterId: string, nextStage: TestProgressStage) {
    const nextRecord = records.find((item) => item.chapterId === nextChapterId && item.stage === nextStage) ?? null;
    setChapterId(nextChapterId);
    setStage(nextStage);
    setMarksScored(nextRecord ? String(nextRecord.marksScored) : "");
    setMarksTotal(nextRecord ? String(nextRecord.marksTotal) : "100");
    setCompletedOn(nextRecord ? nextRecord.completedAt.slice(0, 10) : todayDate());
    setMessage(null);
    setError(null);
  }

  function updateChapterState(targetChapterId: string, state: ProgressState, savedAt: string) {
    setChapters((items) => items.map((item) => item.id === targetChapterId ? { ...item, state, updatedAt: savedAt } : item));
  }

  async function save() {
    if (!chapter) return;
    setBusy("save");
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/tests/stage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save",
          chapterId: chapter.id,
          stage,
          marksScored: Number(marksScored),
          marksTotal: Number(marksTotal),
          completedOn,
        }),
      });
      const payload = await response.json() as TestStageSaveResult & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Test marks could not be saved.");
      setRecords((items) => {
        const next = items.filter((item) => !(item.chapterId === payload.record.chapterId && item.stage === payload.record.stage));
        return [payload.record, ...next];
      });
      updateChapterState(payload.record.chapterId, payload.state, payload.savedAt);
      setMessage(payload.progressChanged
        ? `${stageLabel(stage)} marks saved. Progress updated automatically.`
        : `${stageLabel(stage)} marks updated. No duplicate progress change was created.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test marks could not be saved.");
    } finally {
      setBusy(null);
    }
  }

  async function undo() {
    if (!existing) return;
    setBusy("undo");
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/tests/stage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "undo", recordId: existing.id }),
      });
      const payload = await response.json() as TestStageUndoResult & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Saved test could not be undone.");
      setRecords((items) => items.filter((item) => item.id !== existing.id));
      updateChapterState(payload.chapterId, payload.state, payload.savedAt);
      setMarksScored("");
      setMarksTotal("100");
      setCompletedOn(todayDate());
      setMessage(payload.progressChanged
        ? `${stageLabel(stage)} save was recovered and the matching progress milestone was reverted.`
        : "The marks record was removed; existing legacy progress was left unchanged.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Saved test could not be undone.");
    } finally {
      setBusy(null);
    }
  }

  if (!chapters.length) return (
    <Card><CardBody><div className="progress-empty"><Icon name="book"/><h2>No applicable chapters</h2><p>Choose an academic profile with mapped chapters before recording test marks.</p></div></CardBody></Card>
  );

  return <div className="progress-workspace tests-progress-workspace">
    <Card>
      <CardHeader
        title="Record a chapter test"
        description="Saving valid Test 1 or Test 2 marks updates the matching progress milestone automatically. There is no second progress checkbox."
      />
      <CardBody>
        <div className="planner-form-grid">
          <label><span>Chapter</span><select value={chapterId} disabled={Boolean(busy)} onChange={(event) => selectMilestone(event.target.value, stage)}>
            {chapters.map((item) => <option key={item.id} value={item.id}>{item.subjectTitle} · {item.number} {item.title}</option>)}
          </select></label>
          <label><span>Test milestone</span><select value={stage} disabled={Boolean(busy)} onChange={(event) => selectMilestone(chapterId, event.target.value as TestProgressStage)}>
            <option value="test_1">Test 1</option>
            <option value="test_2">Test 2</option>
          </select></label>
          <label><span>Marks scored</span><input type="number" min="0" step="0.01" value={marksScored} disabled={Boolean(busy)} onChange={(event) => setMarksScored(event.target.value)} placeholder="e.g. 62"/></label>
          <label><span>Total marks</span><input type="number" min="0.01" step="0.01" value={marksTotal} disabled={Boolean(busy)} onChange={(event) => setMarksTotal(event.target.value)} /></label>
          <label><span>Completed on</span><input type="date" value={completedOn} disabled={Boolean(busy) || Boolean(existing)} onChange={(event) => setCompletedOn(event.target.value)} /></label>
        </div>

        <div className="progress-save-state" role="status" aria-live="polite">
          <span>
            <Icon name={prerequisiteMet ? "check" : "lock"} size={15}/>
            {stage === "test_1"
              ? prerequisiteMet ? `First Completion recorded ${formatDate(chapter?.state.completed_at ?? null)}.` : "Record First Completion before Test 1."
              : prerequisiteMet ? `Test 1 recorded ${formatDate(chapter?.state.test_1_at ?? null)}.` : "Record Test 1 before Test 2."}
          </span>
        </div>

        {existing ? <p><strong>Saved milestone:</strong> {existing.marksScored}/{existing.marksTotal} · {formatDate(existing.completedAt)}. Editing marks does not create another progress event.</p> : null}
        {message ? <p role="status">{message}</p> : null}
        {error ? <p role="alert">{error}</p> : null}

        <div className="phase6-header-links">
          <button className="ui-button ui-button--primary" type="button" disabled={Boolean(busy) || !prerequisiteMet || !marksScored || !marksTotal} onClick={() => void save()}>
            <Icon name="check" size={15}/>{busy === "save" ? "Saving…" : existing ? "Update marks" : `Save ${stageLabel(stage)}`}
          </button>
          {existing ? <button className="ui-button" type="button" disabled={Boolean(busy)} onClick={() => void undo()}>
            {busy === "undo" ? "Recovering…" : "Undo this test save"}
          </button> : null}
        </div>
      </CardBody>
    </Card>

    <Card>
      <CardHeader title="Current Test 1 / Test 2 milestones" description="This quick screen stores one current marks record per chapter milestone. Retake history and mistake analysis are kept out of this milestone flow." />
      <CardBody>
        {records.length ? <div className="phase6-session-list">{records.map((item) => {
          const itemChapter = chapters.find((chapterItem) => chapterItem.id === item.chapterId);
          return <div key={item.id}>
            <span><strong>{itemChapter ? `${itemChapter.number} ${itemChapter.title}` : "Chapter"} · {stageLabel(item.stage)}</strong><small>{itemChapter?.subjectTitle ?? ""} · {formatDate(item.completedAt)}</small></span>
            <b>{item.marksScored}/{item.marksTotal}</b>
          </div>;
        })}</div> : <div className="progress-empty"><Icon name="target"/><h3>No test marks saved yet</h3><p>After First Completion, save Test 1 marks here and the Progress, Today, Analytics and Chapter Hub state will read the same milestone.</p></div>}
      </CardBody>
    </Card>
  </div>;
}
