"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import type { ProgressChapter, ProgressState } from "@/lib/progress/types";
import type { TestProgressStage, TestStageRecord } from "@/lib/tests/types";
import {
  TEST_ATTACHMENT_KINDS,
  TEST_MISTAKE_CATEGORIES,
  type TestArchiveModel,
  type TestAttemptAttachment,
  type TestAttachmentKind,
  type TestMistakeCategory,
} from "@/lib/tests/phase5-types";

function todayDate() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}
function formatDate(value: string | null) {
  if (!value) return "Not yet";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(date) : value;
}
function stageLabel(stage: TestProgressStage) { return stage === "test_1" ? "Test 1" : "Test 2"; }
function mistakeLabel(value: TestMistakeCategory) {
  return ({ conceptual: "Conceptual", calculation: "Calculation", forgot_provision_formula: "Forgot provision / formula", presentation: "Presentation", time_management: "Time management", didnt_revise: "Didn't revise", silly_mistake: "Silly mistake", didnt_understand_question: "Didn't understand question", other: "Other" } as Record<TestMistakeCategory, string>)[value];
}
function attachmentLabel(value: TestAttachmentKind) {
  return ({ question_paper: "Question Paper", my_answer_sheet: "My Answer Sheet", checked_paper: "Checked Paper", suggested_answer: "Suggested Answer" } as Record<TestAttachmentKind, string>)[value];
}

export function TestArchiveWorkspace({
  initialChapters,
  milestoneRecords,
  initialArchive,
}: {
  initialChapters: ProgressChapter[];
  milestoneRecords: TestStageRecord[];
  initialArchive: TestArchiveModel;
}) {
  const searchParams = useSearchParams();
  const requestedChapter = searchParams.get("chapterId");
  const [chapters, setChapters] = useState(initialChapters);
  const [attempts, setAttempts] = useState(initialArchive.attempts);
  const [journal, setJournal] = useState(initialArchive.journal);
  const [chapterId, setChapterId] = useState(initialChapters.some((item) => item.id === requestedChapter) ? requestedChapter as string : initialChapters[0]?.id ?? "");
  const [stage, setStage] = useState<TestProgressStage>(searchParams.get("stage") === "test_2" ? "test_2" : "test_1");
  const [marksScored, setMarksScored] = useState("");
  const [marksTotal, setMarksTotal] = useState("100");
  const [durationMinutes, setDurationMinutes] = useState("60");
  const [completedOn, setCompletedOn] = useState(todayDate());
  const [mistakes, setMistakes] = useState<TestMistakeCategory[]>([]);
  const [mistakeNote, setMistakeNote] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attachmentAttemptId, setAttachmentAttemptId] = useState(initialArchive.attempts[0]?.id ?? "");
  const [attachmentKind, setAttachmentKind] = useState<TestAttachmentKind>("question_paper");
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [journalSubject, setJournalSubject] = useState("all");
  const [journalChapter, setJournalChapter] = useState("all");
  const [journalCategory, setJournalCategory] = useState("all");

  const chapter = chapters.find((item) => item.id === chapterId) ?? null;
  const prerequisiteMet = chapter ? (stage === "test_1" ? Boolean(chapter.state.completed_at) : Boolean(chapter.state.test_1_at)) : false;
  const legacyMilestone = milestoneRecords.find((item) => item.chapterId === chapterId && item.stage === stage) ?? null;
  const subjectOptions = [...new Map(chapters.map((item) => [item.subjectId, item.subjectTitle])).entries()];
  const filteredJournal = journal.filter((entry) =>
    (journalSubject === "all" || entry.subjectId === journalSubject) &&
    (journalChapter === "all" || entry.chapterId === journalChapter) &&
    (journalCategory === "all" || entry.category === journalCategory));

  function updateChapterState(targetChapterId: string, state: ProgressState, savedAt: string) {
    setChapters((items) => items.map((item) => item.id === targetChapterId ? { ...item, state, updatedAt: savedAt } : item));
  }
  function toggleMistake(category: TestMistakeCategory) {
    setMistakes((items) => items.includes(category) ? items.filter((item) => item !== category) : [...items, category]);
  }

  async function saveAttempt() {
    if (!chapter) return;
    setBusy(true); setMessage(null); setError(null);
    try {
      const previous = attempts.find((item) => item.chapterId === chapter.id && item.stage === stage) ?? null;
      const response = await fetch("/api/tests/attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapterId: chapter.id, stage, marksScored: Number(marksScored), marksTotal: Number(marksTotal), durationMinutes: Number(durationMinutes), completedOn, mistakeCategories: mistakes, mistakeNote, idempotencyKey }),
      });
      const payload = await response.json() as { attempt?: TestArchiveModel["attempts"][number]; state?: ProgressState; progressChanged?: boolean; retry?: boolean; savedAt?: string; error?: string };
      if (!response.ok || !payload.attempt || !payload.state || !payload.savedAt) throw new Error(payload.error || "Test attempt could not be saved.");
      const attempt = { ...payload.attempt, improvementPoints: payload.attempt.improvementPoints ?? (previous ? Math.round((payload.attempt.percentage - previous.percentage) * 100) / 100 : null) };
      setAttempts((items) => items.some((item) => item.id === attempt.id) ? items : [attempt, ...items]);
      setJournal((items) => {
        const incoming = attempt.mistakes.map((item) => ({ ...item, subjectId: attempt.subjectId, subjectTitle: attempt.subjectTitle, chapterId: attempt.chapterId, chapterTitle: attempt.chapterTitle, chapterNumber: attempt.chapterNumber, stage: attempt.stage, attemptNumber: attempt.attemptNumber, percentage: attempt.percentage, completedAt: attempt.completedAt }));
        const existingIds = new Set(items.map((item) => item.id));
        return [...incoming.filter((item) => !existingIds.has(item.id)), ...items];
      });
      updateChapterState(attempt.chapterId, payload.state, payload.savedAt);
      setAttachmentAttemptId(attempt.id);
      if (!payload.retry) setIdempotencyKey(crypto.randomUUID());
      setMarksScored(""); setMistakes([]); setMistakeNote("");
      setMessage(payload.retry ? `Retry confirmed: Attempt ${attempt.attemptNumber} was already saved; no duplicate was created.` : payload.progressChanged ? `Attempt ${attempt.attemptNumber} saved. ${stageLabel(stage)} progress was recorded automatically.` : `Attempt ${attempt.attemptNumber} saved to history. Existing ${stageLabel(stage)} progress was left unchanged.`);
    } catch (err) { setError(err instanceof Error ? err.message : "Test attempt could not be saved."); }
    finally { setBusy(false); }
  }

  async function uploadAttachment() {
    if (!attachmentAttemptId || !attachmentFile) return;
    setBusy(true); setMessage(null); setError(null);
    try {
      const issue = await fetch("/api/tests/attachments/upload-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attemptId: attachmentAttemptId, kind: attachmentKind, filename: attachmentFile.name, mimeType: attachmentFile.type, sizeBytes: attachmentFile.size }) });
      const issued = await issue.json() as { uploadId?: string; uploadUrl?: string; headers?: Record<string, string>; error?: string };
      if (!issue.ok || !issued.uploadId || !issued.uploadUrl) throw new Error(issued.error || "Attachment upload could not start.");
      const put = await fetch(issued.uploadUrl, { method: "PUT", headers: issued.headers, body: attachmentFile });
      if (!put.ok) throw new Error("The private R2 upload failed before metadata was committed.");
      let complete = await fetch("/api/tests/attachments/upload-complete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uploadId: issued.uploadId }) });
      if (!complete.ok && complete.status >= 500) complete = await fetch("/api/tests/attachments/upload-complete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uploadId: issued.uploadId }) });
      const saved = await complete.json() as TestAttemptAttachment & { retry?: boolean; error?: string };
      if (!complete.ok || !saved.id) throw new Error(saved.error || "Attachment could not be finalized.");
      setAttempts((items) => items.map((item) => item.id === attachmentAttemptId && !item.attachments.some((file) => file.id === saved.id) ? { ...item, attachments: [...item.attachments, saved] } : item));
      setAttachmentFile(null);
      setMessage(saved.retry ? "Attachment retry confirmed without duplicate metadata." : `${attachmentLabel(attachmentKind)} stored privately.`);
    } catch (err) { setError(err instanceof Error ? err.message : "Attachment upload failed."); }
    finally { setBusy(false); }
  }

  async function openAttachment(id: string) {
    setError(null);
    const response = await fetch(`/api/tests/attachments/${encodeURIComponent(id)}/access`, { cache: "no-store" });
    const payload = await response.json() as { url?: string; error?: string };
    if (!response.ok || !payload.url) { setError(payload.error || "Private attachment could not be opened."); return; }
    window.open(payload.url, "_blank", "noopener,noreferrer");
  }

  if (!chapters.length) return <Card><CardBody><div className="progress-empty"><Icon name="book"/><h2>No applicable chapters</h2><p>Choose an academic profile with mapped chapters before recording tests.</p></div></CardBody></Card>;

  return <div className="progress-workspace tests-progress-workspace">
    <Card><CardHeader title="Save a test attempt" description="Every save is permanent history: Attempt 1, Attempt 2, Attempt 3… A retake never overwrites an earlier result."/><CardBody>
      <div className="planner-form-grid">
        <label><span>Chapter</span><select value={chapterId} disabled={busy} onChange={(event) => setChapterId(event.target.value)}>{chapters.map((item) => <option key={item.id} value={item.id}>{item.subjectTitle} · {item.number} {item.title}</option>)}</select></label>
        <label><span>Test number</span><select value={stage} disabled={busy} onChange={(event) => setStage(event.target.value as TestProgressStage)}><option value="test_1">Test 1</option><option value="test_2">Test 2</option></select></label>
        <label><span>Marks obtained</span><input type="number" min="0" step="0.01" value={marksScored} disabled={busy} onChange={(event) => setMarksScored(event.target.value)}/></label>
        <label><span>Maximum marks</span><input type="number" min="0.01" step="0.01" value={marksTotal} disabled={busy} onChange={(event) => setMarksTotal(event.target.value)}/></label>
        <label><span>Duration (minutes)</span><input type="number" min="1" max="1440" value={durationMinutes} disabled={busy} onChange={(event) => setDurationMinutes(event.target.value)}/></label>
        <label><span>Date</span><input type="date" value={completedOn} disabled={busy} onChange={(event) => setCompletedOn(event.target.value)}/></label>
      </div>
      <div className="progress-save-state"><span><Icon name={prerequisiteMet ? "check" : "lock"} size={15}/>{stage === "test_1" ? prerequisiteMet ? `First Completion recorded ${formatDate(chapter?.state.completed_at ?? null)}.` : "Record First Completion before Test 1." : prerequisiteMet ? `Test 1 progress recorded ${formatDate(chapter?.state.test_1_at ?? null)}.` : "Record Test 1 before Test 2."}</span></div>
      {legacyMilestone ? <p><strong>Existing milestone retained:</strong> {legacyMilestone.marksScored}/{legacyMilestone.marksTotal} · {formatDate(legacyMilestone.completedAt)}. It is preserved as historical Attempt 1 rather than rewritten.</p> : null}
      <fieldset><legend>Mistakes (optional)</legend><div className="phase6-header-links">{TEST_MISTAKE_CATEGORIES.map((category) => <label key={category}><input type="checkbox" checked={mistakes.includes(category)} onChange={() => toggleMistake(category)}/> {mistakeLabel(category)}</label>)}</div></fieldset>
      <label><span>Mistake note (optional)</span><textarea value={mistakeNote} maxLength={1200} onChange={(event) => setMistakeNote(event.target.value)} placeholder="What went wrong, and what should you remember next time?"/></label>
      {message ? <p role="status">{message}</p> : null}{error ? <p role="alert">{error}</p> : null}
      <button className="ui-button ui-button--primary" type="button" disabled={busy || !prerequisiteMet || !marksScored || !marksTotal || !durationMinutes} onClick={() => void saveAttempt()}><Icon name="check" size={15}/>{busy ? "Saving…" : "Save new attempt"}</button>
    </CardBody></Card>

    <Card><CardHeader title="Private test files" description="Question papers, answer sheets, checked papers and suggested answers go directly to private R2 and open only through short-lived ownership-checked links."/><CardBody>
      {attempts.length ? <div className="planner-form-grid">
        <label><span>Attempt</span><select value={attachmentAttemptId} disabled={busy} onChange={(event) => setAttachmentAttemptId(event.target.value)}>{attempts.map((item) => <option key={item.id} value={item.id}>{item.subjectTitle} · {item.chapterNumber} {item.chapterTitle} · {stageLabel(item.stage)} · Attempt {item.attemptNumber}</option>)}</select></label>
        <label><span>File type</span><select value={attachmentKind} disabled={busy} onChange={(event) => setAttachmentKind(event.target.value as TestAttachmentKind)}>{TEST_ATTACHMENT_KINDS.map((kind) => <option key={kind} value={kind}>{attachmentLabel(kind)}</option>)}</select></label>
        <label><span>File</span><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => setAttachmentFile(event.target.files?.[0] ?? null)}/></label>
        <button className="ui-button" type="button" disabled={busy || !attachmentFile} onClick={() => void uploadAttachment()}>Upload privately</button>
      </div> : <p>Save a test attempt before attaching files.</p>}
    </CardBody></Card>

    <Card><CardHeader title="Attempt history" description="Repeated tests append to history. Improvement compares each attempt with the previous attempt for the same chapter and test number."/><CardBody>
      {attempts.length ? <div className="phase6-session-list">{attempts.map((item) => <div key={item.id}><span><strong>{item.subjectTitle} · {item.chapterNumber} {item.chapterTitle} · {stageLabel(item.stage)} · Attempt {item.attemptNumber}</strong><small>{formatDate(item.completedAt)} · {item.durationMinutes ? `${item.durationMinutes} min` : "Duration not recorded (legacy)"} · {item.marksScored}/{item.marksTotal} · {item.percentage}%{item.improvementPoints === null ? "" : ` · ${item.improvementPoints >= 0 ? "+" : ""}${item.improvementPoints} pts vs previous`}</small>{item.mistakes.length ? <small>Mistakes: {item.mistakes.map((mistake) => mistakeLabel(mistake.category)).join(", ")}</small> : null}{item.attachments.length ? <small>{item.attachments.map((file) => <button key={file.id} className="ui-button" type="button" onClick={() => void openAttachment(file.id)}>{attachmentLabel(file.kind)}</button>)}</small> : null}</span><b>{item.percentage}%</b></div>)}</div> : <div className="progress-empty"><Icon name="target"/><h3>No attempts yet</h3><p>Your first valid test save will become Attempt 1 and advance progress once.</p></div>}
    </CardBody></Card>

    <Card><CardHeader title="Mistake Journal" description="Filter append-only mistake history by subject, chapter or category without changing the original test result."/><CardBody>
      <div className="planner-form-grid">
        <label><span>Subject</span><select value={journalSubject} onChange={(event) => setJournalSubject(event.target.value)}><option value="all">All subjects</option>{subjectOptions.map(([id, title]) => <option key={id} value={id}>{title}</option>)}</select></label>
        <label><span>Chapter</span><select value={journalChapter} onChange={(event) => setJournalChapter(event.target.value)}><option value="all">All chapters</option>{chapters.filter((item) => journalSubject === "all" || item.subjectId === journalSubject).map((item) => <option key={item.id} value={item.id}>{item.number} {item.title}</option>)}</select></label>
        <label><span>Category</span><select value={journalCategory} onChange={(event) => setJournalCategory(event.target.value)}><option value="all">All categories</option>{TEST_MISTAKE_CATEGORIES.map((category) => <option key={category} value={category}>{mistakeLabel(category)}</option>)}</select></label>
      </div>
      {filteredJournal.length ? <div className="phase6-session-list">{filteredJournal.map((entry) => <div key={entry.id}><span><strong>{mistakeLabel(entry.category)} · {entry.subjectTitle} · {entry.chapterNumber} {entry.chapterTitle}</strong><small>{stageLabel(entry.stage)} · Attempt {entry.attemptNumber} · {entry.percentage}% · {formatDate(entry.completedAt)}</small>{entry.note ? <small>{entry.note}</small> : null}</span></div>)}</div> : <div className="progress-empty"><Icon name="book"/><h3>No matching mistakes</h3><p>Add mistake categories when saving an attempt to build a reviewable pattern history.</p></div>}
    </CardBody></Card>
  </div>;
}
