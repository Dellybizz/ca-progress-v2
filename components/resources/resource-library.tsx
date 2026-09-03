"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import type { ResourceLibraryReady, UploadCard, NoteCard } from "@/lib/resources/types";
import { NoteEditor } from "./note-editor";

const CLIENT_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

function bytes(value: number) { if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`; return `${(value / (1024 * 1024)).toFixed(1)} MB`; }
function statusTone(status: string) { return status === "approved" ? "success" : status === "rejected" || status === "reported" ? "danger" : status === "pending" ? "warning" : "neutral"; }
function matches(value: string, query: string) { return value.toLowerCase().includes(query); }


async function readApiPayload<T extends Record<string, unknown> = { error?: string }>(response: Response): Promise<T> {
  const body = await response.text();
  if (!body.trim()) return {} as T;
  try { return JSON.parse(body) as T; }
  catch { return {} as T; }
}

function uploadFallbackMessage(status: number) {
  if (status === 413) return "This upload is larger than the 10 MB file limit.";
  if (status === 401) return "Your session expired. Sign in again and retry the upload.";
  if (status >= 500) return "The upload service returned a server error. Please retry in a moment.";
  return `Upload failed (${status}). Please check the file and try again.`;
}

function NoteCardView({ note }: { note: NoteCard }) {
  return <Link href={`/notes/${note.id}`} className="phase7-document-card phase7-document-card--note"><div className="phase7-document-icon"><Icon name="notes"/></div><div className="phase7-document-copy"><div className="phase7-document-title"><strong>{note.title}</strong><Badge tone={statusTone(note.moderationStatus)}>{note.isOwner ? note.moderationStatus : "Community · Approved"}</Badge></div><p>{note.excerpt || "Rich-text note"}</p><div className="phase7-document-meta"><span>{note.chapterTitle ?? note.subjectTitle ?? "General note"}</span>{note.tags.slice(0, 3).map((tag) => <span key={tag}>#{tag}</span>)}<span>{note.ownerLabel}</span></div></div><Icon name="chevron" size={17}/></Link>;
}

function UploadCardView({ resource }: { resource: UploadCard }) {
  return <Link href={`/resources/${resource.id}`} className="phase7-document-card phase7-document-card--upload"><div className="phase7-document-icon"><Icon name="book"/></div><div className="phase7-document-copy"><div className="phase7-document-title"><strong>{resource.title}</strong><Badge tone={statusTone(resource.moderationStatus)}>{resource.isOwner ? resource.moderationStatus : "Community · Approved"}</Badge></div><p>{resource.description || resource.originalFilename}</p><div className="phase7-document-meta"><span>{resource.extension.toUpperCase()} · {bytes(resource.sizeBytes)}</span><span>{resource.chapterTitle ?? resource.subjectTitle ?? "General resource"}</span><span>{resource.ownerLabel}</span></div></div><Icon name="chevron" size={17}/></Link>;
}

function UploadPanel({ model, close }: { model: ResourceLibraryReady; close: () => void }) {
  const router = useRouter();
  const [subjectId, setSubjectId] = useState(""); const [chapterId, setChapterId] = useState(""); const [visibility, setVisibility] = useState("private"); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const selectedSubject = model.subjects.find((subject) => subject.id === subjectId) ?? null;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      const form = new FormData(event.currentTarget);
      const selectedFile = form.get("file");
      if (!(selectedFile instanceof File) || selectedFile.size === 0) throw new Error("Choose a file to upload.");
      if (selectedFile.size > CLIENT_UPLOAD_MAX_BYTES) throw new Error("This file is larger than the 10 MB upload limit.");

      const descriptor = { filename: selectedFile.name, mimeType: selectedFile.type, sizeBytes: selectedFile.size, title: form.get("title"), description: form.get("description"), subjectId, chapterId, visibility };
      const issueResponse = await fetch("/api/resources/upload-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(descriptor) });
      const issuePayload = await readApiPayload<{ uploadId?: string; uploadUrl?: string; headers?: Record<string, string>; error?: string }>(issueResponse);
      if (!issueResponse.ok || !issuePayload.uploadId || !issuePayload.uploadUrl) throw new Error(issuePayload.error || uploadFallbackMessage(issueResponse.status));
      const directResponse = await fetch(issuePayload.uploadUrl, { method: "PUT", headers: issuePayload.headers, body: selectedFile });
      if (!directResponse.ok) throw new Error("Direct R2 upload failed. Please retry.");
      const completeResponse = await fetch("/api/resources/upload-complete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uploadId: issuePayload.uploadId }) });
      const completePayload = await readApiPayload<{ error?: string }>(completeResponse);
      if (!completeResponse.ok) throw new Error(completePayload.error || uploadFallbackMessage(completeResponse.status));
      close(); router.refresh();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Upload failed.";
      setError(message === "Failed to fetch" ? "The direct upload could not reach R2. Check your connection and try again." : message);
    } finally { setBusy(false); }
  }
  return <div className="phase7-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><aside className="phase7-upload-drawer" role="dialog" aria-modal="true" aria-label="Upload resource"><div className="phase7-drawer-head"><div><span>Private Storage</span><h2>Upload a resource</h2></div><button onClick={close} aria-label="Close upload drawer"><Icon name="close"/></button></div><form onSubmit={submit} className="phase7-form"><label><span>File</span><input name="file" type="file" required accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,application/pdf,image/jpeg,image/png,image/webp,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"/><small>PDF, images, DOC or DOCX · maximum 10 MB. The browser uploads directly to private R2; the server issues a short-lived URL and rechecks ownership, MIME, size, moderation and quota.</small></label><label><span>Title</span><input name="title" maxLength={160} placeholder="Audit chapter 3 summary"/></label><label><span>Description</span><textarea name="description" maxLength={4000} rows={4} placeholder="Optional context for this file"/></label><label><span>Subject</span><select value={subjectId} onChange={(event) => { setSubjectId(event.target.value); setChapterId(""); }}><option value="">No subject</option>{model.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.title}</option>)}</select></label><label><span>Chapter</span><select disabled={!selectedSubject} value={chapterId} onChange={(event) => setChapterId(event.target.value)}><option value="">No chapter</option>{selectedSubject?.chapters.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.number}. {chapter.title}</option>)}</select></label><label><span>Visibility</span><select value={visibility} onChange={(event) => setVisibility(event.target.value)}><option value="private">Private</option><option value="shared">Share with Community</option></select></label><div className="phase7-policy-note"><Icon name={visibility === "private" ? "lock" : "shield"} size={17}/><span>{visibility === "private" ? "Private files are stored in Cloudflare R2 and opened only through an authorized Worker route." : "Community uploads are hidden until a moderator approves them."}</span></div>{error ? <div className="phase7-inline-error" role="alert">{error}</div> : null}<button disabled={busy} type="submit" className="ui-button ui-button--primary">{busy ? "Uploading…" : "Upload resource"}</button></form></aside></div>;
}

export function ResourceLibrary({ model, initialTab = "my" }: { model: ResourceLibraryReady; initialTab?: "my" | "shared" | "icai" }) {
  const [tab, setTab] = useState(initialTab); const [query, setQuery] = useState(""); const [newNote, setNewNote] = useState(false); const [upload, setUpload] = useState(false);
  const q = query.trim().toLowerCase();
  const myNotes = useMemo(() => model.myNotes.filter((note) => !q || matches(`${note.title} ${note.excerpt} ${note.subjectTitle ?? ""} ${note.chapterTitle ?? ""} ${note.tags.join(" ")}`, q)), [model.myNotes, q]);
  const myUploads = useMemo(() => model.myUploads.filter((item) => !q || matches(`${item.title} ${item.description ?? ""} ${item.originalFilename} ${item.subjectTitle ?? ""} ${item.chapterTitle ?? ""}`, q)), [model.myUploads, q]);
  const sharedNotes = useMemo(() => model.sharedNotes.filter((note) => !q || matches(`${note.title} ${note.excerpt} ${note.subjectTitle ?? ""} ${note.chapterTitle ?? ""}`, q)), [model.sharedNotes, q]);
  const sharedUploads = useMemo(() => model.sharedUploads.filter((item) => !q || matches(`${item.title} ${item.description ?? ""} ${item.originalFilename} ${item.subjectTitle ?? ""} ${item.chapterTitle ?? ""}`, q)), [model.sharedUploads, q]);
  const official = useMemo(() => model.officialResources.filter((item) => !q || matches(`${item.title} ${item.summary ?? ""} ${item.resourceType} ${item.subjects.map((subject) => subject.title).join(" ")}`, q)), [model.officialResources, q]);

  return <div className="phase7-library"><div className="phase7-library-controls"><div className="phase7-tabs" role="tablist" aria-label="Notes library views"><button className={tab === "my" ? "is-active" : ""} onClick={() => setTab("my")}>My Notes & Files <span>{model.myNotes.length + model.myUploads.length}</span></button><button className={tab === "shared" ? "is-active" : ""} onClick={() => setTab("shared")}>Shared <span>{model.sharedNotes.length + model.sharedUploads.length}</span></button><button className={tab === "icai" ? "is-active" : ""} onClick={() => setTab("icai")}>ICAI Resources <span>{model.officialResources.length}</span></button></div><div className="phase7-search"><Icon name="search" size={18}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search subject, chapter, title or tag"/></div><div className="phase7-library-actions"><button className="ui-button ui-button--secondary" onClick={() => setUpload(true)}><Icon name="plus" size={17}/> Upload</button><button className="ui-button ui-button--primary" onClick={() => setNewNote((value) => !value)}><Icon name="notes" size={17}/> New note</button></div></div>
    {newNote ? <Card><CardHeader title="New rich-text note" description="Notes are private by default. Community sharing always enters moderation." action={<button className="phase7-close-text" onClick={() => setNewNote(false)}>Close</button>}/><CardBody><NoteEditor subjects={model.subjects} compact onSaved={() => setNewNote(false)}/></CardBody></Card> : null}
    {tab === "my" ? <Card><CardHeader title="My library" description="Private notes and uploads remain scoped to your account; shared items display their moderation state."/><CardBody>{myNotes.length || myUploads.length ? <div className="phase7-document-list">{myNotes.map((note) => <NoteCardView note={note} key={`n:${note.id}`}/>)}{myUploads.map((resource) => <UploadCardView resource={resource} key={`u:${resource.id}`}/>)}</div> : <EmptyState icon="notes" title="Your library is empty" description="Create a rich note or upload your first PDF, image or Word document."/>}</CardBody></Card> : null}
    {tab === "shared" ? <Card><CardHeader title="Approved community resources" description="Only moderator-approved shared notes and uploads appear here." action={<Badge tone="brand">Moderated</Badge>}/><CardBody>{sharedNotes.length || sharedUploads.length ? <div className="phase7-document-list">{sharedNotes.map((note) => <NoteCardView note={note} key={`sn:${note.id}`}/>)}{sharedUploads.map((resource) => <UploadCardView resource={resource} key={`su:${resource.id}`}/>)}</div> : <EmptyState icon="community" title="No approved community resources yet" description="Pending and reported items stay hidden until moderation is complete."/>}</CardBody></Card> : null}
    {tab === "icai" ? <Card className="phase7-icai-card"><CardHeader title="ICAI official resources" description="Verified official-source metadata from the Phase 8 sync engine. These are not user uploads." action={<Badge tone="success">Official · Verified</Badge>}/><CardBody>{official.length ? <div className="phase7-document-list">{official.map((resource) => <a href={resource.officialUrl} target="_blank" rel="noreferrer" className="phase7-document-card phase7-document-card--icai" key={resource.id}><div className="phase7-document-icon"><Icon name="shield"/></div><div className="phase7-document-copy"><div className="phase7-document-title"><strong>{resource.title}</strong><Badge tone="success">ICAI Official</Badge></div><p>{resource.summary || `${resource.resourceType.replaceAll("_", " ")} from ${resource.sourceName}`}</p><div className="phase7-document-meta"><span>{resource.resourceType.replaceAll("_", " ")}</span><span>{resource.subjects.map((subject) => subject.title).join(", ") || "Official ICAI"}</span><span>Verified {new Date(resource.lastVerifiedAt).toLocaleDateString()}</span></div></div><Icon name="arrow" size={17}/></a>)}</div> : <EmptyState icon="shield" title="No verified ICAI resources match" description="The official-source sync feed is currently empty for this academic profile."/>}</CardBody></Card> : null}
    {upload ? <UploadPanel model={model} close={() => setUpload(false)}/> : null}
  </div>;
}
