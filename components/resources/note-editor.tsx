"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import type { CommunityNoteDraft, NoteSubjectOption } from "@/lib/notes/types";
import type { NoteCard, UploadCard } from "@/lib/resources/types";

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function tableHtml(rows: number, cols: number) {
  const safeRows = Math.max(1, Math.min(rows, 12));
  const safeCols = Math.max(1, Math.min(cols, 12));
  return `<table><tbody>${Array.from({ length: safeRows }, () => `<tr>${Array.from({ length: safeCols }, () => "<td><br></td>").join("")}</tr>`).join("")}</tbody></table><p><br></p>`;
}

export function NoteEditor({
  note,
  subjects,
  availableUploads = [],
  communityDraft = null,
  compact = false,
  onSaved,
  initialSubjectId,
  initialChapterId,
}: {
  note?: NoteCard | null;
  subjects: NoteSubjectOption[];
  availableUploads?: UploadCard[];
  communityDraft?: CommunityNoteDraft | null;
  compact?: boolean;
  onSaved?: () => void;
  initialSubjectId?: string;
  initialChapterId?: string;
}) {
  const router = useRouter();
  const editorRef = useRef<HTMLDivElement>(null);
  const sourceSubjectId = communityDraft?.subjectId ?? initialSubjectId;
  const safeInitialSubject = sourceSubjectId ? subjects.find((subject) => subject.id === sourceSubjectId) ?? null : null;
  const safeInitialChapterId = safeInitialSubject && initialChapterId && safeInitialSubject.chapters.some((chapter) => chapter.id === initialChapterId) ? initialChapterId : "";
  const initialHtml = note?.bodyHtml ?? (communityDraft ? `<p>${escapeHtml(communityDraft.answer)}</p>` : "<p><br></p>");
  const [title, setTitle] = useState(note?.title ?? communityDraft?.suggestedTitle ?? "");
  const [subjectId, setSubjectId] = useState(note?.subjectId ?? safeInitialSubject?.id ?? "");
  const [chapterId, setChapterId] = useState(note?.chapterId ?? safeInitialChapterId);
  const [topicId, setTopicId] = useState(note?.topicId ?? "");
  const [tags, setTags] = useState(note?.tags.join(", ") ?? "");
  const [visibility, setVisibility] = useState<"private" | "shared">(communityDraft ? "private" : note?.visibility ?? "private");
  const [resourceIds, setResourceIds] = useState<string[]>(note?.resourceIds ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedSubject = useMemo(() => subjects.find((subject) => subject.id === subjectId) ?? null, [subjectId, subjects]);
  const selectedChapter = useMemo(() => selectedSubject?.chapters.find((chapter) => chapter.id === chapterId) ?? null, [chapterId, selectedSubject]);

  function format(command: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
  }

  function insertHtml(html: string) {
    editorRef.current?.focus();
    document.execCommand("insertHTML", false, html);
  }

  function addLink() {
    const href = window.prompt("Paste an https:// or mailto: link");
    if (href) format("createLink", href);
  }

  function highlight() {
    const selected = window.getSelection()?.toString() ?? "";
    if (selected) insertHtml(`<mark>${escapeHtml(selected)}</mark>`);
  }

  function insertCustomTable() {
    const rows = Number(window.prompt("Rows (1–12)", "3"));
    const cols = Number(window.prompt("Columns (1–12)", "3"));
    if (Number.isInteger(rows) && Number.isInteger(cols) && rows > 0 && cols > 0) insertHtml(tableHtml(rows, cols));
  }

  function activeTable() {
    const selection = window.getSelection();
    const node = selection?.anchorNode instanceof Element ? selection.anchorNode : selection?.anchorNode?.parentElement;
    return node?.closest("table") ?? editorRef.current?.querySelector("table:last-of-type") ?? null;
  }

  function addRow() {
    const table = activeTable();
    const row = table?.rows.item(table.rows.length - 1);
    if (!table || !row) return;
    const next = table.insertRow();
    for (let index = 0; index < row.cells.length; index += 1) next.insertCell().innerHTML = "<br>";
  }

  function removeRow() {
    const table = activeTable();
    if (table && table.rows.length > 1) table.deleteRow(table.rows.length - 1);
  }

  function addColumn() {
    const table = activeTable();
    if (!table) return;
    for (const row of Array.from(table.rows)) row.insertCell().innerHTML = "<br>";
  }

  function removeColumn() {
    const table = activeTable();
    if (!table || !table.rows.length || table.rows[0].cells.length <= 1) return;
    const index = table.rows[0].cells.length - 1;
    for (const row of Array.from(table.rows)) if (row.cells.length > index) row.deleteCell(index);
  }

  function toggleHeader() {
    const table = activeTable();
    const first = table?.rows.item(0);
    if (!table || !first) return;
    const useHeader = first.cells.item(0)?.tagName !== "TH";
    for (const cell of Array.from(first.cells)) {
      const replacement = document.createElement(useHeader ? "th" : "td");
      replacement.innerHTML = cell.innerHTML;
      cell.replaceWith(replacement);
    }
  }

  function toggleResource(id: string) {
    setResourceIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: note?.id ?? null,
          title,
          bodyHtml: editorRef.current?.innerHTML ?? "",
          subjectId: subjectId || null,
          chapterId: chapterId || null,
          topicId: topicId || null,
          tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
          visibility: communityDraft ? "private" : visibility,
          sourceMessageId: communityDraft?.messageId ?? null,
          resourceIds,
        }),
      });
      const payload = await response.json() as { id?: string; error?: string };
      if (!response.ok || !payload.id) throw new Error(payload.error || "Note could not be saved.");
      onSaved?.();
      router.push(`/notes/${payload.id}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Note could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return <form className={`phase7-note-editor${compact ? " phase7-note-editor--compact" : ""}`} onSubmit={save}>
    {communityDraft ? <div className="phase7-policy-note"><Icon name="community" size={17}/><span><strong>Saving from Community.</strong> The answer, author, original question, date and discussion link will be retained as source attribution. This new note starts private.</span></div> : null}
    <div className="phase7-editor-topline"><label><span>Title</span><input required maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Cash flow revision notes"/></label><label><span>Visibility</span><select disabled={Boolean(communityDraft)} value={communityDraft ? "private" : visibility} onChange={(event) => setVisibility(event.target.value as "private" | "shared")}><option value="private">Private</option><option value="shared">Share with Community</option></select></label></div>

    <div className="phase7-rich-toolbar" role="toolbar" aria-label="Revision note formatting">
      <button type="button" onClick={() => format("formatBlock", "h2")}>H2</button><button type="button" onClick={() => format("formatBlock", "h3")}>H3</button>
      <button type="button" onClick={() => format("bold")}><strong>B</strong><span className="sr-only">Bold</span></button><button type="button" onClick={() => format("italic")}><em>I</em><span className="sr-only">Italic</span></button>
      <button type="button" onClick={() => format("insertUnorderedList")}>• List</button><button type="button" onClick={() => format("insertOrderedList")}>1. List</button>
      <button type="button" onClick={() => insertHtml("<ul><li>☐ </li></ul>")}>☐ Checklist</button><button type="button" onClick={highlight}>Highlight</button><button type="button" onClick={addLink}>Link</button>
      <button type="button" onClick={() => insertHtml(tableHtml(2, 2))}>2×2</button><button type="button" onClick={() => insertHtml(tableHtml(3, 3))}>3×3</button><button type="button" onClick={() => insertHtml(tableHtml(4, 4))}>4×4</button><button type="button" onClick={insertCustomTable}>Custom table</button>
      <button type="button" onClick={addRow}>+ Row</button><button type="button" onClick={removeRow}>− Row</button><button type="button" onClick={addColumn}>+ Col</button><button type="button" onClick={removeColumn}>− Col</button><button type="button" onClick={toggleHeader}>Header row</button>
    </div>
    <small>Tables intentionally keep reliable row/column and header controls; cell merging is not enabled.</small>
    <div ref={editorRef} className="phase7-rich-editor" contentEditable suppressContentEditableWarning data-placeholder="Write your revision note…" dangerouslySetInnerHTML={{ __html: initialHtml }}/>

    <div className="phase7-editor-meta"><label><span>Subject</span><select value={subjectId} onChange={(event) => { setSubjectId(event.target.value); setChapterId(""); setTopicId(""); }}><option value="">General Notes</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.title}</option>)}</select></label><label><span>Chapter</span><select value={chapterId} disabled={!selectedSubject} onChange={(event) => { setChapterId(event.target.value); setTopicId(""); }}><option value="">No chapter</option>{selectedSubject?.chapters.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.number}. {chapter.title}</option>)}</select></label><label><span>Unit / AS (optional)</span><select value={topicId} disabled={!selectedChapter} onChange={(event) => setTopicId(event.target.value)}><option value="">Whole chapter</option>{selectedChapter?.topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.unitNumber ? `${topic.unitNumber} · ` : ""}{topic.title}</option>)}</select></label><label><span>Tags</span><input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="audit, cash flow, revision"/></label></div>

    {availableUploads.length ? <fieldset className="phase7-policy-note"><legend>Private note files</legend><span>Link images, PDFs or other files already in My Files. File access keeps its existing ownership checks.</span><div>{availableUploads.map((upload) => <label key={upload.id}><input type="checkbox" checked={resourceIds.includes(upload.id)} onChange={() => toggleResource(upload.id)}/> {upload.title} <small>({upload.extension.toUpperCase()})</small></label>)}</div></fieldset> : null}
    {visibility === "shared" && !communityDraft ? <div className="phase7-policy-note"><Icon name="shield" size={17}/><span>Sharing is explicit. Shared notes enter moderation before the community can see them; linked files remain governed by their own access settings.</span></div> : <div className="phase7-policy-note"><Icon name="lock" size={17}/><span>Private notes and private note files are visible only to you.</span></div>}
    {error ? <div className="phase7-inline-error" role="alert">{error}</div> : null}
    <div className="phase7-editor-actions"><button className="ui-button ui-button--primary" disabled={busy} type="submit">{busy ? "Saving…" : note ? "Save revision note" : "Create revision note"}</button></div>
  </form>;
}
