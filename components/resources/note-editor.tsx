"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import type { NoteCard } from "@/lib/resources/types";
import type { StudySubjectOption } from "@/lib/study/types";

export function NoteEditor({ note, subjects, compact = false, onSaved }: { note?: NoteCard | null; subjects: StudySubjectOption[]; compact?: boolean; onSaved?: () => void }) {
  const router = useRouter();
  const editorRef = useRef<HTMLDivElement>(null);
  const [title, setTitle] = useState(note?.title ?? "");
  const [subjectId, setSubjectId] = useState(note?.subjectId ?? "");
  const [chapterId, setChapterId] = useState(note?.chapterId ?? "");
  const [tags, setTags] = useState(note?.tags.join(", ") ?? "");
  const [visibility, setVisibility] = useState<"private" | "shared">(note?.visibility ?? "private");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedSubject = useMemo(() => subjects.find((subject) => subject.id === subjectId) ?? null, [subjectId, subjects]);

  function format(command: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
  }

  function addLink() {
    const href = window.prompt("Paste an https:// or mailto: link");
    if (href) format("createLink", href);
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
          tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
          visibility,
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
    <div className="phase7-editor-topline"><label><span>Title</span><input required maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Cash flow revision notes"/></label><label><span>Visibility</span><select value={visibility} onChange={(event) => setVisibility(event.target.value as "private" | "shared")}><option value="private">Private</option><option value="shared">Share with Community</option></select></label></div>
    <div className="phase7-rich-toolbar" role="toolbar" aria-label="Note formatting"><button type="button" onClick={() => format("bold")}><strong>B</strong><span className="sr-only">Bold</span></button><button type="button" onClick={() => format("italic")}><em>I</em><span className="sr-only">Italic</span></button><button type="button" onClick={() => format("underline")}><u>U</u><span className="sr-only">Underline</span></button><button type="button" onClick={() => format("insertUnorderedList")}>• List</button><button type="button" onClick={() => format("insertOrderedList")}>1. List</button><button type="button" onClick={() => format("formatBlock", "blockquote")}>Quote</button><button type="button" onClick={addLink}>Link</button></div>
    <div ref={editorRef} className="phase7-rich-editor" contentEditable suppressContentEditableWarning data-placeholder="Write your note…" dangerouslySetInnerHTML={{ __html: note?.bodyHtml ?? "<p><br></p>" }}/>
    <div className="phase7-editor-meta"><label><span>Subject</span><select value={subjectId} onChange={(event) => { setSubjectId(event.target.value); setChapterId(""); }}><option value="">No subject</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.title}</option>)}</select></label><label><span>Chapter</span><select value={chapterId} disabled={!selectedSubject} onChange={(event) => setChapterId(event.target.value)}><option value="">No chapter</option>{selectedSubject?.chapters.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.number}. {chapter.title}</option>)}</select></label><label><span>Tags</span><input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="audit, cash flow, revision"/></label></div>
    {visibility === "shared" ? <div className="phase7-policy-note"><Icon name="shield" size={17}/><span>Shared notes enter moderation before the community can see them. Editing an approved note sends it back for review.</span></div> : <div className="phase7-policy-note"><Icon name="lock" size={17}/><span>Private notes are visible only to you.</span></div>}
    {error ? <div className="phase7-inline-error" role="alert">{error}</div> : null}
    <div className="phase7-editor-actions"><button className="ui-button ui-button--primary" disabled={busy} type="submit">{busy ? "Saving…" : note ? "Save note" : "Create note"}</button></div>
  </form>;
}
