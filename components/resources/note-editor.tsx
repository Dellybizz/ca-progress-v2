"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { useStudentContext } from "@/components/academic/student-context-provider";
import { offlineMutationFetch, safeLocalHtml } from "@/lib/offline/mutation";
import type { CommunityNoteDraft, NoteSubjectOption } from "@/lib/notes/types";
import type { NoteCard, UploadCard } from "@/lib/resources/types";
import { assertNoteContentSize } from '@/lib/notes/content-limits';
import {getOfflineMeta,putOfflineMeta} from '@/lib/offline/database';
type LegacyDraft={title:string;bodyHtml:string;subjectId:string;chapterId:string;topicId:string;tags:string;visibility:'private'|'shared';resourceIds:string[];clientId:string|null;savedId:string|null};

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
  onDirtyChange,
}: {
  note?: NoteCard | null;
  subjects: NoteSubjectOption[];
  availableUploads?: UploadCard[];
  communityDraft?: CommunityNoteDraft | null;
  compact?: boolean;
  onSaved?: () => void;
  initialSubjectId?: string;
  initialChapterId?: string;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const context = useStudentContext();
  const router = useRouter();
  const editorRef = useRef<HTMLDivElement>(null);
  const savingRef = useRef(false), createIdRef = useRef<string|null>(null), editVersionRef = useRef(0), dirtyRef = useRef(false);
  const savedIdRef = useRef(note?.id ?? null),savedRevisionRef=useRef(note?.revision);
  const [notice,setNotice] = useState<string|null>(null);
  useEffect(()=>{const guard=(event:BeforeUnloadEvent)=>{if(dirtyRef.current){event.preventDefault();event.returnValue='';}};window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard);},[]);
  const [editVersion,setEditVersion]=useState(0);
  const [recoveredDraft,setRecoveredDraft]=useState<LegacyDraft|null>(null);
  const draftWrites=useRef(Promise.resolve());
  function changed(){editVersionRef.current+=1;setEditVersion(editVersionRef.current);dirtyRef.current=true;onDirtyChange?.(true);}
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

  const draftKey=`legacy-note-draft:${note?.id??communityDraft?.messageId??'new'}`;
  useEffect(()=>{let active=true;if(context.userId)getOfflineMeta<LegacyDraft|null>(context.userId,draftKey).then(draft=>{if(active&&draft&&typeof draft.bodyHtml==='string')setRecoveredDraft(draft);}).catch(()=>{if(active)setError('Device draft recovery is unavailable. Keep this page open until your note is saved.');});return()=>{active=false;};},[context.userId,draftKey]);
  useEffect(()=>{
    if(!context.userId||!dirtyRef.current)return;
    const draft:LegacyDraft={title,bodyHtml:editorRef.current?.innerHTML??'',subjectId,chapterId,topicId,tags,visibility,resourceIds,clientId:createIdRef.current,savedId:savedIdRef.current};
    const owner=context.userId;
    draftWrites.current=draftWrites.current.catch(()=>undefined).then(()=>putOfflineMeta(owner,draftKey,draft)).catch(()=>{setError('Your device could not retain this draft. Keep this page open until saved.');});
  },[editVersion,title,subjectId,chapterId,topicId,tags,visibility,resourceIds,context.userId,draftKey]);
  function restoreDraft(){if(!recoveredDraft||!editorRef.current)return;if(dirtyRef.current&&!window.confirm('Replace your current unsaved edits with the recovered draft?'))return;const draft=recoveredDraft;editorRef.current.innerHTML=safeLocalHtml(draft.bodyHtml);setTitle(draft.title);setSubjectId(draft.subjectId);setChapterId(draft.chapterId);setTopicId(draft.topicId);setTags(draft.tags);setVisibility(draft.visibility);setResourceIds(draft.resourceIds);createIdRef.current=draft.clientId;savedIdRef.current=draft.savedId;setRecoveredDraft(null);changed();}

  function format(command: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    changed();
  }

  function insertHtml(html: string) {
    editorRef.current?.focus();
    document.execCommand("insertHTML", false, html);
    changed();
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
    const table=node?.closest('table');
    return table && editorRef.current?.contains(table) ? table as HTMLTableElement : null;
  }

  function addRow() {
    const table = activeTable();
    const row = table?.rows.item(table.rows.length - 1);
    if (!table || !row) return;
    const next = table.insertRow();
    for (let index = 0; index < row.cells.length; index += 1) next.insertCell().innerHTML = "<br>";
    changed();
  }

  function removeRow() {
    const table = activeTable();
    if (table && table.rows.length > 1) {table.deleteRow(table.rows.length - 1);changed();}
  }

  function addColumn() {
    const table = activeTable();
    if (!table) return;
    for (const row of Array.from(table.rows)) row.insertCell().innerHTML = "<br>";
    changed();
  }

  function removeColumn() {
    const table = activeTable();
    if (!table || !table.rows.length || table.rows[0].cells.length <= 1) return;
    const index = table.rows[0].cells.length - 1;
    for (const row of Array.from(table.rows)) if (row.cells.length > index) row.deleteCell(index);
    changed();
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
    changed();
  }

  function toggleResource(id: string) {
    setResourceIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if(savingRef.current)return;
    savingRef.current=true;
    const savedVersion=editVersionRef.current;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const bodyHtml=editorRef.current?.innerHTML??'';assertNoteContentSize(bodyHtml);
      createIdRef.current??=crypto.randomUUID();
      const {response,queued} = await offlineMutationFetch(context.userId!, "/api/v1/notes", {
          id: savedIdRef.current,
          expectedRevision:savedRevisionRef.current,
          clientId:createIdRef.current,
          title,
          bodyHtml,
          subjectId: subjectId || null,
          chapterId: chapterId || null,
          topicId: topicId || null,
          tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
          visibility: communityDraft ? "private" : visibility,
          sourceMessageId: communityDraft?.messageId ?? null,
          resourceIds,
        }, {}, note ? { title: note.title, body_html: note.bodyHtml, subject_id: note.subjectId, chapter_id: note.chapterId, visibility: note.visibility, updated_at: note.updatedAt } : null);
      const payload = await response.json() as { id?: string; error?: string;noteRevision?:number };
      if(response.status===409&&payload.id)savedIdRef.current=payload.id;if(typeof payload.noteRevision==='number')savedRevisionRef.current=payload.noteRevision;
      if (!response.ok || !payload.id) throw new Error(payload.error || "Note could not be saved.");
      savedIdRef.current=payload.id;if(typeof payload.noteRevision==='number')savedRevisionRef.current=payload.noteRevision;
      if(savedVersion!==editVersionRef.current){setNotice('Your earlier changes were saved. Save again to include your latest edits.');return;}
      if(context.userId){const owner=context.userId;draftWrites.current=draftWrites.current.then(async()=>{if(savedVersion===editVersionRef.current)await putOfflineMeta(owner,draftKey,null);});await draftWrites.current;}
      if(savedVersion!==editVersionRef.current){setNotice('Your earlier changes were saved. Save again to include your latest edits.');return;}
      dirtyRef.current=false;onDirtyChange?.(false);
      onSaved?.();
      if(!queued){router.push(`/notes/${payload.id}`);router.refresh();}
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Note could not be saved.");
    } finally {
      setBusy(false);
      savingRef.current=false;
    }
  }

  return <form className={`phase7-note-editor${compact ? " phase7-note-editor--compact" : ""}`} onSubmit={save} onInputCapture={changed} onChangeCapture={changed}>
    {recoveredDraft?<p role="status">An unsaved draft is available on this device. <button type="button" onClick={restoreDraft}>Restore draft</button></p>:null}
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
    <div ref={editorRef} role="textbox" aria-label="Note content" aria-multiline="true" className="phase7-rich-editor" contentEditable suppressContentEditableWarning data-placeholder="Write your revision note…" dangerouslySetInnerHTML={{ __html: initialHtml }}/>

    <div className="phase7-editor-meta"><label><span>Subject</span><select value={subjectId} onChange={(event) => { setSubjectId(event.target.value); setChapterId(""); setTopicId(""); }}><option value="">General Notes</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.title}</option>)}</select></label><label><span>Chapter</span><select value={chapterId} disabled={!selectedSubject} onChange={(event) => { setChapterId(event.target.value); setTopicId(""); }}><option value="">No chapter</option>{selectedSubject?.chapters.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.number}. {chapter.title}</option>)}</select></label><label><span>Unit / AS (optional)</span><select value={topicId} disabled={!selectedChapter} onChange={(event) => setTopicId(event.target.value)}><option value="">Whole chapter</option>{selectedChapter?.topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.unitNumber ? `${topic.unitNumber} · ` : ""}{topic.title}</option>)}</select></label><label><span>Tags</span><input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="audit, cash flow, revision"/></label></div>

    {availableUploads.length ? <fieldset className="phase7-policy-note"><legend>Private note files</legend><span>Link images, PDFs or other files already in My Files. File access keeps its existing ownership checks.</span><div>{availableUploads.map((upload) => <label key={upload.id}><input type="checkbox" checked={resourceIds.includes(upload.id)} onChange={() => toggleResource(upload.id)}/> {upload.title} <small>({upload.extension.toUpperCase()})</small></label>)}</div></fieldset> : null}
    {visibility === "shared" && !communityDraft ? <div className="phase7-policy-note"><Icon name="shield" size={17}/><span>Sharing is explicit. Shared notes enter moderation before the community can see them; linked files remain governed by their own access settings.</span></div> : <div className="phase7-policy-note"><Icon name="lock" size={17}/><span>Private notes and private note files are visible only to you.</span></div>}
    {error ? <div className="phase7-inline-error" role="alert">{error}</div> : null}
    {notice?<p role="status">{notice}</p>:null}
    <div className="phase7-editor-actions"><button className="ui-button ui-button--primary" disabled={busy} type="submit">{busy ? "Saving…" : note ? "Save revision note" : "Create revision note"}</button></div>
  </form>;
}
