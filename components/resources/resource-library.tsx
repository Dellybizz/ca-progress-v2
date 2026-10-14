"use client";
import { OfflineDownload } from "@/components/offline/offline-download";
import { useOfflineModel } from "@/components/offline/use-offline-model";

import { FormEvent, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import type { CommunityNoteDraft } from "@/lib/notes/types";
import type { ResourceLibraryReady, UploadCard, NoteCard } from "@/lib/resources/types";
import {FileManager} from "./file-manager";
import {privateFiles} from "@/lib/resources/file-manager";
import { libraryPage } from "@/lib/resources/library-list";
import { NoteEditor } from "./note-editor";

const CLIENT_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

type AcademicContext = { subjectId?: string; chapterId?: string };

function bytes(value: number) { if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`; return `${(value / (1024 * 1024)).toFixed(1)} MB`; }
function statusTone(status: string) { return status === "approved" ? "success" : status === "rejected" || status === "reported" ? "danger" : status === "pending" ? "warning" : "neutral"; }
function matches(value: string, query: string) { return value.toLowerCase().includes(query); }

function resolveAcademicContext(model: ResourceLibraryReady, context?: AcademicContext) {
  const subject = context?.subjectId ? model.subjects.find((item) => item.id === context.subjectId) ?? null : null;
  const chapterId = subject && context?.chapterId && subject.chapters.some((chapter) => chapter.id === context.chapterId) ? context.chapterId : "";
  return { subjectId: subject?.id ?? "", chapterId };
}

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

function uploadDirect(url: string, headers: Record<string, string> | undefined, file: File, requestRef: { current: XMLHttpRequest | null }, onProgress: (value: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    requestRef.current = request;
    request.open("PUT", url);
    for (const [name, value] of Object.entries(headers || {})) request.setRequestHeader(name, value);
    request.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 100)); };
    request.onload = () => request.status >= 200 && request.status < 300 ? resolve() : reject(new Error("Direct R2 upload failed. Please retry."));
    request.onerror = () => reject(new Error("The direct upload could not reach R2. Check your connection and try again."));
    request.onabort = () => reject(new DOMException("Upload cancelled.", "AbortError"));
    request.onloadend = () => { requestRef.current = null; };
    request.send(file);
  });
}

function NoteCardView({ note }: { note: NoteCard }) {
  return <Link href={`/notes/${note.id}`} className="phase7-document-card phase7-document-card--note"><div className="phase7-document-icon"><Icon name="notes"/></div><div className="phase7-document-copy"><div className="phase7-document-title"><strong>{note.title}</strong><Badge tone={statusTone(note.moderationStatus)}>{note.isOwner ? note.moderationStatus : "Community · Approved"}</Badge></div><p>{note.excerpt || "Rich-text note"}</p><div className="phase7-document-meta"><span>{note.topicTitle ?? note.chapterTitle ?? note.subjectTitle ?? "General note"}</span>{note.source?.type === "community" ? <span>Saved Community answer</span> : null}{note.tags.slice(0, 3).map((tag) => <span key={tag}>#{tag}</span>)}<span>{note.ownerLabel}</span></div></div><Icon name="chevron" size={17}/></Link>;
}

function UploadCardView({ resource }: { resource: UploadCard }) {
  return <div><Link href={`/resources/${resource.id}`} className="phase7-document-card phase7-document-card--upload"><div className="phase7-document-icon"><Icon name="book"/></div><div className="phase7-document-copy"><div className="phase7-document-title"><strong>{resource.title}</strong><Badge tone={statusTone(resource.moderationStatus)}>{resource.isOwner ? resource.moderationStatus : "Community · Approved"}</Badge></div><p>{resource.description || resource.originalFilename}</p><div className="phase7-document-meta"><span>{resource.extension.toUpperCase()} · {bytes(resource.sizeBytes)}</span><span>{resource.chapterTitle ?? resource.subjectTitle ?? "General resource"}</span><span>{resource.ownerLabel}</span></div></div><Icon name="chevron" size={17}/></Link><OfflineDownload id={resource.id} title={resource.originalFilename}/></div>;
}

function UploadPanel({ model, close, initialSubjectId, initialChapterId }: { model: ResourceLibraryReady; close: () => void; initialSubjectId?: string; initialChapterId?: string }) {
  const router = useRouter();
  const initialContext = resolveAcademicContext(model, { subjectId: initialSubjectId, chapterId: initialChapterId });
  const [subjectId, setSubjectId] = useState(initialContext.subjectId); const [chapterId, setChapterId] = useState(initialContext.chapterId); const [visibility, setVisibility] = useState("private"); const [busy, setBusy] = useState(false); const [progress, setProgress] = useState(0); const [error, setError] = useState<string | null>(null); const uploadRequest = useRef<XMLHttpRequest | null>(null);
  const [selectedFiles,setSelectedFiles] = useState<File[]>([]);
  const pendingUpload = useRef(false); const cancelled = useRef(false);
  const staged = useRef(new Map<File,{id:string;uploaded:boolean;url:string;headers?:Record<string,string>}>());
  function chooseFiles(files:File[]) {if(pendingUpload.current)return;setError(null);if(files.length>20){setError("Choose up to 20 files at a time.");return;}if(files.some(file=>file.size===0||file.size>CLIENT_UPLOAD_MAX_BYTES)){setError("Each file must be non-empty and no larger than 10 MB.");return;}staged.current.clear();setSelectedFiles(files);}
  const selectedSubject = model.subjects.find((subject) => subject.id === subjectId) ?? null;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if(pendingUpload.current)return; pendingUpload.current=true;cancelled.current=false;setBusy(true);setProgress(0);setError(null);
    let completed=0;
    try {
      const form = new FormData(event.currentTarget);
      if(!selectedFiles.length)throw new Error("Choose a file to upload.");
      for(const selectedFile of selectedFiles){
        if(cancelled.current)throw new Error("Upload cancelled. Completed files are already saved.");
        let stage=staged.current.get(selectedFile);
        if(!stage){
          const descriptor = {filename:selectedFile.name,mimeType:selectedFile.type,sizeBytes:selectedFile.size,title:selectedFiles.length===1?form.get("title"):selectedFile.name,description:form.get("description"),subjectId,chapterId,visibility};
          const issueResponse = await fetch("/api/v1/resources/upload-url",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(descriptor)});
          const issuePayload = await readApiPayload<{uploadId?:string;uploadUrl?:string;headers?:Record<string,string>;error?:string}>(issueResponse);
          if(!issueResponse.ok||!issuePayload.uploadId||!issuePayload.uploadUrl)throw new Error(issuePayload.error||uploadFallbackMessage(issueResponse.status));
          stage={id:issuePayload.uploadId,url:issuePayload.uploadUrl,headers:issuePayload.headers,uploaded:false};staged.current.set(selectedFile,stage);
        }
        if(!stage.uploaded){
          if(cancelled.current)throw new Error("Upload cancelled. Completed files are already saved.");
          try {await uploadDirect(stage.url,stage.headers,selectedFile,uploadRequest,value=>setProgress(Math.round((completed+value/100)/selectedFiles.length*100)));stage.uploaded=true;}
          catch(error){staged.current.delete(selectedFile);throw error;}
        }
        const completeResponse = await fetch("/api/v1/resources/upload-complete",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({uploadId:stage.id})});
        const completePayload = await readApiPayload<{error?:string}>(completeResponse);
        if(!completeResponse.ok){if(completeResponse.status>=400&&completeResponse.status<500)staged.current.delete(selectedFile);throw new Error(completePayload.error||uploadFallbackMessage(completeResponse.status));}
        staged.current.delete(selectedFile);completed+=1;setSelectedFiles(files=>files.filter(file=>file!==selectedFile));
      }
      close();router.refresh();
    } catch(caught){const message=caught instanceof Error?caught.message:"Upload failed.";setError(`${completed?`${completed} file(s) saved. `:""}${message==="Failed to fetch"?"Check your connection and retry the remaining files.":message}`);if(completed)router.refresh();}
    finally {uploadRequest.current=null;pendingUpload.current=false;setBusy(false);}
  }

  return <div className="phase7-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (!busy && event.target === event.currentTarget) close(); }}><aside className="phase7-upload-drawer" role="dialog" aria-modal="true" aria-label="Upload resource"><div className="phase7-drawer-head"><div><span>Private Storage</span><h2>Upload a resource</h2></div><button disabled={busy} onClick={close} aria-label="Close upload drawer"><Icon name="close"/></button></div><form onSubmit={submit} className="phase7-form"><label className="fm-dropzone" onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();chooseFiles(Array.from(event.dataTransfer.files));}}><span>Drop files here or choose files</span><input name="file" type="file" multiple required={!selectedFiles.length} onChange={event=>{chooseFiles(Array.from(event.target.files||[]));event.target.value="";}} disabled={busy} accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,application/pdf,image/jpeg,image/png,image/webp,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"/><small>PDF, images, DOC or DOCX · maximum 10 MB. Up to 20 files per batch. Files stay private unless you choose to share them.</small>{selectedFiles.length?<ul className="fm-upload-queue">{selectedFiles.map((file,index)=><li key={`${file.name}:${index}`}>{file.name}<small>{bytes(file.size)}</small></li>)}</ul>:null}</label><label><span>Title {selectedFiles.length>1?"(uses each filename)":""}</span><input name="title" maxLength={160} disabled={busy||selectedFiles.length>1} placeholder="Audit chapter 3 summary"/></label><label><span>Description</span><textarea name="description" maxLength={4000} disabled={busy} rows={4} placeholder="Optional context for this file"/></label><label><span>Subject</span><select disabled={busy} value={subjectId} onChange={(event) => { setSubjectId(event.target.value); setChapterId(""); }}><option value="">No subject</option>{model.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.title}</option>)}</select></label><label><span>Chapter</span><select disabled={busy || !selectedSubject} value={chapterId} onChange={(event) => setChapterId(event.target.value)}><option value="">No chapter</option>{selectedSubject?.chapters.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.number}. {chapter.title}</option>)}</select></label><label><span>Visibility</span><select disabled={busy} value={visibility} onChange={(event) => setVisibility(event.target.value)}><option value="private">Private</option><option value="shared">Share with Community</option></select></label><div className="phase7-policy-note"><Icon name={visibility === "private" ? "lock" : "shield"} size={17}/><span>{visibility === "private" ? "Only you can open your private files." : "Community uploads are hidden until a moderator approves them."}</span></div>{busy ? <div className="phase8-upload-progress" role="status" aria-live="polite"><div><span>Uploading securely</span><strong>{progress}%</strong></div><progress max="100" value={progress}/><button type="button" onClick={() => {cancelled.current=true;uploadRequest.current?.abort();}}>Cancel upload</button></div> : null}{error ? <div className="phase7-inline-error" role="alert">{error}</div> : null}<button disabled={busy} type="submit" className="ui-button ui-button--primary">{busy ? "Uploading…" : "Upload resource"}</button></form></aside></div>;
}

export function ResourceLibrary({ model: serverModel, initialTab = "my", initialAcademicContext, initialCommunityDraft = null, hideTabs = false }: { model: ResourceLibraryReady; initialTab?: "my" | "shared" | "icai"; initialAcademicContext?: AcademicContext; initialCommunityDraft?: CommunityNoteDraft | null; hideTabs?: boolean }) {
  const model = useOfflineModel("notes", serverModel);
  const initialContext = resolveAcademicContext(model, { subjectId: initialCommunityDraft?.subjectId ?? initialAcademicContext?.subjectId, chapterId: initialAcademicContext?.chapterId });
  const [tab, setTab] = useState(initialTab); const [query, setQuery] = useState(""); const [newNote, setNewNote] = useState(Boolean(initialCommunityDraft)); const [upload, setUpload] = useState(false); const [academicFilter, setAcademicFilter] = useState(initialContext);
  const [kind,setKind] = useState("all"); const [sort,setSort] = useState("recent"); const [page,setPage] = useState(1);
  const q = query.trim().toLowerCase();
  const selectedFilterSubject = academicFilter.subjectId ? model.subjects.find((subject) => subject.id === academicFilter.subjectId) ?? null : null;
  const selectedFilterChapter = academicFilter.chapterId ? selectedFilterSubject?.chapters.find((chapter) => chapter.id === academicFilter.chapterId) ?? null : null;
  const myNotes = useMemo(() => model.myNotes.filter((note) => (!academicFilter.subjectId || note.subjectId === academicFilter.subjectId) && (!academicFilter.chapterId || note.chapterId === academicFilter.chapterId) && (!q || matches(`${note.title} ${note.excerpt} ${note.subjectTitle ?? ""} ${note.chapterTitle ?? ""} ${note.topicTitle ?? ""} ${note.tags.join(" ")}`, q))), [academicFilter.chapterId, academicFilter.subjectId, model.myNotes, q]);
  const myUploads = useMemo(() => model.myUploads.filter((item) => (!academicFilter.subjectId || item.subjectId === academicFilter.subjectId) && (!academicFilter.chapterId || item.chapterId === academicFilter.chapterId) && (!q || matches(`${item.title} ${item.description ?? ""} ${item.originalFilename} ${item.subjectTitle ?? ""} ${item.chapterTitle ?? ""}`, q))), [academicFilter.chapterId, academicFilter.subjectId, model.myUploads, q]);
  const sharedNotes = useMemo(() => model.sharedNotes.filter((note) => (!academicFilter.subjectId || note.subjectId === academicFilter.subjectId) && (!academicFilter.chapterId || note.chapterId === academicFilter.chapterId) && (!q || matches(`${note.title} ${note.excerpt} ${note.subjectTitle ?? ""} ${note.chapterTitle ?? ""}`, q))), [academicFilter.chapterId, academicFilter.subjectId, model.sharedNotes, q]);
  const sharedUploads = useMemo(() => model.sharedUploads.filter((item) => (!academicFilter.subjectId || item.subjectId === academicFilter.subjectId) && (!academicFilter.chapterId || item.chapterId === academicFilter.chapterId) && (!q || matches(`${item.title} ${item.description ?? ""} ${item.originalFilename} ${item.subjectTitle ?? ""} ${item.chapterTitle ?? ""}`, q))), [academicFilter.chapterId, academicFilter.subjectId, model.sharedUploads, q]);
  const official = useMemo(() => model.officialResources.filter((item) => (!academicFilter.subjectId || item.subjects.some((subject) => subject.id === academicFilter.subjectId)) && (!q || matches(`${item.title} ${item.summary ?? ""} ${item.resourceType} ${item.subjects.map((subject) => subject.title).join(" ")}`, q))), [academicFilter.subjectId, model.officialResources, q]);

  const list = libraryPage(tab === "shared" ? sharedNotes : myNotes, tab === "shared" ? sharedUploads : myUploads, {kind,sort,page});

  if (hideTabs) return <div className="fm-library-root">
    <FileManager files={privateFiles(tab === "shared" ? model.sharedNotes : model.myNotes,tab === "shared" ? model.sharedUploads : model.myUploads)} title={tab === "shared" ? "Community files" : "My files"} subjects={model.subjects} academicContext={academicFilter} onContextChange={setAcademicFilter} actions={<><button type="button" className="fm-upload-button" onClick={()=>setUpload(true)}><Icon name="plus" size={17}/>Upload files</button><button type="button" onClick={()=>setNewNote(value=>!value)}><Icon name="notes" size={17}/>New note</button></>}/>
    {newNote ? <Card><CardHeader title={initialCommunityDraft ? "Save Community answer to Notes" : "New CA revision note"} description={initialCommunityDraft ? "Source attribution is retained and this note starts private." : "Use focused revision formatting, tables and private files. Notes are private by default."} action={<button className="phase7-close-text" onClick={() => setNewNote(false)}>Close</button>}/><CardBody><NoteEditor subjects={model.subjects} availableUploads={model.myUploads} communityDraft={initialCommunityDraft} compact initialSubjectId={academicFilter.subjectId || undefined} initialChapterId={academicFilter.chapterId || undefined} onSaved={() => setNewNote(false)}/></CardBody></Card> : null}
    {upload ? <UploadPanel model={model} initialSubjectId={academicFilter.subjectId || undefined} initialChapterId={academicFilter.chapterId || undefined} close={() => setUpload(false)}/> : null}
  </div>;

  return <div className={`phase7-library${hideTabs ? " resource-hub-library" : ""}`}><div className="phase7-library-controls">{!hideTabs ? <div className="phase7-tabs" role="tablist" aria-label="Notes library views"><button className={tab === "my" ? "is-active" : ""} onClick={() => setTab("my")}>My Notes & Files <span>{model.myNotes.length + model.myUploads.length}</span></button><button className={tab === "shared" ? "is-active" : ""} onClick={() => setTab("shared")}>Shared <span>{model.sharedNotes.length + model.sharedUploads.length}</span></button><button className={tab === "icai" ? "is-active" : ""} onClick={() => setTab("icai")}>ICAI Resources <span>{model.officialResources.length}</span></button></div> : null}<div className="phase7-search"><Icon name="search" size={18}/><input value={query} aria-label="Search your resource collection" onChange={(event) => {setQuery(event.target.value);setPage(1);}} placeholder="Search subject, chapter, Unit/AS, title or tag"/></div><div className="phase7-library-actions"><button className="ui-button ui-button--secondary" onClick={() => setUpload(true)}><Icon name="plus" size={17}/> Upload</button><button className="ui-button ui-button--primary" onClick={() => setNewNote((value) => !value)}><Icon name="notes" size={17}/> New note</button></div></div>
    {tab !== "icai" ? <div className="resource-hub-filters">
      <label>Subject<select value={academicFilter.subjectId} onChange={event=>{setAcademicFilter({subjectId:event.target.value,chapterId:""});setPage(1);}}><option value="">All subjects</option>{model.subjects.map(subject=><option key={subject.id} value={subject.id}>{subject.title}</option>)}</select></label>
      <label>Chapter<select value={academicFilter.chapterId} disabled={!selectedFilterSubject} onChange={event=>{setAcademicFilter({...academicFilter,chapterId:event.target.value});setPage(1);}}><option value="">{selectedFilterSubject ? "All chapters" : "Choose a subject first"}</option>{selectedFilterSubject?.chapters.map(chapter=><option key={chapter.id} value={chapter.id}>{chapter.number}. {chapter.title}</option>)}</select></label>
      <label>Content<select value={kind} onChange={event=>{setKind(event.target.value);setPage(1);}}><option value="all">Notes & files</option><option value="notes">Notes only</option><option value="files">Files only</option></select></label>
      <label>Sort<select value={sort} onChange={event=>{setSort(event.target.value);setPage(1);}}><option value="recent">Recently updated</option><option value="title">Title A–Z</option></select></label>
      <button type="button" className="resource-hub-reset" onClick={()=>{setQuery("");setAcademicFilter({subjectId:"",chapterId:""});setKind("all");setSort("recent");setPage(1);}}>Reset filters</button><p role="status">{list.count} {list.count === 1 ? "result" : "results"}</p>
    </div> : null}
    {academicFilter.subjectId ? <div className="phase7-policy-note"><Icon name="book" size={17}/><span>Showing {selectedFilterChapter ? `${selectedFilterSubject?.title} · ${selectedFilterChapter.number}. ${selectedFilterChapter.title}` : selectedFilterSubject?.title}. New notes and uploads keep this academic context.</span><button type="button" className="phase7-close-text" onClick={() => setAcademicFilter({ subjectId: "", chapterId: "" })}>Show all</button></div> : null}
    {newNote ? <Card><CardHeader title={initialCommunityDraft ? "Save Community answer to Notes" : "New CA revision note"} description={initialCommunityDraft ? "Source attribution is retained and this note starts private." : "Use focused revision formatting, tables and private files. Notes are private by default."} action={<button className="phase7-close-text" onClick={() => setNewNote(false)}>Close</button>}/><CardBody><NoteEditor subjects={model.subjects} availableUploads={model.myUploads} communityDraft={initialCommunityDraft} compact initialSubjectId={academicFilter.subjectId || undefined} initialChapterId={academicFilter.chapterId || undefined} onSaved={() => setNewNote(false)}/></CardBody></Card> : null}
    {tab === "my" ? <Card><CardHeader title="My revision library" description="Your notes and files. Private unless you choose to share them."/><CardBody>{list.count ? <div className="phase7-document-list">{list.items.map(entry=>entry.kind === "note" ? <NoteCardView note={entry.item} key={`n:${entry.item.id}`}/> : <UploadCardView resource={entry.item} key={`u:${entry.item.id}`}/>)}</div> : <EmptyState icon="notes" title={q || kind !== "all" ? "No resources match your filters" : academicFilter.chapterId ? "Nothing linked to this chapter yet" : "Your library is empty"} description={q || kind !== "all" ? "Try a different search or reset the filters." : academicFilter.chapterId ? "Create a revision note or upload a file and this chapter will already be selected." : "Create a revision note or upload your first PDF, image or Word document."}/>}</CardBody></Card> : null}
    {tab === "shared" ? <Card><CardHeader title="Approved community resources" description="Only moderator-approved explicitly shared notes and uploads appear here." action={<Badge tone="brand">Moderated</Badge>}/><CardBody>{list.count ? <div className="phase7-document-list">{list.items.map(entry=>entry.kind === "note" ? <NoteCardView note={entry.item} key={`sn:${entry.item.id}`}/> : <UploadCardView resource={entry.item} key={`su:${entry.item.id}`}/>)}</div> : <EmptyState icon="community" title="No approved community resources match" description="Private, pending and reported items stay hidden."/>}</CardBody></Card> : null}
    {tab === "icai" ? <Card className="phase7-icai-card"><CardHeader title="ICAI official resources" description="Verified official-source metadata from the existing sync engine. These are not user uploads." action={<Badge tone="success">Official · Verified</Badge>}/><CardBody>{official.length ? <div className="phase7-document-list">{official.map((resource) => <a href={resource.officialUrl} target="_blank" rel="noreferrer" className="phase7-document-card phase7-document-card--icai" key={resource.id}><div className="phase7-document-icon"><Icon name="shield"/></div><div className="phase7-document-copy"><div className="phase7-document-title"><strong>{resource.title}</strong><Badge tone="success">ICAI Official</Badge></div><p>{resource.summary || `${resource.resourceType.replaceAll("_", " ")} from ${resource.sourceName}`}</p><div className="phase7-document-meta"><span>{resource.resourceType.replaceAll("_", " ")}</span><span>{resource.subjects.map((subject) => subject.title).join(", ") || "Official ICAI"}</span><span>Verified {new Date(resource.lastVerifiedAt).toLocaleDateString()}</span></div></div><Icon name="arrow" size={17}/></a>)}</div> : <EmptyState icon="shield" title="No verified ICAI resources match" description="The official-source sync feed is currently empty for this academic profile."/>}</CardBody></Card> : null}
    {tab !== "icai" && list.pages > 1 ? <nav className="resource-hub-pagination" aria-label="Resource pages"><button type="button" disabled={list.current === 1} onClick={()=>setPage(list.current-1)}>Previous</button><span>Page {list.current} of {list.pages}</span><button type="button" disabled={list.current === list.pages} onClick={()=>setPage(list.current+1)}>Next</button></nav> : null}
    {upload ? <UploadPanel model={model} initialSubjectId={academicFilter.subjectId || undefined} initialChapterId={academicFilter.chapterId || undefined} close={() => setUpload(false)}/> : null}
  </div>;
}
