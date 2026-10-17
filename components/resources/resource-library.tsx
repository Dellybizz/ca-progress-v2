"use client";
import { OfflineDownload } from "@/components/offline/offline-download";
import { useOfflineModel } from "@/components/offline/use-offline-model";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import type { CommunityNoteDraft } from "@/lib/notes/types";
import type { ResourceLibraryReady, UploadCard, NoteCard } from "@/lib/resources/types";
import {DurableUploadPanel} from "./upload-panel";
import {WorkspaceBrowser} from "./workspace-browser";

import { libraryPage } from "@/lib/resources/library-list";
import { NoteEditor } from "./note-editor";


type AcademicContext = { subjectId?: string; chapterId?: string };

function bytes(value: number) { if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`; return `${(value / (1024 * 1024)).toFixed(1)} MB`; }
function statusTone(status: string) { return status === "approved" ? "success" : status === "rejected" || status === "reported" ? "danger" : status === "pending" ? "warning" : "neutral"; }
function matches(value: string, query: string) { return value.toLowerCase().includes(query); }

function resolveAcademicContext(model: ResourceLibraryReady, context?: AcademicContext) {
  const subject = context?.subjectId ? model.subjects.find((item) => item.id === context.subjectId) ?? null : null;
  const chapterId = subject && context?.chapterId && subject.chapters.some((chapter) => chapter.id === context.chapterId) ? context.chapterId : "";
  return { subjectId: subject?.id ?? "", chapterId };
}

function NoteCardView({ note }: { note: NoteCard }) {
  return <Link href={`/notes/${note.id}`} className="phase7-document-card phase7-document-card--note"><div className="phase7-document-icon"><Icon name="notes"/></div><div className="phase7-document-copy"><div className="phase7-document-title"><strong>{note.title}</strong><Badge tone={statusTone(note.moderationStatus)}>{note.isOwner ? note.moderationStatus : "Community · Approved"}</Badge></div><p>{note.excerpt || "Rich-text note"}</p><div className="phase7-document-meta"><span>{note.topicTitle ?? note.chapterTitle ?? note.subjectTitle ?? "General note"}</span>{note.source?.type === "community" ? <span>Saved Community answer</span> : null}{note.tags.slice(0, 3).map((tag) => <span key={tag}>#{tag}</span>)}<span>{note.ownerLabel}</span></div></div><Icon name="chevron" size={17}/></Link>;
}

function UploadCardView({ resource }: { resource: UploadCard }) {
  return <div><Link href={`/resources/${resource.id}`} className="phase7-document-card phase7-document-card--upload"><div className="phase7-document-icon"><Icon name="book"/></div><div className="phase7-document-copy"><div className="phase7-document-title"><strong>{resource.title}</strong><Badge tone={statusTone(resource.moderationStatus)}>{resource.isOwner ? resource.moderationStatus : "Community · Approved"}</Badge></div><p>{resource.description || resource.originalFilename}</p><div className="phase7-document-meta"><span>{resource.extension.toUpperCase()} · {bytes(resource.sizeBytes)}</span><span>{resource.chapterTitle ?? resource.subjectTitle ?? "General resource"}</span><span>{resource.ownerLabel}</span></div></div><Icon name="chevron" size={17}/></Link><OfflineDownload id={resource.id} title={resource.originalFilename}/></div>;
}


export function ResourceLibrary({ model: serverModel, initialTab = "my", initialAcademicContext, initialCommunityDraft = null, hideTabs = false }: { model: ResourceLibraryReady; initialTab?: "my" | "shared" | "icai"; initialAcademicContext?: AcademicContext; initialCommunityDraft?: CommunityNoteDraft | null; hideTabs?: boolean }) {
  useEffect(()=>{const preventFileNavigation=(event:DragEvent)=>{if(Array.from(event.dataTransfer?.types??[]).includes('Files'))event.preventDefault();};document.addEventListener('dragover',preventFileNavigation);document.addEventListener('drop',preventFileNavigation);return()=>{document.removeEventListener('dragover',preventFileNavigation);document.removeEventListener('drop',preventFileNavigation);};},[]);
  const model = useOfflineModel(hideTabs?"resources":"notes", serverModel);
  const initialContext = resolveAcademicContext(model, { subjectId: initialCommunityDraft?.subjectId ?? initialAcademicContext?.subjectId, chapterId: initialAcademicContext?.chapterId });
  const [droppedFiles,setDroppedFiles]=useState<File[]>([]);
  const [workspaceRevision,setWorkspaceRevision]=useState(0),[noteDirty,setNoteDirty]=useState(false);
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
    <WorkspaceBrowser onExternalFiles={files=>{setDroppedFiles(files);setUpload(true);}} model={model} collection={tab === "shared" ? "shared" : "my"} academicContext={academicFilter} onContextChange={setAcademicFilter} revision={workspaceRevision} actions={<button type="button" className="fm-upload-menu-item" onClick={()=>setUpload(true)}><Icon name="plus" size={17}/>Upload files</button>}/>
    <DurableUploadPanel initialFiles={droppedFiles} open={upload} close={()=>{setUpload(false);setDroppedFiles([]);}} onChanged={()=>setWorkspaceRevision(value=>value+1)}/>
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
    {newNote ? <Card><CardHeader title={initialCommunityDraft ? "Save Community answer to Notes" : "New CA revision note"} description={initialCommunityDraft ? "Source attribution is retained and this note starts private." : "Use focused revision formatting, tables and private files. Notes are private by default."} action={<button className="phase7-close-text" onClick={() => {if(!noteDirty||window.confirm("Discard your unsaved note changes?")){setNewNote(false);setNoteDirty(false);}}}>Close</button>}/><CardBody><NoteEditor subjects={model.subjects} availableUploads={model.myUploads} communityDraft={initialCommunityDraft} compact initialSubjectId={academicFilter.subjectId || undefined} initialChapterId={academicFilter.chapterId || undefined} onDirtyChange={setNoteDirty} onSaved={() => {setNewNote(false);setNoteDirty(false);setWorkspaceRevision(value=>value+1);}}/></CardBody></Card> : null}
    {tab === "my" ? <Card><CardHeader title="My revision library" description="Your notes and files. Private unless you choose to share them."/><CardBody>{list.count ? <div className="phase7-document-list">{list.items.map(entry=>entry.kind === "note" ? <NoteCardView note={entry.item} key={`n:${entry.item.id}`}/> : <UploadCardView resource={entry.item} key={`u:${entry.item.id}`}/>)}</div> : <EmptyState icon="notes" title={q || kind !== "all" ? "No resources match your filters" : academicFilter.chapterId ? "Nothing linked to this chapter yet" : "Your library is empty"} description={q || kind !== "all" ? "Try a different search or reset the filters." : academicFilter.chapterId ? "Create a revision note or upload a file and this chapter will already be selected." : "Create a revision note or upload your first PDF, image or Word document."}/>}</CardBody></Card> : null}
    {tab === "shared" ? <Card><CardHeader title="Approved community resources" description="Only moderator-approved explicitly shared notes and uploads appear here." action={<Badge tone="brand">Moderated</Badge>}/><CardBody>{list.count ? <div className="phase7-document-list">{list.items.map(entry=>entry.kind === "note" ? <NoteCardView note={entry.item} key={`sn:${entry.item.id}`}/> : <UploadCardView resource={entry.item} key={`su:${entry.item.id}`}/>)}</div> : <EmptyState icon="community" title="No approved community resources match" description="Private, pending and reported items stay hidden."/>}</CardBody></Card> : null}
    {tab === "icai" ? <Card className="phase7-icai-card"><CardHeader title="ICAI official resources" description="Verified official-source metadata from the existing sync engine. These are not user uploads." action={<Badge tone="success">Official · Verified</Badge>}/><CardBody>{official.length ? <div className="phase7-document-list">{official.map((resource) => <a href={resource.officialUrl} target="_blank" rel="noreferrer" className="phase7-document-card phase7-document-card--icai" key={resource.id}><div className="phase7-document-icon"><Icon name="shield"/></div><div className="phase7-document-copy"><div className="phase7-document-title"><strong>{resource.title}</strong><Badge tone="success">ICAI Official</Badge></div><p>{resource.summary || `${resource.resourceType.replaceAll("_", " ")} from ${resource.sourceName}`}</p><div className="phase7-document-meta"><span>{resource.resourceType.replaceAll("_", " ")}</span><span>{resource.subjects.map((subject) => subject.title).join(", ") || "Official ICAI"}</span><span>Verified {new Date(resource.lastVerifiedAt).toLocaleDateString()}</span></div></div><Icon name="arrow" size={17}/></a>)}</div> : <EmptyState icon="shield" title="No verified ICAI resources match" description="The official-source sync feed is currently empty for this academic profile."/>}</CardBody></Card> : null}
    {tab !== "icai" && list.pages > 1 ? <nav className="resource-hub-pagination" aria-label="Resource pages"><button type="button" disabled={list.current === 1} onClick={()=>setPage(list.current-1)}>Previous</button><span>Page {list.current} of {list.pages}</span><button type="button" disabled={list.current === list.pages} onClick={()=>setPage(list.current+1)}>Next</button></nav> : null}
    <DurableUploadPanel initialFiles={droppedFiles} open={upload} close={()=>{setUpload(false);setDroppedFiles([]);}} onChanged={()=>setWorkspaceRevision(value=>value+1)}/>
  </div>;
}
