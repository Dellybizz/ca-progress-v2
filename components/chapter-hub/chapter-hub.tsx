"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { Icon, type IconName } from "@/components/ui/icon";
import type { ChapterHubItem, ChapterHubLink, ChapterHubReadyModel } from "@/lib/chapter-hub/types";
import type { ProgressState } from "@/lib/progress/types";
import { AcademicContextBar, AcademicEntityMark } from "@/components/academic/academic-navigation";

const STAGES: Array<{ field: keyof ProgressState; label: string; short: string }> = [
  { field: "completed_at", label: "Completed", short: "Done" }, { field: "revision_1_at", label: "Revision 1", short: "Rev. 1" },
  { field: "revision_2_at", label: "Revision 2", short: "Rev. 2" }, { field: "test_1_at", label: "Test 1", short: "Test 1" }, { field: "test_2_at", label: "Test 2", short: "Test 2" },
];
function dateLabel(value: string | null) { if (!value) return "Not yet"; return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); }
function durationLabel(seconds: number) { const minutes = Math.round(seconds / 60); if (minutes < 60) return `${minutes} min`; const hours = Math.floor(minutes / 60); const rest = minutes % 60; return rest ? `${hours}h ${rest}m` : `${hours}h`; }
function fileSize(bytes: number) { if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`; return `${(bytes / (1024 * 1024)).toFixed(1)} MB`; }
function SectionTitle({ icon, eyebrow, title, action }: { icon: IconName; eyebrow: string; title: string; action?: React.ReactNode }) { return <header className="chapter-hub-section__header"><div className="chapter-hub-section__title"><span><Icon name={icon} size={18}/></span><div><small>{eyebrow}</small><h2>{title}</h2></div></div>{action}</header>; }

export function ChapterHub({ model }: { model: ChapterHubReadyModel }) {
  const [mobileView, setMobileView] = useState<"overview" | "study" | "resources">("overview");
  const [progress, setProgress] = useState(model.progress);
  const [understandingLevel, setUnderstandingLevel] = useState(model.understandingLevel ?? 0);
  const [links, setLinks] = useState(model.links);
  const [pinnedItems, setPinnedItems] = useState(model.pinnedItems);
  const [availableItems, setAvailableItems] = useState(model.availableItems);
  const [linkDraft, setLinkDraft] = useState({ kind: "useful" as ChapterHubLink["kind"], title: "", url: "" });
  const [selectedItem, setSelectedItem] = useState("");
  const [message, setMessage] = useState("");
  const { academic } = model;
  const progressCount = STAGES.filter((stage) => Boolean(progress[stage.field])).length;
  const chapterQuery = `chapterId=${encodeURIComponent(academic.chapterId)}&subjectId=${encodeURIComponent(academic.subjectId)}`;
  const lastStudyAt = model.study.recentSessions[0]?.endedAt ?? null;
  const understanding = model.study.averageSelfReportedUnderstanding;
  const nextStage = STAGES.find((stage) => !progress[stage.field]);
  const activity = [
    ...model.progressEvents.map((event) => ({ id: `progress-${event.id}`, at: event.createdAt, icon: "target" as IconName, title: `${event.stage.replaceAll("_", " ")} ${event.action}` })),
    ...model.study.recentSessions.map((session) => ({ id: `study-${session.id}`, at: session.endedAt, icon: "timer" as IconName, title: `${durationLabel(session.durationSeconds)} Focus session` })),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 5);
  async function mutate(body:Record<string,unknown>){
    const response=await fetch(`/api/chapters/${encodeURIComponent(academic.chapterId)}/workspace`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
    const payload=await response.json() as {error?:string;[key:string]:unknown};
    if(!response.ok)throw new Error(payload.error||"Chapter could not be updated.");
    return payload;
  }
  async function saveStageDate(field:keyof ProgressState,date:string){
    const previous=progress;
    setProgress((current)=>({...current,[field]:date?`${date}T12:00:00.000Z`:null}));
    setMessage("Saved");
    try{await mutate({action:"set_stage_date",stage:field.replace(/_at$/,""),date:date||null});}
    catch(error){setProgress(previous);setMessage(error instanceof Error?error.message:"Could not save date.");}
  }
  async function saveUnderstanding(level:number){
    const previous=understandingLevel;
    setUnderstandingLevel(level); setMessage("Saved");
    try{await mutate({action:"set_understanding",level});}
    catch(error){setUnderstandingLevel(previous);setMessage(error instanceof Error?error.message:"Could not save understanding.");}
  }
  async function addLink(event:React.FormEvent){
    event.preventDefault(); setMessage("");
    try{
      const payload=await mutate({action:"add_link",...linkDraft});
      setLinks((items)=>[payload.link as ChapterHubLink,...items]); setLinkDraft({...linkDraft,title:"",url:""}); setMessage("Link added");
    }catch(error){setMessage(error instanceof Error?error.message:"Could not add link.");}
  }
  async function attachItem(){
    const item=availableItems.find((candidate)=>`${candidate.sourceKind}:${candidate.sourceId}`===selectedItem);
    if(!item)return;
    setAvailableItems((items)=>items.filter((candidate)=>candidate!==item)); setPinnedItems((items)=>[{...item,id:`pending-${item.sourceId}`},...items]); setSelectedItem(""); setMessage("Attached");
    try{const payload=await mutate({action:"attach_item",sourceKind:item.sourceKind,sourceId:item.sourceId});setPinnedItems((items)=>items.map((candidate)=>candidate.sourceKind===item.sourceKind&&candidate.sourceId===item.sourceId?{...candidate,id:String(payload.id)}:candidate));}
    catch(error){setPinnedItems((items)=>items.filter((candidate)=>!(candidate.sourceKind===item.sourceKind&&candidate.sourceId===item.sourceId)));setAvailableItems((items)=>[item,...items]);setMessage(error instanceof Error?error.message:"Could not attach item.");}
  }
  async function removeItem(item:ChapterHubItem){
    setPinnedItems((items)=>items.filter((candidate)=>candidate.id!==item.id));setAvailableItems((items)=>[item,...items]);
    try{await mutate({action:"remove_item",id:item.id});setMessage("Removed");}
    catch(error){setPinnedItems((items)=>[item,...items]);setAvailableItems((items)=>items.filter((candidate)=>candidate.sourceKind!==item.sourceKind||candidate.sourceId!==item.sourceId));setMessage(error instanceof Error?error.message:"Could not remove item.");}
  }

  return <div className={`chapter-hub-page chapter-hub-page--${mobileView}`} data-canonical-chapter-id={academic.chapterId}>
    <section className="chapter-hub-hero"><div className="chapter-hub-hero__copy"><div className="chapter-hub-hero__badges"><AcademicEntityMark kind="chapter" label={`Chapter ${academic.chapterNumber}`}/><Badge>{academic.paperLabel}</Badge></div><h1><b>{academic.chapterNumber}</b>{academic.chapterTitle}</h1><p>{academic.subjectTitle} · {academic.groupName}</p><div className="chapter-hub-actions"><Link href={`/study?${chapterQuery}`} className="ui-button ui-button--primary"><Icon name="timer" size={16}/> Start Focus</Link><Link href={`/subjects/${academic.subjectSlug}/progress?chapterId=${encodeURIComponent(academic.chapterId)}`} className="ui-button ui-button--secondary">Update progress</Link></div></div><div className="chapter-hub-hero__stats"><div><span>Progress</span><strong>{progressCount}/5</strong><small>{nextStage ? `Next: ${nextStage.label}` : "All stages complete"}</small></div><div><span>Focused</span><strong>{durationLabel(model.study.totalSeconds)}</strong><small>{model.study.sessionCount} sessions</small></div><div><span>Saved</span><strong>{model.notes.length + model.files.length}</strong><small>notes and files</small></div></div></section>
    <AcademicContextBar level={academic.levelName} group={academic.groupName} attempt={model.attemptKey} syllabus={academic.syllabusVersionKey}/>
    <nav className="chapter-hub-mobile-tabs" aria-label="Chapter workspace view">{(["overview", "study", "resources"] as const).map((view) => <button type="button" key={view} aria-pressed={mobileView === view} onClick={() => setMobileView(view)}>{view.charAt(0).toUpperCase() + view.slice(1)}</button>)}</nav>

    <div className="chapter-hub-workspace">
      <main className="chapter-hub-main">
        <Card className="chapter-hub-section chapter-hub-controls" data-mobile-view="overview"><CardBody><SectionTitle icon="target" eyebrow="Chapter controls" title="Progress & understanding"/><div className="chapter-hub-date-grid">{STAGES.map((stage)=><label key={stage.field} className={progress[stage.field]?"is-complete":""}><span>{stage.short}</span><input type="date" value={progress[stage.field]?.slice(0,10)??""} onChange={(event)=>void saveStageDate(stage.field,event.target.value)} aria-label={`${stage.label} date`}/></label>)}</div><label className="chapter-hub-understanding"><span><strong>Understanding</strong><small>Self-reported, not a mastery score</small></span><output>{understandingLevel}%</output><input type="range" min="0" max="100" step="1" value={understandingLevel} onChange={(event)=>setUnderstandingLevel(Number(event.target.value))} onPointerUp={(event)=>void saveUnderstanding(Number(event.currentTarget.value))} onKeyUp={(event)=>{if(["ArrowLeft","ArrowRight","Home","End"].includes(event.key))void saveUnderstanding(Number(event.currentTarget.value));}} aria-label="Chapter understanding level"/></label>{message?<p className="chapter-hub-save-state" role="status">{message}</p>:null}</CardBody></Card>

        <Card className="chapter-hub-section chapter-hub-study" data-mobile-view="study"><CardBody><SectionTitle icon="timer" eyebrow="Study history" title="Focus for this chapter" action={<Link href={`/study?${chapterQuery}`} className="chapter-hub-text-link">Start Focus <Icon name="arrow" size={13}/></Link>}/><div className="chapter-hub-study-total"><strong>{durationLabel(model.study.totalSeconds)}</strong><span>{model.study.sessionCount} saved session{model.study.sessionCount === 1 ? "" : "s"} · Last studied: {dateLabel(lastStudyAt)}</span>{understanding !== null ? <small>Average self-reported understanding {Math.round(understanding)}% · not a mastery score</small> : null}</div><div className="chapter-hub-list">{model.study.recentSessions.length ? model.study.recentSessions.slice(0, 4).map((session) => <div key={session.id}><span><Icon name="clock" size={14}/><strong>{session.intendedTaskTitle ?? "General Focus"}</strong></span><small>{durationLabel(session.durationSeconds)} · {dateLabel(session.endedAt)}{session.understandingScore !== null ? ` · ${session.understandingScore}%` : ""}</small></div>) : <p>No Focus sessions for this chapter yet.</p>}</div></CardBody></Card>

        <Card className="chapter-hub-section chapter-hub-topics" data-mobile-view="overview"><CardBody><SectionTitle icon="layers" eyebrow="Chapter structure" title="Topics & units"/>{model.topics.length ? <div className="chapter-hub-topic-grid">{model.topics.map((topic) => <span key={topic.id} data-academic-topic-id={topic.id}><b>{topic.unitNumber ?? "Unit"}</b>{topic.title}</span>)}</div> : <p className="chapter-hub-empty-line">No separately indexed topics are available.</p>}</CardBody></Card>

        <Card className="chapter-hub-section chapter-hub-materials" data-mobile-view="resources"><CardBody><SectionTitle icon="book" eyebrow="Chapter material" title="Attached to this chapter"/><div className="chapter-hub-attach"><select value={selectedItem} onChange={(event)=>setSelectedItem(event.target.value)} aria-label="Choose existing material"><option value="">Choose personal, ICAI or community material</option>{availableItems.map((item)=><option key={`${item.sourceKind}:${item.sourceId}`} value={`${item.sourceKind}:${item.sourceId}`}>{item.meta} · {item.title}</option>)}</select><button type="button" className="ui-button ui-button--secondary" disabled={!selectedItem} onClick={()=>void attachItem()}>Attach</button></div><div className="chapter-hub-pinned-list">{pinnedItems.length?pinnedItems.map((item)=><div key={item.id}><Link href={item.href}><span><strong>{item.title}</strong><small>{item.meta}</small></span><Icon name="arrow" size={14}/></Link><button type="button" onClick={()=>void removeItem(item)} aria-label={`Remove ${item.title} from chapter`}><Icon name="close" size={14}/></button></div>):<p>Nothing attached yet. Choose any personal, ICAI or community material above.</p>}</div></CardBody></Card>

        <Card className="chapter-hub-section chapter-hub-links" data-mobile-view="resources"><CardBody><SectionTitle icon="arrow" eyebrow="Useful links" title="Videos, revision & references"/><form className="chapter-hub-link-form" onSubmit={(event)=>void addLink(event)}><select value={linkDraft.kind} onChange={(event)=>setLinkDraft((draft)=>({...draft,kind:event.target.value as ChapterHubLink["kind"]}))} aria-label="Link type"><option value="useful">Useful link</option><option value="youtube">YouTube video</option><option value="revision">Revision link</option></select><input value={linkDraft.title} onChange={(event)=>setLinkDraft((draft)=>({...draft,title:event.target.value}))} placeholder="Title" maxLength={160} required/><input type="url" value={linkDraft.url} onChange={(event)=>setLinkDraft((draft)=>({...draft,url:event.target.value}))} placeholder="https://…" maxLength={2048} required/><button className="ui-button ui-button--primary" type="submit">Add link</button></form><div className="chapter-hub-link-list">{links.length?links.map((link)=><div key={link.id}><a href={link.url} target="_blank" rel="noreferrer"><Badge>{link.kind==="youtube"?"Video":link.kind}</Badge><span>{link.title}</span><Icon name="arrow" size={14}/></a><button type="button" aria-label={`Remove ${link.title}`} onClick={()=>{setLinks((items)=>items.filter((item)=>item.id!==link.id));void mutate({action:"remove_link",id:link.id}).catch(()=>setLinks((items)=>[link,...items]));}}><Icon name="close" size={14}/></button></div>):<p>No useful links added yet.</p>}</div></CardBody></Card>
      </main>

      <aside className="chapter-hub-rail">
        <Card className="chapter-hub-section chapter-hub-tests" data-mobile-view="overview"><CardBody><SectionTitle icon="tests" eyebrow="Tests" title="Attempts" action={<Link href={`/tests?${chapterQuery}`} className="chapter-hub-text-link">Record marks <Icon name="arrow" size={13}/></Link>}/><div className="chapter-hub-test-list">{(["test_1_at", "test_2_at"] as const).map((field, index) => <div key={field} className={progress[field] ? "is-complete" : ""}><span>{progress[field] ? <Icon name="check" size={15}/> : `Test ${index + 1}`}</span><div><strong>Test {index + 1}</strong><small>{progress[field] ? dateLabel(progress[field]) : "Not completed"}</small></div></div>)}</div></CardBody></Card>

        <Card className="chapter-hub-section chapter-hub-activity" data-mobile-view="overview"><CardBody><SectionTitle icon="clock" eyebrow="Recent" title="Chapter activity"/><div className="chapter-hub-activity-list">{activity.length ? activity.map((item) => <div key={item.id}><span><Icon name={item.icon} size={14}/></span><div><strong>{item.title}</strong><small>{dateLabel(item.at)}</small></div></div>) : <p>No chapter activity yet.</p>}</div></CardBody></Card>

        <Card className="chapter-hub-section chapter-hub-notes" data-mobile-view="resources"><CardBody><SectionTitle icon="notes" eyebrow="Notes" title="Your notes" action={<Link href={`/notes?${chapterQuery}`} className="chapter-hub-text-link">Open notes <Icon name="arrow" size={13}/></Link>}/><div className="chapter-hub-content-list">{model.notes.length ? model.notes.slice(0, 4).map((note) => <Link key={note.id} href={`/notes/${note.id}`}><span><strong>{note.title}</strong><small>{note.excerpt || "No preview"}</small></span><Icon name="chevron" size={14}/></Link>) : <p>No notes linked to this chapter.</p>}</div></CardBody></Card>

        <Card className="chapter-hub-section chapter-hub-files" data-mobile-view="resources"><CardBody><SectionTitle icon="book" eyebrow="Files" title="Chapter library" action={<Link href={`/resources?${chapterQuery}`} className="chapter-hub-text-link">Open library <Icon name="arrow" size={13}/></Link>}/><div className="chapter-hub-content-list">{model.files.length ? model.files.slice(0, 4).map((file) => <Link key={file.id} href={`/resources/${file.id}`}><span><strong>{file.title}</strong><small>{file.extension.toUpperCase()} · {fileSize(file.sizeBytes)}</small></span><Icon name="chevron" size={14}/></Link>) : <p>No files linked to this chapter.</p>}</div></CardBody></Card>

        <Card className="chapter-hub-section chapter-hub-doubts" data-mobile-view="resources"><CardBody><SectionTitle icon="community" eyebrow="Doubts" title="Ask your subject room" action={<Link href="/community" className="chapter-hub-text-link">Community <Icon name="arrow" size={13}/></Link>}/><div className="chapter-hub-content-list">{model.doubtChannels.length ? model.doubtChannels.map((channel) => <Link key={channel.id} href={`/community/${channel.channelKey}?chapterId=${encodeURIComponent(academic.chapterId)}`}><span><strong>{channel.title}</strong><small>{channel.description}</small></span><Icon name="chevron" size={14}/></Link>) : <p>No subject-specific doubt room is available.</p>}</div></CardBody></Card>
      </aside>
    </div>
  </div>;
}
